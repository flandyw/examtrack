import type { ExamAttempt } from "@/lib/exam-data"
import type { ExamSuggestion } from "@/lib/exam-suggestions"

export type ProgressionExam = ExamSuggestion & { phase: string }
export type ExamProgression = { version: 1; name: string; exams: ProgressionExam[]; updatedAt: string }
const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ")
export const progressionExamKey = (exam: Pick<ExamSuggestion, "subject" | "provider" | "examYear" | "paper">) =>
  JSON.stringify([normalise(exam.subject), normalise(exam.provider), exam.examYear, normalise(exam.paper)])

export function parseExamProgression(text: string): Omit<ExamProgression, "updatedAt"> {
  if (text.length > 500_000) throw new Error("The plan is too large. Import up to 1,000 exams.")
  let value: unknown
  try { value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) }
  catch { throw new Error("Paste valid JSON, without any surrounding explanation.") }
  if (!value || typeof value !== "object") throw new Error("Expected a plan object.")
  const plan = value as Record<string, unknown>
  if (plan.version !== 1) throw new Error("The plan must have version: 1.")
  const readText = (value: unknown, label: string, optional = false) => {
    if (optional && value === undefined) return ""
    if (typeof value !== "string" || (!optional && !value.trim()) || value.length > 200) throw new Error(`${label} must be ${optional ? "" : "non-empty "}text (up to 200 characters).`)
    return value.trim()
  }
  const name = readText(plan.name, "Plan name")
  if (!Array.isArray(plan.exams) || plan.exams.length > 1000) throw new Error("exams must be a list of up to 1,000 papers.")
  const keys = new Set<string>()
  const exams = plan.exams.map((value, index): ProgressionExam => {
    const label = `Exam ${index + 1}`
    if (!value || typeof value !== "object") throw new Error(`${label} must be an object.`)
    const exam = value as Record<string, unknown>
    if (!Number.isInteger(exam.examYear) || Number(exam.examYear) < 1990 || Number(exam.examYear) > 2100) throw new Error(`${label}: examYear must be a whole year from 1990 to 2100.`)
    if (typeof exam.marks !== "number" || !Number.isFinite(exam.marks) || exam.marks <= 0 || exam.marks > 500) throw new Error(`${label}: marks must be a number greater than 0 and at most 500.`)
    const result = { subject: readText(exam.subject, `${label} subject`), provider: readText(exam.provider, `${label} provider`), paper: readText(exam.paper, `${label} paper`), phase: readText(exam.phase, `${label} phase`, true), examYear: Number(exam.examYear), marks: exam.marks }
    const key = progressionExamKey(result)
    if (keys.has(key)) throw new Error(`${label} duplicates an earlier paper (${result.subject}, ${result.provider} ${result.examYear}, ${result.paper}).`)
    keys.add(key)
    return result
  })
  return { version: 1, name, exams }
}

export function isExamProgression(value: unknown): value is ExamProgression {
  if (!value || typeof value !== "object") return false
  const updatedAt = (value as ExamProgression).updatedAt
  if (typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) return false
  try { parseExamProgression(JSON.stringify(value)); return true } catch { return false }
}

export function mergeExamProgression(local?: ExamProgression, remote?: ExamProgression) {
  return remote && remote.updatedAt > (local?.updatedAt ?? "") ? remote : local
}

export function progressionBySubject(plan: Pick<ExamProgression, "exams">, attempts: ExamAttempt[]) {
  const logged = new Set(attempts.map(progressionExamKey))
  const groups = new Map<string, { subject: string; total: number; completed: number; next?: ProgressionExam }>()
  for (const exam of plan.exams) {
    const key = normalise(exam.subject)
    const group = groups.get(key) ?? { subject: exam.subject, total: 0, completed: 0 }
    group.total++
    if (logged.has(progressionExamKey(exam))) group.completed++
    else group.next ??= exam
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function buildProgressionPrompt(subjects: string[], instructions: string, current?: ExamProgression) {
  return `Create a practice exam progression for ExamTrack. Ask me about my available papers, subjects, exam dates and workload if needed before producing the final JSON. Do not invent paper availability or marks; ask me to confirm uncertain details.
Subjects: ${JSON.stringify(subjects)}. Support all my subjects concurrently, even six or more. Each subject advances independently through its papers in array order. Phase labels describe the purpose of a paper; they do not lock other subjects. Use the exact subject and paper names I supply. Do not assume every subject has Exam 1 and Exam 2 or the same marks.
My preferences: ${instructions.trim() || "New company exams first, then older VCAA exams, saving recent VCAA exams for closer to the final exam."}
Return only JSON with this structure: {"version":1,"name":"My exam progression","exams":[{"subject":"Subject name","provider":"Provider name","examYear":2026,"paper":"Exam","marks":100,"phase":"Company practice"}]}.
The row above illustrates the schema only. Include concrete papers in my preferred order for EACH subject. Use year integers 1990–2100, numeric marks greater than 0 and at most 500, and strings up to 200 characters. No duplicate subject/provider/year/paper combinations. Maximum 1000 exams. phase is optional. No timestamps or completion flags.
Current plan (if any): ${current ? JSON.stringify({ version: 1, name: current.name, exams: current.exams }) : "None"}`
}
