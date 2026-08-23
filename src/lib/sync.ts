import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import type { User } from "@supabase/supabase-js"
import { EMPTY_APP_DATA, migrateAppData, type AlternativeMistakeDeck, type AppData, type ExamAttempt, type Mistake, type MistakeInsights, type SavedAtarEstimate } from "@/lib/exam-data"
import { supabase } from "@/lib/supabase"
import { isExamDifficultySettings } from "@/lib/exam-difficulty"
import { migrateSacRecords, type SacRecord } from "@/lib/sac"
import { isExamTimerSession, isSacTimerSession, mergeTimerSession } from "@/lib/ongoing-timers"
import { migrateLearningWorkspace } from "@/lib/learning-workspace"

const TOMBSTONE_KEY = "examtrack:sync:tombstones:v1"
const OWNER_KEY = "examtrack:sync:owner:v1"

function ownerBackupKey(owner: string) {
  return `examtrack:sync:owner-backup:v1:${owner}`
}

type Collection = "attempts" | "mistakes"
type Tombstones = Record<Collection, Record<string, string>>
type RemoteRow = {
  id: string
  payload: unknown | null
  updated_at: string
  deleted_at: string | null
}

const EMPTY_TOMBSTONES = (): Tombstones => ({ attempts: {}, mistakes: {} })

function loadTombstones(): Tombstones {
  try {
    const value = JSON.parse(localStorage.getItem(TOMBSTONE_KEY) ?? "null") as Partial<Tombstones> | null
    return {
      attempts: value?.attempts && typeof value.attempts === "object" ? value.attempts : {},
      mistakes: value?.mistakes && typeof value.mistakes === "object" ? value.mistakes : {},
    }
  } catch {
    return EMPTY_TOMBSTONES()
  }
}

function saveTombstones(value: Tombstones) {
  localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(value))
}

export function recordLocalChanges(previous: AppData, next: AppData, now = new Date().toISOString()) {
  const tombstones = loadTombstones()
  for (const collection of ["attempts", "mistakes"] as const) {
    const previousIds = new Set(previous[collection].map(({ id }) => id))
    const nextIds = new Set(next[collection].map(({ id }) => id))
    for (const id of previousIds) if (!nextIds.has(id)) tombstones[collection][id] = now
    for (const id of nextIds) if (!previousIds.has(id)) delete tombstones[collection][id]
  }
  saveTombstones(tombstones)
}

export function mergeCollection<T extends { id: string; updatedAt: string }>(
  local: T[],
  remote: Array<RemoteRow & { payload: T | null }>,
  tombstones: Record<string, string>,
): T[] {
  const merged = new Map(local.map((item) => [item.id, item]))
  for (const row of remote) {
    const localVersion = merged.get(row.id)?.updatedAt ?? tombstones[row.id] ?? ""
    const remoteVersion = row.deleted_at ?? row.updated_at
    if (remoteVersion <= localVersion) continue
    if (row.deleted_at) {
      merged.delete(row.id)
      tombstones[row.id] = remoteVersion
    } else if (row.payload) {
      merged.set(row.id, row.payload)
      delete tombstones[row.id]
    }
  }
  return [...merged.values()]
}

export function mergeTrackedState(
  localIds: string[],
  localUpdatedAt: string,
  remoteIds: string[],
  remoteUpdatedAt: string,
) {
  return remoteUpdatedAt > localUpdatedAt
    ? { trackedExamIds: remoteIds, trackedExamIdsUpdatedAt: remoteUpdatedAt }
    : { trackedExamIds: localIds, trackedExamIdsUpdatedAt: localUpdatedAt }
}

export function mergeSacState(
  localRecords: SacRecord[],
  localUpdatedAt: string,
  remoteRecords: SacRecord[],
  remoteUpdatedAt: string,
) {
  return remoteUpdatedAt > localUpdatedAt
    ? { sacRecords: remoteRecords, sacRecordsUpdatedAt: remoteUpdatedAt }
    : { sacRecords: localRecords, sacRecordsUpdatedAt: localUpdatedAt }
}

export function mergeMistakeInsights(local?: MistakeInsights, remote?: MistakeInsights) {
  const updatedAt = (insights?: MistakeInsights) => insights?.questionsGeneratedAt ?? insights?.generatedAt ?? ""
  return remote && updatedAt(remote) > updatedAt(local) ? remote : local
}

export function mergeAlternativeMistakeDeck(local?: AlternativeMistakeDeck, remote?: AlternativeMistakeDeck) {
  return remote && remote.updatedAt > (local?.updatedAt ?? "") ? remote : local
}

export function mergeAtarEstimates(
  local: SavedAtarEstimate[],
  localUpdatedAt: string,
  remote: SavedAtarEstimate[],
  remoteUpdatedAt: string,
) {
  return remoteUpdatedAt > localUpdatedAt
    ? { atarEstimates: remote, atarEstimatesUpdatedAt: remoteUpdatedAt }
    : { atarEstimates: local, atarEstimatesUpdatedAt: localUpdatedAt }
}

async function syncCollection<T extends { id: string; updatedAt: string }>(
  collection: Collection,
  userId: string,
  local: T[],
  remote: Array<RemoteRow & { payload: T | null }>,
  tombstones: Record<string, string>,
) {
  if (!supabase) return
  const merged = mergeCollection(local, remote, tombstones)
  const rows = [
    ...merged.map((item) => ({
      user_id: userId,
      id: item.id,
      payload: item,
      updated_at: item.updatedAt,
      deleted_at: null,
    })),
    ...Object.entries(tombstones).map(([id, deletedAt]) => ({
      user_id: userId,
      id,
      payload: null,
      updated_at: deletedAt,
      deleted_at: deletedAt,
    })),
  ]
  if (rows.length) {
    const { error } = await supabase.from(collection).upsert(rows, { onConflict: "user_id,id" })
    if (error) throw error
  }
  return merged
}

export async function syncAppData(data: AppData, userId: string): Promise<AppData> {
  if (!supabase) return data
  const [attemptResult, mistakeResult, stateResult] = await Promise.all([
    supabase.from("attempts").select("id,payload,updated_at,deleted_at"),
    supabase.from("mistakes").select("id,payload,updated_at,deleted_at"),
    supabase.from("user_state").select("payload,updated_at").maybeSingle(),
  ])
  if (attemptResult.error) throw attemptResult.error
  if (mistakeResult.error) throw mistakeResult.error
  if (stateResult.error) throw stateResult.error

  const activeAttempts = attemptResult.data.filter((row) => !row.deleted_at).map((row) => row.payload)
  const activeMistakes = mistakeResult.data.filter((row) => !row.deleted_at).map((row) => row.payload)
  const validated = migrateAppData({
    schemaVersion: 5,
    attempts: activeAttempts,
    mistakes: activeMistakes,
    sacRecords: [],
    sacRecordsUpdatedAt: "1970-01-01T00:00:00.000Z",
    subjects: [],
    subjectsUpdatedAt: "1970-01-01T00:00:00.000Z",
    trackedExamIds: [],
    trackedExamIdsUpdatedAt: "1970-01-01T00:00:00.000Z",
    completedExamIds: [],
    completedExamIdsUpdatedAt: "1970-01-01T00:00:00.000Z",
  })
  if (!validated) throw new Error("Synced data is invalid.")

  const attemptsById = new Map(validated.attempts.map((item) => [item.id, item]))
  const mistakesById = new Map(validated.mistakes.map((item) => [item.id, item]))
  const attemptRows = attemptResult.data.map((row) => ({ ...row, payload: row.deleted_at ? null : attemptsById.get(row.id) ?? null }))
  const mistakeRows = mistakeResult.data.map((row) => ({ ...row, payload: row.deleted_at ? null : mistakesById.get(row.id) ?? null }))
  const tombstones = loadTombstones()
  const [attempts, mistakes] = await Promise.all([
    syncCollection<ExamAttempt>("attempts", userId, data.attempts, attemptRows, tombstones.attempts),
    syncCollection<Mistake>("mistakes", userId, data.mistakes, mistakeRows, tombstones.mistakes),
  ])
  const remoteState = stateResult.data?.payload as { trackedExamIds?: unknown; trackedExamIdsUpdatedAt?: unknown; completedExamIds?: unknown; completedExamIdsUpdatedAt?: unknown; subjects?: unknown; subjectsUpdatedAt?: unknown; sacRecords?: unknown; sacRecordsUpdatedAt?: unknown; activeExamTimer?: unknown; activeExamTimerUpdatedAt?: unknown; activeSacTimer?: unknown; activeSacTimerUpdatedAt?: unknown; mistakeInsights?: unknown; alternativeMistakeDeck?: unknown; examDifficulty?: unknown; atarEstimates?: unknown; atarEstimatesUpdatedAt?: unknown; learning?: unknown } | undefined
  const remoteIds = Array.isArray(remoteState?.trackedExamIds) && remoteState.trackedExamIds.every((id) => typeof id === "string") ? remoteState.trackedExamIds : []
  const remoteUpdatedAt = typeof remoteState?.trackedExamIdsUpdatedAt === "string" ? remoteState.trackedExamIdsUpdatedAt : (stateResult.data?.updated_at ?? "")
  const { trackedExamIds, trackedExamIdsUpdatedAt } = mergeTrackedState(data.trackedExamIds, data.trackedExamIdsUpdatedAt, remoteIds, remoteUpdatedAt)
  const remoteCompletedIds = Array.isArray(remoteState?.completedExamIds) && remoteState.completedExamIds.every((id) => typeof id === "string") ? remoteState.completedExamIds : []
  const remoteCompletedUpdatedAt = typeof remoteState?.completedExamIdsUpdatedAt === "string" ? remoteState.completedExamIdsUpdatedAt : ""
  const useRemoteCompleted = remoteCompletedUpdatedAt > data.completedExamIdsUpdatedAt
  const completedExamIds = useRemoteCompleted ? remoteCompletedIds : data.completedExamIds
  const completedExamIdsUpdatedAt = useRemoteCompleted ? remoteCompletedUpdatedAt : data.completedExamIdsUpdatedAt
  const remoteSubjects = Array.isArray(remoteState?.subjects) && remoteState.subjects.every((subject) => typeof subject === "string") ? remoteState.subjects : []
  const remoteSubjectsUpdatedAt = typeof remoteState?.subjectsUpdatedAt === "string" ? remoteState.subjectsUpdatedAt : ""
  const useRemoteSubjects = remoteSubjectsUpdatedAt > data.subjectsUpdatedAt
  const subjects = useRemoteSubjects ? remoteSubjects : data.subjects
  const subjectsUpdatedAt = useRemoteSubjects ? remoteSubjectsUpdatedAt : data.subjectsUpdatedAt
  const remoteSacRecords = migrateSacRecords(remoteState?.sacRecords) ?? []
  const remoteSacUpdatedAt = typeof remoteState?.sacRecordsUpdatedAt === "string" ? remoteState.sacRecordsUpdatedAt : ""
  const { sacRecords, sacRecordsUpdatedAt } = mergeSacState(data.sacRecords, data.sacRecordsUpdatedAt, remoteSacRecords, remoteSacUpdatedAt)
  const remoteExamTimer = isExamTimerSession(remoteState?.activeExamTimer) ? remoteState.activeExamTimer : undefined
  const remoteExamTimerUpdatedAt = typeof remoteState?.activeExamTimerUpdatedAt === "string" ? remoteState.activeExamTimerUpdatedAt : ""
  const { session: activeExamTimer, updatedAt: activeExamTimerUpdatedAt } = mergeTimerSession(
    data.activeExamTimer,
    data.activeExamTimerUpdatedAt,
    remoteExamTimer,
    remoteExamTimerUpdatedAt,
  )
  const remoteSacTimer = isSacTimerSession(remoteState?.activeSacTimer) ? remoteState.activeSacTimer : undefined
  const remoteSacTimerUpdatedAt = typeof remoteState?.activeSacTimerUpdatedAt === "string" ? remoteState.activeSacTimerUpdatedAt : ""
  const { session: activeSacTimer, updatedAt: activeSacTimerUpdatedAt } = mergeTimerSession(
    data.activeSacTimer,
    data.activeSacTimerUpdatedAt,
    remoteSacTimer,
    remoteSacTimerUpdatedAt,
  )
  const remoteInsights = migrateAppData({ ...EMPTY_APP_DATA, mistakeInsights: remoteState?.mistakeInsights })?.mistakeInsights
  const mistakeInsights = mergeMistakeInsights(data.mistakeInsights, remoteInsights)
  const remoteAlternativeDeck = migrateAppData({ ...EMPTY_APP_DATA, alternativeMistakeDeck: remoteState?.alternativeMistakeDeck })?.alternativeMistakeDeck
  const alternativeMistakeDeck = mergeAlternativeMistakeDeck(data.alternativeMistakeDeck, remoteAlternativeDeck)
  const remoteDifficulty = isExamDifficultySettings(remoteState?.examDifficulty) ? remoteState.examDifficulty : undefined
  const examDifficulty = remoteDifficulty && remoteDifficulty.updatedAt > (data.examDifficulty?.updatedAt ?? "")
    ? remoteDifficulty
    : data.examDifficulty
  const remoteAtarEstimates = Array.isArray(remoteState?.atarEstimates)
    ? migrateAppData({ ...EMPTY_APP_DATA, atarEstimates: remoteState.atarEstimates })?.atarEstimates ?? []
    : []
  const remoteAtarEstimatesUpdatedAt = typeof remoteState?.atarEstimatesUpdatedAt === "string" ? remoteState.atarEstimatesUpdatedAt : "1970-01-01T00:00:00.000Z"
  const { atarEstimates, atarEstimatesUpdatedAt } = mergeAtarEstimates(data.atarEstimates, data.atarEstimatesUpdatedAt, remoteAtarEstimates, remoteAtarEstimatesUpdatedAt)
  const remoteLearning = migrateLearningWorkspace(remoteState?.learning)
  const learning = remoteLearning.updatedAt > data.learning.updatedAt ? remoteLearning : data.learning
  const { error: stateError } = await supabase.from("user_state").upsert({
    user_id: userId,
    payload: { trackedExamIds, trackedExamIdsUpdatedAt, completedExamIds, completedExamIdsUpdatedAt, subjects, subjectsUpdatedAt, sacRecords, sacRecordsUpdatedAt, activeExamTimer, activeExamTimerUpdatedAt, activeSacTimer, activeSacTimerUpdatedAt, mistakeInsights, alternativeMistakeDeck, examDifficulty, atarEstimates, atarEstimatesUpdatedAt, learning },
    updated_at: [trackedExamIdsUpdatedAt, completedExamIdsUpdatedAt, subjectsUpdatedAt, sacRecordsUpdatedAt, activeExamTimerUpdatedAt, activeSacTimerUpdatedAt, mistakeInsights?.questionsGeneratedAt ?? mistakeInsights?.generatedAt ?? "", alternativeMistakeDeck?.updatedAt ?? "", examDifficulty?.updatedAt ?? "", atarEstimatesUpdatedAt, learning.updatedAt].toSorted().at(-1),
  }, { onConflict: "user_id" })
  if (stateError) throw stateError
  saveTombstones(tombstones)
  return { ...data, attempts: attempts ?? data.attempts, mistakes: mistakes ?? data.mistakes, subjects, subjectsUpdatedAt, trackedExamIds, trackedExamIdsUpdatedAt, completedExamIds, completedExamIdsUpdatedAt, sacRecords, sacRecordsUpdatedAt, activeExamTimer, activeExamTimerUpdatedAt, activeSacTimer, activeSacTimerUpdatedAt, mistakeInsights, alternativeMistakeDeck, examDifficulty, atarEstimates, atarEstimatesUpdatedAt, learning }
}

export type SyncStatus = "unconfigured" | "signed-out" | "syncing" | "synced" | "error"

export function useSupabaseSync(data: AppData, setData: Dispatch<SetStateAction<AppData>>) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<SyncStatus>(supabase ? "signed-out" : "unconfigured")
  const previous = useRef(data)

  useEffect(() => {
    recordLocalChanges(previous.current, data)
    previous.current = data
    if (!supabase || !user) return
    let cancelled = false
    const timeout = window.setTimeout(() => {
      setStatus("syncing")
      syncAppData(data, user.id)
        .then((merged) => {
          if (cancelled) return
          setData((current) => JSON.stringify(current) === JSON.stringify(merged) ? current : merged)
          setStatus("synced")
        })
        .catch(() => {
          if (!cancelled) setStatus("error")
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [data, setData, user])

  useEffect(() => {
    if (!supabase) return
    const acceptUser = (current: User | null) => {
      if (current) {
        const owner = localStorage.getItem(OWNER_KEY)
        if (owner && owner !== current.id) {
          // Preserve the outgoing account's data before switching so nothing
          // is lost if the incoming remote fetch fails.
          try {
            localStorage.setItem(ownerBackupKey(owner), JSON.stringify(previous.current))
          } catch {
            // Storage full or unavailable — proceed without a backup.
          }
          localStorage.removeItem(TOMBSTONE_KEY)
          previous.current = EMPTY_APP_DATA
          setData(EMPTY_APP_DATA)
        }
        localStorage.setItem(OWNER_KEY, current.id)
      }
      setUser(current)
    }
    supabase.auth.getUser()
      .then(({ data: { user: current } }) => acceptUser(current))
      .catch(() => setStatus("error"))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      acceptUser(session?.user ?? null)
      setStatus(session ? "syncing" : "signed-out")
    })
    return () => subscription.unsubscribe()
  }, [setData])

  return {
    configured: Boolean(supabase),
    user,
    status,
    signIn: async (email: string, password: string) => {
      if (!supabase) throw new Error("Supabase is not configured.")
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    signUp: async (email: string, password: string) => {
      if (!supabase) throw new Error("Supabase is not configured.")
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      return Boolean(data.session)
    },
    signOut: async () => {
      if (!supabase) return
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
  }
}
