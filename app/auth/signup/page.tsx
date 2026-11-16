"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  auth,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithRedirect,
} from "@/lib/auth"
import {
  ArrowRight,
  Check,
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
import { PASSWORD_RULES, firstUnmetPasswordRule } from "@/lib/password-rules"
import { cn } from "@/lib/utils"

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

function textOf(err: unknown) {
  return err instanceof Error ? err.message : ""
}

export default function SignupPage() {
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState<Step>("account")

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [studyEmailsEnabled, setStudyEmailsEnabled] = useState(true)
  const [showPassword, setShowPassword] = useState(false)

  const [learningMode, setLearningMode] = useState<LearningMode | "">("")
  const [classLevel, setClassLevel] = useState("")
  const [department, setDepartment] = useState<Department | "">("")
  const [schoolName, setSchoolName] = useState("")
  const [examType, setExamType] = useState<ExamType | "">("")
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])

  const [error, setError] = useState("")
  const [signingUp, setSigningUp] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)
  const [emailDelivered, setEmailDelivered] = useState(true)
  const [resending, setResending] = useState(false)
  const [resendNotice, setResendNotice] = useState("")

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
    if (!fullName.trim()) {
      setError("Enter your name so we know what to call you.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address you can open.")
      return
    }
    const unmet = firstUnmetPasswordRule(password)
    if (unmet) {
      setError(`Your password still needs ${unmet.toLowerCase()}.`)
      return
    }
    if (password !== confirmPassword) {
      setError("Those two passwords don't match.")
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
      const setup = { learningMode, schoolName, classLevel, department, examType, subjects: selectedSubjects, studyEmailsEnabled }
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password, fullName, setup)
      setEmailDelivered(result.confirmationSent)
      setConfirmationSent(true)
    } catch (err) {
      setError(textOf(err) || "Could not create your account. Please try again.")
      setStep("account")
    } finally {
      setSigningUp(false)
    }
  }

  const resendConfirmation = async () => {
    setResendNotice("")
    setResending(true)
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || "Could not resend the email.")
      setEmailDelivered(true)
      setResendNotice("A new link is on its way. Check your inbox and spam folder.")
    } catch (err) {
      setResendNotice(textOf(err) || "Could not resend the email. Please try again.")
    } finally {
      setResending(false)
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

  if (confirmationSent) return <AuthShell title="Check your email" lede={emailDelivered ? `We sent a confirmation link to ${email.trim()}. Open it to activate your account.` : `Your account was created, but we could not deliver the confirmation email to ${email.trim()}. Request a new link below.`}>
    <div className="space-y-5">
      <div className="rounded-2xl border border-hairline bg-surface-sunken p-5 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent"><Mail className="h-6 w-6" aria-hidden="true" /></div>
        <p className="text-body-sm font-semibold text-foreground">Your learning path is saved.</p>
        <p className="mt-1 text-body-sm text-muted">Check your inbox and spam folder. The link works once.</p>
      </div>
      {resendNotice && <p role="status" className="text-body-sm text-muted">{resendNotice}</p>}
      <button type="button" onClick={resendConfirmation} disabled={resending} className="btn-primary btn-lg btn-block">
        {resending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {resending ? "Sending…" : "Resend confirmation email"}
      </button>
      <Link href="/auth/login" className="btn-secondary btn-lg btn-block">Go to sign in <ArrowRight className="h-4 w-4" /></Link>
    </div>
  </AuthShell>

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

            <ul className="space-y-1.5" aria-label="Password requirements">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(password)
                return <li key={rule.label} className="flex items-center gap-2 text-caption">
                  <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", met ? "border-success/40 bg-success/15 text-success" : "border-hairline")}>{met && <Check className="h-2.5 w-2.5" aria-hidden="true" />}</span>
                  <span className={met ? "font-medium text-success" : "text-muted"}>{rule.label}</span>
                </li>
              })}
            </ul>

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

            <label className="flex items-start gap-3 rounded-lg border border-hairline p-3 text-body-sm text-muted">
              <input type="checkbox" checked={studyEmailsEnabled} onChange={(event) => setStudyEmailsEnabled(event.target.checked)} className="mt-1" />
              <span>Send me study reminders and learning tips by email. I can turn these off anytime in Settings. Account and plan expiry emails still arrive.</span>
            </label>

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
