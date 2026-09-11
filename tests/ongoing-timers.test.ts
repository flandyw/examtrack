import { describe, expect, test } from "bun:test"
import { EMPTY_APP_DATA, migrateAppData } from "../src/lib/exam-data"
import { createFocalTimerLink } from "../src/lib/focal-timer"
import { getExamTimerState } from "../src/lib/exam-timer"
import { pauseExamSession, resumeExamSession, mergeTimerSession, type ExamTimerSession } from "../src/lib/ongoing-timers"

const start = Date.parse("2026-09-11T00:00:00Z")
const session: ExamTimerSession = {
  subject: "Chemistry", provider: "VCAA", title: "Chemistry practice", examYear: 2025, paper: "Exam",
  readingMinutes: 15, writingMinutes: 120, marks: 100, startedAt: start, pausedSeconds: 0,
  focal: createFocalTimerLink("exam", "Chemistry", "Chemistry practice", 8100, new Date(start)),
  workspaceItems: [{ id: "q1", label: "Question 1", marks: 5, status: "flagged", confidence: "low", note: "Revisit calculation" }],
}

describe("saved exam sessions", () => {
  test("restores a paused workspace on another device and excludes an overnight break", () => {
    const paused = pauseExamSession(session, start + 20 * 60_000)
    const updatedAt = new Date(paused.pausedAt!).toISOString()
    const restored = migrateAppData(JSON.parse(JSON.stringify({ ...EMPTY_APP_DATA, activeExamTimer: paused, activeExamTimerUpdatedAt: updatedAt })))!
    const remote = mergeTimerSession(undefined, "", restored.activeExamTimer, updatedAt).session!
    expect(remote.workspaceItems).toEqual(session.workspaceItems)
    const now = start + 24 * 60 * 60_000
    const resumed = resumeExamSession(remote, now)
    expect(getExamTimerState(now, resumed.startedAt, 15, 120, 100).writingElapsedSeconds).toBe(300)
    expect(resumed.focal?.sessionId).toBe(session.focal?.sessionId)
    expect(resumed.focal?.intervals).toEqual([
      { start: new Date(start).toISOString(), end: updatedAt },
      { start: new Date(now).toISOString() },
    ])
    expect(resumed.pausedSeconds).toBe((now - paused.pausedAt!) / 1000)
  })

  test("repeated pause/resume is idempotent and preserves fractional pause time", () => {
    const paused = pauseExamSession(session, start + 1000)
    expect(pauseExamSession(paused, start + 2000)).toBe(paused)
    const resumed = resumeExamSession(paused, start + 2500)
    expect(resumed.pausedSeconds).toBe(1.5)
    expect(resumeExamSession(resumed, start + 3000)).toBe(resumed)
  })

  test("completion on another device removes a stale saved session", () => {
    expect(mergeTimerSession(session, "2026-09-11T00:00:00Z", undefined, "2026-09-12T00:00:00Z").session).toBeUndefined()
  })
})
