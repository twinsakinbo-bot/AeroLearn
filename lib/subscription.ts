import { db, doc, getDoc, updateDoc } from "@/lib/db"
import { isPaidPlan } from "@/lib/plans"

export interface UserSubscriptionInfo {
  isPro: boolean;
  planId: string;
  aiExplanationsUsedToday: number;
  practiceQuestionsUsedToday: number;
  flashcardsUsedToday: number;
  lastResetDate: string;
}

/** Coerce whatever the row holds into a Date. Written as a Firestore Timestamp by
 *  the old code, as an ISO string by Supabase, as epoch seconds by the migrator. */
function expiryDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    return (raw as { toDate: () => Date }).toDate();
  }
  if (typeof raw === "object" && raw !== null && "seconds" in raw) {
    return new Date((raw as { seconds: number }).seconds * 1000);
  }
  const parsed = new Date(raw as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Does this account have paid access right now?
 *
 * The plan test is delegated to `isPaidPlan` in lib/plans so that the list of
 * sellable plans exists in exactly one place. This function previously inlined
 * `"pro" | "lifetime" | "weekly" | "monthly"`, which meant that every sale of
 * One Term, Full Year, JAMB Sprint, WAEC Final Lap or Both Exams took the money
 * and paid out nothing — the student sat in front of the free tier they had
 * already upgraded away from, and the receipt had already been approved out of
 * the queue.
 */
export function isProUser(userProfile: any): boolean {
  if (!userProfile) return false;
  if (!isPaidPlan(userProfile.subscription)) return false;

  const expiresAt = expiryDate(userProfile.proExpiresAt);
  // No expiry on file is permanent access, which is how `lifetime` is stored.
  if (!expiresAt) return true;
  return new Date() <= expiresAt;
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
