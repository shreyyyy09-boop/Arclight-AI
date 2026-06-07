import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Mic, Sparkles, Paperclip, ArrowRight, Zap, Code, Image as ImageIcon,
  Globe, ChevronDown, User, Copy, Check, RotateCcw, Volume2, Plus, X,
  Trash2, Pencil, ThumbsUp, ThumbsDown, Download, Keyboard, Menu, Wrench,
  Settings, HelpCircle, Star, Search, LogOut, Languages, Video, Brain, FileText,
  Monitor, Radio, Share2, BookOpen, NotebookPen, Wand2, Command, Pin,
  FolderOpen, GitBranch, MessageCircle, Smile, Link, Hash, Type, MoreVertical,
} from "lucide-react";
import type { ChatMessage, ChatConversation } from "../services/dbService";
import type { MediaAttachment } from "../services/geminiService";
import type { ApiUsage } from "../services/usageService";
import { getConfig, getCurrentSpeechLanguageCode, saveConfig, MODEL_OPTIONS, LANGUAGE_OPTIONS, TEXT_CHAT_MODEL, type LanguageType, type ModelType, type ResponseModeType, type VoiceType } from "../services/configService";
import { resetZoyaSession } from "../services/geminiService";
import SystemConfigModal from "./SystemConfigModal";
import MemoryModal from "./MemoryModal";
import GradientText from "./GradientText";
import StarBorder from "./StarBorder";
import SpotlightCard from "./SpotlightCard";

/* ------------------------------------------------------------------ */
/*  Animations & Styles                                               */
/* ------------------------------------------------------------------ */

/* Animations injected once via index.css */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TypingScreenProps {
  messages: ChatMessage[];
  textInput: string;
  setTextInput: (val: string | ((prev: string) => string)) => void;
  onSend: (e?: React.FormEvent, media?: MediaAttachment) => void;
  onSwitchToTalk: () => void;
  onNewChat: () => void;
  appState: "idle" | "listening" | "processing" | "speaking";
  conversations?: ChatConversation[];
  activeConversationId?: string;
  onSwitchConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onUpdateMessageFeedback?: (msgId: string, feedback: "up" | "down" | null) => void;
  onDeleteMessage?: (msgId: string) => void;
  onEditMessage?: (msgId: string, newText: string) => void;
  onExportChat?: () => void;
  onExportChatAsText?: () => void;
  onSignOut?: () => void;
  userName?: string;
  userEmail?: string;
  userPhoto?: string;
  onTogglePin?: (id: string) => void;
  onSetFolder?: (id: string, folder: string) => void;
  onToggleReaction?: (convId: string, msgId: string, emoji: string) => void;
  onSetInstruction?: (id: string, instruction: string) => void;
  onToggleShare?: (id: string) => Promise<string | null>;
  onBranchMessage?: (msgId: string, newText: string) => void;
  webSearchEnabled?: boolean;
  onWebSearchToggle?: () => void;
  apiUsage?: ApiUsage;
  onChangeApiKey?: (newKey: string) => Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Suggestion Prompts                                                 */
/* ------------------------------------------------------------------ */

const SUGGESTIONS = [
  "Write a creative story about AI",
  "Explain quantum computing simply",
  "Summarize an uploaded PDF",
  "Help me debug my React code",
  "Explain an uploaded code file",
  "Extract action items from notes",
];

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getFileKind(file: File): MediaAttachment["kind"] | null {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown")) return "text";
  if (/\.(js|jsx|ts|tsx|py|java|c|cpp|cs|go|rs|php|rb|swift|kt|html|css|scss|json|xml|yaml|yml|sql|sh|bat|ps1|env|toml|ini|mdx)$/i.test(name)) return "code";
  return null;
}

function getAttachmentLabel(media?: MediaAttachment): string {
  if (!media) return "";
  if (media.kind === "video") return "Video ready for analysis";
  if (media.kind === "image") return "Image ready to send";
  if (media.kind === "pdf") return "PDF ready for questions";
  if (media.kind === "code") return "Code file ready to explain";
  return "Document ready for questions";
}

function getAttachmentIcon(media?: MediaAttachment) {
  if (media?.kind === "video") return <Video size={14} strokeWidth={1.5} className="shrink-0 text-blue-400" />;
  if (media?.kind === "image") return <ImageIcon size={14} strokeWidth={1.5} className="shrink-0 text-blue-400" />;
  if (media?.kind === "code") return <Code size={14} strokeWidth={1.5} className="shrink-0 text-blue-400" />;
  return <FileText size={14} strokeWidth={1.5} className="shrink-0 text-blue-400" />;
}

/* ------------------------------------------------------------------ */
/*  Inline Markdown Parser                                             */
/* ------------------------------------------------------------------ */

function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let pos = 0;

  while (remaining.length > 0) {
    let best: { type: string; index: number; length: number; groups: string[] } | null = null;
    const checks = [
      { type: "link", regex: /\[([^\]]+)\]\(([^)]+)\)/ },
      { type: "code", regex: /`([^`]+)`/ },
      { type: "bold", regex: /\*\*([^*]+)\*\*/ },
      { type: "strikethrough", regex: /~~([^~]+)~~/ },
      { type: "italic", regex: /(?<!\*)\*([^*]+)\*(?!\*)/ },
      { type: "italic2", regex: /(?<!_)_([^_]+)_(?!_)/ },
    ];
    for (const c of checks) {
      const m = c.regex.exec(remaining);
      if (m && (!best || m.index < best.index)) {
        best = { type: c.type, index: m.index, length: m[0].length, groups: m.slice(1) };
      }
    }
    if (best) {
      if (best.index > 0) nodes.push(remaining.slice(0, best.index));
      const k = `${keyPrefix}-i${pos}`;
      switch (best.type) {
        case "link":
          nodes.push(<a key={k} href={best.groups[1]} target="_blank" rel="noopener noreferrer" className="text-[#89b4f8] hover:text-[#aecbfa] hover:underline transition-colors">{parseInline(best.groups[0], k)}</a>);
          break;
        case "code":
          nodes.push(<code key={k} className="px-1.5 py-0.5 rounded bg-[#1a1a2e] text-[#89b4f8] text-[13px] font-mono">{best.groups[0]}</code>);
          break;
        case "bold":
          nodes.push(<strong key={k} className="text-[#e8eaed] font-semibold">{parseInline(best.groups[0], k)}</strong>);
          break;
        case "italic":
        case "italic2":
          nodes.push(<em key={k} className="italic text-gray-200">{parseInline(best.groups[0], k)}</em>);
          break;
        case "strikethrough":
          nodes.push(<del key={k} className="line-through text-gray-500">{best.groups[0]}</del>);
          break;
      }
      remaining = remaining.slice(best.index + best.length);
      pos++;
    } else {
      nodes.push(remaining);
      break;
    }
  }
  return nodes;
}

/* ------------------------------------------------------------------ */
/*  Block Markdown Renderer                                            */
/* ------------------------------------------------------------------ */

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let codeBlock = false;
  let codeAcc = "";
  let codeLang = "";
  let tableLines: string[] = [];
  let blockquoteLines: string[] = [];

  const flushCode = (key: string) => {
    if (codeAcc.trim()) {
      out.push(
        <div key={key} className="my-3 rounded-xl overflow-hidden border border-[#2a2b2c] bg-[#0f0f0f]">
          {codeLang && (
            <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a1a] border-b border-[#2a2b2c]">
              <span className="text-[10px] text-blue-400 font-mono uppercase tracking-widest">{codeLang}</span>
              <button onClick={() => navigator.clipboard.writeText(codeAcc.trim())} className="text-[10px] text-gray-500 hover:text-blue-400 transition-colors">Copy</button>
            </div>
          )}
          <pre className="p-4 overflow-x-auto"><code className="text-[13px] font-mono text-[#89b4f8] leading-relaxed whitespace-pre-wrap">{codeAcc.trim()}</code></pre>
        </div>
      );
    }
    codeAcc = "";
    codeLang = "";
  };

  const flushTable = (key: string) => {
    if (tableLines.length < 2) {
      for (let i = 0; i < tableLines.length; i++) {
        out.push(<p key={`${key}-fb${i}`} className="text-[15px] text-[#e8eaed] leading-[1.8]">{parseInline(tableLines[i], `${key}-fb${i}`)}</p>);
      }
      tableLines = [];
      return;
    }
    const headers = tableLines[0].split("|").map((c) => c.trim()).filter(Boolean);
    const rows = tableLines.slice(2).map((line) => line.split("|").map((c) => c.trim()).filter(Boolean)).filter((r) => r.length > 0);
    out.push(
      <div key={key} className="overflow-x-auto my-3 rounded-lg border border-[#2a2b2c]">
        <table className="w-full text-[12px]">
          <thead className="bg-[#1a1a1a]"><tr>{headers.map((h, i) => <th key={i} className="px-3 py-2 text-left text-gray-300 font-semibold border-b border-[#2a2b2c]">{parseInline(h, `${key}-h${i}`)}</th>)}</tr></thead>
          <tbody>{rows.map((row, ri) => <tr key={ri} className="border-t border-[#2a2b2c]/60 hover:bg-white/[0.02]">{row.map((cell, ci) => <td key={ci} className="px-3 py-2 text-gray-400">{parseInline(cell, `${key}-r${ri}c${ci}`)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
    tableLines = [];
  };

  const flushBlockquote = (key: string) => {
    if (blockquoteLines.length === 0) return;
    const content = blockquoteLines.join("\n");
    out.push(<blockquote key={key} className="my-3 pl-4 border-l-2 border-[#89b4f8]/40 text-[#9aa0a6] italic text-[15px] leading-[1.8]">{parseInline(content, key)}</blockquote>);
    blockquoteLines = [];
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (line.startsWith("```")) {
      flushBlockquote(`bq-${idx}`);
      flushTable(`table-${idx}`);
      if (!codeBlock) { codeBlock = true; codeLang = line.slice(3).trim(); }
      else { codeBlock = false; flushCode(`code-${idx}`); }
      continue;
    }
    if (codeBlock) { codeAcc += line + "\n"; continue; }
    if (line.trim().startsWith(">")) {
      flushTable(`table-${idx}`);
      blockquoteLines.push(line.trim().slice(1).trim());
      continue;
    }
    if (line.trim().startsWith("|")) {
      flushBlockquote(`bq-${idx}`);
      tableLines.push(line.trim());
      continue;
    }
    if (tableLines.length > 0) { flushTable(`table-${idx}`); idx--; continue; }
    if (blockquoteLines.length > 0) { flushBlockquote(`bq-${idx}`); idx--; continue; }
    if (/^(---+|\*\*\*+|___+)$/.test(line.trim())) {
      out.push(<div key={`hr-${idx}`} className="my-4 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />);
      continue;
    }
    if (line.startsWith("# ")) out.push(<h1 key={idx} className="text-xl font-semibold text-[#e8eaed] mt-5 mb-2">{parseInline(line.slice(2), `h1-${idx}`)}</h1>);
    else if (line.startsWith("## ")) out.push(<h2 key={idx} className="text-lg font-semibold text-[#e8eaed] mt-4 mb-2">{parseInline(line.slice(3), `h2-${idx}`)}</h2>);
    else if (line.startsWith("### ")) out.push(<h3 key={idx} className="text-base font-semibold text-[#e8eaed] mt-3 mb-1.5">{parseInline(line.slice(4), `h3-${idx}`)}</h3>);
    else {
      const processed = parseInline(line, `line-${idx}`);
      if (line.match(/^[-*]\s/)) out.push(<li key={idx} className="ml-4 text-[15px] text-[#e8eaed] leading-[1.8] list-disc marker:text-[#89b4f8]">{processed}</li>);
      else if (/^\d+\.\s/.test(line)) out.push(<li key={idx} className="ml-4 text-[15px] text-[#e8eaed] leading-[1.8] list-decimal marker:text-[#89b4f8]">{processed}</li>);
      else if (line.trim() === "") out.push(<div key={idx} className="h-2" />);
      else out.push(<p key={idx} className="text-[15px] text-[#e8eaed] leading-[1.8]">{processed}</p>);
    }
  }
  if (codeBlock) flushCode("code-final");
  if (tableLines.length > 0) flushTable("table-final");
  if (blockquoteLines.length > 0) flushBlockquote("bq-final");
  return out;
}

/* ------------------------------------------------------------------ */
/*  Streaming Text Hook                                                */
/* ------------------------------------------------------------------ */

function getStreamingChunkSize(text: string, index: number, isFastResponse = false): number {
  const remaining = text.length - index;
  const nextChar = text[index] ?? "";
  if (remaining <= 1) return remaining;
  if (isFastResponse) return Math.min(remaining, text.length > 700 ? 80 : 42);
  if (nextChar === "\n") return 1;
  if (/\s/.test(nextChar)) return Math.min(2, remaining);
  if (/[.,!?;:)]/.test(nextChar)) return 1;
  if (text.length > 1200) return Math.min(5, remaining);
  if (text.length > 500) return Math.min(3, remaining);
  return Math.min(2, remaining);
}

function getStreamingDelay(text: string, index: number, isFastResponse = false): number {
  if (isFastResponse) return 1;
  const previousChar = text[Math.max(0, index - 1)] ?? "";
  if (previousChar === "\n") return 85;
  if (/[.!?]/.test(previousChar)) return 120;
  if (/[,;:]/.test(previousChar)) return 70;
  if (text.length > 1200) return 12;
  if (text.length > 500) return 18;
  return 26;
}

function useStreamingText(fullText: string, isActive: boolean, isFastResponse = false, onDone?: () => void, onProgress?: () => void) {
  const [displayed, setDisplayed] = useState(isActive ? "" : fullText);
  const idxRef = useRef(isActive ? 0 : fullText.length);
  const timeoutRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const displayedRef = useRef(displayed);

  useEffect(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!isActive) {
      idxRef.current = fullText.length;
      doneRef.current = true;
      displayedRef.current = fullText;
      setDisplayed(fullText);
      return;
    }

    if (!fullText) {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
      return;
    }

    if (idxRef.current > fullText.length || displayedRef.current !== fullText.slice(0, displayedRef.current.length)) {
      idxRef.current = 0;
      doneRef.current = false;
      displayedRef.current = "";
      setDisplayed("");
    }

    doneRef.current = false;

    const tick = () => {
      const nextIndex = Math.min(fullText.length, idxRef.current + getStreamingChunkSize(fullText, idxRef.current, isFastResponse));
      idxRef.current = nextIndex;

      if (idxRef.current >= fullText.length) {
        displayedRef.current = fullText;
        setDisplayed(fullText);
        onProgress?.();
        if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
        return;
      }

      const nextText = fullText.slice(0, idxRef.current);
      displayedRef.current = nextText;
      setDisplayed(nextText);
      onProgress?.();
      timeoutRef.current = window.setTimeout(tick, getStreamingDelay(fullText, idxRef.current, isFastResponse));
    };

    timeoutRef.current = window.setTimeout(tick, isFastResponse ? 1 : 80);
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [fullText, isActive, isFastResponse, onDone, onProgress]);

  return displayed;
}

function StreamingMessage({
  text,
  isActive,
  isFastResponse = false,
  onDone,
  onProgress,
}: {
  text: string;
  isActive: boolean;
  isFastResponse?: boolean;
  onDone?: () => void;
  onProgress?: () => void;
}) {
  const displayed = useStreamingText(text, isActive, isFastResponse, onDone, onProgress);
  return <>{renderMarkdown(displayed)}</>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function TypingScreen({
  messages,
  textInput,
  setTextInput,
  onSend,
  onSwitchToTalk,
  onNewChat,
  appState,
  conversations = [],
  activeConversationId = "",
  onSwitchConversation = (_id: string) => {},
  onDeleteConversation = (_id: string) => {},
  onUpdateMessageFeedback = (_msgId: string, _fb: "up" | "down" | null) => {},
  onDeleteMessage = (_msgId: string) => {},
  onEditMessage = (_msgId: string, _txt: string) => {},
  onExportChat = () => {},
  onExportChatAsText = () => {},
  onSignOut = () => {},
  userName = "there",
  userEmail = "",
  userPhoto = "",
  onTogglePin,
  onSetFolder,
  onToggleReaction,
  onSetInstruction,
  onToggleShare,
  onBranchMessage,
  webSearchEnabled = false,
  onWebSearchToggle = () => {},
  apiUsage,
  onChangeApiKey,
}: TypingScreenProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wakeRecognitionRef = useRef<any>(null);
  const streamedMessageIdsRef = useRef<Set<string>>(new Set());
  const previousMessageIdsRef = useRef<Set<string> | null>(null);
  const previousConversationIdRef = useRef(activeConversationId);
  const [dotCount, setDotCount] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [mediaAttachment, setMediaAttachment] = useState<MediaAttachment | undefined>();
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAttractionPanel, setShowAttractionPanel] = useState(false);
  const [isWakeListening, setIsWakeListening] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelDropdownPos, setModelDropdownPos] = useState({ top: 0, right: 0 });
  const modelDropdownBtnRef = useRef<HTMLButtonElement>(null);
  const [currentModel, setCurrentModel] = useState<ModelType>(getConfig().model);
  const [responseMode, setResponseMode] = useState<ResponseModeType>(getConfig().responseMode);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<LanguageType>(getConfig().language);
  const [activeAssistant, setActiveAssistant] = useState<"ARCLIGHT" | "NOVA">(() => {
    const voice = getConfig().voice;
    // Default to ARCLIGHT if voice is not MAN or BOY, otherwise NOVA
    return voice === "MAN" || voice === "BOY" ? "NOVA" : "ARCLIGHT"; 
  });
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [showInstructionModal, setShowInstructionModal] = useState(false);
  const [instructionText, setInstructionText] = useState("");
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [showBranchConfirm, setShowBranchConfirm] = useState<string | null>(null);
  const [showChangeApiModal, setShowChangeApiModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [apiChangeError, setApiChangeError] = useState("");
  const [apiChangeLoading, setApiChangeLoading] = useState(false);

  const clearMediaAttachment = useCallback((revokePreview = true) => {
    setMediaAttachment((current) => {
      if (revokePreview && current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return undefined;
    });
  }, []);

  /* ---- auto-scroll ----------------------------------------------- */
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, appState]);

  useEffect(() => {
    const messageIds = new Set(messages.map((msg) => msg.id));
    const lastMsg = messages[messages.length - 1];
    const previousIds = previousMessageIdsRef.current;
    const conversationChanged = previousConversationIdRef.current !== activeConversationId;

    if (!previousIds || conversationChanged) {
      messages.forEach((msg) => {
        if (msg.sender === "zoya") streamedMessageIdsRef.current.add(msg.id);
      });
      previousMessageIdsRef.current = messageIds;
      previousConversationIdRef.current = activeConversationId;
      setActiveStreamId(null);
      return;
    }

    const isNewLastMessage = Boolean(lastMsg && !previousIds.has(lastMsg.id));
    previousMessageIdsRef.current = messageIds;

    if (!lastMsg || lastMsg.sender !== "zoya" || !isNewLastMessage || streamedMessageIdsRef.current.has(lastMsg.id)) return;
    setActiveStreamId(lastMsg.id);
  }, [messages, activeConversationId]);

  /* ---- Speech Recognition for text input ------------------------- */
  const [isVoiceTyping, setIsVoiceTyping] = useState(false);
  const speechRecognitionRef = useRef<any>(null);
  const interimTextRef = useRef('');

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Web Speech API is not supported in this browser.");
      setIsVoiceTyping(false);
      return;
    }

    let recognition: any = null;
    if (isVoiceTyping) {
      recognition = new SpeechRecognition();
      recognition.continuous = false; // Listen for a single phrase
      recognition.interimResults = true; // Get results as they come in
      recognition.lang = getCurrentSpeechLanguageCode();

      recognition.onstart = () => {
        console.log("Speech recognition started.");
        interimTextRef.current = ''; // Clear any previous interim text
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let currentFinal = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            currentFinal += event.results[i][0].transcript;
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }

        if (currentFinal) {
          setTextInput((prev) => {
            const textWithoutLastInterim = prev.endsWith(interimTextRef.current)
              ? prev.slice(0, prev.length - interimTextRef.current.length)
              : prev;
            interimTextRef.current = ''; // Clear interim after final
            return (textWithoutLastInterim.trim() ? textWithoutLastInterim.trim() + " " : "") + currentFinal;
          });
        } else if (currentInterim) {
          setTextInput((prev) => {
            const textWithoutLastInterim = prev.endsWith(interimTextRef.current)
              ? prev.slice(0, prev.length - interimTextRef.current.length)
              : prev;
            interimTextRef.current = currentInterim; // Store new interim
            return (textWithoutLastInterim.trim() ? textWithoutLastInterim.trim() + " " : "") + currentInterim;
          });
        }
      };

      recognition.onend = () => { console.log("Speech recognition ended."); setIsVoiceTyping(false); interimTextRef.current = ''; };
      recognition.onerror = (event: any) => { console.error("Speech recognition error:", event.error); setIsVoiceTyping(false); interimTextRef.current = ''; };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } else {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
      }
    }

    return () => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
      }
    };
  }, [isVoiceTyping, setTextInput]);

  const handleVoiceInputToggle = useCallback(() => {
    setIsVoiceTyping((prev) => !prev);
    if (!isVoiceTyping && textareaRef.current) {
      textareaRef.current.focus(); // Focus textarea when starting voice input
    }
  }, [isVoiceTyping]);

  // Auto-stop mic when AI starts processing
  useEffect(() => {
    if (appState === "processing" && isVoiceTyping) {
      setIsVoiceTyping(false);
    }
  }, [appState, isVoiceTyping]);

  /* ---- thinking dots ----------------------------------------------- */
  useEffect(() => { const iv = setInterval(() => setDotCount((c) => (c + 1) % 4), 400); return () => clearInterval(iv); }, []);

  /* ---- textarea auto-resize -------------------------------------- */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [textInput]);

  /* ---- keyboard shortcuts ---------------------------------------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowSidebar(false); setShowModelDropdown(false); setShowLanguageDropdown(false); setEditingMsgId(null); setShowMemoryModal(false); setShowCommandPalette(false); setShowExportModal(false); setShowInstructionModal(false); setShowShareModal(false); setShowReactionPicker(null); setShowMoreMenu(false); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") { e.preventDefault(); onNewChat(); }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); setShowSidebar(true); }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e") { e.preventDefault(); onExportChat(); }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m") { e.preventDefault(); setShowMemoryModal(true); }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "v") { e.preventDefault(); setShowAttractionPanel(true); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setShowCommandPalette(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNewChat, onExportChat, setShowSidebar, setShowModelDropdown, setShowLanguageDropdown, setEditingMsgId]);

  useEffect(() => {
    return () => {
      wakeRecognitionRef.current?.stop?.();
      wakeRecognitionRef.current = null;
    };
  }, []);

  /* ---- handlers --------------------------------------------------- */
  const sendModePrompt = useCallback((prompt: string) => {
    setShowAttractionPanel(false);
    setTextInput(prompt);
    textareaRef.current?.focus();
  }, [setTextInput]);

  const captureScreenAndAnalyze = useCallback(async () => {
    setShowAttractionPanel(false);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setTextInput("Screen Vision is not supported in this browser. Use the desktop app or a Chromium browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach((track) => track.stop());

      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      if (!base64) throw new Error("Could not capture screen image");

      onSend(undefined, {
        mimeType: "image/png",
        data: base64,
        fileName: "screen-capture.png",
        kind: "image",
        previewUrl: dataUrl,
        prompt: "Screen Vision Mode: Analyze this screen. Explain what is visible, identify errors or important UI details, and suggest the next useful action.",
      });
    } catch (error) {
      console.error("Screen capture failed", error);
      setTextInput("Screen capture was cancelled or failed. Try again and choose a window or screen to share.");
    }
  }, [onSend, setTextInput]);

  const toggleWakeWord = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setTextInput("Wake Word Mode needs browser speech recognition support. Try it in Chrome or the desktop app.");
      return;
    }

    if (wakeRecognitionRef.current) {
      wakeRecognitionRef.current.stop();
      wakeRecognitionRef.current = null;
      setIsWakeListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = getCurrentSpeechLanguageCode();
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript || "")
        .join(" ")
        .toLowerCase();
      if (transcript.includes("hey arclight") || transcript.includes("hey arc light") || transcript.includes("hey nova")) {
        setShowAttractionPanel(false);
        textareaRef.current?.focus();
        setTextInput("");
      }
    };
    recognition.onend = () => {
      wakeRecognitionRef.current = null;
      setIsWakeListening(false);
    };
    recognition.start();
    wakeRecognitionRef.current = recognition;
    setIsWakeListening(true);
  }, [setTextInput]);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() && !mediaAttachment) return;
    
    // Stop voice typing if active when sending
    if (isVoiceTyping) setIsVoiceTyping(false);
    
    onSend(e, mediaAttachment);
    clearMediaAttachment(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [textInput, mediaAttachment, onSend, isVoiceTyping, clearMediaAttachment]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSuggestion = (text: string) => { setTextInput(text); textareaRef.current?.focus(); };

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  }, []);

  const scrollToBottom = () => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });

  const handleStreamProgress = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 160) {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    }
  }, []);

  const handleStreamDone = useCallback((id: string) => {
    streamedMessageIdsRef.current.add(id);
    setActiveStreamId((currentId) => (currentId === id ? null : currentId));
  }, []);

  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = getFileKind(file);
    if (!kind) {
      setTextInput((prev) => prev + (prev ? "\n" : "") + `[Unsupported media type: ${file.name}]`);
      e.target.value = "";
      return;
    }
    const maxSize = kind === "pdf" || kind === "video" ? 25 * 1024 * 1024 : 1.5 * 1024 * 1024;
    if (file.size > maxSize) {
      const maxLabel = kind === "pdf" || kind === "video" ? "25 MB" : "1.5 MB";
      setTextInput((prev) => prev + (prev ? "\n" : "") + `[File is too large for inline analysis: ${file.name}. Please use a file under ${maxLabel}.]`);
      e.target.value = "";
      return;
    }

    if (kind === "text" || kind === "code") {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        setMediaAttachment((current) => {
          if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
          return {
            mimeType: file.type || "text/plain",
            data: "",
            fileName: file.name,
            kind,
            documentText: text.slice(0, 180000),
          };
        });
      };
      reader.onerror = () => {
        setTextInput((prev) => prev + (prev ? "\n" : "") + `[Could not read file: ${file.name}]`);
      };
      reader.readAsText(file);
      e.target.value = "";
      return;
    }

    const previewUrl = kind === "image" || kind === "video" ? URL.createObjectURL(file) : undefined;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      if (!base64) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        return;
      }
      setMediaAttachment((current) => {
        if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return {
          mimeType: file.type || (kind === "pdf" ? "application/pdf" : "application/octet-stream"),
          data: base64,
          fileName: file.name,
          kind,
          previewUrl,
        };
      });
    };
    reader.onerror = () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setTextInput((prev) => prev + (prev ? "\n" : "") + `[Could not read file: ${file.name}]`);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleModelChange = (model: ModelType) => {
    const cfg = getConfig();
    saveConfig({ ...cfg, model, responseMode: "balanced" });
    setCurrentModel(model);
    setResponseMode("balanced");
    resetZoyaSession();
    setShowModelDropdown(false);
  };

  const handleFastResponseMode = () => {
    const cfg = getConfig();
    saveConfig({ ...cfg, model: TEXT_CHAT_MODEL, responseMode: "fast" });
    setCurrentModel(TEXT_CHAT_MODEL);
    setResponseMode("fast");
    resetZoyaSession();
    setShowModelDropdown(false);
  };

  const handleAssistantChange = (assistant: "ARCLIGHT" | "NOVA") => {
    const cfg = getConfig();
    const voice: VoiceType = assistant === "ARCLIGHT" ? "WOMAN" : "MAN";
    saveConfig({ ...cfg, voice });
    setActiveAssistant(assistant);
    resetZoyaSession();
  };

  const handleLanguageChange = (language: LanguageType) => {
    const cfg = getConfig();
    saveConfig({ ...cfg, language });
    setCurrentLanguage(language);
    resetZoyaSession();
    setShowLanguageDropdown(false);
  };

  const dots = ".".repeat(dotCount);
  const isEmpty = messages.length === 0;
  const lastMsg = messages[messages.length - 1];
  const isStreaming = Boolean(activeStreamId);
  const isWaitingForReply = appState === "processing" && lastMsg?.sender !== "zoya";
  const currentModelName = responseMode === "fast" ? "Fast Response" : MODEL_OPTIONS.find((model) => model.id === currentModel)?.name || "3 Flash";
  const assistantLabel = activeAssistant === "NOVA" ? "Nova" : "ArcLight";
  const mediaAttachmentUrl = mediaAttachment ? mediaAttachment.previewUrl || `data:${mediaAttachment.mimeType};base64,${mediaAttachment.data}` : "";
  const isImageAttachment = mediaAttachment?.kind === "image" || mediaAttachment?.mimeType.startsWith("image/");
  const isVideoAttachment = mediaAttachment?.kind === "video" || mediaAttachment?.mimeType.startsWith("video/");

  const modelDropdown = (
    <div className="relative">
      <button
        ref={modelDropdownBtnRef}
        type="button"
        onClick={() => {
          if (modelDropdownBtnRef.current) {
            const rect = modelDropdownBtnRef.current.getBoundingClientRect();
            setModelDropdownPos({ top: rect.top, right: window.innerWidth - rect.right });
          }
          setShowModelDropdown((show) => !show);
        }}
        className="flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-all"
      >
        {currentModelName} <ChevronDown size={12} strokeWidth={1.5} className={`transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
      </button>
      {showModelDropdown && createPortal(
        <>
          {/* Backdrop to close on outside click */}
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowModelDropdown(false)} />
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="fixed w-56 bg-[#1e1f20] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[9999]"
              style={{ bottom: window.innerHeight - modelDropdownPos.top + 8, right: modelDropdownPos.right }}
            >
              {MODEL_OPTIONS.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleModelChange(model.id)}
                  className={`w-full text-left px-4 py-3 text-sm transition-all ${
                    responseMode === "balanced" && currentModel === model.id ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <div className="font-medium">{model.name}</div>
                  <div className="text-[11px] text-gray-500">{model.desc}</div>
                </button>
              ))}
              <button
                type="button"
                onClick={handleFastResponseMode}
                className={`w-full text-left px-4 py-3 text-sm transition-all ${
                  responseMode === "fast" ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="font-medium flex items-center gap-2">
                  <Zap size={14} strokeWidth={1.5} className="text-blue-400" />
                  Fast Response
                </div>
                <div className="text-[11px] text-gray-500">Uses default model with shorter, quicker replies</div>
              </button>
            </motion.div>
          </AnimatePresence>
        </>,
        document.body
      )}
    </div>
  );

  const attractionActions = [
    {
      title: "Screen Vision",
      desc: "Share a screen/window and ask ArcLight what it sees.",
      icon: <Monitor size={18} strokeWidth={1.5} />,
      tone: "text-cyan-300 bg-cyan-500/10 border-cyan-400/20",
      action: captureScreenAndAnalyze,
    },
    {
      title: "Wake Word",
      desc: isWakeListening ? "Listening for Hey ArcLight..." : "Start a lightweight Hey ArcLight listener.",
      icon: <Radio size={18} strokeWidth={1.5} />,
      tone: isWakeListening ? "text-green-300 bg-green-500/10 border-green-400/20" : "text-blue-300 bg-blue-500/10 border-blue-400/20",
      action: toggleWakeWord,
    },
    {
      title: "Voice PC Control",
      desc: "Demo commands for opening sites, music, and browser actions.",
      icon: <Command size={18} strokeWidth={1.5} />,
      tone: "text-violet-300 bg-violet-500/10 border-violet-400/20",
      action: () => {
        setShowAttractionPanel(false);
        onSwitchToTalk();
      },
    },
    {
      title: "Live Translation",
      desc: "Turn any pasted or spoken line into bilingual output.",
      icon: <Languages size={18} strokeWidth={1.5} />,
      tone: "text-emerald-300 bg-emerald-500/10 border-emerald-400/20",
      action: () => sendModePrompt("Live Translation Mode: Translate everything I send between Hindi and English. Preserve tone, explain tricky phrases briefly, and keep the output easy to speak aloud."),
    },
    {
      title: "AI Study Mode",
      desc: "Make notes, quizzes, flashcards, and chapter explainers.",
      icon: <BookOpen size={18} strokeWidth={1.5} />,
      tone: "text-amber-300 bg-amber-500/10 border-amber-400/20",
      action: () => sendModePrompt("AI Study Mode: If I upload a PDF or notes, make clean study notes, important questions, flashcards, a short quiz, and explain the hard parts simply."),
    },
    {
      title: "Code Copilot",
      desc: "Explain bugs, architecture, and fixes from code files.",
      icon: <Code size={18} strokeWidth={1.5} />,
      tone: "text-sky-300 bg-sky-500/10 border-sky-400/20",
      action: () => sendModePrompt("Code Copilot Mode: Explain uploaded code, find bugs, suggest fixes, and give clean step-by-step changes. Be practical and concise."),
    },
    {
      title: "Auto Note Maker",
      desc: "Turn rough speech or text into organized notes.",
      icon: <NotebookPen size={18} strokeWidth={1.5} />,
      tone: "text-rose-300 bg-rose-500/10 border-rose-400/20",
      action: () => sendModePrompt("Auto Note Maker: Turn my rough text or transcript into clean notes with a title, summary, bullets, key takeaways, and action items."),
    },
    {
      title: "Share Summary",
      desc: "Create a post-ready summary from this conversation.",
      icon: <Share2 size={18} strokeWidth={1.5} />,
      tone: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-400/20",
      action: () => sendModePrompt("Create a beautiful shareable summary of this conversation. Include a title, key points, useful outcomes, and a short social caption."),
    },
    {
      title: "Avatar Scene",
      desc: "Generate a design prompt for a reactive 3D AI avatar.",
      icon: <Wand2 size={18} strokeWidth={1.5} />,
      tone: "text-purple-300 bg-purple-500/10 border-purple-400/20",
      action: () => sendModePrompt("Design a reactive 3D AI avatar for ArcLight/Nova. Give me visual style, idle/listening/speaking animations, colors, and implementation steps using React Three Fiber."),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex text-white font-sans overflow-hidden safe-inset" style={{ background: 'radial-gradient(ellipse at center, #0a1628 0%, #060b15 40%, #000000 100%)' }}>
      {showConfigModal && (
        <SystemConfigModal
          onClose={() => {
            setShowConfigModal(false);
            const config = getConfig();
            const voice = config.voice;
            setActiveAssistant(voice === "MAN" || voice === "BOY" ? "NOVA" : "ARCLIGHT");
            setCurrentModel(config.model);
            setResponseMode(config.responseMode);
            setCurrentLanguage(config.language);
          }}
        />
      )}
      {showMemoryModal && <MemoryModal onClose={() => setShowMemoryModal(false)} />}
      <AnimatePresence>
        {showAttractionPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAttractionPanel(false)}
            className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 md:backdrop-blur-xl p-3 sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl max-h-[86vh] overflow-hidden rounded-2xl border border-white/10 bg-[#101114] shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/15 text-blue-300 flex items-center justify-center">
                    <Sparkles size={18} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">Extra's Features</h2>
                    <p className="text-xs text-gray-500">Demo-ready modes that make ArcLight feel alive</p>
                  </div>
                </div>
                <button onClick={() => setShowAttractionPanel(false)} className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>

              <div className="grid gap-2.5 sm:gap-3 p-3 sm:p-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 max-h-[60vh] sm:max-h-[68vh]">
                {attractionActions.map((feature) => (
                  <button
                    key={feature.title}
                    type="button"
                    onClick={feature.action}
                    className="group text-left rounded-2xl border border-white/10 bg-white/[0.035] p-4 hover:bg-white/[0.06] transition-all"
                  >
                    <div className={`mb-4 h-10 w-10 rounded-xl border flex items-center justify-center ${feature.tone}`}>
                      {feature.icon}
                    </div>
                    <div className="text-sm font-semibold text-white">{feature.title}</div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500 group-hover:text-gray-400">{feature.desc}</p>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
                <span className="text-[11px] text-gray-500">Shortcut: Ctrl + Shift + V</span>
                <button onClick={() => setShowAttractionPanel(false)} className="rounded-xl bg-white px-5 py-2 text-sm font-medium text-black hover:bg-gray-200 transition-colors">
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          SIDEBAR
         ═══════════════════════════════════════════════════════════════ */}
<AnimatePresence mode="wait">
  {showSidebar && (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={() => setShowSidebar(false)}
        className="absolute inset-0 z-40 bg-black/55 lg:hidden"
      />

      {/* Sidebar */}
      <motion.aside
        initial={{ x: -320, opacity: 0.9 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -320, opacity: 0.95 }}
        transition={{
          duration: 0.28,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="absolute lg:static z-50 w-[280px] sm:w-[260px] md:w-[280px] xl:w-[300px] h-full bg-[#0e0e0e] border-r border-white/[0.06] flex flex-col overflow-hidden safe-inset-top safe-inset-bottom gpu-accelerated"
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-3 safe-inset-top">
          <button
            onClick={() => setShowSidebar(false)}
            className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-white transition-all duration-200"
          >
            <Menu size={18} strokeWidth={1.5} />
          </button>

          <span className="text-[15px] font-medium tracking-wide text-white sm:hidden">
            {assistantLabel}
          </span>

          <button
            onClick={() => setShowCommandPalette(true)}
            className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-white transition-all duration-200"
            title="Command palette (Ctrl+K)"
          >
            <Search size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* User Profile Badge */}
        {userEmail && (
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              {userPhoto ? (
                <img
                  src={userPhoto}
                  alt={userName}
                  className="w-7 h-7 rounded-full border border-white/[0.06] object-cover flex-shrink-0"
                  referrerPolicy="no-referrer"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                />
              ) : null}
              <div className={`w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-white/[0.06] flex items-center justify-center flex-shrink-0 ${userPhoto ? 'hidden' : ''}`}>
                <span className="text-[11px] font-semibold text-blue-300">{userEmail.charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-300 font-medium truncate">{userName}</p>
                <p className="text-[9px] text-gray-600 truncate">{userEmail}</p>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-9 pr-3 py-2 bg-white/[0.03] border border-white/[0.05] rounded-xl text-[12px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-white/10 transition-all"
            />
            {sidebarSearch && (
              <button onClick={() => setSidebarSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X size={12} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        {/* New Chat */}
        <div className="px-3 py-2">
          <button
            onClick={() => {
              onNewChat();
              setShowSidebar(false);
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/15 hover:border-blue-500/25 text-sm text-blue-300 hover:text-blue-200 transition-all duration-200 group"
          >
            <Plus size={16} strokeWidth={2} className="group-hover:rotate-90 transition-transform duration-200" />
            New chat
          </button>
        </div>

        {/* Assistant Switch */}
        <div className="px-4 pb-2">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.03] border border-white/[0.05] p-0.5">
            {(["ARCLIGHT", "NOVA"] as const).map((assistant) => (
              <button
                key={assistant}
                type="button"
                onClick={() => handleAssistantChange(assistant)}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-bold tracking-tight transition-all duration-200 ${
                  activeAssistant === assistant
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "text-gray-500 hover:text-white hover:bg-white/[0.03]"
                }`}
              >
                {assistant}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="px-3 pb-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLanguageDropdown((show) => !show)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] text-[13px] text-gray-400 hover:text-white transition-all duration-200"
            >
              <Languages size={16} className="text-blue-400" />
              <span className="flex-1 text-left">Speech language</span>
              <span className="text-[11px] text-gray-500">{currentLanguage}</span>
              <ChevronDown size={14} className={`transition-transform ${showLanguageDropdown ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {showLanguageDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute left-0 right-0 top-full mt-2 rounded-2xl bg-[#141414] border border-white/[0.08] shadow-2xl overflow-hidden z-50"
                >
                  {LANGUAGE_OPTIONS.map((language) => (
                    <button
                      key={language}
                      type="button"
                      onClick={() => handleLanguageChange(language)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                        currentLanguage === language
                          ? "bg-blue-600/15 text-white"
                          : "text-gray-400 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <span>{language}</span>
                      {currentLanguage === language && <Check size={14} strokeWidth={1.5} className="text-blue-400" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-4 h-px bg-white/[0.05] mb-2" />

        {/* Recent Chats */}
<div className="flex-1 overflow-y-auto px-3 pb-4">
  <p className="text-[10px] text-gray-500 uppercase tracking-[0.1em] px-3 mb-2 mt-4 font-semibold">
    History
  </p>

  {/* Pinned chats first */}
  {conversations.filter(c => c.pinned && (!sidebarSearch || c.title.toLowerCase().includes(sidebarSearch.toLowerCase()))).length > 0 && (
    <>
      <p className="text-[10px] text-blue-400/60 uppercase tracking-[0.1em] px-3 mb-1 mt-2 font-semibold flex items-center gap-1">
        <Pin size={10} strokeWidth={1.5} /> Pinned
      </p>
      {conversations.filter(c => c.pinned && (!sidebarSearch || c.title.toLowerCase().includes(sidebarSearch.toLowerCase()))).map((conv) => {
        const isActive = conv.id === activeConversationId;
        return (
          <div key={`pinned-${conv.id}`} className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isActive ? "bg-white/[0.08] text-white" : "text-gray-400 hover:text-white hover:bg-white/[0.04]"}`}>
            <button onClick={() => { onSwitchConversation(conv.id); setShowSidebar(false); }} className="flex-1 text-left truncate text-[12.5px]">
              {conv.folder && <span className="text-[9px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded mr-1">{conv.folder}</span>}
              {conv.title}
            </button>
            <span className="text-[10px] text-gray-600 shrink-0">{timeAgo(conv.updatedAt)}</span>
            <button onClick={() => onTogglePin?.(conv.id)} className="opacity-100 p-1 rounded-md hover:bg-blue-500/10 text-blue-400 transition-all duration-200" title="Unpin">
              <Pin size={12} strokeWidth={1.5} />
            </button>
            <button onClick={() => onDeleteConversation(conv.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all duration-200">
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
      <div className="mx-3 h-px bg-white/[0.04] my-2" />
    </>
  )}

  <div className="space-y-1">
    {conversations.filter(c => !c.pinned && (!sidebarSearch || c.title.toLowerCase().includes(sidebarSearch.toLowerCase()))).map((conv) => {
      const isActive = conv.id === activeConversationId;

      return (
        <div
          key={conv.id}
          className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
            isActive
              ? "bg-white/[0.08] text-white"
              : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
          }`}
        >
          <button
            onClick={() => {
              onSwitchConversation(conv.id);
              setShowSidebar(false);
            }}
            className="flex-1 text-left truncate text-[12.5px]"
          >
            {conv.folder && <span className="text-[9px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded mr-1">{conv.folder}</span>}
            {conv.title}
          </button>

          <span className="text-[10px] text-gray-600 shrink-0">
            {timeAgo(conv.updatedAt)}
          </span>

          <button
            onClick={() => onTogglePin?.(conv.id)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-blue-500/10 text-gray-500 hover:text-blue-400 transition-all duration-200"
            title="Pin"
          >
            <Pin size={12} strokeWidth={1.5} />
          </button>

          <button
            onClick={() => onDeleteConversation(conv.id)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all duration-200"
          >
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        </div>
      );
    })}
  </div>
</div>

        {/* Bottom Actions */}
        <div className="p-2 border-t border-white/[0.05] space-y-0.5 bg-[#0e0e0e]">
          <button
            onClick={() => setShowExportModal(true)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.05] text-[13px] text-gray-400 hover:text-white transition-all duration-200"
          >
            <Download size={16} strokeWidth={1.5} />
            Export chat
          </button>

          <button
            onClick={async () => {
              const link = await onToggleShare?.(activeConversationId);
              if (link) {
                setShareLink(`${window.location.origin}/share/${link}`);
                setShowShareModal(true);
              }
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.05] text-[13px] text-gray-400 hover:text-white transition-all duration-200"
          >
            <Share2 size={16} strokeWidth={1.5} />
            Share conversation
          </button>

          <button
            onClick={() => {
              onSwitchToTalk();
              setShowSidebar(false);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.05] text-[13px] text-gray-400 hover:text-white transition-all duration-200"
          >
            <Mic size={16} strokeWidth={1.5} />
            Voice mode
          </button>

          {/* More Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(prev => !prev)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-200 ${
                showMoreMenu ? 'bg-white/[0.08] text-white' : 'hover:bg-white/[0.05] text-gray-400 hover:text-white'
              }`}
            >
              <MoreVertical size={16} strokeWidth={1.5} />
              More
              <ChevronDown size={14} className={`ml-auto transition-transform duration-200 ${showMoreMenu ? 'rotate-180' : ''}`} strokeWidth={1.5} />
            </button>

            <AnimatePresence>
              {showMoreMenu && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pl-2 space-y-0.5 py-1">
                    <button
                      onClick={() => {
                        const currentConv = conversations.find(c => c.id === activeConversationId);
                        setInstructionText(currentConv?.systemInstruction || "");
                        setShowInstructionModal(true);
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/[0.05] text-[12px] text-gray-400 hover:text-white transition-all duration-200"
                    >
                      <Type size={14} strokeWidth={1.5} />
                      Custom instructions
                    </button>

                    <button
                      onClick={() => {
                        setShowMemoryModal(true);
                        setShowSidebar(false);
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/[0.05] text-[12px] text-gray-400 hover:text-white transition-all duration-200"
                    >
                      <Brain size={14} strokeWidth={1.5} />
                      Memory
                    </button>

                    <button
                      onClick={() => {
                        setShowConfigModal(true);
                        setShowSidebar(false);
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/[0.05] text-[12px] text-gray-400 hover:text-white transition-all duration-200"
                    >
                      <Settings size={14} strokeWidth={1.5} />
                      System config
                    </button>

                    <button
                      onClick={() => {
                        setShowAttractionPanel(true);
                        setShowSidebar(false);
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/[0.05] text-[12px] text-gray-400 hover:text-white transition-all duration-200"
                    >
                      <Sparkles size={14} strokeWidth={1.5} />
                      Extra features
                    </button>

                    <button
                      onClick={() => { setShowShortcuts(true); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/[0.05] text-[12px] text-gray-400 hover:text-white transition-all duration-200"
                    >
                      <Keyboard size={14} strokeWidth={1.5} />
                      Keyboard shortcuts
                    </button>

                    <button
                      onClick={() => { setShowChangeApiModal(true); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/[0.05] text-[12px] text-gray-400 hover:text-white transition-all duration-200"
                    >
                      <Hash size={14} strokeWidth={1.5} />
                      Change API key
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Compact API Usage */}
          {apiUsage && (
            <div className="mx-1 mt-1 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 uppercase tracking-[0.08em] font-medium">Usage</span>
                <span className="text-[10px] text-blue-400/80 font-medium">{apiUsage.todayRequests} today</span>
              </div>
              <div className="h-[3px] bg-white/[0.04] rounded-full overflow-hidden mt-1.5">
                <div className="h-full bg-blue-500/50 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (apiUsage.todayRequests / 1500) * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] text-gray-600">{apiUsage.totalRequests} total</span>
                <span className="text-[9px] text-gray-600">~{apiUsage.estimatedTokens > 1000 ? `${(apiUsage.estimatedTokens / 1000).toFixed(1)}k` : apiUsage.estimatedTokens} tokens</span>
              </div>
              <p className="text-[8px] text-gray-700 mt-0.5">Free tier: 1,500 req/day</p>
            </div>
          )}

          <button
            onClick={() => onSignOut?.()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 text-[13px] text-gray-400 hover:text-red-300 transition-all duration-200"
          >
            <LogOut size={16} strokeWidth={1.5} />
            Sign out
          </button>
        </div>
      </motion.aside>
    </>
  )}
</AnimatePresence>
      {/* ═══════════════════════════════════════════════════════════════
          MAIN CONTENT
         ═══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Top Bar ── */}
        <header className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 z-10 bg-black/60 md:bg-black/40 md:backdrop-blur-md safe-inset-top">
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => setShowSidebar(true)} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all">
              <Menu size={18} strokeWidth={1.5} />
            </button>
            <span className="text-base sm:text-lg font-medium tracking-tight">{assistantLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden sm:flex items-center rounded-full bg-white/[0.04] border border-white/[0.06] p-1">
              {(["ARCLIGHT", "NOVA"] as const).map((assistant) => (
                <button
                  key={assistant}
                  type="button"
                  onClick={() => handleAssistantChange(assistant)}
                  className={`px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-medium transition-all ${
                    activeAssistant === assistant
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                      : "text-gray-500 hover:text-white"
                  }`}
                >
                  {assistant}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowConfigModal(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all touch-target"
              title="System config"
            >
            <Settings size={18} strokeWidth={1.5} />
          </button>
            <button
              onClick={() => { onSwitchToTalk(); }}
              className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${
                appState === "listening" || appState === "speaking"
                  ? "bg-gradient-to-r from-red-500/20 to-red-400/20 border border-red-500/30 text-red-400 hover:text-red-200 shadow-[0_0_20px_rgba(255,0,0,0.3)] animate-wiggle animate-pulse-red"
                  : appState === "processing"
                    ? "bg-gradient-to-r from-blue-600/20 to-blue-500/20 border border-blue-500/30 text-blue-400 hover:text-white shadow-[0_0_20px_rgba(59,130,246,0.2)] animate-pulse-blue"
                    : "bg-gradient-to-r from-blue-600/20 to-blue-500/20 border border-blue-500/30 text-blue-400 hover:text-white hover:bg-none hover:bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
              }`}
              title="Open voice console"
            >
              <Mic size={18} strokeWidth={1.5} />
            </button>
            <button onClick={() => onSignOut?.()} className="p-2 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-500/10 transition-all" title="Sign out">
              <LogOut size={18} strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {/* ── Messages Scroll Area ── */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto scroll-smooth" style={{ scrollbarWidth: "thin", scrollbarColor: "#2a2b2c transparent" }}>
          {isEmpty ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex flex-col items-center justify-center min-h-full px-4 pb-32 pt-12">
              <div className="w-full max-w-2xl mx-2 sm:mx-auto px-2 sm:px-4">
                <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="w-fit text-3xl sm:text-4xl md:text-5xl font-normal mb-3 text-left">
                  <GradientText
                    colors={["#5227FF", "#1d0039", "#B497CF", "#5227FF"]}
                    animationSpeed={8}
                    showBorder={false}
                  >
                    Hi, {userName}
                  </GradientText>
                </motion.h2>
                <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="text-2xl sm:text-3xl md:text-4xl font-normal mb-8 sm:mb-10 text-left text-[#9aa0a6]">
                  How can I help you today?
                </motion.h2>
              </div>

              {/* Input Pill - Empty State */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="w-full max-w-2xl mx-2 sm:mx-auto"> 
                <StarBorder as="form" onSubmit={handleSubmit} className={`rounded-2xl sm:rounded-3xl transition-colors ${isVoiceTyping ? '' : ''}`} color="#4285F4" speed="6s">
                <div className={`relative rounded-2xl sm:rounded-3xl transition-colors px-4 py-3.5 sm:px-5 sm:py-4 ${isVoiceTyping ? 'bg-blue-900/20 border border-blue-500/30 shadow-blue-500/20' : 'bg-[#1e1f20]'}`}>
                  {mediaAttachment && (
                    <div className="mb-3 flex items-center gap-3">
                      <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 bg-black/30 flex items-center justify-center">
                        {isVideoAttachment ? (
                          <video src={mediaAttachmentUrl} className="w-full h-full object-cover" muted playsInline />
                        ) : isImageAttachment ? (
                          <img src={mediaAttachmentUrl} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-blue-300">{mediaAttachment.kind === "code" ? <Code size={24} strokeWidth={1.5} /> : <FileText size={24} strokeWidth={1.5} />}</div>
                        )}
                        <button type="button" onClick={() => clearMediaAttachment()} className="absolute top-1 right-1 bg-black/65 rounded-full p-0.5 text-white hover:bg-black/85 transition-colors" title="Remove media"><X size={11} strokeWidth={1.5} /></button>
                      </div>
                      <div className="flex min-w-0 items-center gap-2 text-xs text-gray-400">
                        {getAttachmentIcon(mediaAttachment)}
                        <span className="truncate">{mediaAttachment.fileName || getAttachmentLabel(mediaAttachment)}</span>
                      </div>
                    </div>
                  )}
                  <textarea ref={textareaRef} value={textInput} onChange={(e) => setTextInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={`Ask ${assistantLabel} anything...`} rows={1} className="w-full bg-transparent text-[15px] text-[#e8eaed] placeholder-[#5f6368] resize-none outline-none max-h-[120px] scrollbar-hide mb-2.5 sm:mb-3" style={{ scrollbarWidth: "none" }} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-0.5"> 
                      <button type="button" onClick={() => imageInputRef.current?.click()} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-all" title="Upload image or video"><Plus size={18} strokeWidth={1.5} /></button>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-all" title="Attach PDF, text, or code file"><Paperclip size={18} strokeWidth={1.5} /></button>
                      <button type="button" onClick={() => setShowShortcuts(true)} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-all" title="Shortcut"><Command size={18} strokeWidth={1.5} /></button>
                    </div>
                    <div className="flex items-center gap-2">
                      {modelDropdown}
                      <button
                        type="button"
                        onClick={handleVoiceInputToggle}
                        className={`p-2 rounded-full transition-all ${
                          isVoiceTyping ? "bg-blue-600/20 text-blue-400 animate-pulse-blue" : "hover:bg-white/10 text-gray-400 hover:text-white"
                        }`}
                        title="Voice input"
                      >
                        <Mic size={18} strokeWidth={1.5} />
                      </button>
                      {appState === "processing" ? (
                        <button type="button" className="p-2 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                        </button>
                      ) : (
                        <button type="submit" disabled={!textInput.trim() && !mediaAttachment} className="p-2 rounded-full bg-white text-black hover:bg-gray-200 transition-all disabled:opacity-25 disabled:cursor-not-allowed">
                          <ArrowRight size={20} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                </StarBorder>
              </motion.div>

              {/* Suggestion Pills */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex flex-wrap justify-center gap-1.5 sm:gap-2 mt-5 sm:mt-6 max-w-2xl mx-2 sm:mx-auto px-2 sm:px-4">
                {SUGGESTIONS.map((text, i) => (
                  <SpotlightCard key={i} className="inline-block" spotlightColor="rgba(66, 133, 244, 0.15)" rounded="9999px">
                  <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 + i * 0.05 }} onClick={() => handleSuggestion(text)} className="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-full bg-[#1e1f20] text-[#e8eaed] text-[13px] hover:bg-[#2a2b2c] transition-colors border border-white/[0.04] touch-target">
                    {text}
                  </motion.button>
                  </SpotlightCard>
                ))}
              </motion.div>
            </motion.div>
          ) : (
            <div className="max-w-3xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => {
                  const isUser = msg.sender === "user";
                  const isLast = idx === messages.length - 1;
                  const streamThis = !isUser && msg.id === activeStreamId;
                  const isEditing = editingMsgId === msg.id;
                  return (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="group msg-contain">
                      <div className={`flex gap-2.5 sm:gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                        <div className="shrink-0 mt-0.5">
                          {isUser ? (
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center"><User size={13} strokeWidth={1.5} className="text-blue-300" /></div>
                          ) : (
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center"><Sparkles size={13} strokeWidth={1.5} className="text-white" /></div>
                          )}
                        </div>
                        <div className={`flex-1 ${isUser ? "text-right" : "text-left"} min-w-0`}>
                          <div className={`inline-block text-left max-w-full ${isUser ? "bg-blue-600/10 rounded-2xl rounded-tr-sm" : ""} px-4 py-3`}>
                            {msg.imageUrl && (
                              <div className="mb-2 rounded-xl overflow-hidden border border-white/10 max-w-[300px]">
                                <img src={msg.imageUrl} alt="Uploaded" className="w-full h-auto object-cover max-h-[300px]" />
                              </div>
                            )}
                            {msg.videoUrl && (
                              <div className="mb-2 rounded-xl overflow-hidden border border-white/10 max-w-[340px] bg-black/40">
                                <video src={msg.videoUrl} controls className="w-full h-auto max-h-[320px]" />
                              </div>
                            )}
                            {msg.fileName && !msg.imageUrl && !msg.videoUrl && (
                              <div className="mb-2 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 max-w-[360px]">
                                <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center">
                                  {msg.fileType?.includes("code") ? <Code size={16} strokeWidth={1.5} /> : <FileText size={16} strokeWidth={1.5} />}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm text-gray-200">{msg.fileName}</div>
                                  <div className="text-[11px] text-gray-600">{msg.fileType || "document"}</div>
                                </div>
                              </div>
                            )}
                            {isUser ? (
                              isEditing ? (
                                <div className="flex flex-col gap-2 min-w-[200px] sm:min-w-[300px]">
                                  <textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="w-full bg-[#1e1f20] border border-blue-500/30 rounded-xl p-3 text-[14px] text-gray-200 outline-none resize-none" rows={3} />
                                  <div className="flex gap-2 justify-end">
                                    <button onClick={() => setEditingMsgId(null)} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
                                    <button onClick={() => { onEditMessage?.(msg.id, editText); setEditingMsgId(null); }} className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white hover:bg-blue-500 transition-colors">Regenerate</button>
                                    <button onClick={() => { onBranchMessage?.(msg.id, editText); setEditingMsgId(null); }} className="px-3 py-1.5 rounded-lg text-xs bg-purple-600 text-white hover:bg-purple-500 transition-colors flex items-center gap-1"><GitBranch size={12} strokeWidth={1.5} /> Branch</button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-[15px] text-[#e8eaed] leading-[1.8] whitespace-pre-wrap">{msg.text}</p>
                              )
                            ) : (
                              <div className="space-y-1">
                                {streamThis ? (
                                  <StreamingMessage
                                    text={msg.text}
                                    isActive={true}
                                    isFastResponse={responseMode === "fast"}
                                    onDone={() => handleStreamDone(msg.id)}
                                    onProgress={handleStreamProgress}
                                  />
                                ) : renderMarkdown(msg.text)}
                                {streamThis && <span className="inline-block w-1.5 h-4 bg-blue-400 ml-0.5 animate-pulse align-middle rounded-sm" />}
                              </div>
                            )}
                          </div>
                          {/* Action Bar */}
                          <div className="flex items-center gap-0.5 mt-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity relative action-bar-hover">
                            <button onClick={() => handleCopy(msg.text, msg.id)} className="p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all" title="Copy">
                              {copiedId === msg.id ? <Check size={13} strokeWidth={1.5} className="text-green-400" /> : <Copy size={13} strokeWidth={1.5} />}
                            </button>
                            {!isUser && (
                              <button onClick={() => onSend()} className="p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all" title="Regenerate"><RotateCcw size={13} strokeWidth={1.5} /></button>
                            )}
                            {!isUser && (
                              <>
                                <button onClick={() => onUpdateMessageFeedback?.(msg.id, msg.feedback === "up" ? null : "up")} className={`p-1 rounded-md transition-all ${msg.feedback === "up" ? "text-blue-400 bg-blue-500/10" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`} title="Helpful"><ThumbsUp size={13} strokeWidth={1.5} /></button>
                                <button onClick={() => onUpdateMessageFeedback?.(msg.id, msg.feedback === "down" ? null : "down")} className={`p-1 rounded-md transition-all ${msg.feedback === "down" ? "text-rose-400 bg-rose-500/10" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`} title="Not helpful"><ThumbsDown size={13} strokeWidth={1.5} /></button>
                              </>
                            )}
                            {/* Reactions */}
                            <div className="relative">
                              <button onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)} className="p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all" title="React"><Smile size={13} strokeWidth={1.5} /></button>
                              {showReactionPicker === msg.id && (
                                <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 bg-[#1e1f20] border border-white/10 rounded-xl p-1.5 shadow-xl z-50">
                                  {["\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE80", "\uD83D\uDC4D", "\uD83D\uDC4E", "\uD83D\uDD25", "\u2B50"].map((emoji) => (
                                    <button key={emoji} onClick={() => { onToggleReaction?.(activeConversationId, msg.id, emoji); setShowReactionPicker(null); }} className="p-1 rounded hover:bg-white/10 text-sm transition-all">{emoji}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Branch */}
                            {isUser && (
                              <button onClick={() => { setEditingMsgId(msg.id); setEditText(msg.text); }} className="p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all" title="Edit & branch"><GitBranch size={13} strokeWidth={1.5} /></button>
                            )}
                            {isUser && (
                              <button onClick={() => { setEditingMsgId(msg.id); setEditText(msg.text); }} className="p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all" title="Edit"><Pencil size={13} strokeWidth={1.5} /></button>
                            )}
                            <button onClick={() => onDeleteMessage?.(msg.id)} className="p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Delete"><Trash2 size={13} strokeWidth={1.5} /></button>
                          </div>
                          {/* Render reactions */}
                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Array.from(new Set(msg.reactions)).map((emoji) => (
                                <button key={emoji} onClick={() => onToggleReaction?.(activeConversationId, msg.id, emoji)} className="px-1.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs hover:bg-white/[0.1] transition-all">
                                  {emoji} <span className="text-gray-500 text-[10px]">{msg.reactions!.filter(r => r === emoji).length}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {isWaitingForReply && !isStreaming && (
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                    <Sparkles size={14} strokeWidth={1.5} className="text-white" />
                  </div>
                  <div className="flex flex-col gap-2 pt-2 w-full max-w-xs">
                    <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                      <span>{assistantLabel} is thinking</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden relative">
                      <motion.div
                        animate={{
                          x: ["-100%", "100%"],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-blue-500 to-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="h-4" />
            </div>
          )}
        </div>

        {/* ── Scroll to Bottom Button ── */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} onClick={scrollToBottom} className="absolute bottom-28 sm:bottom-32 right-4 sm:right-6 z-30 p-2.5 rounded-full bg-[#1e1f20] border border-white/10 text-gray-400 hover:text-white hover:bg-[#2a2b2c] transition-all shadow-xl gpu-accelerated">
              <ChevronDown size={16} />
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Input Area (Chat Mode) ── */}
        {!isEmpty && (
          <div className="flex-shrink-0 px-2.5 sm:px-4 pb-3 sm:pb-6 pt-2 bg-gradient-to-t from-black via-black to-transparent z-20 safe-inset-bottom">
            <div className="max-w-2xl mx-auto">
              {mediaAttachment && (
                <div className="mb-2 flex items-center gap-2">
                  <div className="relative rounded-lg overflow-hidden border border-white/10 w-14 h-14 sm:w-16 sm:h-16 bg-black/30 flex items-center justify-center">
                    {isVideoAttachment ? (
                      <video src={mediaAttachmentUrl} className="w-full h-full object-cover" muted playsInline />
                    ) : isImageAttachment ? (
                      <img src={mediaAttachmentUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-blue-300">{mediaAttachment.kind === "code" ? <Code size={20} /> : <FileText size={20} />}</div>
                    )}
                    <button onClick={() => clearMediaAttachment()} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white hover:bg-black/80 transition-colors"><X size={10} /></button>
                  </div>
                  <span className="text-xs text-gray-500 truncate">{mediaAttachment.fileName || getAttachmentLabel(mediaAttachment)}</span>
                </div>
              )}
              <StarBorder as="form" onSubmit={handleSubmit} className="rounded-2xl sm:rounded-3xl" color="#4285F4" speed="6s">
              <div className={`relative rounded-2xl sm:rounded-3xl transition-all duration-300 px-4 py-3.5 sm:px-5 sm:py-4 ${isVoiceTyping ? 'bg-blue-900/20 border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : 'bg-[#1e1f20]'}`}>
                <textarea ref={textareaRef} value={textInput} onChange={(e) => setTextInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={`Ask ${assistantLabel} anything...`} rows={1} className="w-full bg-transparent text-[15px] text-[#e8eaed] placeholder-[#5f6368] resize-none outline-none max-h-[120px] scrollbar-hide mb-2.5 sm:mb-3" style={{ scrollbarWidth: "none" }} />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => imageInputRef.current?.click()} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-all" title="Upload image or video"><Plus size={18} strokeWidth={1.5} /></button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-all" title="Attach PDF, text, or code file"><Paperclip size={18} strokeWidth={1.5} /></button>
                    <button
                      type="button"
                      onClick={() => onWebSearchToggle()}
                      className={`p-2 rounded-full transition-all ${
                        webSearchEnabled ? "bg-blue-500/20 text-blue-400" : "text-gray-400 hover:text-white hover:bg-white/10"
                      }`}
                      title={webSearchEnabled ? "Web search ON" : "Enable web search"}
                    >
                      <Globe size={18} strokeWidth={1.5} />
                    </button>
                    <button type="button" onClick={() => setShowShortcuts(true)} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-all" title="Shortcut"><Command size={18} strokeWidth={1.5} /></button>
                  </div>
                  <div className="flex items-center gap-2">
                    {modelDropdown}
                    <button
                      type="button"
                      onClick={handleVoiceInputToggle}
                      className={`p-2 rounded-full transition-all ${
                        isVoiceTyping ? "bg-blue-600/20 text-blue-400 animate-pulse-blue" : "hover:bg-white/10 text-gray-400 hover:text-white"
                      }`}
                      title="Voice input"
                    >
                      <Mic size={18} strokeWidth={1.5} />
                    </button>
                    {appState === "processing" ? (
                      <button type="button" className="p-2 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                      </button>
                    ) : (
                      <button type="submit" disabled={!textInput.trim() && !mediaAttachment} className="p-2 rounded-full bg-white text-black hover:bg-gray-200 transition-all disabled:opacity-25 disabled:cursor-not-allowed">
                        <ArrowRight size={20} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              </StarBorder>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleAttachmentSelect} />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.markdown,.mdx,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.php,.rb,.swift,.kt,.html,.css,.scss,.json,.xml,.yaml,.yml,.sql,.sh,.bat,.ps1,.env,.toml,.ini,text/*,application/pdf,application/json"
        className="hidden"
        onChange={handleAttachmentSelect}
      />

      {/* Command Palette (Ctrl+K) */}
      <AnimatePresence>
        {showCommandPalette && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCommandPalette(false)} className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 pt-[20vh] p-3 sm:p-4">
            <motion.div initial={{ scale: 0.96, opacity: 0, y: -10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: -10 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-[#1a1b1c] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
                <Search size={18} strokeWidth={1.5} className="text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search chats, actions..."
                  className="flex-1 bg-transparent text-[15px] text-white placeholder-gray-500 outline-none"
                  onChange={(e) => setSidebarSearch(e.target.value)}
                />
                <kbd className="px-2 py-0.5 rounded bg-white/5 text-gray-500 font-mono text-[10px] border border-white/10">ESC</kbd>
              </div>
              <div className="max-h-[50vh] overflow-y-auto p-2">
                {/* Quick Actions */}
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.1em] px-3 py-2 font-semibold">Actions</p>
                {[
                  { label: "New chat", icon: <Plus size={16} strokeWidth={1.5} />, action: () => { onNewChat(); setShowCommandPalette(false); }, shortcut: "Ctrl+N" },
                  { label: "Export as Markdown", icon: <Download size={16} strokeWidth={1.5} />, action: () => { onExportChat(); setShowCommandPalette(false); }, shortcut: "Ctrl+Shift+E" },
                  { label: "Export as Text", icon: <Type size={16} strokeWidth={1.5} />, action: () => { onExportChatAsText(); setShowCommandPalette(false); }, shortcut: "" },
                  { label: "Open memory", icon: <Brain size={16} strokeWidth={1.5} />, action: () => { setShowMemoryModal(true); setShowCommandPalette(false); }, shortcut: "Ctrl+Shift+M" },
                  { label: "Extra features", icon: <Sparkles size={16} strokeWidth={1.5} />, action: () => { setShowAttractionPanel(true); setShowCommandPalette(false); }, shortcut: "Ctrl+Shift+V" },
                  { label: "Voice mode", icon: <Mic size={16} strokeWidth={1.5} />, action: () => { onSwitchToTalk(); setShowCommandPalette(false); }, shortcut: "" },
                ].filter(item => !sidebarSearch || item.label.toLowerCase().includes(sidebarSearch.toLowerCase())).map((item) => (
                  <button key={item.label} onClick={item.action} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/[0.05] transition-all">
                    <span className="text-gray-500">{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.shortcut && <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-600 font-mono text-[10px] border border-white/10">{item.shortcut}</kbd>}
                  </button>
                ))}

                {/* Chat Search */}
                {sidebarSearch && conversations.filter(c => c.title.toLowerCase().includes(sidebarSearch.toLowerCase())).length > 0 && (
                  <>
                    <p className="text-[10px] text-gray-500 uppercase tracking-[0.1em] px-3 py-2 mt-2 font-semibold">Chats</p>
                    {conversations.filter(c => c.title.toLowerCase().includes(sidebarSearch.toLowerCase())).slice(0, 8).map((conv) => (
                      <button key={conv.id} onClick={() => { onSwitchConversation(conv.id); setShowCommandPalette(false); setSidebarSearch(""); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/[0.05] transition-all">
                        <MessageCircle size={14} strokeWidth={1.5} className="text-gray-500" />
                        <span className="flex-1 text-left truncate">{conv.title}</span>
                        <span className="text-[10px] text-gray-600">{timeAgo(conv.updatedAt)}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowExportModal(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 sm:p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-xs bg-[#1e1f20] border border-white/10 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Export Chat</h3>
                <button onClick={() => setShowExportModal(false)} className="text-gray-500 hover:text-white"><X size={16} /></button>
              </div>
              <div className="space-y-2">
                <button onClick={() => { onExportChat(); setShowExportModal(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-sm text-gray-300 hover:text-white transition-all">
                  <FileText size={16} strokeWidth={1.5} /> Download as Markdown
                </button>
                <button onClick={() => { onExportChatAsText(); setShowExportModal(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-sm text-gray-300 hover:text-white transition-all">
                  <Type size={16} strokeWidth={1.5} /> Download as Plain Text
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowShareModal(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 sm:p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-[#1e1f20] border border-white/10 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Link size={16} strokeWidth={1.5} /> Share Conversation</h3>
                <button onClick={() => setShowShareModal(false)} className="text-gray-500 hover:text-white"><X size={16} /></button>
              </div>
              <p className="text-xs text-gray-400 mb-4">Anyone with this link can read this conversation.</p>
              <div className="flex items-center gap-2">
                <input readOnly value={shareLink} className="flex-1 px-3 py-2 bg-[#0f0f0f] border border-white/10 rounded-xl text-xs text-gray-300 font-mono" />
                <button onClick={() => navigator.clipboard.writeText(shareLink)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-medium text-white transition-colors">
                  Copy
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Instruction Modal */}
      <AnimatePresence>
        {showInstructionModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowInstructionModal(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 sm:p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-[#1e1f20] border border-white/10 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2"><MessageCircle size={16} strokeWidth={1.5} /> Custom Instructions</h3>
                <button onClick={() => setShowInstructionModal(false)} className="text-gray-500 hover:text-white"><X size={16} /></button>
              </div>
              <p className="text-xs text-gray-400 mb-3">Add custom instructions for this specific chat. ArcLight will follow these on top of its default personality.</p>
              <textarea
                value={instructionText}
                onChange={(e) => setInstructionText(e.target.value)}
                placeholder="e.g., Always respond in code only. Be concise."
                className="w-full h-32 px-4 py-3 bg-[#0f0f0f] border border-white/10 rounded-xl text-sm text-gray-200 placeholder-gray-600 resize-none outline-none focus:border-blue-500/30 transition-all"
              />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowInstructionModal(false)} className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
                <button onClick={() => { onSetInstruction?.(activeConversationId, instructionText); setShowInstructionModal(false); }} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-medium text-white transition-colors">Save Instructions</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shortcuts Modal */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowShortcuts(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 sm:p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-[#1e1f20] border border-white/10 rounded-xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Keyboard Shortcuts</h3>
                <button onClick={() => setShowShortcuts(false)} className="text-gray-500 hover:text-white"><X size={16} /></button>
              </div>
              <div className="space-y-3 text-sm">
                {[
                  { keys: "Ctrl + K", desc: "Command palette" },
                  { keys: "Ctrl + N", desc: "New chat" },
                  { keys: "Ctrl + Shift + O", desc: "Open sidebar" },
                  { keys: "Ctrl + Shift + E", desc: "Export chat" },
                  { keys: "Ctrl + Shift + M", desc: "Open memory" },
                  { keys: "Ctrl + Shift + V", desc: "Open extra's features" },
                  { keys: "Enter", desc: "Send message" },
                  { keys: "Shift + Enter", desc: "New line" },
                  { keys: "Esc", desc: "Close sidebar / cancel edit" },
                ].map((s) => (
                  <div key={s.keys} className="flex items-center justify-between">
                    <span className="text-gray-400">{s.desc}</span>
                    <kbd className="px-2 py-1 rounded bg-white/5 text-gray-300 font-mono text-xs border border-white/10">{s.keys}</kbd>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Change API Key Modal */}
      <AnimatePresence>
        {showChangeApiModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowChangeApiModal(false); setApiChangeError(""); }} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 sm:p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-[#1e1f20] border border-white/10 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Hash size={16} strokeWidth={1.5} /> Change API Key</h3>
                <button onClick={() => { setShowChangeApiModal(false); setApiChangeError(""); }} className="text-gray-500 hover:text-white"><X size={16} /></button>
              </div>
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">Enter a new Gemini API key from Google AI Studio.</p>
              <input
                type="password"
                value={newApiKey}
                onChange={(e) => { setNewApiKey(e.target.value); setApiChangeError(""); }}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && newApiKey.trim() && onChangeApiKey) {
                    setApiChangeLoading(true);
                    try { await onChangeApiKey(newApiKey.trim()); setShowChangeApiModal(false); setNewApiKey(""); }
                    catch (err: any) { setApiChangeError(err.message || "Failed"); }
                    finally { setApiChangeLoading(false); }
                  }
                }}
                placeholder="Enter new API key..."
                className="w-full px-4 py-3 mb-3 bg-[#0f0f0f] border border-white/10 rounded-xl text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-blue-500/30 transition-all"
                autoFocus
                disabled={apiChangeLoading}
              />
              <AnimatePresence>
                {apiChangeError && (
                  <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                    {apiChangeError}
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex items-center justify-end gap-3">
                <button onClick={() => { setShowChangeApiModal(false); setNewApiKey(""); setApiChangeError(""); }} disabled={apiChangeLoading} className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
                <button
                  disabled={!newApiKey.trim() || apiChangeLoading}
                  onClick={async () => {
                    if (!newApiKey.trim() || !onChangeApiKey) return;
                    setApiChangeLoading(true);
                    try { await onChangeApiKey(newApiKey.trim()); setShowChangeApiModal(false); setNewApiKey(""); }
                    catch (err: any) { setApiChangeError(err.message || "Failed"); }
                    finally { setApiChangeLoading(false); }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl text-xs font-medium text-white transition-colors"
                >
                  {apiChangeLoading ? "Updating..." : "Update API Key"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
