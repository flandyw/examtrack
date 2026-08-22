import { useEffect, useMemo, useState } from "react"
import { BookOpenCheck, FileDown, NotebookPen, Plus, Search, Shuffle, SkipForward } from "lucide-react"
import { toast } from "sonner"

import { MarkdownPreview } from "@/components/markdown-preview"
import { MistakeAttachments } from "@/components/mistake-attachments"
import { MistakeAlternativeDeck } from "@/components/mistake-alternative-deck"
import { MistakeInsights } from "@/components/mistake-insights"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getDueMistakes,
  getMistakeSchedule,
  previewMistakeReview,
  type AppData,
  type ExamAttempt,
  type Mistake,
  type MistakeReviewState,
  type ReviewRating,
} from "@/lib/exam-data"
import { downloadMistakesPdf } from "@/lib/mistake-pdf"
import { isTechSplitMathsSubject, matchesMathsExamFilter, type MathsExamFilter } from "@/lib/mistake-filters"
import { buildRevisionPriorities, buildRevisionQueue, formatReviewInterval, getMistakeProgress, getMistakeQueueCounts } from "@/lib/mistake-review"
import { findVcaaExamForAttempt, type VcaaStudyResources } from "@/lib/vcaa-resources"

type BrowserFilter = "all" | "due" | "new" | "learning" | "review" | "mature" | "suspended"
type PageTab = "study" | "schedule" | "alternative" | "browse"

type MistakesPageProps = {
  data: AppData
  studies: VcaaStudyResources[]
  onLog: () => void
  onEdit: (mistake: Mistake) => void
  onReview: (mistake: Mistake, rating: ReviewRating) => void
  onToggleSuspend: (mistake: Mistake) => void
  onDelete: (mistake: Mistake) => void
  onSaveInsights: (insights: NonNullable<AppData["mistakeInsights"]>) => void
  onSaveAlternativeDeck: (deck: NonNullable<AppData["alternativeMistakeDeck"]>) => void
}

const RATING_OPTIONS: { rating: ReviewRating; label: string; shortcut: string; variant: "destructive" | "outline" | "secondary" | "default" }[] = [
  { rating: "again", label: "Again", shortcut: "1", variant: "destructive" },
  { rating: "hard", label: "Hard", shortcut: "2", variant: "outline" },
  { rating: "good", label: "Good", shortcut: "3", variant: "secondary" },
  { rating: "easy", label: "Easy", shortcut: "4", variant: "default" },
]

function stateLabel(state: MistakeReviewState, mature: boolean) {
  if (mature) return "Mature"
  if (state === "new") return "New"
  if (state === "learning") return "Learning"
  if (state === "relearning") return "Relearning"
  return "Review"
}

function formatDueDate(dueAt: string) {
  return new Date(dueAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
}

function canUseReviewShortcut(target: EventTarget | null) {
  return !(target instanceof HTMLElement) || !target.closest("input, textarea, select, button, [contenteditable='true']")
}

function ExamContext({ mistake, attempt, studies }: { mistake: Mistake; attempt?: ExamAttempt; studies: VcaaStudyResources[] }) {
  const exam = attempt ? findVcaaExamForAttempt(attempt, studies) : undefined
  return (
    <CardDescription>
      {attempt ? <>{attempt.title} · {attempt.paper}{exam ? <> · <a className="font-medium text-foreground underline underline-offset-4" href={exam.url} target="_blank" rel="noreferrer">Exam PDF</a></> : null}</> : "Deleted exam"}
      {mistake.totalMarks !== undefined && mistake.marksLost !== undefined ? <> · {mistake.marksLost}/{mistake.totalMarks} marks lost</> : null}
    </CardDescription>
  )
}

function ReviewCard({ mistake, attempt, studies, onRate }: { mistake: Mistake; attempt?: ExamAttempt; studies: VcaaStudyResources[]; onRate: (rating: ReviewRating) => void }) {
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const schedule = getMistakeSchedule(mistake)
  const previews = useMemo(() => Object.fromEntries(RATING_OPTIONS.map(({ rating }) => [rating, previewMistakeReview(mistake, rating)])) as Record<ReviewRating, ReturnType<typeof previewMistakeReview>>, [mistake])

  function rate(rating: ReviewRating) {
    if (submitting) return
    setSubmitting(true)
    onRate(rating)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!canUseReviewShortcut(event.target)) return
      if (!revealed && (event.key === " " || event.key === "Enter")) {
        event.preventDefault()
        setRevealed(true)
        return
      }
      if (!revealed) return
      const option = RATING_OPTIONS.find((item) => item.shortcut === event.key)
      if (option && !submitting) {
        event.preventDefault()
        setSubmitting(true)
        onRate(option.rating)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onRate, revealed, submitting])

  return (
    <Card className="mx-auto w-full max-w-4xl" aria-live="polite">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{mistake.question}</CardTitle>
            <ExamContext mistake={mistake} attempt={attempt} studies={studies} />
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge variant="secondary">{stateLabel(schedule.state, schedule.resolved)}</Badge>
            <Badge variant="outline">{mistake.category}</Badge>
            {mistake.areaOfStudy ? <Badge variant="outline">{mistake.areaOfStudy}</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid min-h-80 content-start gap-6">
        <section>
          <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Question</p>
          <MarkdownPreview>{mistake.questionText?.trim() || mistake.question}</MarkdownPreview>
          <MistakeAttachments attachments={mistake.attachments} />
        </section>
        {revealed ? <>
          <Separator />
          <section className="grid gap-5">
            <div><p className="mb-2 text-sm font-medium">What went wrong</p><MarkdownPreview>{mistake.explanation}</MarkdownPreview></div>
            <div><p className="mb-2 text-sm font-medium">Improved response or method</p><MarkdownPreview>{mistake.correction}</MarkdownPreview></div>
            {mistake.criterion ? <div><p className="mb-2 text-sm font-medium">Assessment criterion</p><MarkdownPreview>{mistake.criterion}</MarkdownPreview></div> : null}
          </section>
        </> : null}
      </CardContent>
      <CardFooter className="block">
        {!revealed ? (
          <div className="flex flex-col items-center gap-2">
            <Button size="lg" onClick={() => setRevealed(true)}>Show answer</Button>
            <p className="text-xs text-muted-foreground">Space or Enter</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {RATING_OPTIONS.map((option) => (
              <Button key={option.rating} variant={option.variant} className="h-auto flex-col gap-0.5 py-2" disabled={submitting} onClick={() => rate(option.rating)}>
                <span>{option.label} <span className="text-xs opacity-60">{option.shortcut}</span></span>
                <span className="text-xs font-normal opacity-70">{formatReviewInterval(previews[option.rating].dueAt)}</span>
              </Button>
            ))}
          </div>
        )}
      </CardFooter>
    </Card>
  )
}

function StudyQueue({ mistakes, attempts, studies, onReview, onBrowse }: { mistakes: Mistake[]; attempts: ExamAttempt[]; studies: VcaaStudyResources[]; onReview: (mistake: Mistake, rating: ReviewRating) => void; onBrowse: () => void }) {
  const [reviewed, setReviewed] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const attemptMap = useMemo(() => new Map(attempts.map((attempt) => [attempt.id, attempt])), [attempts])
  const due = getDueMistakes(mistakes, now)
  const dueIdKey = due.map((mistake) => mistake.id).join("\u0000")
  const [queueIds, setQueueIds] = useState(() => due.map((mistake) => mistake.id))
  const dueMap = new Map(due.map((mistake) => [mistake.id, mistake]))
  const current = queueIds.map((id) => dueMap.get(id)).find((mistake) => mistake !== undefined)
  const counts = getMistakeQueueCounts(mistakes, now)
  const nextScheduled = mistakes
    .filter((mistake) => !mistake.suspended && !due.some((dueMistake) => dueMistake.id === mistake.id))
    .map((mistake) => getMistakeSchedule(mistake).dueAt)
    .toSorted()[0]
  const sessionTotal = reviewed + due.length

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const nextDueIds = dueIdKey ? dueIdKey.split("\u0000") : []
    const nextDueIdSet = new Set(nextDueIds)
    setQueueIds((currentIds) => [
      ...currentIds.filter((id) => nextDueIdSet.has(id)),
      ...nextDueIds.filter((id) => !currentIds.includes(id)),
    ])
  }, [dueIdKey])

  function rate(rating: ReviewRating) {
    if (!current) return
    onReview(current, rating)
    setQueueIds((ids) => ids.filter((id) => id !== current.id))
    setReviewed((value) => value + 1)
  }

  function shuffleQueue() {
    setQueueIds((ids) => {
      const shuffled = [...ids]
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1))
        ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
      }
      return shuffled
    })
  }

  function skipCard() {
    setQueueIds((ids) => ids.length > 1 ? [...ids.slice(1), ids[0]] : ids)
  }

  if (!current) {
    return (
      <Empty className="min-h-96 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><BookOpenCheck /></EmptyMedia>
          <EmptyTitle>{reviewed ? "Review complete" : "Nothing due right now"}</EmptyTitle>
          <EmptyDescription>{nextScheduled ? `Next card is due in ${formatReviewInterval(nextScheduled, now)}.` : mistakes.length ? "All active cards are reviewed." : "Log a mistake after your next practice exam to create your first card."}</EmptyDescription>
        </EmptyHeader>
        {mistakes.length ? <Button variant="outline" onClick={onBrowse}>Browse cards</Button> : null}
      </Empty>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="mx-auto grid w-full max-w-4xl gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            <span className="font-medium">Study session</span>
            <span className="ml-2 text-muted-foreground">{reviewed} reviewed · {due.length} remaining</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={shuffleQueue} disabled={due.length < 2}><Shuffle />Shuffle</Button>
            <Button size="sm" variant="outline" onClick={skipCard} disabled={due.length < 2}><SkipForward />Skip</Button>
          </div>
        </div>
        <Progress value={sessionTotal ? reviewed / sessionTotal * 100 : 0} />
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span><span className="font-medium text-foreground tabular-nums">{counts.new}</span> new</span>
          <span><span className="font-medium text-foreground tabular-nums">{counts.learning + counts.relearning}</span> learning</span>
          <span><span className="font-medium text-foreground tabular-nums">{counts.review}</span> review</span>
        </div>
      </div>
      <ReviewCard key={current.id} mistake={current} attempt={attemptMap.get(current.attemptId)} studies={studies} onRate={rate} />
    </div>
  )
}

function BrowseCard({ mistake, attempt, studies, onEdit, onToggleSuspend, onDelete }: { mistake: Mistake; attempt?: ExamAttempt; studies: VcaaStudyResources[]; onEdit: (mistake: Mistake) => void; onToggleSuspend: (mistake: Mistake) => void; onDelete: (mistake: Mistake) => void }) {
  const schedule = getMistakeSchedule(mistake)
  const isDue = !mistake.suspended && new Date(schedule.dueAt).getTime() <= Date.now()
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><CardTitle>{mistake.question}</CardTitle><ExamContext mistake={mistake} attempt={attempt} studies={studies} /></div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge variant={mistake.suspended ? "outline" : "secondary"}>{mistake.suspended ? "Suspended" : stateLabel(schedule.state, schedule.resolved)}</Badge>
            <Badge variant="outline">{mistake.category}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="line-clamp-3 text-sm">
          <MarkdownPreview inline>{mistake.questionText?.trim() || mistake.question}</MarkdownPreview>
        </div>
        <MistakeAttachments attachments={mistake.attachments} compact />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{mistake.suspended ? "Not in queue" : isDue ? "Due now" : `Due ${formatDueDate(schedule.dueAt)}`}</span>
          <span>Interval {schedule.intervalDays ? `${schedule.intervalDays}d` : "—"}</span>
          <span>Ease {schedule.easeFactor.toFixed(2)}</span>
          <span>{mistake.reviewHistory?.length ?? 0} reviews</span>
          {schedule.lapses ? <span>{schedule.lapses} lapse{schedule.lapses === 1 ? "" : "s"}</span> : null}
        </div>
        <details className="rounded-lg border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none">Answer and review history</summary>
          <div className="grid gap-4 border-t p-3">
            <div><p className="mb-2 text-sm font-medium">What went wrong</p><MarkdownPreview>{mistake.explanation}</MarkdownPreview></div>
            <div><p className="mb-2 text-sm font-medium">Improved response or method</p><MarkdownPreview>{mistake.correction}</MarkdownPreview></div>
            {mistake.reviewHistory?.length ? <div>
              <p className="mb-2 text-sm font-medium">Recent reviews</p>
              <ul className="grid gap-1 text-xs text-muted-foreground">
                {mistake.reviewHistory.toReversed().slice(0, 5).map((review) => <li key={review.id}>{new Date(review.completedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })} · {review.result}{review.intervalDays === undefined ? "" : ` · ${review.intervalDays}d interval`}</li>)}
              </ul>
            </div> : null}
          </div>
        </details>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onEdit(mistake)}>Edit</Button>
        <Button size="sm" variant="outline" onClick={() => onToggleSuspend(mistake)}>{mistake.suspended ? "Unsuspend" : "Suspend"}</Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(mistake)}>Delete</Button>
      </CardFooter>
    </Card>
  )
}

export function MistakesPage({ data, studies, onLog, onEdit, onReview, onToggleSuspend, onDelete, onSaveInsights, onSaveAlternativeDeck }: MistakesPageProps) {
  const [subject, setSubject] = useState("all")
  const [mathsExamFilter, setMathsExamFilter] = useState<MathsExamFilter>("all")
  const [tab, setTab] = useState<PageTab>("study")
  const [search, setSearch] = useState("")
  const [browserFilter, setBrowserFilter] = useState<BrowserFilter>("all")
  const [exporting, setExporting] = useState(false)
  const attemptMap = useMemo(() => new Map(data.attempts.map((attempt) => [attempt.id, attempt])), [data.attempts])
  const subjects = useMemo(() => [...new Set(data.attempts.map((attempt) => attempt.subject))].toSorted(), [data.attempts])
  const activeSubject = subject === "all" || subjects.includes(subject) ? subject : "all"
  const mathsSubject = activeSubject !== "all" ? activeSubject : subjects.length === 1 ? subjects[0] : null
  const showMathsExamFilter = mathsSubject !== null && isTechSplitMathsSubject(mathsSubject)
  const activeMathsExamFilter = showMathsExamFilter ? mathsExamFilter : "all"
  const visibleMistakes = useMemo(() => data.mistakes.filter((mistake) => {
    const attempt = attemptMap.get(mistake.attemptId)
    const matchesSubject = activeSubject === "all" || attempt?.subject === activeSubject
    return matchesSubject && matchesMathsExamFilter(attempt, activeMathsExamFilter)
  }), [data.mistakes, attemptMap, activeSubject, activeMathsExamFilter])
  const dueIds = useMemo(() => new Set(getDueMistakes(visibleMistakes).map((mistake) => mistake.id)), [visibleMistakes])
  const counts = useMemo(() => getMistakeQueueCounts(visibleMistakes), [visibleMistakes])
  const progress = useMemo(() => getMistakeProgress(visibleMistakes), [visibleMistakes])
  const topPriority = useMemo(() => buildRevisionPriorities(visibleMistakes).find((item) => item.unresolved > 0), [visibleMistakes])
  const worksheetMistakes = useMemo(() => buildRevisionQueue(visibleMistakes), [visibleMistakes])
  const alternativeCount = useMemo(() => data.alternativeMistakeDeck?.cards.filter((card) => visibleMistakes.some((mistake) => mistake.id === card.sourceMistakeId)).length ?? 0, [data.alternativeMistakeDeck, visibleMistakes])
  const browsedMistakes = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    const schedules = new Map(visibleMistakes.map((mistake) => [mistake.id, getMistakeSchedule(mistake)]))
    return visibleMistakes.filter((mistake) => {
      const schedule = schedules.get(mistake.id)
      const attempt = attemptMap.get(mistake.attemptId)
      const matchesSearch = !normalizedSearch || [mistake.question, mistake.questionText, mistake.explanation, mistake.correction, mistake.areaOfStudy, mistake.criterion, attempt?.title, attempt?.subject]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch))
      if (!matchesSearch || !schedule) return false
      if (browserFilter === "all") return true
      if (browserFilter === "due") return dueIds.has(mistake.id)
      if (browserFilter === "suspended") return Boolean(mistake.suspended)
      if (browserFilter === "mature") return schedule.resolved && !mistake.suspended
      if (browserFilter === "learning") return !mistake.suspended && (schedule.state === "learning" || schedule.state === "relearning")
      return !mistake.suspended && schedule.state === browserFilter
    }).toSorted((first, second) => (schedules.get(first.id)?.dueAt ?? "").localeCompare(schedules.get(second.id)?.dueAt ?? ""))
  }, [visibleMistakes, attemptMap, dueIds, search, browserFilter])
  const scheduleGroups = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const dayMs = 24 * 60 * 60 * 1000
    const upcoming = visibleMistakes
      .filter((mistake) => !mistake.suspended)
      .map((mistake) => ({ mistake, schedule: getMistakeSchedule(mistake) }))
      .toSorted((first, second) => first.schedule.dueAt.localeCompare(second.schedule.dueAt))
    const groups = new Map<string, { key: string; label: string; overdue: boolean; items: typeof upcoming }>()
    for (const entry of upcoming) {
      const dueDate = new Date(entry.schedule.dueAt)
      const dayIndex = Math.floor((new Date(dueDate).setHours(0, 0, 0, 0) - startOfToday.getTime()) / dayMs)
      const key = dayIndex <= -1 ? "overdue" : dayIndex === 0 ? "today" : dayIndex === 1 ? "tomorrow" : `day-${dayIndex}`
      let group = groups.get(key)
      if (!group) {
        const label = dayIndex <= -1
          ? "Overdue"
          : dayIndex === 0
            ? "Today"
            : dayIndex === 1
              ? "Tomorrow"
              : dueDate.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
        group = { key, label, overdue: dayIndex < 0, items: [] }
        groups.set(key, group)
      }
      group.items.push(entry)
    }
    return [...groups.values()]
  }, [visibleMistakes])
  const dueThisWeekCount = useMemo(() => {
    const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000
    return visibleMistakes.filter((mistake) => !mistake.suspended && new Date(getMistakeSchedule(mistake).dueAt).getTime() <= horizon).length
  }, [visibleMistakes])

  async function exportWorksheet() {
    setExporting(true)
    try {
      await downloadMistakesPdf(worksheetMistakes, data.attempts, activeSubject === "all" ? "mistakes" : activeSubject)
      toast.success("Worksheet downloaded")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export worksheet.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Mistakes" description="Study the cards due today, reveal the correction, then grade how easily you recalled it.">
        <Button variant="outline" onClick={() => void exportWorksheet()} disabled={!worksheetMistakes.length || exporting}><FileDown />{exporting ? "Creating PDF..." : "Export worksheet"}</Button>
        <Button onClick={onLog} disabled={!data.attempts.length}><Plus />Log mistake</Button>
      </PageHeader>
      <MistakeInsights data={data} priorityCategory={topPriority?.category} onSave={onSaveInsights} />
      {data.mistakes.length ? <Card size="sm">
        <CardHeader className="grid gap-3 border-b sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <CardTitle>Mistake progress</CardTitle>
            <CardDescription>{progress.activeCards
              ? `${progress.matureCards} of ${progress.activeCards} active cards have reached a 21+ day interval.`
              : visibleMistakes.length
                ? "Suspended cards are excluded from progress."
                : "No mistake cards have been logged for this subject yet."}</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {subjects.length > 1 ? <Select value={activeSubject} onValueChange={(value) => {
              setSubject(value ?? "all")
              setMathsExamFilter("all")
            }}>
              <SelectTrigger aria-label="Filter mistake cards by subject"><SelectValue>{activeSubject === "all" ? "All subjects" : activeSubject}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="all">All subjects</SelectItem>{subjects.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select> : null}
            {showMathsExamFilter ? <Select value={activeMathsExamFilter} onValueChange={(value) => setMathsExamFilter((value ?? "all") as MathsExamFilter)}>
              <SelectTrigger aria-label="Filter maths mistake cards by exam"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All exams</SelectItem>
                <SelectItem value="exam-1">Exam 1 · Tech-free</SelectItem>
                <SelectItem value="exam-2">Exam 2 · Tech-active</SelectItem>
              </SelectContent>
            </Select> : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Mastery</span>
              <span className="text-sm font-semibold tabular-nums">{Math.round(progress.masteryPercent)}%</span>
            </div>
            <Progress value={progress.masteryPercent} aria-label={`${Math.round(progress.masteryPercent)}% of active mistake cards are mature`} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <div><p className="text-2xl font-semibold tabular-nums">{progress.recallRate === null ? "—" : `${Math.round(progress.recallRate)}%`}</p><p className="text-xs text-muted-foreground">Recall · last 30 days</p>{progress.recallDelta !== null ? <p className="mt-1 text-xs font-medium tabular-nums">{progress.recallDelta > 0 ? "+" : ""}{Math.round(progress.recallDelta)} pts vs prior 30 days</p> : null}</div>
            <div><p className="text-2xl font-semibold tabular-nums">{progress.strengthenedCards}</p><p className="text-xs text-muted-foreground">Cards strengthened</p>{progress.newlyMatureCards ? <p className="mt-1 text-xs font-medium">{progress.newlyMatureCards} newly mature</p> : null}</div>
            <div><p className="text-2xl font-semibold tabular-nums">{progress.reviewsCompleted}</p><p className="text-xs text-muted-foreground">Reviews · last 30 days</p></div>
            <div><p className="text-2xl font-semibold tabular-nums">{counts.due}</p><p className="text-xs text-muted-foreground">Due now</p></div>
          </div>
          <Separator />
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-2xl font-semibold tabular-nums">{counts.new}</p><p className="text-xs text-muted-foreground">New</p></div>
            <div><p className="text-2xl font-semibold tabular-nums">{counts.learning + counts.relearning}</p><p className="text-xs text-muted-foreground">Learning</p></div>
            <div><p className="text-2xl font-semibold tabular-nums">{counts.scheduled}</p><p className="text-xs text-muted-foreground">Scheduled later</p></div>
          </div>
        </CardContent>
      </Card> : null}
      <Tabs value={tab} onValueChange={(value) => setTab(value as "study" | "alternative" | "browse")}>
        <TabsList>
          <TabsTrigger value="study">Study ({counts.due})</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="alternative">Alternatives ({alternativeCount})</TabsTrigger>
          <TabsTrigger value="browse">Browse ({visibleMistakes.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="study" className="mt-4"><StudyQueue key={`${activeSubject}:${activeMathsExamFilter}`} mistakes={visibleMistakes} attempts={data.attempts} studies={studies} onReview={onReview} onBrowse={() => setTab("browse")} /></TabsContent>
        <TabsContent value="schedule" className="mt-4">
          {scheduleGroups.length ? (
            <div className="grid gap-6">
              <p className="text-sm text-muted-foreground">{dueThisWeekCount
                ? `${dueThisWeekCount} card${dueThisWeekCount === 1 ? "" : "s"} to review in the next 7 days.`
                : "Nothing scheduled for the next week — log mistakes after your next timed paper."}</p>
              {scheduleGroups.map((group) => (
                <section key={group.key} className="grid gap-2" aria-label={`Reviews due ${group.label.toLowerCase()}`}>
                  <div className="flex items-center gap-2">
                    <h3 className={group.overdue ? "text-sm font-semibold text-destructive" : "text-sm font-semibold"}>{group.label}</h3>
                    <Badge variant={group.overdue ? "destructive" : "secondary"}>{group.items.length}</Badge>
                  </div>
                  <div className="grid gap-2">
                    {group.items.map(({ mistake }) => {
                      const attempt = attemptMap.get(mistake.attemptId)
                      return (
                        <button
                          key={mistake.id}
                          type="button"
                          onClick={() => onEdit(mistake)}
                          className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                        >
                          <span className="truncate text-sm font-medium">{mistake.question}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {[attempt?.subject, attempt?.title, stateLabel(getMistakeSchedule(mistake).state, Boolean(mistake.resolved))].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <Empty className="min-h-64 border"><EmptyHeader><EmptyMedia variant="icon"><NotebookPen /></EmptyMedia><EmptyTitle>No reviews scheduled</EmptyTitle><EmptyDescription>Cards appear here once mistakes are logged and reviewed.</EmptyDescription></EmptyHeader></Empty>
          )}
        </TabsContent>
        <TabsContent value="alternative" className="mt-4"><MistakeAlternativeDeck key={`${activeSubject}:${activeMathsExamFilter}`} mistakes={visibleMistakes} allMistakes={data.mistakes} attempts={data.attempts} deck={data.alternativeMistakeDeck} onSave={onSaveAlternativeDeck} /></TabsContent>
        <TabsContent value="browse" className="mt-4">
          <div className="grid gap-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, exams, subjects, or notes" aria-label="Search mistake cards" /></div>
              <Select value={browserFilter} onValueChange={(value) => setBrowserFilter((value ?? "all") as BrowserFilter)}>
                <SelectTrigger aria-label="Filter mistake cards by schedule"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cards</SelectItem><SelectItem value="due">Due now</SelectItem><SelectItem value="new">New</SelectItem><SelectItem value="learning">Learning</SelectItem><SelectItem value="review">Review</SelectItem><SelectItem value="mature">Mature</SelectItem><SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {browsedMistakes.length ? <div className="grid gap-4 lg:grid-cols-2">{browsedMistakes.map((mistake) => <BrowseCard key={mistake.id} mistake={mistake} attempt={attemptMap.get(mistake.attemptId)} studies={studies} onEdit={onEdit} onToggleSuspend={onToggleSuspend} onDelete={onDelete} />)}</div> : <Empty className="min-h-64 border"><EmptyHeader><EmptyMedia variant="icon"><NotebookPen /></EmptyMedia><EmptyTitle>No matching cards</EmptyTitle><EmptyDescription>Try another search or schedule filter.</EmptyDescription></EmptyHeader></Empty>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
