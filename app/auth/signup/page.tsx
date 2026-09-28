"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  auth,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithRedirect,
  updateProfile,
  type User,
} from "@/lib/auth"
import { db, doc, getDoc, setDoc } from "@/lib/db"
import {
  ArrowRight,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  School,
  UserRound,
} from "lucide-react"

import { AuthDivider, AuthShell, GoogleMark } from "@/components/auth/auth-shell"
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
  type Department,
  type ExamType,
  type LearningMode,
} from "@/lib/constants"
import { getSubjectLimit } from "@/lib/subscription"

type Step = "account" | "goal" | "class" | "department" | "exam" | "subjects"

const JSS_LEVELS = CLASS_LEVELS.filter((level) => level.startsWith("JSS"))
const SS_LEVELS = CLASS_LEVELS.filter((level) => level.startsWith("SS"))

/**
 * A brand-new account is always on the free plan, and the same limit is
 * enforced in onboarding and in Settings — read it from one place so the
 * three screens can never disagree about how many subjects are allowed.
 */
const MAX_SUBJECTS = getSubjectLimit(null)

const STEP_LABELS: Record<Step, string> = {
  account: "Account",
  goal: "Goal",
  class: "Class",
  department: "Department",
  exam: "Exam",
  subjects: "Subjects",
}

const HEADINGS: Record<Step, { title: string; lede: string }> = {
  account: {
    title: "Create your account",
    lede: "Free to start. No card details, and nothing renews on its own.",
  },
  goal: {
    title: "What are you here for?",
    lede: "This decides which curriculum we load for you.",
  },
  class: {
    title: "What class are you in?",
    lede: "So the topics match the syllabus you are actually being taught.",
  },
  department: {
    title: "Your department",
    lede: "Pick the stream your school placed you in.",
  },
  exam: {
    title: "Which exam?",
    lede: "We will build your practice around this paper.",
  },
  subjects: {
    title: "Pick your subjects",
    lede: `Choose up to ${MAX_SUBJECTS} on the free plan. You can change them later in Settings.`,
  },
}

/** Starting fields shared by both sign-up routes. */
const NEW_PROFILE = {
  favoriteSubjects: [],
  studyStats: { questionsAttempted: 0, questionsCorrect: 0, subjectsStudied: [] },
  subscription: "free",
  xp: 0,
  streak: 0,
  longestStreak: 0,
  completedLessons: [],
  completedTopics: [],
  completedQuizzes: [],
  homeworkCompleted: 0,
  badges: [],
  balance: 0,
  inventory: [],
}

/** Best-effort: a failed welcome email must never block a sign-up. */
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

function codeOf(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code?: unknown }).code)
    : ""
}

function textOf(err: unknown) {
  return err instanceof Error ? err.message : ""
}

function messageForCode(code: string) {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in instead."
    case "auth/invalid-email":
      return "That doesn't look like a valid email address."
    case "auth/invalid-credential":
      return "Those details weren't accepted. Check the email and password."
    case "auth/weak-password":
      return "Passwords need at least 6 characters. Choose something stronger."
    case "auth/operation-not-allowed":
      return "Email sign-up is switched off right now. Use Google, or contact support."
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again."
    case "auth/network-request-failed":
    case "auth/timeout":
      return "Network problem. Check your connection and try again."
    default:
      return "Couldn't create your account. Please try again, or contact support."
  }
}

export default function SignupPage() {
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState<Step>("account")

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const [learningMode, setLearningMode] = useState<LearningMode | "">("")
  const [classLevel, setClassLevel] = useState("")
  const [department, setDepartment] = useState<Department | "">("")
  const [schoolName, setSchoolName] = useState("")
  const [examType, setExamType] = useState<ExamType | "">("")
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])

  const [error, setError] = useState("")
  const [signingUp, setSigningUp] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isJSS = classLevel.startsWith("JSS")
  const isSS = classLevel.startsWith("SS")

  const availableSubjects =
    learningMode === "exam" || learningMode === "self_learning"
      ? SUBJECTS
      : isJSS
        ? JSS_SUBJECTS
        : department
          ? SS_SUBJECTS_BY_DEPARTMENT[department]
          : []

  // Which panels this student will see, so the rail can show a real total.
  const steps: Step[] =
    learningMode === "school"
      ? isSS
        ? ["account", "goal", "class", "department", "subjects"]
        : ["account", "goal", "class", "subjects"]
      : learningMode === "exam"
        ? ["account", "goal", "exam", "subjects"]
        : ["account", "goal", "subjects"]

  const stepIndex = steps.indexOf(step) === -1 ? steps.length - 1 : steps.indexOf(step)

  const toggleSubject = (subject: string) => {
    if (selectedSubjects.includes(subject)) {
      setSelectedSubjects((prev) => prev.filter((s) => s !== subject))
      setError("")
      return
    }
    if (selectedSubjects.length >= MAX_SUBJECTS) {
      setError(`The free plan covers ${MAX_SUBJECTS} subjects. Upgrade to Pro later for the rest.`)
      return
    }
    setSelectedSubjects((prev) => [...prev, subject])
    setError("")
  }

  const handleNextFromAccount = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (password !== confirmPassword) {
      setError("Those two passwords don't match.")
      return
    }
    if (password.length < 6) {
      setError("Passwords need at least 6 characters.")
      return
    }
    setStep("goal")
  }

  const handleNextFromGoal = () => {
    if (!learningMode) {
      setError("Pick what you are here for first.")
      return
    }
    setError("")
    setSelectedSubjects([])
    setStep(learningMode === "school" ? "class" : learningMode === "exam" ? "exam" : "subjects")
  }

  const handleNextFromClass = () => {
    if (!classLevel) {
      setError("Pick your class level first.")
      return
    }
    setError("")
    setDepartment("")
    setSelectedSubjects([])
    setStep(isSS ? "department" : "subjects")
  }

  const handleNextFromDepartment = () => {
    if (!department) {
      setError("Pick your department first.")
      return
    }
    setError("")
    setSelectedSubjects([])
    setStep("subjects")
  }

  const handleNextFromExam = () => {
    if (!examType) {
      setError("Pick the exam you are sitting first.")
      return
    }
    setError("")
    setSelectedSubjects([])
    setStep("subjects")
  }

  const backFromSubjects = () => {
    setError("")
    if (learningMode === "school") setStep(isSS ? "department" : "class")
    else if (learningMode === "exam") setStep("exam")
    else setStep("goal")
  }

  const handleFinalSignup = async () => {
    if (selectedSubjects.length === 0) {
      setError("Pick at least one subject.")
      return
    }
    setError("")
    setSigningUp(true)
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(user, { displayName: fullName })
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        displayName: fullName,
        learningMode: learningMode || null,
        schoolName: learningMode === "school" ? schoolName : null,
        classLevel: learningMode === "school" ? classLevel : null,
        department: learningMode === "school" && isSS ? department : null,
        examType: learningMode === "exam" ? examType : null,
        subjects: selectedSubjects,
        createdAt: new Date(),
        // The wizard already collected everything onboarding would ask for.
        onboardingCompleted: true,
        ...NEW_PROFILE,
      })
      await sendWelcomeEmail(user, fullName)
      // A full navigation, so the signed-in shell mounts with a clean tree.
      window.location.href = "/app"
    } catch (err) {
      console.error("Account creation failed", err)
      setError(messageForCode(codeOf(err)))
    } finally {
      setSigningUp(false)
    }
  }

  /**
   * Supabase's Google sign-in is a full-page redirect, so everything this used to
   * do inline afterwards now happens elsewhere: the profile row is created by the
   * `handle_new_user` trigger, and /auth/callback sends a first-time account to
   * onboarding (which is where the welcome email is sent from).
   */
  const handleGoogleSignUp = async () => {
    setError("")
    try {
      await signInWithRedirect(auth, new GoogleAuthProvider())
    } catch (err) {
      setError(`Couldn't sign up with Google. ${textOf(err)}`.trim())
    }
  }

  // The wizard keeps everything in local state, so there is nothing worth
  // rendering on the server — a flash of step one would only be misleading.
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    )
  }

  const heading = HEADINGS[step]

  return (
    <AuthShell
      wide
      eyebrow={<StepRail labels={steps.map((s) => STEP_LABELS[s])} index={stepIndex} />}
      title={heading.title}
      lede={heading.lede}
      footer={
        <>
          By creating an account you agree to our{" "}
          <Link href="/legal/terms" className="link-inline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="link-inline">
            Privacy Policy
          </Link>
          .
        </>
      }
    >
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-danger/35 bg-danger/10 px-4 py-3 text-body-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {step === "account" && (
        <div className="animate-fade-in">
          <form onSubmit={handleNextFromAccount} className="space-y-5" noValidate>
            <IconField id="fullName" label="Full name" icon={UserRound}>
              <input
                id="fullName"
                type="text"
                name="name"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Chidi Okonkwo"
                className="input-premium pl-10"
              />
            </IconField>

            <IconField id="email" label="Email address" icon={Mail}>
              <input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@example.com"
                className="input-premium pl-10"
              />
            </IconField>

            <IconField id="password" label="Password" icon={Lock}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="At least 6 characters"
                className="input-premium pl-10 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-subtle transition-colors hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </IconField>

            <IconField id="confirmPassword" label="Confirm password" icon={Lock}>
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                name="confirm-password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Repeat your password"
                className="input-premium pl-10"
              />
            </IconField>

            <button type="submit" className="btn-primary btn-lg btn-block">
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>

          <AuthDivider label="or continue with" />

          <button
            type="button"
            onClick={handleGoogleSignUp}
            className="btn-secondary btn-lg btn-block"
          >
            <GoogleMark className="h-4 w-4" />
            Google
          </button>

          <p className="mt-7 text-center text-body-sm text-muted">
            Already have an account?{" "}
            <Link href="/auth/login" className="link-inline inline-flex items-center gap-1">
              Sign in
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </p>
        </div>
      )}

      {step === "goal" && (
        <div className="animate-fade-in">
          <div className="space-y-3">
            {GOALS.map((goal) => (
              <OptionRow
                key={goal.id}
                active={learningMode === goal.id}
                onClick={() => setLearningMode(goal.id)}
                icon={goal.icon}
                title={goal.title}
                desc={goal.desc}
              />
            ))}
          </div>
          <div className="mt-7 flex gap-3">
            <BackButton onClick={() => setStep("account")} />
            <button type="button" onClick={handleNextFromGoal} className="btn-primary btn-lg flex-1">
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
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

          <div>
            <p className="mb-2.5 text-overline uppercase text-subtle">Junior secondary</p>
            <div className="grid grid-cols-3 gap-2.5">
              {JSS_LEVELS.map((level) => (
                <ChoicePill
                  key={level}
                  active={classLevel === level}
                  onClick={() => setClassLevel(level)}
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
                  onClick={() => setClassLevel(level)}
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
                onClick={() => setDepartment(dept)}
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
              <ChoicePill key={exam} active={examType === exam} onClick={() => setExamType(exam)}>
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
              {selectedSubjects.length} of {MAX_SUBJECTS} chosen
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
              onClick={handleFinalSignup}
              disabled={signingUp}
              className="btn-primary btn-lg flex-1"
            >
              {signingUp && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {signingUp ? "Creating your account…" : "Create account"}
            </button>
          </div>
        </div>
      )}
    </AuthShell>
  )
}
