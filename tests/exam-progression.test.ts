import { describe, expect, test } from "bun:test"
import { buildProgressionPrompt, isExamProgression, mergeExamProgression, parseExamProgression, progressionBySubject, type ExamProgression, type ProgressionExam } from "../src/lib/exam-progression"
import { EMPTY_APP_DATA, migrateAppData, type ExamAttempt } from "../src/lib/exam-data"
import { parseAppDataFile } from "../src/lib/storage"

const paper = (subject: string, overrides: Partial<ProgressionExam> = {}): ProgressionExam => ({ subject, provider: "Company", examYear: 2026, paper: "Exam", marks: 80, phase: "Company practice", ...overrides })
const plan = (exams: ProgressionExam[]): ExamProgression => ({ version: 1, name: "My plan", exams, updatedAt: "2026-09-11T00:00:00.000Z" })
const logged = (exam: ProgressionExam): ExamAttempt => ({ ...exam, id: "logged", title: "Completed exam", completedAt: "2026-09-11", rawScore: 50, rawMax: exam.marks, referenceId: null, createdAt: "2026-09-11T00:00:00.000Z", updatedAt: "2026-09-11T00:00:00.000Z" })

describe("custom exam progression", () => {
  test("keeps six subjects independent through company, older and recent VCAA papers", () => {
    const subjects = ["English", "Chemistry", "Biology", "History", "French", "Music"]
    const exams = subjects.flatMap((subject) => [paper(subject), paper(subject, { provider: "VCAA", examYear: 2018, phase: "Older VCAA" }), paper(subject, { provider: "VCAA", examYear: 2025, phase: "Recent VCAA" })])
    const groups = progressionBySubject(plan(exams), [logged(exams[0])])
    expect(groups).toHaveLength(6)
    expect(groups[0]).toMatchObject({ completed: 1, total: 3, next: { provider: "VCAA", examYear: 2018 } })
    expect(groups.slice(1).every((group) => group.completed === 0 && group.next?.provider === "Company")).toBe(true)
  })
  test("matches all identity fields, normalises case and spaces, and reopens deleted attempts", () => {
    const exams = [paper("English"), paper("English", { paper: "Oral" }), paper("English", { provider: "Other" }), paper("English", { examYear: 2025 })]
    const attempts = [logged(paper(" ENGLISH ", { provider: " company ", paper: " exam " }))]
    expect(progressionBySubject(plan(exams), attempts)[0]).toMatchObject({ completed: 1, next: { paper: "Oral" } })
    expect(progressionBySubject(plan(exams), [])[0].next).toEqual(exams[0])
    expect(progressionBySubject(plan(exams), exams.map(logged))[0]).toMatchObject({ completed: 4, total: 4 })
    expect(progressionBySubject(plan(exams), exams.map(logged))[0].next).toBeUndefined()
  })
  test("accepts fenced JSON and optional phases without changing paper order", () => {
    const exams = [paper("History", { examYear: 2025 }), paper("History", { examYear: 2017 })]
    const parsed = parseExamProgression("```json\n" + JSON.stringify(plan(exams)) + "\n```")
    expect(parsed.exams).toEqual(exams)
    expect(parseExamProgression(JSON.stringify(plan([{ ...exams[0], phase: undefined } as unknown as ProgressionExam]))).exams[0].phase).toBe("")
  })
  test("rejects invalid rows and duplicate exams with useful errors", () => {
    for (const change of [{ marks: 0 }, { marks: "80" }, { marks: 501 }, { examYear: 2026.5 }, { examYear: "2026" }, { subject: " " }, { paper: null }]) {
      expect(() => parseExamProgression(JSON.stringify(plan([{ ...paper("Biology"), ...change } as ProgressionExam])))).toThrow("Exam 1")
    }
    expect(() => parseExamProgression(JSON.stringify(plan([paper("Biology"), paper(" BIOLOGY ")])))).toThrow("duplicates")
    expect(() => parseExamProgression('{"version":2,"name":"Plan","exams":[]}')).toThrow("version")
    expect(() => parseExamProgression("not JSON")).toThrow("valid JSON")
    expect(() => parseExamProgression(JSON.stringify(plan(Array.from({ length: 1001 }, () => paper("Biology")))))).toThrow("1,000")
  })
  test("persists through app exports and migration without affecting old data", () => {
    const examProgression = plan([paper("History")])
    expect(parseAppDataFile(JSON.stringify({ ...EMPTY_APP_DATA, examProgression })).examProgression).toEqual(examProgression)
    expect(migrateAppData(EMPTY_APP_DATA)?.examProgression).toBeUndefined()
    expect(isExamProgression({ ...examProgression, updatedAt: "bad" })).toBe(false)
    expect(migrateAppData({ ...EMPTY_APP_DATA, examProgression: { ...examProgression, exams: null } })).toBeNull()
  })
  test("sync preserves newer plans and intentional clearing", () => {
    const original = plan([paper("French")])
    const cleared = { ...plan([]), updatedAt: "2026-09-12T00:00:00.000Z" }
    expect(mergeExamProgression(original, cleared)).toEqual(cleared)
    expect(mergeExamProgression(cleared, original)).toEqual(cleared)
    expect(mergeExamProgression(original, undefined)).toEqual(original)
    expect(mergeExamProgression(undefined, original)).toEqual(original)
  })
  test("prompt carries subjects, preferences and the draft with the import contract", () => {
    const prompt = buildProgressionPrompt(["History", "French"], "Save 2025 papers for October", plan([paper("History")]))
    expect(prompt).toContain('["History","French"]')
    expect(prompt).toContain("Save 2025 papers for October")
    expect(prompt).toContain('"version":1')
    expect(prompt).toContain("Each subject advances independently")
    expect(prompt).toContain("Do not invent paper availability")
  })
})
