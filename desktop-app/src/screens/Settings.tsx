import { useState } from "react"
import type { DesktopProfile } from "../storage"
import { Page, PageHeading, Panel } from "../ui"

export function SettingsScreen({ profile, update, showToast }: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  showToast: (text: string) => void
}) {
  const [name, setName] = useState(profile.name)
  const [classLevel, setClassLevel] = useState(profile.classLevel)
  const [goal, setGoal] = useState(profile.goal)
  const save = () => {
    if (!name.trim()) return
    update({ name: name.trim().slice(0, 100), classLevel, goal: goal.trim().slice(0, 300) })
    showToast("Settings saved on this device")
  }
  return <Page>
    <PageHeading overline="Your workspace" title="Settings" subtitle="Personalise this desktop workspace." />
    <Panel title="Learning profile" description="These settings are stored on this device.">
      <label htmlFor="settings-name">Name</label><input id="settings-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
      <label htmlFor="settings-class">Class level</label><input id="settings-class" value={classLevel} maxLength={30} onChange={(event) => setClassLevel(event.target.value)} />
      <label htmlFor="settings-goal">Study goal</label><textarea id="settings-goal" value={goal} maxLength={300} onChange={(event) => setGoal(event.target.value)} />
      <button className="primary-button" onClick={save} disabled={!name.trim()}>Save changes</button>
    </Panel>
    <div style={{ height: 16 }} />
    <Panel title="Privacy"><p className="muted">Your notes, mock results, messages and local progress stay in this desktop profile. Use the profile menu to clear this device's profile when sharing the computer.</p></Panel>
  </Page>
}
