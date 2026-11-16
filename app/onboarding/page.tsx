"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { auth, onAuthStateChanged, type User } from "@/lib/auth"
import { db, doc, getDoc, updateDoc } from "@/lib/db"
import { ChevronRight, Loader2, School } from "lucide-react"

import { AuthShell } from "@/components/auth/auth-shell"
import {
  BackButton,
  ChoicePill,
  DEPARTMENT_META,
  GOALS,
  IconField,
  OptionRow,
  StepRail,
  SubjectToggle,
} from "@/components/auth/wizard"
import {
  CLASS_LEVELS,
  DEPARTMENTS,
  EXAM_TYPES,
  JSS_SUBJECTS,
  SS_SUBJECTS_BY_DEPARTMENT,
  SUBJECTS,
  type ClassLevel,
  type Department,
  type ExamType,
  type LearningMode,
} from "@/lib/constants"
import { getSubjectLimit } from "@/lib/subscription"
import { getSupabase } from "@/lib/supabase/client"

/**
 * Finishing setup for an account that never went through the sign-up wizard —
 * a Google sign-in, or an account made before the wizard existed. Same steps
 * and same components, minus the parts Firebase already knows.
 */

type Step = "goal" | "class" | "department" | "exam" | "subjects" | "review"

const JSS_LEVELS = CLASS_LEVELS.filter((level) => level.startsWith("JSS"))
const SS_LEVELS = CLASS_LEVELS.filter((level) => level.startsWith("SS"))

const STEP_LABELS: Record<Step, string> = {
  goal: "Goal",
  class: "Class",
  department: "Department",
  exam: "Exam",
  subjects: "Subjects",
  review: "Review",
}

function headingFor(step: Step, limitSentence: string) {
  switch (step) {
    case "goal":
      return {
        title: "What are you here for?",
        lede: "This decides which curriculum we load for you.",
      }
    case "class":
      return {
        title: "What class are you in?",
        lede: "So the topics match the syllabus you are actually being taught.",
      }
    case "department":
      return { title: "Your department", lede: "Pick the stream your school placed you in." }
    case "exam":
      return { title: "Which exam?", lede: "We will build your practice around this paper." }
    case "subjects":
      return { title: "Pick your subjects", lede: limitSentence }
    case "review":
      return {
        title: "Ready when you are",
        lede: "Have a look over this — all of it can be changed later in Settings.",
      }
  }
}

/**
 * Google accounts start here; confirmed email accounts also return here with
 * their wizard choices prefilled from signup metadata. Send the welcome email
 * after either route finishes setup. Best-effort: it must never block setup.
 */
async function sendWelcomeEmail(user: User, name: string) {
  try {
    const idToken = await user.getIdToken()
    await fetch("/api/onboarding/welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ email: user.email, name }),
    })
  } catch (err) {
    console.error("Welcome email failed to send", err)
  }
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
      <span className="sr-only">Loading your setup</span>
    </div>
  )
}

/** One line of the review list. */
function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="shrink-0 text-caption text-muted">{label}</dt>
      <dd className="flex flex-wrap justify-end gap-1.5 text-right text-body-sm font-semibold text-foreground">
        {children}
      </dd>
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [step, setStep] = useState<Step>("goal")

  const [userProfile, setUserProfile] = useState<Record<string, unknown> | null>(null)
  const [learningMode, setLearningMode] = useState<LearningMode | "">("")
  const [classLevel, setClassLevel] = useState<ClassLevel | "">("")
  const [department, setDepartment] = useState<Department | "">("")
  const [schoolName, setSchoolName] = useState("")
  const [examType, setExamType] = useState<ExamType | "">("")
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [studyEmailsEnabled, setStudyEmailsEnabled] = useState(true)

  // Signed-out students belong on the sign-in page, and students who have
  // already answered these questions belong in the app.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login")
        return
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        if (snap.exists()) {
          const data = snap.data()
          setUserProfile(data)
          if (data.onboardingCompleted || data.classLevel) {
            router.replace("/app")
            return
          }
        }
        const { data: authData } = await getSupabase().auth.getUser()
        const setup = authData.user?.user_metadata?.aerolearn_setup as Record<string, unknown> | undefined
        if (setup && ["school", "exam", "self_learning"].includes(String(setup.learningMode)) &&
            Array.isArray(setup.subjects) && setup.subjects.length > 0) {
          const mode = setup.learningMode as LearningMode
          const level = CLASS_LEVELS.find((item) => item === setup.classLevel) || ""
          const exam = EXAM_TYPES.find((item) => item === setup.examType) || ""
          if ((mode !== "school" || level) && (mode !== "exam" || exam)) {
            setLearningMode(mode)
            setClassLevel(level as ClassLevel | "")
            setDepartment((DEPARTMENTS.find((item) => item === setup.department) || "") as Department | "")
            setSchoolName(typeof setup.schoolName === "string" ? setup.schoolName : "")
            setExamType(exam as ExamType | "")
            setSelectedSubjects(setup.subjects.filter((item): item is string => typeof item === "string" && SUBJECTS.includes(item as (typeof SUBJECTS)[number])).slice(0, getSubjectLimit(null)))
            setStudyEmailsEnabled(setup.studyEmailsEnabled !== false)
            setStep("review")
          }
        }
      } catch (err) {
        console.error("Failed to check onboarding status:", err)
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [router])

  const isJSS = classLevel.startsWith("JSS")
  const isSS = classLevel.startsWith("SS")

  // Pro accounts can reach this screen too — a subscriber who signed in with
  // Google has never been asked any of this.
  const limit = getSubjectLimit(userProfile)
  const capped = Number.isFinite(limit)
  const limitSentence = capped
    ? `Choose up to ${limit} on your current plan. You can change them later in Settings.`
    : "Choose as many as you like. You can change them later in Settings."

  const availableSubjects =
    learningMode === "exam" || learningMode === "self_learning"
      ? SUBJECTS
      : isJSS
        ? JSS_SUBJECTS
        : department
          ? SS_SUBJECTS_BY_DEPARTMENT[department]
          : []

  // Which panels this student will actually see, so the rail can show a real
  // total instead of a fixed five.
  const steps: Step[] =
    learningMode === "school"
      ? isSS
        ? ["goal", "class", "department", "subjects", "review"]
        : ["goal", "class", "subjects", "review"]
      : learningMode === "exam"
        ? ["goal", "exam", "subjects", "review"]
        : ["goal", "subjects", "review"]

  const stepIndex = steps.indexOf(step) === -1 ? steps.length - 1 : steps.indexOf(step)

  /* Each of these three answers decides which subject list applies, so a
     change to any of them drops subjects picked from the previous one. */
  const pickGoal = (mode: LearningMode) => {
    if (mode !== learningMode) setSelectedSubjects([])
    setLearningMode(mode)
    setError("")
  }

  const pickClassLevel = (level: ClassLevel) => {
    if (level.startsWith("SS") !== isSS) {
      setDepartment("")
      setSelectedSubjects([])
    }
    setClassLevel(level)
    setError("")
  }

  const pickDepartment = (dept: Department) => {
    if (dept !== department) setSelectedSubjects([])
    setDepartment(dept)
    setError("")
  }

  const toggleSubject = (subject: string) => {
    if (selectedSubjects.includes(subject)) {
      setSelectedSubjects((prev) => prev.filter((s) => s !== subject))
      setError("")
      return
    }
    if (selectedSubjects.length >= limit) {
      setError(`Your plan covers ${limit} subjects. Upgrade to Pro for the rest.`)
      return
    }
    setSelectedSubjects((prev) => [...prev, subject])
    setError("")
  }

  const handleNextFromGoal = () => {
    if (!learningMode) {
      setError("Pick one to carry on.")
      return
    }
    setStep(learningMode === "school" ? "class" : learningMode === "exam" ? "exam" : "subjects")
  }

  const handleNextFromClass = () => {
    if (!classLevel) {
      setError("Choose your class first.")
      return
    }
    setStep(isSS ? "department" : "subjects")
  }

  const handleNextFromDepartment = () => {
    if (!department) {
      setError("Choose the department you are in.")
      return
    }
    setStep("subjects")
  }

  const handleNextFromExam = () => {
    if (!examType) {
      setError("Choose the exam you are sitting.")
      return
    }
    setStep("subjects")
  }

  const handleNextFromSubjects = () => {
    if (selectedSubjects.length === 0) {
      setError("Pick at least one subject to start with.")
      return
    }
    setError("")
    setStep("review")
  }

  const backFromSubjects = () => {
    if (learningMode === "school") {
      setStep(isSS ? "department" : "class")
    } else if (learningMode === "exam") {
      setStep("exam")
    } else {
      setStep("goal")
    }
  }

  const handleComplete = async () => {
    if (selectedSubjects.length === 0) return
    const user = auth.currentUser
    if (!user) {
      setError("Your session has expired. Sign in again to finish setting up.")
      return
    }
    setError("")
    setSaving(true)
    try {
      await updateDoc(doc(db, "users", user.uid), {
        learningMode,
        classLevel: learningMode === "school" ? classLevel : null,
        department: learningMode === "school" && isSS ? department : null,
        examType: learningMode === "exam" ? examType : null,
        schoolName:
          learningMode === "school" && schoolName.trim() !== "" ? schoolName.trim() : null,
        subjects: selectedSubjects,
        onboardingCompleted: true,
        studyEmailsEnabled,
        updatedAt: new Date(),
      })
      await sendWelcomeEmail(user, user.displayName || "Student")
      router.replace("/app")
    } catch (err) {
      console.error("Failed to save onboarding:", err)
      setError("Couldn't save your setup. Check your connection and try again.")
      setSaving(false)
    }
  }

  if (loading) return <Spinner />

  const heading = headingFor(step, limitSentence)

  return (
    <AuthShell
      wide
      eyebrow={<StepRail labels={steps.map((s) => STEP_LABELS[s])} index={stepIndex} />}
      title={heading.title}
      lede={heading.lede}
    >
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-danger/35 bg-danger/10 px-4 py-3 text-body-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {step === "goal" && (
        <div className="animate-fade-in">
          <div className="space-y-3">
            {GOALS.map((goal) => (
              <OptionRow
                key={goal.id}
                active={learningMode === goal.id}
                onClick={() => pickGoal(goal.id)}
                icon={goal.icon}
                title={goal.title}
                desc={goal.desc}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={handleNextFromGoal}
            className="btn-primary btn-lg btn-block mt-7"
          >
            Continue
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {step === "class" && (
        <div className="animate-fade-in space-y-6">
          <IconField id="schoolName" label="School name (optional)" icon={School}>
            <input
              id="schoolName"
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="e.g. King's College"
              className="input-premium pl-10"
            />
          </IconField>
          <p className="field-hint -mt-4">
            Only used to help you find classmates in Community. Leave it blank if you would rather
            not say.
          </p>

          <div>
            <p className="mb-2.5 text-overline uppercase text-subtle">Junior secondary</p>
            <div className="grid grid-cols-3 gap-2.5">
              {JSS_LEVELS.map((level) => (
                <ChoicePill
                  key={level}
                  active={classLevel === level}
                  onClick={() => pickClassLevel(level)}
                >
                  {level}
                </ChoicePill>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2.5 text-overline uppercase text-subtle">Senior secondary</p>
            <div className="grid grid-cols-3 gap-2.5">
              {SS_LEVELS.map((level) => (
                <ChoicePill
                  key={level}
                  active={classLevel === level}
                  onClick={() => pickClassLevel(level)}
                >
                  {level}
                </ChoicePill>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <BackButton onClick={() => setStep("goal")} />
            <button type="button" onClick={handleNextFromClass} className="btn-primary btn-lg flex-1">
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {step === "department" && (
        <div className="animate-fade-in">
          <div className="space-y-3">
            {DEPARTMENTS.map((dept) => (
              <OptionRow
                key={dept}
                active={department === dept}
                onClick={() => pickDepartment(dept)}
                icon={DEPARTMENT_META[dept].icon}
                title={dept}
                desc={DEPARTMENT_META[dept].desc}
              />
            ))}
          </div>
          <div className="mt-7 flex gap-3">
            <BackButton onClick={() => setStep("class")} />
            <button
              type="button"
              onClick={handleNextFromDepartment}
              className="btn-primary btn-lg flex-1"
            >
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {step === "exam" && (
        <div className="animate-fade-in">
          <div className="grid grid-cols-2 gap-2.5">
            {EXAM_TYPES.map((exam) => (
              <ChoicePill
                key={exam}
                active={examType === exam}
                onClick={() => {
                  setExamType(exam)
                  setError("")
                }}
              >
                {exam}
              </ChoicePill>
            ))}
          </div>
          <div className="mt-7 flex gap-3">
            <BackButton onClick={() => setStep("goal")} />
            <button type="button" onClick={handleNextFromExam} className="btn-primary btn-lg flex-1">
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {step === "subjects" && (
        <div className="animate-fade-in">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-overline uppercase text-subtle">
              {capped
                ? `${selectedSubjects.length} of ${limit} chosen`
                : `${selectedSubjects.length} chosen`}
            </p>
            {learningMode === "school" && isSS && department && (
              <span className="badge-neutral">{department}</span>
            )}
          </div>

          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1">
            {availableSubjects.map((subject) => (
              <SubjectToggle
                key={subject}
                selected={selectedSubjects.includes(subject)}
                onClick={() => toggleSubject(subject)}
                label={subject}
              />
            ))}
          </div>

          <div className="mt-7 flex gap-3">
            <BackButton onClick={backFromSubjects} />
            <button
              type="button"
              onClick={handleNextFromSubjects}
              className="btn-primary btn-lg flex-1"
            >
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="animate-fade-in">
          <dl className="divide-y divide-hairline rounded-lg border border-hairline bg-surface-sunken px-4 py-1">
            <SummaryRow label="Path">
              {GOALS.find((goal) => goal.id === learningMode)?.title ?? "—"}
            </SummaryRow>
            {learningMode === "school" && classLevel && (
              <SummaryRow label="Class">{classLevel}</SummaryRow>
            )}
            {learningMode === "school" && isSS && department && (
              <SummaryRow label="Department">{department}</SummaryRow>
            )}
            {learningMode === "school" && schoolName.trim() !== "" && (
              <SummaryRow label="School">{schoolName.trim()}</SummaryRow>
            )}
            {learningMode === "exam" && examType && (
              <SummaryRow label="Exam">{examType}</SummaryRow>
            )}
            <SummaryRow label="Subjects">
              {selectedSubjects.map((subject) => (
                <span key={subject} className="badge-accent">
                  {subject}
                </span>
              ))}
            </SummaryRow>
          </dl>

          <label className="mt-4 flex items-start gap-3 rounded-lg border border-hairline p-3 text-body-sm text-muted">
            <input type="checkbox" checked={studyEmailsEnabled} onChange={(event) => setStudyEmailsEnabled(event.target.checked)} className="mt-1" />
            <span>Send me study reminders and learning tips by email. I can turn these off in Settings. Account and plan expiry emails still arrive.</span>
          </label>

          <div className="mt-7 flex gap-3">
            <BackButton onClick={() => setStep("subjects")} />
            <button
              type="button"
              onClick={handleComplete}
              disabled={saving}
              className="btn-primary btn-lg flex-1"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? "Saving your setup…" : "Enter AeroLearn"}
            </button>
          </div>
        </div>
      )}
    </AuthShell>
  )
}
