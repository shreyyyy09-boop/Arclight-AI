import { db } from "../config/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const API_KEYS_COLLECTION = "userSettings";

// In-memory API key holder for synchronous access by services
let currentApiKey: string | null = null;

export function getCurrentApiKey(): string {
  return currentApiKey || "";
}

export function setCurrentApiKey(key: string): void {
  currentApiKey = key;
}

export async function saveUserApiKey(userId: string, apiKey: string): Promise<void> {
  const userDocRef = doc(db, API_KEYS_COLLECTION, userId);
  await setDoc(userDocRef, {
    apiKey,
    updatedAt: Date.now(),
  }, { merge: true });

  // Set in memory for immediate use
  setCurrentApiKey(apiKey);
}

export async function getUserApiKey(userId: string): Promise<string | null> {
  const userDocRef = doc(db, API_KEYS_COLLECTION, userId);
  const userDoc = await getDoc(userDocRef);

  if (userDoc.exists()) {
    const key = userDoc.data().apiKey || null;
    if (key) {
      setCurrentApiKey(key);
    }
    return key;
  }

  return null;
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    // Use gemini-2.0-flash which is available on free tier
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "hi" }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
      }
    );

    if (response.ok) {
      return true;
    }

    const errorData = await response.json().catch(() => null);
    const errorMessage = errorData?.error?.message?.toLowerCase() || "";
    const errorCode = errorData?.error?.code;

    // Only reject for invalid key errors
    if (
      errorCode === 401 ||
      errorCode === 403 ||
      errorMessage.includes("api key not valid") ||
      errorMessage.includes("invalid api key") ||
      errorMessage.includes("api key expired")
    ) {
      return false;
    }

    // For quota/rate limit/server errors, the key itself is valid
    return true;
  } catch (error: any) {
    console.error("API key validation network error:", error);
    return false;
  }
}
