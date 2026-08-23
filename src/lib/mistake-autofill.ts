import type { Mistake } from "@/lib/exam-data"

export const MISTAKE_AUTOFILL_FIELDS = [
  "question",
  "questionText",
  "explanation",
  "correction",
  "areaOfStudy",
  "criterion",
  "totalMarks",
  "marksLost",
] as const

export type MistakeAutofillField = (typeof MISTAKE_AUTOFILL_FIELDS)[number]

export type MistakeAutofill = {
  id: string
  question: string | null
  questionText: string | null
  explanation: string | null
  correction: string | null
  areaOfStudy: string | null
  criterion: string | null
  totalMarks: number | null
  marksLost: number | null
}

const TEXT_FIELDS = ["question", "questionText", "explanation", "correction", "areaOfStudy", "criterion"] as const

function isEmptyText(value: string | undefined) {
  return !value?.trim()
}

function isValidNumber(value: unknown, minimum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum
}

export function getEmptyMistakeFields(mistake: Mistake): MistakeAutofillField[] {
  const fields: MistakeAutofillField[] = TEXT_FIELDS.filter((field) => isEmptyText(mistake[field]))
  if (mistake.totalMarks === undefined) fields.push("totalMarks")
  if (mistake.marksLost === undefined) fields.push("marksLost")
  return fields
}

export function hasEmptyMistakeFields(mistake: Mistake) {
  return getEmptyMistakeFields(mistake).length > 0
}

/**
 * Applies sparse AI suggestions to the latest records. Each field is checked again
 * immediately before assignment so a value added while ChatGPT was running wins.
 */
export function applyMistakeAutofills(mistakes: Mistake[], autofills: MistakeAutofill[], updatedAt: string): Mistake[] {
  const autofillMap = new Map(autofills.map((autofill) => [autofill.id, autofill]))

  return mistakes.map((mistake) => {
    const autofill = autofillMap.get(mistake.id)
    if (!autofill) return mistake

    let next = mistake
    let changed = false
    for (const field of TEXT_FIELDS) {
      const suggestion = autofill[field]
      if (isEmptyText(mistake[field]) && typeof suggestion === "string" && suggestion.trim()) {
        next = { ...next, [field]: suggestion.trim() }
        changed = true
      }
    }

    if (
      mistake.totalMarks === undefined
      && isValidNumber(autofill.totalMarks, Number.MIN_VALUE)
      && (mistake.marksLost === undefined || mistake.marksLost <= autofill.totalMarks!)
    ) {
      next = { ...next, totalMarks: autofill.totalMarks! }
      changed = true
    }

    if (
      mistake.marksLost === undefined
      && isValidNumber(autofill.marksLost, 0)
      && (next.totalMarks === undefined || autofill.marksLost! <= next.totalMarks)
    ) {
      next = { ...next, marksLost: autofill.marksLost! }
      changed = true
    }

    return changed ? { ...next, updatedAt } : mistake
  })
}
