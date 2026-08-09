import { normaliseComparisonName } from "@/lib/exam-data"

export function getKnownExamMarks(subject: string, paper: string): number | null {
  const normalisedSubject = normaliseComparisonName(subject)
  const isMathematicalMethods = normalisedSubject === "mathematical methods" ||
    normalisedSubject === "mathematical methods cas"

  if (!isMathematicalMethods) return null

  const paperNumber = Number(paper.match(/\d+/)?.[0])
  if (paperNumber === 1) return 40
  if (paperNumber === 2) return 80
  return null
}
