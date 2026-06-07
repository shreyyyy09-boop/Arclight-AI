import { db } from "../config/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { TEXT_CHAT_MODEL } from "./configService";

export interface ChatMessage {
  id: string;
  sender: "user" | "zoya";
  text: string;
  timestamp: number;
  imageUrl?: string;
  videoUrl?: string;
  fileName?: string;
  fileType?: string;
  feedback?: "up" | "down" | null;
  reactions?: string[];  // emoji reactions
  branchId?: string;     // conversation branching
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  model: string;
  pinned?: boolean;
  folder?: string;
  systemInstruction?: string;  // custom persona per chat
  shared?: boolean;            // public share link
  branches?: string[];         // branch IDs
}

const MAX_CONVERSATIONS = 50;
const DEFAULT_TITLE = "New chat";
const TITLE_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "could", "do", "does", "for", "from", "give",
  "help", "how", "i", "in", "is", "it", "make", "me", "my", "of", "on", "or", "please", "show", "tell", "that",
  "the", "this", "to", "want", "what", "when", "where", "why", "will", "with", "write", "you", "your",
]);

function cleanTitleText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/\[Attached file:[^\]]+\]/gi, " ")
    .replace(/[#*_`~>\[\]()|]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(text: string): string {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => word.length <= 3 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function stripPromptPhrases(text: string): string {
  let cleaned = text.trim();
  const promptPrefixes = [
    /^(hi+|hello|hey|ok|okay|please|pls)[,!. ]+/i,
    /^(can|could|would|will)\s+you\s+/i,
    /^(i\s+want|i\s+need|i\s+am\s+trying|i'm\s+trying)\s+(to\s+)?/i,
    /^(help\s+me|tell\s+me|show\s+me|explain|create|make|write|generate|build|fix|debug)\s+(to\s+)?/i,
    /^(what\s+is|what\s+are|how\s+to|how\s+do\s+i|why\s+is|why\s+are)\s+/i,
  ];

  for (let i = 0; i < 3; i++) {
    const before = cleaned;
    for (const prefix of promptPrefixes) cleaned = cleaned.replace(prefix, "");
    if (before === cleaned) break;
  }

  return cleaned.trim();
}

function getPromptEchoTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((msg) => msg.sender === "user" && msg.text.trim());
  if (!firstUserMessage) return "";
  const cleaned = cleanTitleText(firstUserMessage.text);
  return cleaned.split(" ").slice(0, 8).join(" ");
}

function generateConversationTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((msg) => msg.sender === "user" && (msg.text.trim() || msg.imageUrl));
  const fallbackMessage = messages.find((msg) => msg.text.trim() || msg.imageUrl);
  const source = firstUserMessage || fallbackMessage;

  if (!source) return DEFAULT_TITLE;
  if (!source.text.trim() && source.imageUrl) return "Image chat";

  const cleaned = stripPromptPhrases(cleanTitleText(source.text));
  if (!cleaned) return source.imageUrl ? "Image chat" : DEFAULT_TITLE;

  const meaningfulWords = cleaned
    .split(" ")
    .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""))
    .filter((word) => word.length > 1 && !TITLE_STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 5);

  const titleWords = meaningfulWords.length >= 2 ? meaningfulWords : cleaned.split(" ").slice(0, 5);
  const title = toTitleCase(titleWords.join(" "));
  return title.length > 44 ? `${title.slice(0, 41).trim()}...` : title;
}

function shouldAutoTitle(conv: ChatConversation): boolean {
  if (conv.messages.length === 0) return false;
  if (conv.title === DEFAULT_TITLE) return true;

  const promptEchoTitle = getPromptEchoTitle(conv.messages);
  return Boolean(promptEchoTitle && conv.title.trim().toLowerCase() === promptEchoTitle.toLowerCase());
}

function withAutoTitle(conv: ChatConversation): ChatConversation {
  if (!shouldAutoTitle(conv)) return conv;
  return { ...conv, title: generateConversationTitle(conv.messages) };
}

/**
 * Deep-strips all undefined values from an object so Firestore setDoc won't reject.
 * Firestore throws "Unsupported field value: undefined" for any undefined field.
 */
function stripUndefined(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === undefined) continue; // skip undefined entirely
    if (Array.isArray(val)) {
      result[key] = val.map(item =>
        item && typeof item === "object" && !Array.isArray(item)
          ? stripUndefined(item as Record<string, any>)
          : item
      );
    } else if (val && typeof val === "object") {
      result[key] = stripUndefined(val as Record<string, any>);
    } else {
      result[key] = val;
    }
  }
  return result;
}

function prepareConversationForStorage(conv: ChatConversation): ChatConversation {
  const mapped: ChatConversation = {
    ...conv,
    messages: conv.messages.map((msg) => {
      const cleaned: ChatMessage = { ...msg };
      // Strip large base64 video data
      if (cleaned.videoUrl) {
        delete (cleaned as any).videoUrl;
        cleaned.text = cleaned.text || `[Video: ${cleaned.fileName || "uploaded video"}]`;
      }
      // Strip large base64 image data URLs to prevent Firestore 1MB doc limit
      if (cleaned.imageUrl && cleaned.imageUrl.startsWith("data:")) {
        delete (cleaned as any).imageUrl;
      }
      return cleaned;
    }),
  };
  return stripUndefined(mapped as any) as ChatConversation;
}

function getConversationsRef(userId: string) {
  return collection(db, "users", userId, "conversations");
}

export async function getAllConversations(userId: string): Promise<ChatConversation[]> {
  try {
    // Fetch ALL docs first, then sort in memory (avoids needing Firestore composite index)
    const snapshot = await getDocs(getConversationsRef(userId));
    const conversations: ChatConversation[] = [];
    snapshot.forEach((docSnap) => {
      conversations.push(withAutoTitle(docSnap.data() as ChatConversation));
    });
    // Sort by updatedAt descending in memory
    conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    return conversations;
  } catch (error) {
    console.error("Error fetching conversations from Firestore:", error);
    return [];
  }
}

export async function getConversation(userId: string, id: string): Promise<ChatConversation | null> {
  try {
    const docRef = doc(getConversationsRef(userId), id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return withAutoTitle(docSnap.data() as ChatConversation);
    }
    return null;
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return null;
  }
}

export async function saveConversation(userId: string, conv: ChatConversation): Promise<void> {
  try {
    const prepared = withAutoTitle(prepareConversationForStorage(conv));
    const docRef = doc(getConversationsRef(userId), conv.id);
    await setDoc(docRef, prepared, { merge: true });
  } catch (error) {
    console.error("Error saving conversation to Firestore:", error);
    throw error;
  }
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  try {
    const docRef = doc(getConversationsRef(userId), id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting conversation:", error);
  }
}

export function createConversation(model: string = TEXT_CHAT_MODEL): ChatConversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    createdAt: now,
    updatedAt: now,
    model,
  };
}

export async function updateConversationTitle(userId: string, id: string, title: string): Promise<void> {
  const conv = await getConversation(userId, id);
  if (conv) {
    conv.title = title;
    conv.updatedAt = Date.now();
    await saveConversation(userId, conv);
  }
}

export async function addMessageToConversation(userId: string, id: string, message: ChatMessage): Promise<void> {
  const conv = await getConversation(userId, id);
  if (!conv) return;
  conv.messages.push(message);
  conv.updatedAt = Date.now();
  await saveConversation(userId, conv);
}

export async function updateMessageFeedback(userId: string, convId: string, msgId: string, feedback: "up" | "down" | null): Promise<void> {
  const conv = await getConversation(userId, convId);
  if (!conv) return;
  const msg = conv.messages.find((m) => m.id === msgId);
  if (msg) {
    msg.feedback = feedback;
    await saveConversation(userId, conv);
  }
}

export async function deleteMessage(userId: string, convId: string, msgId: string): Promise<void> {
  const conv = await getConversation(userId, convId);
  if (!conv) return;
  conv.messages = conv.messages.filter((m) => m.id !== msgId);
  conv.updatedAt = Date.now();
  await saveConversation(userId, conv);
}

export async function editMessage(userId: string, convId: string, msgId: string, newText: string): Promise<void> {
  const conv = await getConversation(userId, convId);
  if (!conv) return;
  const msg = conv.messages.find((m) => m.id === msgId);
  if (msg) {
    msg.text = newText;
    conv.updatedAt = Date.now();
    await saveConversation(userId, conv);
  }
}

export function exportConversationAsMarkdown(conv: ChatConversation): string {
  let md = `# ${conv.title}\n\n`;
  md += `*Generated on ${new Date(conv.updatedAt).toLocaleString()}*\n\n`;
  md += `---\n\n`;
  for (const msg of conv.messages) {
    const role = msg.sender === "user" ? "**User**" : "**ArcLight**";
    md += `${role} (${new Date(msg.timestamp).toLocaleTimeString()}):\n\n${msg.text}\n\n---\n\n`;
  }
  return md;
}

export function downloadConversation(conv: ChatConversation): void {
  const md = exportConversationAsMarkdown(conv);
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `arclight-chat-${conv.id.slice(0, 8)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── Pin / Unpin ── */
export async function togglePinConversation(userId: string, id: string): Promise<void> {
  try {
    const docRef = doc(getConversationsRef(userId), id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as ChatConversation;
      await updateDoc(docRef, { pinned: !data.pinned });
    }
  } catch (e) { console.error("Error toggling pin:", e); }
}

/* ── Folder ── */
export async function setConversationFolder(userId: string, id: string, folder: string): Promise<void> {
  try {
    const docRef = doc(getConversationsRef(userId), id);
    await updateDoc(docRef, { folder: folder || null });
  } catch (e) { console.error("Error setting folder:", e); }
}

/* ── Reactions ── */
export async function toggleMessageReaction(userId: string, convId: string, msgId: string, emoji: string): Promise<void> {
  const conv = await getConversation(userId, convId);
  if (!conv) return;
  const msg = conv.messages.find((m) => m.id === msgId);
  if (!msg) return;
  if (!msg.reactions) msg.reactions = [];
  const idx = msg.reactions.indexOf(emoji);
  if (idx >= 0) msg.reactions.splice(idx, 1);
  else msg.reactions.push(emoji);
  await saveConversation(userId, conv);
}

/* ── Custom System Instruction per Chat ── */
export async function setChatInstruction(userId: string, id: string, instruction: string): Promise<void> {
  try {
    const docRef = doc(getConversationsRef(userId), id);
    await updateDoc(docRef, { systemInstruction: instruction || null });
  } catch (e) { console.error("Error setting instruction:", e); }
}

/* ── Share Conversation ── */
export async function toggleShareConversation(userId: string, id: string): Promise<string | null> {
  try {
    const docRef = doc(getConversationsRef(userId), id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as ChatConversation;
      const newShared = !data.shared;
      await updateDoc(docRef, { shared: newShared });
      return newShared ? id : null;
    }
    return null;
  } catch (e) { console.error("Error toggling share:", e); return null; }
}

/* ── Export as plain text ── */
export function exportConversationAsText(conv: ChatConversation): string {
  let txt = `${conv.title}\nGenerated on ${new Date(conv.updatedAt).toLocaleString()}\n${"─".repeat(40)}\n\n`;
  for (const msg of conv.messages) {
    const role = msg.sender === "user" ? "User" : "ArcLight";
    txt += `[${role}] (${new Date(msg.timestamp).toLocaleTimeString()}):\n${msg.text}\n\n${"─".repeat(30)}\n\n`;
  }
  return txt;
}

export function downloadConversationAsText(conv: ChatConversation): void {
  const txt = exportConversationAsText(conv);
  const blob = new Blob([txt], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `arclight-chat-${conv.id.slice(0, 8)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
