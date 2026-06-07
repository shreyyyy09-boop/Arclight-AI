export interface MemoryItem {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  source: "user" | "voice" | "manual";
}

const STORAGE_KEY = "arclight_user_memories";
const MAX_MEMORIES = 80;

function normalizeMemoryText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function dedupeKey(text: string): string {
  return normalizeMemoryText(text).toLowerCase().replace(/[.!?]+$/g, "");
}

export function getMemories(): MemoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MemoryItem[];
    return parsed
      .filter((item) => item?.id && item?.text?.trim())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveMemories(memories: MemoryItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories.slice(0, MAX_MEMORIES)));
}

export function addMemory(text: string, source: MemoryItem["source"] = "user"): MemoryItem | null {
  const cleanText = normalizeMemoryText(text);
  if (cleanText.length < 3) return null;

  const now = Date.now();
  const existing = getMemories();
  const key = dedupeKey(cleanText);
  const duplicate = existing.find((item) => dedupeKey(item.text) === key);

  if (duplicate) {
    const updated = { ...duplicate, text: cleanText, updatedAt: now, source };
    saveMemories([updated, ...existing.filter((item) => item.id !== duplicate.id)]);
    return updated;
  }

  const memory: MemoryItem = {
    id: crypto.randomUUID(),
    text: cleanText,
    createdAt: now,
    updatedAt: now,
    source,
  };

  saveMemories([memory, ...existing]);
  return memory;
}

export function updateMemory(id: string, text: string): void {
  const cleanText = normalizeMemoryText(text);
  const memories = getMemories();
  if (!cleanText) {
    deleteMemory(id);
    return;
  }

  saveMemories(memories.map((item) => (
    item.id === id ? { ...item, text: cleanText, updatedAt: Date.now(), source: "manual" } : item
  )));
}

export function deleteMemory(id: string): void {
  saveMemories(getMemories().filter((item) => item.id !== id));
}

export function clearMemories(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function extractMemoryCandidates(text: string): string[] {
  const trimmed = normalizeMemoryText(text);
  if (!trimmed) return [];

  const patterns = [
    /\bremember\s+that\s+(.+)/i,
    /\bremember\s+(.+)/i,
    /\bplease\s+remember\s+(.+)/i,
    /\bcall\s+me\s+(.+)/i,
    /\bmy\s+([a-z][a-z\s]{1,28})\s+is\s+(.+)/i,
    /\bi\s+(?:like|love|prefer|hate|work\s+on|am\s+working\s+on)\s+(.+)/i,
  ];

  const candidates: string[] = [];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    if (pattern.source.startsWith("\\bmy")) {
      candidates.push(`My ${match[1].trim()} is ${match[2].trim()}`);
    } else if (pattern.source.includes("call")) {
      candidates.push(`Call me ${match[1].trim()}`);
    } else if (pattern.source.includes("like|love|prefer")) {
      candidates.push(`I ${trimmed.match(/\bi\s+([a-z\s]+?)\s+/i)?.[1]?.trim() || "prefer"} ${match[1].trim()}`);
    } else {
      candidates.push(match[1].trim());
    }
  }

  return Array.from(new Set(candidates.map(normalizeMemoryText))).filter((candidate) => candidate.length >= 3);
}

export function rememberFromText(text: string, source: MemoryItem["source"] = "user"): MemoryItem[] {
  return extractMemoryCandidates(text)
    .map((candidate) => addMemory(candidate, source))
    .filter((item): item is MemoryItem => Boolean(item));
}

export function getMemoryInstruction(): string {
  const memories = getMemories();
  if (memories.length === 0) return "";

  const lines = memories.slice(0, 20).map((item, index) => `${index + 1}. ${item.text}`);
  return [
    "LONG-TERM MEMORY:",
    "Use these saved facts only when they are relevant. Do not mention that you are using memory unless the user asks.",
    ...lines,
    "If the user asks you to remember a useful fact, save it with the memory tool when available.",
  ].join("\n");
}
