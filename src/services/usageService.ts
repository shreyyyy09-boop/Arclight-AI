import { db } from "../config/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export interface ApiUsage {
  totalRequests: number;
  todayRequests: number;
  todayDate: string; // YYYY-MM-DD
  estimatedTokens: number;
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Store usage in the SAME document as the API key (userSettings/{userId})
// This avoids Firestore security rules blocking subcollection access
function getUserSettingsRef(userId: string) {
  return doc(db, "userSettings", userId);
}

export async function getApiUsage(userId: string): Promise<ApiUsage> {
  try {
    const snap = await getDoc(getUserSettingsRef(userId));
    if (snap.exists()) {
      const data = snap.data();
      const usage = data.usage as ApiUsage | undefined;
      if (usage) {
        const today = getTodayKey();
        const todayRequests = usage.todayDate === today ? (usage.todayRequests || 0) : 0;
        return {
          totalRequests: usage.totalRequests || 0,
          todayRequests,
          todayDate: today,
          estimatedTokens: usage.estimatedTokens || 0,
        };
      }
    }
  } catch (e) {
    console.error("[getApiUsage] FAILED:", e);
  }
  return {
    totalRequests: 0,
    todayRequests: 0,
    todayDate: getTodayKey(),
    estimatedTokens: 0,
  };
}

export async function incrementApiUsage(userId: string, estimatedTokens: number = 0): Promise<void> {
  try {
    const ref = getUserSettingsRef(userId);
    const today = getTodayKey();

    // Read current values
    let current: ApiUsage = {
      totalRequests: 0,
      todayRequests: 0,
      todayDate: today,
      estimatedTokens: 0,
    };

    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const usage = data.usage as ApiUsage | undefined;
      if (usage) {
        current = {
          totalRequests: usage.totalRequests || 0,
          todayRequests: usage.todayDate === today ? (usage.todayRequests || 0) : 0,
          todayDate: today,
          estimatedTokens: usage.estimatedTokens || 0,
        };
      }
    }

    // Write updated usage into the same userSettings document (merge: true)
    await setDoc(ref, {
      usage: {
        totalRequests: current.totalRequests + 1,
        todayRequests: current.todayRequests + 1,
        todayDate: today,
        estimatedTokens: current.estimatedTokens + estimatedTokens,
      },
    }, { merge: true });
  } catch (e) {
    console.error("[incrementApiUsage] FAILED:", e);
  }
}
