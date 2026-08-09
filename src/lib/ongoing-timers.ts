import { isFocalTimerLink, type FocalTimerLink } from "@/lib/focal-timer"
import type { SacUnit } from "@/lib/sac"

export type ExamTimerSession = {
  subject: string
  provider: string
  title: string
  examYear: number
  paper: string
  readingMinutes: number
  writingMinutes: number
  marks: number
  startedAt: number
  pausedAt?: number
  pausedSeconds: number
  focal?: FocalTimerLink
}

export type SacTimerSession = {
  recordId?: string
  subject: string
  provider: string
  title: string
  sacNumber?: string
  unit: SacUnit
  areaOfStudy?: string
  scheduledAt: string
  durationMinutes: number
  maxScore: number
  weighting?: number
  notes?: string
  createdAt?: string
  startedAt: number
  pausedAt?: number
  pausedSeconds: number
  focal?: FocalTimerLink
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string"
}

function isOptionalNumber(value: unknown) {
  return value === undefined || typeof value === "number" && Number.isFinite(value)
}

function hasValidSharedTimerState(value: Record<string, unknown>) {
  return typeof value.subject === "string" &&
    typeof value.provider === "string" &&
    typeof value.title === "string" &&
    typeof value.startedAt === "number" && Number.isFinite(value.startedAt) &&
    typeof value.pausedSeconds === "number" && Number.isFinite(value.pausedSeconds) && value.pausedSeconds >= 0 &&
    isOptionalNumber(value.pausedAt) &&
    (value.focal === undefined || isFocalTimerLink(value.focal))
}

export function isExamTimerSession(value: unknown): value is ExamTimerSession {
  if (!isRecord(value) || !hasValidSharedTimerState(value)) return false
  return typeof value.examYear === "number" && Number.isFinite(value.examYear) &&
    typeof value.paper === "string" &&
    typeof value.readingMinutes === "number" && Number.isFinite(value.readingMinutes) && value.readingMinutes >= 0 &&
    typeof value.writingMinutes === "number" && Number.isFinite(value.writingMinutes) && value.writingMinutes > 0 &&
    typeof value.marks === "number" && Number.isFinite(value.marks) && value.marks > 0
}

export function isSacTimerSession(value: unknown): value is SacTimerSession {
  if (!isRecord(value) || !hasValidSharedTimerState(value)) return false
  return isOptionalString(value.recordId) &&
    isOptionalString(value.sacNumber) &&
    (value.unit === 3 || value.unit === 4) &&
    isOptionalString(value.areaOfStudy) &&
    typeof value.scheduledAt === "string" &&
    typeof value.durationMinutes === "number" && Number.isFinite(value.durationMinutes) && value.durationMinutes > 0 &&
    typeof value.maxScore === "number" && Number.isFinite(value.maxScore) && value.maxScore > 0 &&
    isOptionalNumber(value.weighting) &&
    isOptionalString(value.notes) &&
    isOptionalString(value.createdAt)
}

export function mergeTimerSession<T>(
  local: T | undefined,
  localUpdatedAt: string,
  remote: T | undefined,
  remoteUpdatedAt: string,
) {
  return remoteUpdatedAt > localUpdatedAt
    ? { session: remote, updatedAt: remoteUpdatedAt }
    : { session: local, updatedAt: localUpdatedAt }
}
