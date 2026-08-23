import type { AppData, AssessmentReference, ExamAttempt, Mistake } from "@/lib/exam-data"
import type { Timetable } from "@/lib/timetable"
import { daysUntil, getExamStart } from "@/lib/timetable"
import { predictStudyScore } from "@/lib/study-score"
import { isCompletedSac } from "@/lib/sac"

export type StudyTaskKind = "mistake-review" | "topic-practice" | "practice-exam" | "sac-prep" | "custom"
export type StudyTaskStatus = "planned" | "completed" | "skipped"

export type StudyTask = {
  id: string
  kind: StudyTaskKind
  title: string
  subject?: string
  detail: string
  durationMinutes: number
  plannedFor: string
  status: StudyTaskStatus
  sourceId?: string
  createdAt: string
  updatedAt: string
}

export type CurriculumArea = {
  id: string
  subject: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

export type StudyGoalKind = "study-score" | "exam-percentage" | "atar"

export type StudyGoal = {
  id: string
  kind: StudyGoalKind
  subject?: string
  target: number
  deadline: string
  createdAt: string
  updatedAt: string
}

export type PracticeQuestionRating = "unattempted" | "correct" | "needs-review"

export type PracticeQuestion = {
  id: string
  sourceMistakeId?: string
  skill: string
  question: string
  answer: string
  marks: number
  rating: PracticeQuestionRating
}

export type PracticeSession = {
  id: string
  title: string
  subject: string
  durationMinutes: number
  questions: PracticeQuestion[]
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export type LearningPreferences = {
  dailyMinutes: number
  studyDays: number[]
}

export type LearningWorkspace = {
  tasks: StudyTask[]
  curriculumAreas: CurriculumArea[]
  goals: StudyGoal[]
  practiceSessions: PracticeSession[]
  preferences: LearningPreferences
  updatedAt: string
}

export const EMPTY_LEARNING_WORKSPACE: LearningWorkspace = {
  tasks: [],
  curriculumAreas: [],
  goals: [],
  practiceSessions: [],
  preferences: { dailyMinutes: 60, studyDays: [1, 2, 3, 4, 5, 6] },
  updatedAt: "1970-01-01T00:00:00.000Z",
}

export type PlannerSuggestion = Omit<StudyTask, "id" | "status" | "createdAt" | "updatedAt">

export type MasteryArea = {
  key: string
  subject: string
  name: string
  awardedMarks: number
  availableMarks: number
  mistakes: number
  reviews: number
  mastery: number | null
  evidenceCount: number
  lastEvidenceAt?: string
}

export type GoalProgress = {
  current: number | null
  target: number
  progress: number
  gap: number | null
  label: string
  evidence: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function isTimestamped(value: unknown) {
  return isRecord(value) && typeof value.id === "string" && typeof value.createdAt === "string" && typeof value.updatedAt === "string"
}

export function isLearningWorkspace(value: unknown): value is LearningWorkspace {
  if (!isRecord(value)) return false
  return Array.isArray(value.tasks) && value.tasks.every((task) => isTimestamped(task) &&
    ["mistake-review", "topic-practice", "practice-exam", "sac-prep", "custom"].includes(String(task.kind)) &&
    typeof task.title === "string" && (task.subject === undefined || typeof task.subject === "string") &&
    typeof task.detail === "string" && typeof task.durationMinutes === "number" && task.durationMinutes > 0 &&
    typeof task.plannedFor === "string" && ["planned", "completed", "skipped"].includes(String(task.status)) &&
    (task.sourceId === undefined || typeof task.sourceId === "string")) &&
    Array.isArray(value.curriculumAreas) && value.curriculumAreas.every((area) => isTimestamped(area) &&
      typeof area.subject === "string" && typeof area.name === "string" &&
      (area.description === undefined || typeof area.description === "string")) &&
    Array.isArray(value.goals) && value.goals.every((goal) => isTimestamped(goal) &&
      ["study-score", "exam-percentage", "atar"].includes(String(goal.kind)) &&
      (goal.subject === undefined || typeof goal.subject === "string") && typeof goal.target === "number" &&
      Number.isFinite(goal.target) && typeof goal.deadline === "string") &&
    Array.isArray(value.practiceSessions) && value.practiceSessions.every((session) => isTimestamped(session) &&
      typeof session.title === "string" && typeof session.subject === "string" &&
      typeof session.durationMinutes === "number" && session.durationMinutes > 0 &&
      (session.completedAt === undefined || typeof session.completedAt === "string") &&
      Array.isArray(session.questions) && session.questions.every((question: unknown) => isRecord(question) &&
        typeof question.id === "string" && (question.sourceMistakeId === undefined || typeof question.sourceMistakeId === "string") &&
        typeof question.skill === "string" && typeof question.question === "string" && typeof question.answer === "string" &&
        typeof question.marks === "number" && question.marks > 0 &&
        ["unattempted", "correct", "needs-review"].includes(String(question.rating)))) &&
    isRecord(value.preferences) && typeof value.preferences.dailyMinutes === "number" && value.preferences.dailyMinutes > 0 &&
    Array.isArray(value.preferences.studyDays) && value.preferences.studyDays.every((day) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6) &&
    typeof value.updatedAt === "string"
}

export function migrateLearningWorkspace(value: unknown): LearningWorkspace {
  return isLearningWorkspace(value) ? value : EMPTY_LEARNING_WORKSPACE
}

function localDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function nextStudyDate(preferences: LearningPreferences, from: Date, offset = 0) {
  for (let index = Math.max(0, offset); index < 14; index += 1) {
    const candidate = addDays(from, index)
    if (preferences.studyDays.includes(candidate.getDay())) return localDate(candidate)
  }
  return localDate(from)
}

function attemptForMistake(mistake: Mistake, attempts: ExamAttempt[]) {
  return attempts.find((attempt) => attempt.id === mistake.attemptId)
}

export function buildPlannerSuggestions(data: AppData, timetable?: Timetable | null, now = new Date()): PlannerSuggestion[] {
  const suggestions: PlannerSuggestion[] = []
  const due = data.mistakes.filter((mistake) => !mistake.suspended && (!mistake.dueAt || new Date(mistake.dueAt) <= now))
  const dueBySubject = new Map<string, Mistake[]>()
  for (const mistake of due) {
    const subject = attemptForMistake(mistake, data.attempts)?.subject ?? "General"
    dueBySubject.set(subject, [...(dueBySubject.get(subject) ?? []), mistake])
  }
  for (const [subject, mistakes] of [...dueBySubject.entries()].toSorted((a, b) => b[1].length - a[1].length).slice(0, 2)) {
    suggestions.push({
      kind: "mistake-review",
      title: `Review ${mistakes.length} due ${subject} card${mistakes.length === 1 ? "" : "s"}`,
      subject,
      detail: "Recall the correction before revealing it, then grade the review.",
      durationMinutes: Math.min(35, Math.max(10, mistakes.length * 3)),
      plannedFor: nextStudyDate(data.learning.preferences, now),
      sourceId: `due:${subject}`,
    })
  }

  const today = localDate(now)
  for (const sac of data.sacRecords.filter((record) => !isCompletedSac(record) && record.scheduledAt >= today).toSorted((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, 2)) {
    const remaining = Math.max(1, Math.ceil((new Date(`${sac.scheduledAt}T00:00:00`).getTime() - now.getTime()) / 86_400_000))
    suggestions.push({
      kind: "sac-prep",
      title: `Prepare for ${sac.title}`,
      subject: sac.subject,
      detail: `${remaining} day${remaining === 1 ? "" : "s"} remaining · focus on ${sac.areaOfStudy || "the assessed area"}.`,
      durationMinutes: Math.min(data.learning.preferences.dailyMinutes, remaining <= 3 ? 45 : 30),
      plannedFor: nextStudyDate(data.learning.preferences, now, remaining <= 2 ? 0 : 1),
      sourceId: sac.id,
    })
  }

  const mastery = buildMasteryAreas(data)
  for (const area of mastery.filter((item) => item.mastery !== null && item.mastery < 75).slice(0, 2)) {
    suggestions.push({
      kind: "topic-practice",
      title: `Strengthen ${area.name}`,
      subject: area.subject,
      detail: `${Math.round(area.mastery ?? 0)}% evidence-based mastery from ${area.evidenceCount} item${area.evidenceCount === 1 ? "" : "s"}.`,
      durationMinutes: Math.min(40, data.learning.preferences.dailyMinutes),
      plannedFor: nextStudyDate(data.learning.preferences, now, 1),
      sourceId: area.key,
    })
  }

  const latest = data.attempts.toSorted((a, b) => b.completedAt.localeCompare(a.completedAt))[0]
  const daysSinceExam = latest ? Math.floor((now.getTime() - new Date(`${latest.completedAt}T00:00:00`).getTime()) / 86_400_000) : Infinity
  if (daysSinceExam >= 7) {
    const subject = mastery[0]?.subject ?? data.subjects[0]
    suggestions.push({
      kind: "practice-exam",
      title: subject ? `Sit a timed ${subject} paper` : "Sit a timed practice paper",
      subject,
      detail: latest ? `Your last recorded paper was ${daysSinceExam} days ago.` : "Build your first full-paper performance baseline.",
      durationMinutes: Math.max(60, data.learning.preferences.dailyMinutes),
      plannedFor: nextStudyDate(data.learning.preferences, now, 2),
      sourceId: `exam:${subject ?? "general"}`,
    })
  }

  if (timetable) {
    const tracked = new Set(data.trackedExamIds)
    const nextExam = timetable.exams.filter((entry) => tracked.has(entry.id) && getExamStart(entry) >= now).toSorted((a, b) => getExamStart(a).getTime() - getExamStart(b).getTime())[0]
    if (nextExam && daysUntil(nextExam, now) <= 21) {
      suggestions.unshift({
        kind: "practice-exam",
        title: `Official exam preparation: ${nextExam.subject}`,
        subject: nextExam.subject,
        detail: `${daysUntil(nextExam, now)} days until the official exam. Rehearse under full conditions.`,
        durationMinutes: Math.max(90, data.learning.preferences.dailyMinutes),
        plannedFor: nextStudyDate(data.learning.preferences, now),
        sourceId: nextExam.id,
      })
    }
  }

  const existing = new Set(data.learning.tasks.filter((task) => task.status === "planned").map((task) => `${task.sourceId}:${task.plannedFor}`))
  return suggestions.filter((suggestion) => !existing.has(`${suggestion.sourceId}:${suggestion.plannedFor}`)).slice(0, 6)
}

export function materialiseTask(suggestion: PlannerSuggestion, now = new Date()): StudyTask {
  const timestamp = now.toISOString()
  return { ...suggestion, id: crypto.randomUUID(), status: "planned", createdAt: timestamp, updatedAt: timestamp }
}

export function buildMasteryAreas(data: Pick<AppData, "attempts" | "mistakes" | "learning">): MasteryArea[] {
  const buckets = new Map<string, MasteryArea>()
  const ensure = (subject: string, name: string) => {
    const key = `${subject.trim().toLowerCase()}::${name.trim().toLowerCase()}`
    const current = buckets.get(key) ?? { key, subject, name, awardedMarks: 0, availableMarks: 0, mistakes: 0, reviews: 0, mastery: null, evidenceCount: 0 }
    buckets.set(key, current)
    return current
  }
  for (const area of data.learning.curriculumAreas) ensure(area.subject, area.name)
  for (const attempt of data.attempts) {
    for (const result of attempt.questionResults ?? []) {
      const name = result.areaOfStudy?.trim() || result.criterion?.trim()
      if (!name) continue
      const bucket = ensure(attempt.subject, name)
      bucket.awardedMarks += result.marksAwarded
      bucket.availableMarks += result.maxMarks
      bucket.evidenceCount += 1
      bucket.lastEvidenceAt = [bucket.lastEvidenceAt ?? "", attempt.completedAt].toSorted().at(-1)
    }
  }
  const attemptMap = new Map(data.attempts.map((attempt) => [attempt.id, attempt]))
  for (const mistake of data.mistakes) {
    const attempt = attemptMap.get(mistake.attemptId)
    const name = mistake.areaOfStudy?.trim() || mistake.criterion?.trim()
    if (!attempt || !name) continue
    const bucket = ensure(attempt.subject, name)
    bucket.mistakes += 1
    bucket.reviews += mistake.reviewHistory?.length ?? 0
    bucket.evidenceCount += 1
    bucket.lastEvidenceAt = [bucket.lastEvidenceAt ?? "", mistake.updatedAt.slice(0, 10)].toSorted().at(-1)
  }
  return [...buckets.values()].map((area) => {
    if (!area.availableMarks && !area.mistakes) return area
    const score = area.availableMarks ? area.awardedMarks / area.availableMarks * 100 : 60
    const mistakePenalty = Math.min(25, area.mistakes * 5)
    const reviewRecovery = Math.min(mistakePenalty, area.reviews * 2)
    return { ...area, mastery: Math.max(0, Math.min(100, score - mistakePenalty + reviewRecovery)) }
  }).toSorted((a, b) => (a.mastery ?? -1) - (b.mastery ?? -1) || a.subject.localeCompare(b.subject))
}

function averagePercent(attempts: ExamAttempt[], subject?: string) {
  const matched = subject ? attempts.filter((attempt) => attempt.subject.toLowerCase() === subject.toLowerCase()) : attempts
  if (!matched.length) return null
  return matched.reduce((total, attempt) => total + attempt.rawScore / attempt.rawMax * 100, 0) / matched.length
}

export function getGoalProgress(goal: StudyGoal, data: AppData, references: AssessmentReference[]): GoalProgress {
  let current: number | null = null
  let label = "Current"
  let evidence = "No compatible evidence yet."
  if (goal.kind === "exam-percentage") {
    current = averagePercent(data.attempts, goal.subject)
    label = "Average exam result"
    evidence = current === null ? evidence : `Based on ${data.attempts.filter((attempt) => !goal.subject || attempt.subject.toLowerCase() === goal.subject.toLowerCase()).length} recorded paper(s).`
  } else if (goal.kind === "study-score" && goal.subject) {
    const prediction = predictStudyScore({ subject: goal.subject, attempts: data.attempts, references })
    current = prediction?.studyScore ?? null
    label = "Predicted raw study score"
    evidence = prediction ? `${prediction.confidence} confidence · likely ${prediction.low}–${prediction.high}.` : evidence
  } else if (goal.kind === "atar") {
    const saved = data.atarEstimates[0]
    current = saved ? Number.parseFloat(saved.atarLabel.replace(/[^0-9.]/g, "")) : null
    label = "Latest saved ATAR estimate"
    evidence = saved ? `Saved ${new Date(saved.savedAt).toLocaleDateString("en-AU")}.` : "Save an ATAR estimate to establish a baseline."
  }
  const gap = current === null ? null : Math.max(0, goal.target - current)
  return { current, target: goal.target, progress: current === null ? 0 : Math.max(0, Math.min(100, current / goal.target * 100)), gap, label, evidence }
}

export function createPracticeSession(subject: string, data: AppData, limit = 6, now = new Date()): PracticeSession | null {
  const attemptMap = new Map(data.attempts.map((attempt) => [attempt.id, attempt]))
  const mistakes = data.mistakes.filter((mistake) => attemptMap.get(mistake.attemptId)?.subject.toLowerCase() === subject.toLowerCase() && !mistake.suspended)
  const alternativeMap = new Map((data.alternativeMistakeDeck?.cards ?? []).map((card) => [card.sourceMistakeId, card]))
  const questions = mistakes.slice(0, limit).map((mistake): PracticeQuestion => {
    const alternative = alternativeMap.get(mistake.id)
    return {
      id: crypto.randomUUID(),
      sourceMistakeId: mistake.id,
      skill: alternative?.skill ?? mistake.areaOfStudy ?? mistake.criterion ?? mistake.category,
      question: alternative?.question ?? mistake.questionText ?? `Reattempt ${mistake.question} without looking at your correction.`,
      answer: alternative?.answer ?? mistake.correction,
      marks: alternative?.marks ?? mistake.totalMarks ?? 1,
      rating: "unattempted",
    }
  })
  if (!questions.length) return null
  const timestamp = now.toISOString()
  return {
    id: crypto.randomUUID(),
    title: `${subject} targeted practice`,
    subject,
    durationMinutes: Math.max(15, Math.min(90, questions.reduce((total, question) => total + question.marks * 2, 0))),
    questions,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
