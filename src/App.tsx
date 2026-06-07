import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import TypingScreen from "./components/TypingScreen";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Volume2, VolumeX, Settings, SlidersHorizontal, Send, X, MessageSquare, FileText, Edit3, Trash2, LogOut } from "lucide-react";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { Capacitor } from "@capacitor/core";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import LoginScreen from "./components/LoginScreen";
import APIScreen from "./components/APIScreen";
import LoadingScreen from "./components/LoadingScreen";
import { auth } from "./config/firebase";
import { getZoyaResponse, getZoyaResponseWithSearch, generateImage, resetZoyaSession, generateChatTitle, type MediaAttachment } from "./services/geminiService";
import { LiveSessionManager } from "./services/liveService";
import PermissionModal from "./components/PermissionModal";
import SystemConfigModal from "./components/SystemConfigModal";
import { getConfig, saveConfig } from "./services/configService";
import AxelCore from "./components/AxelCore";
import type { ChatMessage, ChatConversation } from "./services/dbService";
import {
  getAllConversations,
  createConversation,
  saveConversation,
  deleteConversation,
  getConversation,
  downloadConversation,
  downloadConversationAsText,
  togglePinConversation,
  setConversationFolder,
  toggleMessageReaction,
  setChatInstruction,
  toggleShareConversation,
  updateConversationTitle,
} from "./services/dbService";
import { addMemory, rememberFromText } from "./services/memoryService";
import { saveUserApiKey, getUserApiKey, validateApiKey } from "./services/apiKeyService";
import { getApiUsage, incrementApiUsage, type ApiUsage } from "./services/usageService";

type AppState = "idle" | "listening" | "processing" | "speaking";

function isElectronApp(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes("electron") || Boolean((window as any).process?.versions?.electron);
}

function isNativeOrDesktopApp(): boolean {
  return Capacitor.isNativePlatform() || isElectronApp();
}

function getSignedInName(user: User | null): string {
  const rawName = user?.displayName?.trim() || user?.email?.split("@")[0] || "";
  const readableName = rawName.replace(/[._-]+/g, " ").trim();
  return readableName.split(/\s+/)[0] || "there";
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [voiceMessages, setVoiceMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  const [isMuted, setIsMuted] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [activeChar, setActiveChar] = useState<"ARCLIGHT" | "NOVA" | null>(null);
  const [isInputMuted, setIsInputMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [showChat, setShowChat] = useState(false);
  const [showNotepad, setShowNotepad] = useState(false);
  const [notepadContent, setNotepadContent] = useState("");
  const [textInput, setTextInput] = useState("");
  const [voiceTextInput, setVoiceTextInput] = useState("");
  const [isWaving, setIsWaving] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [showTypingScreen, setShowTypingScreen] = useState(true);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showVoiceDownloadModal, setShowVoiceDownloadModal] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [apiUsage, setApiUsage] = useState<ApiUsage>({ totalRequests: 0, todayRequests: 0, todayDate: "", estimatedTokens: 0 });
  const userName = useMemo(() => getSignedInName(authUser), [authUser]);
  const userEmail = useMemo(() => authUser?.email || "", [authUser]);
  const userPhoto = useMemo(() => authUser?.photoURL || "", [authUser]);
  const isNativeOrDesktop = useMemo(() => isNativeOrDesktopApp(), []);
  const webSearchRef = useRef(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  useEffect(() => {
    webSearchRef.current = webSearchEnabled;
  }, [webSearchEnabled]);

  useEffect(() => {
    resetZoyaSession();
  }, [userName]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setAuthLoading(false);
      
      if (user) {
        setApiKeyLoading(true);
        try {
          const storedKey = await getUserApiKey(user.uid);
          if (storedKey) {
            setHasApiKey(true);
          } else {
            setHasApiKey(false);
          }
          // Load API usage stats
          const usage = await getApiUsage(user.uid);
          setApiUsage(usage);
        } catch (error) {
          console.error("Error checking API key:", error);
          setHasApiKey(false);
        } finally {
          setApiKeyLoading(false);
        }
      } else {
        setHasApiKey(false);
        setApiKeyLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [voiceMessages, showChat]);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Initialize conversations from Firestore
  useEffect(() => {
    if (!authUser) return;
    const uid = authUser.uid;

    const loadConversations = async () => {
      const all = await getAllConversations(uid);
      if (all.length > 0) {
        setConversations(all);
        setActiveConversationId(all[0].id);
        setMessages(all[0].messages);
      } else {
        const newConv = createConversation();
        await saveConversation(uid, newConv);
        setConversations([newConv]);
        setActiveConversationId(newConv.id);
        setMessages([]);
      }
    };

    loadConversations();
  }, [authUser]);

  // Helper: save messages to a specific conversation and refresh list
  const persistMessages = useCallback(async (convId: string, msgs: ChatMessage[]) => {
    if (!authUser || !convId) return;
    const uid = authUser.uid;
    try {
      const conv = await getConversation(uid, convId);
      if (conv) {
        conv.messages = msgs;
        conv.updatedAt = Date.now();
        await saveConversation(uid, conv);
        const all = await getAllConversations(uid);
        setConversations(all);
      }
    } catch (error) {
      console.error("[persistMessages] FAILED for conv", convId, error);
    }
  }, [authUser]);

  // Safety-net: debounced backup persist (fires 2s after messages stop changing)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeConversationId || !authUser || messages.length === 0) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      try {
        const uid = authUser.uid;
        const conv = await getConversation(uid, activeConversationId);
        if (conv) {
          // Only save if message counts differ (avoid redundant writes)
          if (conv.messages.length !== messages.length) {
            conv.messages = messages;
            conv.updatedAt = Date.now();
            await saveConversation(uid, conv);
            const all = await getAllConversations(uid);
            setConversations(all);
          }
        }
      } catch (error) {
        console.error("[safety-net persist] FAILED:", error);
      }
    }, 2000);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [messages, activeConversationId, authUser]);

  const toggleListening = useCallback(async (char?: "ARCLIGHT" | "NOVA") => {
    if (!isNativeOrDesktop) {
      setShowVoiceDownloadModal(true);
      return;
    }

    if (isSessionActive) {
      if (!char || char === activeChar) {
        setIsSessionActive(false);
        setActiveChar(null);
        if (liveSessionRef.current) {
          liveSessionRef.current.stop();
          liveSessionRef.current = null;
        }
        setAppState("idle");
        resetZoyaSession();
        return;
      } else {
        if (liveSessionRef.current) {
          liveSessionRef.current.stop();
        }
      }
    }

    try {
      const targetChar = char || "ARCLIGHT";
      const currentConfig = getConfig();
      if (targetChar === "ARCLIGHT") {
        saveConfig({ ...currentConfig, voice: "WOMAN" });
      } else {
        saveConfig({ ...currentConfig, voice: "MAN" });
      }
      
      setActiveChar(targetChar);
      setIsSessionActive(true);
      resetZoyaSession();
      
      const session = new LiveSessionManager(userName);
      session.isMuted = isMuted;
      session.isInputMuted = isInputMuted;
      session.outputVolume = volume;
      liveSessionRef.current = session;
      session.onError = (error) => {
        console.error("Live session failed", error);
        liveSessionRef.current = null;
        setIsSessionActive(false);
        setActiveChar(null);
        setAppState("idle");
        const errorName = error instanceof DOMException ? error.name : "";
        if (errorName === "NotAllowedError" || errorName === "NotFoundError" || errorName === "NotReadableError") {
          setShowPermissionModal(true);
        }
      };
        
        session.onStateChange = (state) => {
          setAppState(state);
        };
        
        session.onMessage = (sender, text) => {
          const newMsg: ChatMessage = { id: crypto.randomUUID(), sender, text, timestamp: Date.now() };
          setVoiceMessages((prev) => [...prev, newMsg]);

          if (sender === "user") {
            rememberFromText(text, "voice");
          }

          if (sender === "zoya") {
            const lowerText = text.toLowerCase().trim();
            if (lowerText.startsWith("hi") || lowerText.startsWith("hello") || lowerText.includes(" hey")) {
              setIsWaving(true);
              setTimeout(() => setIsWaving(false), 4000);
            }
          }
        };
        
        session.onCommand = (url) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 1000);
        };

        session.onNotepadUpdate = (content) => {
          setNotepadContent(content);
          setShowNotepad(true);
        };

        session.onMemorySave = (content) => {
          addMemory(content, "voice");
        };

        await session.start();
      } catch (e) {
        console.error("Failed to start session", e);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setActiveChar(null);
        setAppState("idle");
      }
  }, [isNativeOrDesktop, isSessionActive, activeChar, isMuted, isInputMuted, volume, userName]);

  const handleSendText = async (e?: React.FormEvent, media?: MediaAttachment) => {
    if (e) e.preventDefault();
    if (!textInput.trim() && !media) return;

    const msg = textInput.trim() || media?.prompt?.trim() || "";
    setTextInput("");
    rememberFromText(msg, "user");
    const mediaUrl = media && !media.documentText ? media.previewUrl || `data:${media.mimeType};base64,${media.data}` : undefined;
    const isVideo = media?.kind === "video" || media?.mimeType.startsWith("video/");
    const isDocument = media?.kind === "pdf" || media?.kind === "text" || media?.kind === "code";

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: "user",
      text: msg || (isVideo ? "Analyze this video" : isDocument ? `Analyze ${media?.fileName || "this document"}` : "Analyze this image"),
      timestamp: Date.now(),
      imageUrl: media && !isVideo && !isDocument ? mediaUrl : undefined,
      videoUrl: media && isVideo ? mediaUrl : undefined,
      fileName: media?.fileName,
      fileType: media?.mimeType,
    };
    const updatedWithUser = [...messages, userMsg];
    setMessages(updatedWithUser);
    // Save user message immediately
    if (activeConversationId) {
      await persistMessages(activeConversationId, updatedWithUser);
    }

    // Auto-generate title for new conversations (first message)
    const currentConv = conversations.find(c => c.id === activeConversationId);
    if (activeConversationId && authUser && currentConv && currentConv.title === "New chat" && messages.length === 0) {
      const firstMsgText = msg || userMsg.text;
      // Fire-and-forget: generate title in background
      generateChatTitle(firstMsgText).then(async (title) => {
        if (title && authUser && activeConversationId) {
          await updateConversationTitle(authUser.uid, activeConversationId, title);
          const all = await getAllConversations(authUser.uid);
          setConversations(all);
        }
      }).catch(() => {});
    }

    setAppState("processing");
    try {
      // Get current conversation's custom instruction
      const customInstruction = currentConv?.systemInstruction;
      
      // Check if web search is enabled
      const isWebSearch = webSearchRef.current;
      const cleanMsg = msg;
      
      // Check if image generation is requested
      const isImageGen = cleanMsg.toLowerCase().startsWith("/generate ") || cleanMsg.toLowerCase().startsWith("generate image of ");
      
      let reply: string;
      let imageData: string | null = null;
      
      if (isImageGen) {
        const imagePrompt = cleanMsg.replace(/^\/generate\s+/i, "").replace(/^generate image of\s+/i, "");
        imageData = await generateImage(imagePrompt);
        reply = imageData 
          ? `Here's the generated image for: "${imagePrompt}"`
          : "I couldn't generate the image. Please try a different prompt.";
      } else if (isWebSearch) {
        reply = await getZoyaResponseWithSearch(cleanMsg, messagesRef.current, userName);
      } else {
        reply = await getZoyaResponse(cleanMsg, messagesRef.current, media, userName, customInstruction || undefined);
      }
      
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "zoya",
        text: reply,
        timestamp: Date.now(),
        imageUrl: imageData || undefined,
      };
      const updatedWithAi = [...updatedWithUser, aiMsg];
      setMessages(updatedWithAi);
      // Save AI response
      if (activeConversationId) {
        await persistMessages(activeConversationId, updatedWithAi);
      }
      // Track API usage
      if (authUser) {
        const estimatedTokens = Math.ceil((msg.length + reply.length) * 1.3);
        await incrementApiUsage(authUser.uid, estimatedTokens);
        const usage = await getApiUsage(authUser.uid);
        setApiUsage(usage);
      }
      setAppState("idle");
    } catch (err) {
      console.error("Text fallback failed", err);
      setAppState("idle");
    }
  };

  const handleSendVoiceText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const msg = voiceTextInput.trim();
    if (!msg) return;

    setVoiceTextInput("");
    rememberFromText(msg, "voice");
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: "user",
      text: msg,
      timestamp: Date.now(),
    };
    setVoiceMessages((prev) => [...prev, userMsg]);

    if (liveSessionRef.current) {
      liveSessionRef.current.sendText(msg);
      return;
    }

    setAppState("processing");
    try {
      const history = voiceMessages.map((m) => ({ sender: m.sender, text: m.text }));
      const reply = await getZoyaResponse(msg, history, undefined, userName);
      setVoiceMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        sender: "zoya",
        text: reply,
        timestamp: Date.now(),
      }]);
    } catch (err) {
      console.error("Voice text fallback failed", err);
    } finally {
      setAppState("idle");
    }
  };

  const handleNewChat = useCallback(async () => {
    if (!authUser) return;
    const uid = authUser.uid;
    
    // Save current messages before switching
    if (activeConversationId && messages.length > 0) {
      await persistMessages(activeConversationId, messages);
    }
    
    const newConv = createConversation();
    await saveConversation(uid, newConv);
    const all = await getAllConversations(uid);
    setConversations(all);
    setActiveConversationId(newConv.id);
    setMessages([]);
    setTextInput("");
    setAppState("idle");
  }, [authUser, activeConversationId, messages, persistMessages]);

  const handleSwitchConversation = useCallback(async (id: string) => {
    if (!authUser) return;
    
    // Save current messages before switching
    if (activeConversationId && activeConversationId !== id && messages.length > 0) {
      await persistMessages(activeConversationId, messages);
    }
    
    const conv = await getConversation(authUser.uid, id);
    if (conv) {
      setActiveConversationId(id);
      setMessages(conv.messages);
    }
  }, [authUser, activeConversationId, messages, persistMessages]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    if (!authUser) return;
    const uid = authUser.uid;
    await deleteConversation(uid, id);
    const remaining = await getAllConversations(uid);
    setConversations(remaining);
    if (activeConversationId === id) {
      if (remaining.length > 0) {
        setActiveConversationId(remaining[0].id);
        setMessages(remaining[0].messages);
      } else {
        const newConv = createConversation();
        await saveConversation(uid, newConv);
        setConversations([newConv]);
        setActiveConversationId(newConv.id);
        setMessages([]);
      }
    }
  }, [activeConversationId, authUser]);

  const handleDeleteMessage = useCallback(async (msgId: string) => {
    const updated = messages.filter((m) => m.id !== msgId);
    setMessages(updated);
    if (activeConversationId) {
      await persistMessages(activeConversationId, updated);
    }
  }, [messages, activeConversationId, persistMessages]);

  const handleEditMessage = useCallback(async (msgId: string, newText: string) => {
    let updatedMessages: ChatMessage[] = [];
    flushSync(() => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msgId);
        if (idx === -1) return prev;
        updatedMessages = prev.slice(0, idx + 1).map((m, i) => (i === idx ? { ...m, text: newText } : m));
        return updatedMessages;
      });
    });

    // Save edited messages immediately
    if (activeConversationId) {
      await persistMessages(activeConversationId, updatedMessages);
    }

    const history = updatedMessages.map((m) => ({ sender: m.sender, text: m.text }));
    setAppState("processing");
    getZoyaResponse(newText, history, undefined, userName).then(async (reply) => {
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), sender: "zoya", text: reply, timestamp: Date.now() };
      const finalMessages = [...updatedMessages, aiMsg];
      setMessages(finalMessages);
      // Save regenerated response
      if (activeConversationId) {
        await persistMessages(activeConversationId, finalMessages);
      }
      setAppState("idle");
    }).catch(() => setAppState("idle"));
  }, [activeConversationId, userName, persistMessages]);

  const handleUpdateMessageFeedback = useCallback(async (msgId: string, feedback: "up" | "down" | null) => {
    const updated = messages.map((m) => (m.id === msgId ? { ...m, feedback } : m));
    setMessages(updated);
    if (activeConversationId) {
      await persistMessages(activeConversationId, updated);
    }
  }, [messages, activeConversationId, persistMessages]);

  const handleExportChat = useCallback(async () => {
    if (!authUser || !activeConversationId) return;
    const conv = await getConversation(authUser.uid, activeConversationId);
    if (conv) {
      downloadConversation(conv);
    }
  }, [activeConversationId, authUser]);

  const handleExportChatAsText = useCallback(async () => {
    if (!authUser || !activeConversationId) return;
    const conv = await getConversation(authUser.uid, activeConversationId);
    if (conv) {
      downloadConversationAsText(conv);
    }
  }, [activeConversationId, authUser]);

  const handleTogglePin = useCallback(async (id: string) => {
    if (!authUser) return;
    await togglePinConversation(authUser.uid, id);
    const all = await getAllConversations(authUser.uid);
    setConversations(all);
  }, [authUser]);

  const handleSetFolder = useCallback(async (id: string, folder: string) => {
    if (!authUser) return;
    await setConversationFolder(authUser.uid, id, folder);
    const all = await getAllConversations(authUser.uid);
    setConversations(all);
  }, [authUser]);

  const handleToggleReaction = useCallback(async (convId: string, msgId: string, emoji: string) => {
    if (!authUser) return;
    await toggleMessageReaction(authUser.uid, convId, msgId, emoji);
    const conv = await getConversation(authUser.uid, convId);
    if (conv && convId === activeConversationId) {
      setMessages(conv.messages);
    }
  }, [authUser, activeConversationId]);

  const handleSetInstruction = useCallback(async (id: string, instruction: string) => {
    if (!authUser) return;
    await setChatInstruction(authUser.uid, id, instruction);
    const all = await getAllConversations(authUser.uid);
    setConversations(all);
  }, [authUser]);

  const handleToggleShare = useCallback(async (id: string) => {
    if (!authUser) return null;
    return await toggleShareConversation(authUser.uid, id);
  }, [authUser]);

  // Conversation branching: edit message and create a fork
  const handleBranchFromMessage = useCallback(async (msgId: string, newText: string) => {
    if (!authUser || !activeConversationId) return;
    const uid = authUser.uid;
    
    // Get current conversation
    const conv = await getConversation(uid, activeConversationId);
    if (!conv) return;
    
    // Find message index and slice up to that point
    const msgIdx = conv.messages.findIndex(m => m.id === msgId);
    if (msgIdx === -1) return;
    
    // Create new branch conversation
    const branchConv = createConversation(conv.model);
    branchConv.title = `Branch: ${conv.title}`;
    branchConv.messages = conv.messages.slice(0, msgIdx);
    
    // Add edited message
    const editedMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: "user",
      text: newText,
      timestamp: Date.now(),
      branchId: branchConv.id,
    };
    branchConv.messages.push(editedMsg);
    await saveConversation(uid, branchConv);
    
    // Switch to branch
    const all = await getAllConversations(uid);
    setConversations(all);
    setActiveConversationId(branchConv.id);
    setMessages(branchConv.messages);
    
    // Get AI response
    setAppState("processing");
    try {
      const history = branchConv.messages.map(m => ({ sender: m.sender, text: m.text }));
      const reply = await getZoyaResponse(newText, history, undefined, userName, conv.systemInstruction || undefined);
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "zoya",
        text: reply,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, aiMsg]);
      setAppState("idle");
    } catch {
      setAppState("idle");
    }
  }, [authUser, activeConversationId, userName]);

  const handleSignOut = useCallback(async () => {
    if (liveSessionRef.current) {
      liveSessionRef.current.stop();
      liveSessionRef.current = null;
    }
    setIsSessionActive(false);
    setActiveChar(null);
    setAppState("idle");
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut().catch((error) => {
        console.warn("Native Firebase sign-out failed:", error);
      });
    }

    await signOut(auth);
  }, []);

  const handleApiKeySubmit = useCallback(async (apiKey: string) => {
    if (!authUser) throw new Error("Not authenticated");
    
    const isValid = await validateApiKey(apiKey);
    if (!isValid) {
      throw new Error("Please check your API key and make sure you get it from Google AI Studio.");
    }
    
    await saveUserApiKey(authUser.uid, apiKey);
    setHasApiKey(true);
  }, [authUser]);

  const handleChangeApiKey = useCallback(async (newApiKey: string) => {
    if (!authUser) throw new Error("Not authenticated");
    
    const isValid = await validateApiKey(newApiKey);
    if (!isValid) {
      throw new Error("Invalid API key. Please get a valid key from Google AI Studio.");
    }
    
    await saveUserApiKey(authUser.uid, newApiKey);
    // Reset AI instance to use new key
    const { resetZoyaSession } = await import("./services/geminiService");
    resetZoyaSession();
  }, [authUser]);

  const handleSwitchToTalk = useCallback(() => {
    if (!isNativeOrDesktop) {
      setShowVoiceDownloadModal(true);
      return;
    }
    setShowTypingScreen(false);
  }, [isNativeOrDesktop]);

  if (authLoading || apiKeyLoading) {
    return (
      <AnimatePresence>
        <LoadingScreen />
      </AnimatePresence>
    );
  }

  if (!authUser) {
    return <LoginScreen />;
  }

  if (!hasApiKey) {
    return <APIScreen onSubmit={handleApiKeySubmit} />;
  }

  if (showTypingScreen) {
    return (
      <>
        <TypingScreen
          messages={messages}
          textInput={textInput}
          setTextInput={setTextInput}
          onSend={handleSendText}
          onSwitchToTalk={handleSwitchToTalk}
          onNewChat={handleNewChat}
          appState={appState}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSwitchConversation={handleSwitchConversation}
          onDeleteConversation={handleDeleteConversation}
          onUpdateMessageFeedback={handleUpdateMessageFeedback}
          onDeleteMessage={handleDeleteMessage}
          onEditMessage={handleEditMessage}
          onExportChat={handleExportChat}
          onExportChatAsText={handleExportChatAsText}
          onSignOut={handleSignOut}
          userName={userName}
          userEmail={userEmail}
          userPhoto={userPhoto}
          onTogglePin={handleTogglePin}
          onSetFolder={handleSetFolder}
          onToggleReaction={handleToggleReaction}
          onSetInstruction={handleSetInstruction}
          onToggleShare={handleToggleShare}
          onBranchMessage={handleBranchFromMessage}
          webSearchEnabled={webSearchEnabled}
          onWebSearchToggle={() => setWebSearchEnabled(prev => !prev)}
          apiUsage={apiUsage}
          onChangeApiKey={handleChangeApiKey}
        />
        {showVoiceDownloadModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm bg-[#111318] border border-white/10 rounded-2xl p-6 shadow-2xl text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/15 text-blue-300">
                <Mic size={22} strokeWidth={1.5} />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Voice Assistance Requires App</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-6">
                Please use the desktop app or Android app to access voice assistance.
              </p>
              <button
                onClick={() => setShowVoiceDownloadModal(false)}
                className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-gray-200 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="h-[100dvh] w-screen bg-[#030610] text-[#a855f7] flex flex-col font-sans relative overflow-hidden m-0 p-0">
      {/* Background Grid */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(168, 85, 247, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(168, 85, 247, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Radial soft glow in center */}
      <div className="absolute inset-0 z-0 pointer-events-none flex justify-center items-center">
        <div className="w-[800px] h-[800px] bg-[#a855f7] rounded-full blur-[180px] opacity-[0.03]" />
      </div>

      {showPermissionModal && (
        <PermissionModal onClose={() => setShowPermissionModal(false)} />
      )}

      {showConfigModal && (
        <SystemConfigModal onClose={() => setShowConfigModal(false)} />
      )}

      {/* Right Side Chat Panel */}
      <AnimatePresence>
        {showChat && (
          <motion.div 
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            className="fixed top-0 right-0 h-full w-80 bg-[#02040a]/95 backdrop-blur-xl border-l border-violet-900/30 z-40 flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-center justify-between p-4 border-b border-violet-900/30">
              <h3 className="text-xs font-bold tracking-widest text-violet-500 flex items-center gap-2">
                <MessageSquare size={12} /> SYSTEM LOGS
              </h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    if (window.confirm("Clear all chat logs?")) {
                      setVoiceMessages([]);
                    }
                  }}
                  className="text-gray-500 hover:text-red-500 transition-colors p-1"
                  title="Clear Logs"
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
                <button onClick={() => setShowChat(false)} className="text-gray-500 hover:text-white transition-colors p-1">
                  <X size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>
            
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-4" style={{ scrollbarWidth: 'none' }}>
              {voiceMessages.length === 0 ? (
                <div className="text-center text-gray-600 text-[10px] tracking-widest mt-10">NO LOGS AVAILABLE</div>
              ) : (
                voiceMessages.map((m) => (
                  <div key={m.id} className={`flex flex-col max-w-[85%] ${m.sender === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                    <span className="text-[8px] text-gray-600 tracking-widest mb-1 uppercase">{m.sender === 'user' ? 'COMMANDER' : activeChar || 'SYSTEM'}</span>
                    <div className={`text-xs p-3 rounded-md leading-relaxed ${m.sender === 'user' ? 'bg-violet-950/40 text-violet-100 border border-violet-800/50 rounded-tr-none' : 'bg-white/5 text-gray-300 border border-white/10 rounded-tl-none'}`}>
                      {m.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-violet-900/30 bg-[#010205]">
              <form onSubmit={handleSendVoiceText} className="flex items-center gap-2 bg-[#061021] border border-violet-900/50 rounded p-1">
                <input 
                  type="text" 
                  value={voiceTextInput}
                  onChange={(e) => setVoiceTextInput(e.target.value)}
                  placeholder="Type message..."
                  className="flex-1 bg-transparent border-none outline-none text-xs px-2 placeholder-violet-800 text-violet-50 font-mono"
                />
                <button type="submit" className="p-2 text-violet-500 hover:text-violet-300 transition-colors">
                  <Send size={14} strokeWidth={1.5} />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNotepad && (
          <motion.div 
            initial={{ x: -400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -400, opacity: 0 }}
            className="fixed top-0 left-0 h-full w-96 bg-[#02040a]/95 backdrop-blur-xl border-r border-violet-900/30 z-40 flex flex-col shadow-[10px_0_30px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-center justify-between p-4 border-b border-violet-900/30">
              <h3 className="text-xs font-bold tracking-widest text-violet-500 flex items-center gap-2">
                <Edit3 size={12} /> AI NOTEPAD
              </h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    if (window.confirm("Are you sure you want to clear the notepad?")) {
                      setNotepadContent("");
                    }
                  }} 
                  className="text-gray-500 hover:text-red-500 transition-colors p-1"
                  title="Clear Notepad"
                >
                  <Trash2 size={14} />
                </button>
                <button onClick={() => setShowNotepad(false)} className="text-gray-500 hover:text-white transition-colors p-1">
                  <X size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>
            
            <div className="flex-1 p-6 flex flex-col gap-4 overflow-hidden">
              <textarea 
                value={notepadContent}
                onChange={(e) => setNotepadContent(e.target.value)}
                placeholder="AI will write here..."
                className="flex-1 bg-transparent border border-violet-900/20 rounded-lg p-4 text-sm text-violet-100 font-mono resize-none focus:outline-none focus:border-violet-500/50 transition-all placeholder-violet-900/50 scrollbar-hide"
                style={{ scrollbarWidth: 'none' }}
              />
              <div className="flex justify-between items-center text-[10px] text-violet-900 font-mono tracking-widest uppercase px-1">
                <span>Auto-Saving Enabled</span>
                <span>{notepadContent.length} Characters</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="absolute top-0 w-full z-20 flex flex-wrap justify-center sm:justify-between items-center gap-2 px-3 sm:px-8 py-3 sm:py-6 bg-transparent safe-inset-top">
        {/* Top Left - Character Toggles */}
        <div className="flex items-center gap-1.5 sm:gap-6 rounded-sm bg-[#030610]/80 px-2.5 sm:px-4 py-1.5 sm:py-2 border border-white/[0.04] backdrop-blur-sm">
          {(["ARCLIGHT", "NOVA"] as const).map((char) => {
            const isActive = activeChar === char;
            return (
              <button
                key={char}
                onClick={() => toggleListening(char)}
                className={`font-mono text-[11px] sm:text-base leading-tight tracking-tight transition-colors whitespace-nowrap rounded px-1.5 py-1 ${
                  isActive
                    ? "text-red-300 hover:text-red-200"
                    : "text-gray-300 hover:text-white"
                }`}
                title={isActive ? `Disconnect ${char}` : `Connect ${char}`}
              >
                {isActive ? "Disconnect" : "Connect"} {char}
              </button>
            );
          })}
        </div>

        {/* Top Center: Status */}
        <div className="hidden sm:flex absolute left-1/2 transform -translate-x-1/2 flex-col items-center gap-1 mt-2">
          <div className="text-[#a855f7] text-[10px] font-bold tracking-[0.5em] uppercase" style={{ textShadow: "0 0 10px rgba(168,85,247,0.5)" }}>
            {appState}
          </div>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          <button 
            onClick={() => setShowConfigModal(true)}
            className="w-8 h-8 sm:w-8 sm:h-8 flex items-center justify-center border border-white/5 bg-white/5 rounded-sm text-gray-500 hover:text-violet-400 hover:border-violet-500/30 transition-colors"
          >
            <SlidersHorizontal size={14} strokeWidth={1.5} />
          </button>
          <button className="w-8 h-8 flex items-center justify-center border border-white/5 bg-white/5 rounded-sm text-gray-500 hover:text-violet-400 hover:border-violet-500/30 transition-colors">
            <Settings size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={handleSignOut}
            className="w-8 h-8 flex items-center justify-center border border-white/5 bg-white/5 rounded-sm text-gray-500 hover:text-red-300 hover:border-red-500/30 transition-colors"
            title="Sign out"
          >
            <LogOut size={14} strokeWidth={1.5} />
          </button>

        </div>
      </header>

      {/* Main Center */}
      {/* Main App Container */}
<main className="flex-1 relative w-full h-full flex flex-col items-center justify-center overflow-hidden min-h-0 pt-24 pb-24 sm:pt-0 sm:pb-0">
  
  {/* The Core Wrapper */}
  <div className="relative z-10 flex flex-col items-center justify-center -mt-4 sm:mt-0">
    
    <AxelCore
                onSwitchToTyping={() => setShowTypingScreen(true)}
                activeChar={activeChar}
                isListening={appState === "listening"}
                isSpeaking={appState === "speaking"}
              />

    {/* Status Display - Positioned relative to the 600px circle */}
    <div className="absolute -bottom-14 sm:-bottom-28 flex flex-col items-center pointer-events-none">
       <span className="text-cyan-400 text-[9px] sm:text-[12px] tracking-[0.45em] sm:tracking-[0.8em] font-black uppercase opacity-80 animate-pulse">
         Core Online
       </span>
       <div className="mt-2 h-[1px] w-24 sm:w-40 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
    </div>

  </div>

  {/* Background Technical Grid Glow */}
  <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(34,211,238,0.12),transparent_70%)]" />
  </div>

</main>

      {/* Bottom Left Controls */}
      <footer className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col gap-4 sm:bottom-6 sm:left-8 sm:translate-x-0 safe-inset-bottom">
        <div className="flex items-center gap-3 sm:gap-4 rounded-sm bg-[#05060b]/90 border border-white/[0.04] px-4 py-3 backdrop-blur-sm">
          <button 
            onClick={() => setShowChat(!showChat)}
            className={`flex h-8 w-8 items-center justify-center transition-colors ${showChat ? 'text-violet-300' : 'text-gray-500 hover:text-gray-200'}`}
            title="Toggle Text Chat"
          >
            <MessageSquare size={22} strokeWidth={1.5} />
          </button>
          <button 
            onClick={() => setShowNotepad(!showNotepad)}
            className={`flex h-8 w-8 items-center justify-center transition-colors ${showNotepad ? 'text-violet-300' : 'text-gray-500 hover:text-gray-200'}`}
            title="Toggle Notepad"
          >
            <FileText size={22} strokeWidth={1.5} />
          </button>
          <button 
            onClick={() => {
              const next = !isInputMuted;
              setIsInputMuted(next);
              if (liveSessionRef.current) liveSessionRef.current.isInputMuted = next;
            }}
            className={`flex h-8 w-8 items-center justify-center transition-colors ${!isInputMuted ? 'text-gray-500 hover:text-gray-200' : 'text-red-400 hover:text-red-300'}`}
            title="Toggle Mic Input"
          >
            {!isInputMuted ? <Mic size={23} strokeWidth={1.5} /> : <MicOff size={23} strokeWidth={1.5} />}
          </button>
          <div className="relative group flex items-center">
            <button 
              onClick={() => {
                const next = !isMuted;
                setIsMuted(next);
                if (liveSessionRef.current) liveSessionRef.current.isMuted = next;
              }}
              className={`flex h-8 w-8 items-center justify-center transition-colors ${isMuted ? 'text-red-400 hover:text-red-300' : 'text-gray-500 hover:text-gray-200'}`}
              title="Toggle Voice Output"
            >
              {isMuted ? <VolumeX size={24} strokeWidth={1.5} /> : <Volume2 size={24} strokeWidth={1.5} />}
            </button>
            
            {/* Bridge padding (pl-2) keeps hover active while moving mouse */}
            <div className="absolute left-full top-0 h-full pl-2 hidden group-hover:flex items-center z-50">
              <div className="flex items-center justify-center p-3 bg-[#030610] border border-violet-900/50 rounded-sm shadow-xl">
                <input 
                   type="range" 
                   min="0" max="1" step="0.01" 
                   value={volume} 
                   onChange={(e) => {
                     const v = parseFloat(e.target.value);
                     setVolume(v);
                     if (liveSessionRef.current) liveSessionRef.current.outputVolume = v;
                   }} 
                   className="w-24 h-1 accent-violet-500 appearance-none bg-gray-800 rounded outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
