import { db, doc, getDoc, updateDoc } from "@/lib/db"
import { isProUser } from "@/lib/plan-access"
export { isProUser } from "@/lib/plan-access"

export interface UserSubscriptionInfo {
  isPro: boolean;
  planId: string;
  aiExplanationsUsedToday: number;
  practiceQuestionsUsedToday: number;
  flashcardsUsedToday: number;
  lastResetDate: string;
}

export function getSubjectLimit(userProfile: any): number {
  return isProUser(userProfile) ? Infinity : 2;
}

export function getPracticeLimit(userProfile: any): number {
  return isProUser(userProfile) ? Infinity : 2;
}

export function getFlashcardLimit(userProfile: any): number {
  return isProUser(userProfile) ? Infinity : 2;
}

export async function getUserSubscription(uid: string): Promise<UserSubscriptionInfo> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) {
    return { isPro: false, planId: "free", aiExplanationsUsedToday: 0, practiceQuestionsUsedToday: 0, flashcardsUsedToday: 0, lastResetDate: "" };
  }
  
  const data = snap.data();
  const isPro = isProUser(data);
  
  const today = new Date().toISOString().split('T')[0];
  let aiUsedToday = data.aiExplanationsUsedToday || 0;
  let practiceUsedToday = data.practiceQuestionsUsedToday || 0;
  let flashcardsUsedToday = data.flashcardsUsedToday || 0;
  let lastReset = data.lastAiReset || ""; // Keep old field name for backward compatibility, or update it
  
  if (lastReset !== today) {
    aiUsedToday = 0;
    practiceUsedToday = 0;
    flashcardsUsedToday = 0;
    lastReset = today;
    await updateDoc(doc(db, "users", uid), {
      aiExplanationsUsedToday: 0,
      practiceQuestionsUsedToday: 0,
      flashcardsUsedToday: 0,
      lastAiReset: today // this serves as the reset date for everything daily
    });
  }
  
  return {
    isPro,
    planId: data.subscription || "free",
    aiExplanationsUsedToday: aiUsedToday,
    practiceQuestionsUsedToday: practiceUsedToday,
    flashcardsUsedToday: flashcardsUsedToday,
    lastResetDate: lastReset
  };
}
