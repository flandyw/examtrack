import { normaliseComparisonName } from "@/lib/exam-data"

export type KnownExamConditions = {
  readingMinutes: number
  writingMinutes: number
  marks: number
}

export function getKnownExamConditions(subject: string, paper: string): KnownExamConditions | null {
  const normalisedSubject = normaliseComparisonName(subject)
  const isMathematicalMethods = normalisedSubject === "mathematical methods" ||
    normalisedSubject === "mathematical methods cas"

  if (!isMathematicalMethods) return null

  const paperNumber = Number(paper.match(/\d+/)?.[0])
  if (paperNumber === 1) return { readingMinutes: 15, writingMinutes: 60, marks: 40 }
  if (paperNumber === 2) return { readingMinutes: 15, writingMinutes: 120, marks: 80 }
  return null
}

export function getKnownExamMarks(subject: string, paper: string): number | null {
  return getKnownExamConditions(subject, paper)?.marks ?? null
}
