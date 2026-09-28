import { NextRequest, NextResponse } from "next/server"
import { getAdminAuth } from "@/lib/db-admin"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

export async function POST(req: NextRequest) {
  try {
    // Verify auth
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const token = authHeader.split("Bearer ")[1]
    await getAdminAuth().verifyIdToken(token)

    const { subjects, hoursPerDay, examDate, learningMode } = await req.json()
    if (!subjects || subjects.length === 0) {
      return NextResponse.json({ error: "No subjects provided" }, { status: 400 })
    }

    // Generate a balanced timetable algorithmically
    const timetable: { subject: string; day: string; time: string; duration: number }[] = []
    
    // Calculate sessions per subject
    const totalSlotsPerWeek = hoursPerDay * 7
    const slotsPerSubject = Math.max(1, Math.floor(totalSlotsPerWeek / subjects.length))
    
    // Available time slots (afternoon focused for students)
    const timeSlots = [
      "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM"
    ].slice(0, Math.min(hoursPerDay + 1, 7))

    // Weekend morning slots
    const weekendMorningSlots = ["9:00 AM", "10:00 AM", "11:00 AM"]

    let subjectIndex = 0
    
    // Weekdays: afternoon/evening study
    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      const day = DAYS[dayIdx]
      const slotsForDay = timeSlots.slice(0, hoursPerDay)
      
      for (const time of slotsForDay) {
        timetable.push({
          subject: subjects[subjectIndex % subjects.length],
          day,
          time,
          duration: 1,
        })
        subjectIndex++
      }
    }

    // Weekends: morning + afternoon
    for (let dayIdx = 5; dayIdx < 7; dayIdx++) {
      const day = DAYS[dayIdx]
      const morningSlots = weekendMorningSlots.slice(0, Math.min(2, hoursPerDay))
      const afternoonSlots = timeSlots.slice(0, Math.max(1, hoursPerDay - 2))
      
      for (const time of [...morningSlots, ...afternoonSlots]) {
        timetable.push({
          subject: subjects[subjectIndex % subjects.length],
          day,
          time,
          duration: 1,
        })
        subjectIndex++
      }
    }

    // If exam date is near, increase frequency of weaker subjects
    if (examDate) {
      const daysUntilExam = Math.max(1, Math.floor((new Date(examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      if (daysUntilExam < 30) {
        // Add extra revision slots on weekends
        for (const subject of subjects.slice(0, 2)) {
          timetable.push({ subject, day: "Saturday", time: "8:00 AM", duration: 1 })
          timetable.push({ subject, day: "Sunday", time: "8:00 AM", duration: 1 })
        }
      }
    }

    return NextResponse.json({ timetable })
  } catch (error: any) {
    console.error("Timetable generation error:", error)
    return NextResponse.json({ error: "Failed to generate timetable" }, { status: 500 })
  }
}
