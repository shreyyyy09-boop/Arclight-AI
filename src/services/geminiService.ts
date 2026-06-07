import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { getConfig, getCurrentInstruction, getCurrentSpeechLanguageCode, getCurrentVoiceId, TEXT_CHAT_MODEL } from "./configService";
import { getCurrentApiKey } from "./apiKeyService";

let aiInstance: GoogleGenAI | null = null;
let abortController: AbortController | null = null;
const TEXT_CHAT_FALLBACK_MODEL = "gemini-2.5-flash-lite";

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: getCurrentApiKey() });
  }
  return aiInstance;
}

export function resetZoyaSession() {
  abortZoyaRequest();
}

export function abortZoyaRequest() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

export interface MediaAttachment {
  mimeType: string;
  data: string; // base64, or raw text when documentText is provided
  fileName?: string;
  kind?: "image" | "video" | "pdf" | "text" | "code";
  previewUrl?: string;
  documentText?: string;
  prompt?: string;
}

export type ImageAttachment = MediaAttachment;

export async function getZoyaResponse(
  prompt: string,
  history: { sender: "user" | "zoya"; text: string }[] = [],
  media?: MediaAttachment,
  userName?: string,
  customInstruction?: string
): Promise<string> {
  try {
    const ai = getAI();
    const appConfig = getConfig();
    const isFastResponse = appConfig.responseMode === "fast";
    const recentHistory = history.slice(isFastResponse ? -4 : -20);
    const contents: any[] = recentHistory.map((msg) => ({
      role: msg.sender === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    }));
    const promptParts: any[] = [{
      text: prompt || (
        media?.kind === "video"
          ? "Analyze this video in detail."
          : media?.kind === "pdf"
            ? "Summarize this PDF and highlight the important points."
            : media?.kind === "text" || media?.kind === "code"
              ? "Read this file, summarize it, and answer any questions about it."
              : "Please respond to the attached image."
      )
    }];

    if (media) {
      if (media.documentText) {
        promptParts.push({
          text: [
            `Attached file: ${media.fileName || "document"}`,
            `MIME type: ${media.mimeType}`,
            "",
            media.documentText,
          ].join("\n"),
        });
      } else {
        promptParts.push({
          inlineData: {
            mimeType: media.mimeType,
            data: media.data,
          },
        });
      }
    }

    contents.push({ role: "user", parts: promptParts });
    abortController = new AbortController();

    const baseInstruction = customInstruction 
      ? getCurrentInstruction(userName) + `\n\nCUSTOM INSTRUCTIONS FOR THIS CHAT:\n${customInstruction}`
      : getCurrentInstruction(userName);

    const request: any = {
      contents,
      config: {
        systemInstruction: baseInstruction,
        maxOutputTokens: isFastResponse ? 384 : undefined,
        temperature: isFastResponse ? 0.4 : undefined,
        thinkingConfig: isFastResponse ? { thinkingBudget: 0 } : undefined,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
        ],
      },
    };

    const selectedModel = isFastResponse ? TEXT_CHAT_MODEL : appConfig.model;
    const modelsToTry = Array.from(new Set([selectedModel, TEXT_CHAT_MODEL, TEXT_CHAT_FALLBACK_MODEL]));

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({ model, ...request });
        abortController = null;
        return response.text ?? "Ugh, fine. I have nothing to say.";
      } catch (modelError) {
        if (model === modelsToTry[modelsToTry.length - 1]) throw modelError;
        console.warn(`${model} failed, retrying with next working model`, modelError);
      }
    }

    return "Ugh, fine. I have nothing to say.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Ugh, please check you API";
  }
}

export async function getZoyaAudio(text: string): Promise<string | null> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          languageCode: getCurrentSpeechLanguageCode(),
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: getCurrentVoiceId() },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

/* ── Image Generation (Gemini 2.0 Flash) ── */
export async function generateImage(prompt: string): Promise<string | null> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Image generation error:", error);
    return null;
  }
}

/* ── Web Search (Gemini Grounding) ── */
export async function getZoyaResponseWithSearch(
  prompt: string,
  history: { sender: "user" | "zoya"; text: string }[] = [],
  userName?: string
): Promise<string> {
  try {
    const ai = getAI();
    const appConfig = getConfig();
    const recentHistory = history.slice(appConfig.responseMode === "fast" ? -4 : -20);
    const contents: any[] = recentHistory.map((msg) => ({
      role: msg.sender === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    }));
    contents.push({ role: "user", parts: [{ text: prompt }] });
    abortController = new AbortController();

    const response = await ai.models.generateContent({
      model: appConfig.model || TEXT_CHAT_MODEL,
      contents,
      config: {
        systemInstruction: getCurrentInstruction(userName),
        tools: [{ googleSearch: {} }],
      },
    });
    abortController = null;
    return response.text ?? "I couldn't find relevant information.";
  } catch (error) {
    console.error("Web search error:", error);
    return "I couldn't search the web right now. Please try again.";
  }
}

/**
 * Generate a short, descriptive title for a conversation based on the first user message.
 * Falls back to truncated message text if API call fails.
 */
export async function generateChatTitle(firstMessage: string): Promise<string> {
  const fallback = firstMessage.length > 40 ? firstMessage.substring(0, 40) + "..." : firstMessage;
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: TEXT_CHAT_FALLBACK_MODEL,
      contents: [{ parts: [{ text: `Generate a very short title (3-6 words, no quotes, no punctuation at the end) for a chat conversation that starts with this message: "${firstMessage}". Reply ONLY with the title, nothing else.` }] }],
      config: {
        maxOutputTokens: 20,
        temperature: 0.5,
      },
    });
    const title = (response.text || "").trim().replace(/^["']|["']$/g, "").replace(/[.!?]+$/, "");
    return title.length > 0 && title.length <= 50 ? title : fallback;
  } catch (error) {
    console.warn("Title generation failed, using fallback:", error);
    return fallback;
  }
}
