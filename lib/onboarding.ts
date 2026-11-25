/** A profile row (or a saved class) does not mean learning setup is finished. */
export function needsLearningSetup(profile: Record<string, unknown> | null | undefined): boolean {
  if (profile?.role === "admin") return false
  if (profile?.onboardingCompleted !== true) return true
  if (!["school", "exam", "self_learning"].includes(String(profile.learningMode))) return true
  if (!Array.isArray(profile.subjects) || !profile.subjects.some(s => typeof s === "string" && s.trim())) return true
  if (profile.learningMode === "school" && !profile.classLevel) return true
  if (profile.learningMode === "exam" && !profile.examType) return true
  return false
}
