import { normaliseComparisonName, type ExamAttempt } from "@/lib/exam-data"

export type MathsExamFilter = "all" | "exam-1" | "exam-2"

const TECH_SPLIT_MATHS_SUBJECTS = new Set([
  "mathematical methods",
  "mathematical methods cas",
  "specialist mathematics",
])

export function isTechSplitMathsSubject(subject: string) {
  return TECH_SPLIT_MATHS_SUBJECTS.has(normaliseComparisonName(subject))
}

export function matchesMathsExamFilter(attempt: ExamAttempt | undefined, filter: MathsExamFilter) {
  if (filter === "all") return true
  if (!attempt || !isTechSplitMathsSubject(attempt.subject)) return false

  const paperNumber = Number(attempt.paper.match(/\b[12]\b/)?.[0])
  return paperNumber === (filter === "exam-1" ? 1 : 2)
}
