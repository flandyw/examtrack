import { describe, expect, test } from "bun:test"
import { EMPTY_APP_DATA, type AppData } from "../src/lib/exam-data"
import { buildMasteryAreas, buildPlannerSuggestions, createPracticeSession, getGoalProgress, materialiseTask } from "../src/lib/learning-workspace"

const attempt = {
  id: "attempt-1",
  subject: "Biology",
  provider: "VCAA",
  title: "VCAA 2025 Biology",
  examYear: 2025,
  paper: "Examination",
  completedAt: "2026-08-20",
  rawScore: 70,
  rawMax: 100,
  questionResults: [{ id: "q1", label: "Question 1", marksAwarded: 4, maxMarks: 10, areaOfStudy: "Genetics", confidence: "low" as const }],
  referenceId: null,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
}

const mistake = {
  id: "mistake-1",
  attemptId: attempt.id,
  question: "Question 1",
  category: "Concept" as const,
  explanation: "Confused dominant and recessive alleles.",
  correction: "Track each allele independently.",
  areaOfStudy: "Genetics",
  dueAt: "2026-08-22T00:00:00.000Z",
  resolved: false,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
}

function appData(): AppData {
  return { ...EMPTY_APP_DATA, attempts: [attempt], mistakes: [mistake], subjects: ["Biology"] }
}

describe("learning workspace", () => {
  test("builds actionable planner recommendations and materialises a task", () => {
    const suggestions = buildPlannerSuggestions(appData(), null, new Date("2026-08-23T00:00:00.000Z"))
    expect(suggestions.some((item) => item.kind === "mistake-review" && item.subject === "Biology")).toBe(true)
    const task = materialiseTask(suggestions[0], new Date("2026-08-23T01:00:00.000Z"))
    expect(task.status).toBe("planned")
    expect(task.updatedAt).toBe("2026-08-23T01:00:00.000Z")
  })

  test("turns question and mistake evidence into a conservative mastery score", () => {
    const [area] = buildMasteryAreas(appData())
    expect(area.name).toBe("Genetics")
    expect(area.evidenceCount).toBe(2)
    expect(area.mastery).toBe(35)
  })

  test("creates a targeted session and prefers an available alternative question", () => {
    const data = appData()
    data.alternativeMistakeDeck = { updatedAt: "2026-08-23T00:00:00.000Z", cards: [{ sourceMistakeId: mistake.id, skill: "Punnett squares", question: "Cross Aa with aa.", answer: "Half Aa, half aa.", marks: 2, generatedAt: "2026-08-23T00:00:00.000Z" }] }
    const session = createPracticeSession("Biology", data, 6, new Date("2026-08-23T00:00:00.000Z"))
    expect(session?.questions[0]).toMatchObject({ question: "Cross Aa with aa.", rating: "unattempted", marks: 2 })
  })

  test("calculates an exam-average goal gap from recorded evidence", () => {
    const data = appData()
    const progress = getGoalProgress({ id: "goal-1", kind: "exam-percentage", subject: "Biology", target: 80, deadline: "2026-10-01", createdAt: "2026-08-23T00:00:00.000Z", updatedAt: "2026-08-23T00:00:00.000Z" }, data, [])
    expect(progress.current).toBe(70)
    expect(progress.gap).toBe(10)
  })
})
