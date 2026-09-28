import { useState } from "react"
import { Check, ChevronRight, GraduationCap, Sparkles, Target, Zap } from "lucide-react"
import { classLevels, goalOptions } from "../data"

export function Welcome({ onComplete }: { onComplete: (name: string, classLevel: string, goal: string) => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [classLevel, setClassLevel] = useState(classLevels[3])
  const [goal, setGoal] = useState(goalOptions[0])

  return (
    <div className="welcome-screen">
      <div className="welcome-art">
        <div className="welcome-glow" />
        <div className="welcome-logo"><GraduationCap size={42} /></div>
        <span className="welcome-orbit orbit-a" />
        <span className="welcome-orbit orbit-b" />
        <div className="welcome-quote">
          <strong>“Progress is built one focused session at a time.”</strong>
          <small>AeroLearn workspace</small>
        </div>
      </div>
      <div className="welcome-card">
        <div className="brand welcome-brand">
          <span className="brand-symbol"><GraduationCap size={20} /></span>
          <span>Aero<span>Learn</span></span>
        </div>
        {step === 0 && (
          <>
            <p className="overline">A new way to learn</p>
            <h1>Your focused learning workspace.</h1>
            <p className="welcome-copy">
              A calm, private desktop app for lessons, practice, community and progress. Everything the AeroLearn platform offers, ready without a browser tab.
            </p>
            <div className="feature-list">
              <span><Zap size={16} /> Works offline</span>
              <span><Target size={16} /> Learn at your pace</span>
              <span><Sparkles size={16} /> Built for students</span>
            </div>
            <button className="primary-button wide" onClick={() => setStep(1)}>
              Set up my workspace <ChevronRight size={17} />
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <p className="overline">Let's make it yours</p>
            <h1>Tell us about yourself.</h1>
            <p className="welcome-copy">Your answers stay on this device and shape your starting point.</p>
            <label>
              Your name
              <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Amara" />
            </label>
            <label>
              Class level
              <select value={classLevel} onChange={(event) => setClassLevel(event.target.value)}>
                {classLevels.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <button className="primary-button wide" disabled={!name.trim()} onClick={() => setStep(2)}>
              Continue <ChevronRight size={17} />
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <p className="overline">One last thing</p>
            <h1>What brings you here?</h1>
            <p className="welcome-copy">We'll use this to suggest the right first sessions.</p>
            <div className="goal-options">
              {goalOptions.map((item) => (
                <button
                  key={item}
                  className={goal === item ? "goal-option selected" : "goal-option"}
                  onClick={() => setGoal(item)}
                >
                  <span className="goal-radio">{goal === item && <Check size={13} />}</span>
                  {item}
                </button>
              ))}
            </div>
            <button className="primary-button wide" onClick={() => onComplete(name.trim(), classLevel, goal)}>
              Enter AeroLearn <ChevronRight size={17} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
