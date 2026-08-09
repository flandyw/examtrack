import { describe, expect, test } from "bun:test"
import { mergeCollection, mergeMistakeInsights, mergeSacState, mergeTrackedState } from "../src/lib/sync"
import { mergeTimerSession } from "../src/lib/ongoing-timers"

type Item = { id: string; updatedAt: string; value: string }

describe("sync merge", () => {
  test("keeps the newest edit and applies newer deletions", () => {
    const local: Item[] = [
      { id: "local-wins", updatedAt: "2026-07-12T02:00:00.000Z", value: "local" },
      { id: "deleted", updatedAt: "2026-07-12T01:00:00.000Z", value: "old" },
    ]
    const remote = [
      { id: "local-wins", payload: { id: "local-wins", updatedAt: "2026-07-12T01:00:00.000Z", value: "remote" }, updated_at: "2026-07-12T01:00:00.000Z", deleted_at: null },
      { id: "deleted", payload: null, updated_at: "2026-07-12T03:00:00.000Z", deleted_at: "2026-07-12T03:00:00.000Z" },
      { id: "remote-wins", payload: { id: "remote-wins", updatedAt: "2026-07-12T04:00:00.000Z", value: "remote" }, updated_at: "2026-07-12T04:00:00.000Z", deleted_at: null },
    ]
    const tombstones: Record<string, string> = {}

    expect(mergeCollection(local, remote, tombstones)).toEqual([
      local[0],
      remote[2].payload,
    ])
    expect(tombstones.deleted).toBe("2026-07-12T03:00:00.000Z")
  })

  test("does not resurrect a locally deleted item from an older remote copy", () => {
    const tombstones = { deleted: "2026-07-12T03:00:00.000Z" }
    const remote = [{
      id: "deleted",
      payload: { id: "deleted", updatedAt: "2026-07-12T01:00:00.000Z", value: "old" },
      updated_at: "2026-07-12T01:00:00.000Z",
      deleted_at: null,
    }]

    expect(mergeCollection<Item>([], remote, tombstones)).toEqual([])
  })

  test("preserves question text and review scheduling in a synced mistake payload", () => {
    const payload = {
      id: "mistake-1",
      updatedAt: "2026-07-12T04:00:00.000Z",
      questionText: "Differentiate $e^{2x}$.",
      reviewState: "review",
      intervalDays: 20,
      easeFactor: 2.5,
      dueAt: "2026-08-01T04:00:00.000Z",
    }

    expect(mergeCollection([], [{ id: payload.id, payload, updated_at: payload.updatedAt, deleted_at: null }], {}))
      .toEqual([payload])
  })

  test("keeps the newest tracked-exam state across devices", () => {
    expect(mergeTrackedState(["local"], "2026-07-15T01:00:00.000Z", ["remote"], "2026-07-15T02:00:00.000Z"))
      .toEqual({ trackedExamIds: ["remote"], trackedExamIdsUpdatedAt: "2026-07-15T02:00:00.000Z" })
  })

  test("keeps the newest SAC collection across devices", () => {
    const local = [{ id: "local" }] as never[]
    const remote = [{ id: "remote" }] as never[]
    expect(mergeSacState(local, "2026-07-15T01:00:00.000Z", remote, "2026-07-15T02:00:00.000Z"))
      .toEqual({ sacRecords: remote, sacRecordsUpdatedAt: "2026-07-15T02:00:00.000Z" })
  })

  test("keeps the newest ongoing timer snapshot and its deletion", () => {
    const local = { title: "Local timer" }
    const remote = { title: "Remote timer" }
    expect(mergeTimerSession(local, "2026-07-15T01:00:00.000Z", remote, "2026-07-15T02:00:00.000Z"))
      .toEqual({ session: remote, updatedAt: "2026-07-15T02:00:00.000Z" })
    expect(mergeTimerSession(remote, "2026-07-15T02:00:00.000Z", undefined, "2026-07-15T03:00:00.000Z"))
      .toEqual({ session: undefined, updatedAt: "2026-07-15T03:00:00.000Z" })
  })

  test("keeps the newest saved mistake insights", () => {
    const older = { summary: "Old", biggestErrors: [], otherInsights: [], nextStep: "Old", generatedAt: "2026-07-15T01:00:00.000Z" }
    const newer = { ...older, summary: "New", generatedAt: "2026-07-15T02:00:00.000Z" }
    expect(mergeMistakeInsights(older, newer)).toEqual(newer)
    expect(mergeMistakeInsights(newer, older)).toEqual(newer)
    const withQuestions = { ...older, practiceQuestions: "Questions", questionsGeneratedAt: "2026-07-15T03:00:00.000Z" }
    expect(mergeMistakeInsights(newer, withQuestions)).toEqual(withQuestions)
  })
})
