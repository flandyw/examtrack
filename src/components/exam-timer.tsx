import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Check, Clock3, Pause, Play, RotateCcw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SubjectCombobox } from "@/components/subject-combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { PageHeader } from "@/components/page-header"
import { QuestionResultsEditor } from "@/components/question-results-editor"
import { PerformanceContextFields } from "@/components/performance-context-fields"
import { useTickingNow } from "@/hooks/use-ticking-now"
import { formatExamTitle, formatReferenceName, validateAttempt, validateQuestionResults, type AssessmentReference, type ExamAttempt, type QuestionResult } from "@/lib/exam-data"
import { buildCompanyExamSuggestions, buildExamSuggestions, findLatestAttempt, type ExamSuggestion } from "@/lib/exam-suggestions"
import { getKnownExamConditions } from "@/lib/exam-conditions"
import { formatTimer, getExamTimerState } from "@/lib/exam-timer"
import {
  createFocalTimerLink,
  pauseFocalTimer,
  publishFocalTimer,
  resumeFocalTimer,
} from "@/lib/focal-timer"
import { loadAppData } from "@/lib/storage"
import { firstPreferredSubject, prioritiseSubjects } from "@/lib/subjects"
import { hasPerformanceContext, type PerformanceContext } from "@/lib/performance-context"
import type { VcaaStudyResources } from "@/lib/vcaa-resources"
import { isExamTimerSession, type ExamTimerSession } from "@/lib/ongoing-timers"

export type ExamTimerPreset = Pick<ExamTimerSession, "subject" | "provider" | "examYear" | "paper" | "marks"> & Partial<Pick<ExamTimerSession, "readingMinutes" | "writingMinutes">>

type ExamTimerProps = {
  references: AssessmentReference[]
  studies: VcaaStudyResources[]
  preferredSubjects: string[]
  initialExam?: ExamTimerPreset | null
  activeSession?: ExamTimerSession
  onSessionChange: (session: ExamTimerSession | undefined) => void
  onSave: (attempt: ExamAttempt) => void
}

const STORAGE_KEY = "examtrack.timer"
const today = () => new Date().toISOString().slice(0, 10)

function loadSession(): ExamTimerSession | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null")
    return isExamTimerSession(value) ? value : null
  } catch {
    return null
  }
}

function SuggestionButton({ suggestion, onClick, showProvider = false }: {
  suggestion: ExamSuggestion
  onClick: (suggestion: ExamSuggestion) => void
  showProvider?: boolean
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto justify-start whitespace-normal px-4 py-3 text-left"
      onClick={() => onClick(suggestion)}
    >
      <span className="grid gap-1">
        <span className="font-medium">{showProvider ? `${suggestion.provider} · ${suggestion.paper}` : suggestion.subject}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {showProvider ? `${suggestion.subject} · ${suggestion.examYear}` : `${suggestion.examYear} · ${suggestion.paper}`} · {suggestion.marks} marks
        </span>
      </span>
    </Button>
  )
}

export function ExamTimer({ references, studies, preferredSubjects, initialExam, activeSession, onSessionChange, onSave }: ExamTimerProps) {
  const migratedLegacySession = useRef(false)
  const session = activeSession ?? null
  const [subject, setSubject] = useState(initialExam?.subject ?? firstPreferredSubject(references.map((item) => item.studyName), preferredSubjects))
  const [provider, setProvider] = useState(initialExam?.provider ?? "VCAA")
  const [examYear, setExamYear] = useState(initialExam?.examYear ?? new Date().getFullYear())
  const [paper, setPaper] = useState(initialExam?.paper ?? "")
  const [readingMinutes, setReadingMinutes] = useState(initialExam?.readingMinutes ?? 15)
  const [writingMinutes, setWritingMinutes] = useState(initialExam?.writingMinutes ?? 120)
  const [marks, setMarks] = useState(initialExam?.marks ?? 100)
  const [markingOpen, setMarkingOpen] = useState(false)
  const [rawScore, setRawScore] = useState(0)
  const [rawMax, setRawMax] = useState(initialExam?.marks ?? 100)
  const [comment, setComment] = useState("")
  const [performanceContext, setPerformanceContext] = useState<PerformanceContext>({})
  const [completedAt, setCompletedAt] = useState(today)
  const [markingError, setMarkingError] = useState<string | null>(null)
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([])
  const history = useMemo(loadAppData, [])
  const suggestions = useMemo(
    () => buildExamSuggestions(history.attempts, references, preferredSubjects, 4, studies),
    [history.attempts, preferredSubjects, references, studies],
  )
  const companySuggestions = useMemo(
    () => buildCompanyExamSuggestions(history.attempts, references, preferredSubjects, history.examDifficulty, 4),
    [history.attempts, history.examDifficulty, preferredSubjects, references],
  )
  const latestAttempt = useMemo(() => findLatestAttempt(history.attempts), [history.attempts])
  const now = useTickingNow(250)

  useEffect(() => {
    if (!migratedLegacySession.current) {
      migratedLegacySession.current = true
      const legacySession = loadSession()
      if (!activeSession && legacySession) onSessionChange(legacySession)
    }
    if (activeSession) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(activeSession))
    else sessionStorage.removeItem(STORAGE_KEY)
  }, [activeSession, onSessionChange])

  function saveSession(next: ExamTimerSession | undefined) {
    if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else sessionStorage.removeItem(STORAGE_KEY)
    onSessionChange(next)
  }

  const subjects = useMemo(() => prioritiseSubjects(references.map((item) => item.studyName), preferredSubjects), [preferredSubjects, references])
  const paperOptions = useMemo(
    () => [...new Set(references
      .filter((item) => item.studyName.toLowerCase() === subject.trim().toLowerCase())
      .map((item) => formatReferenceName(item.name)))].toSorted(),
    [references, subject],
  )
  const timer = useMemo(() => session
    ? getExamTimerState(session.pausedAt ?? now.getTime(), session.startedAt, session.readingMinutes, session.writingMinutes, session.marks)
    : null, [now, session])

  function applySuggestion(suggestion: ExamSuggestion) {
    const conditions = getKnownExamConditions(suggestion.subject, suggestion.paper)
    setSubject(suggestion.subject)
    setProvider(suggestion.provider)
    setExamYear(suggestion.examYear)
    setPaper(suggestion.paper)
    setMarks(suggestion.marks)
    setRawMax(suggestion.marks)
    if (conditions) {
      setReadingMinutes(conditions.readingMinutes)
      setWritingMinutes(conditions.writingMinutes)
    }
  }

  function start(event: FormEvent) {
    event.preventDefault()
    const focal = createFocalTimerLink(
      "exam",
      subject,
      formatExamTitle(provider, examYear, subject),
      (readingMinutes + writingMinutes) * 60,
    )
    const next = {
      subject: subject.trim(), provider: provider.trim(), title: formatExamTitle(provider, examYear, subject), examYear, paper: paper.trim(),
      readingMinutes, writingMinutes, marks, startedAt: Date.now(), pausedSeconds: 0, focal,
    }
    saveSession(next)
    setRawMax(marks)
    void publishFocalTimer(focal, "in-progress")
  }

  function reset() {
    if (timer?.phase !== "overtime" && !window.confirm("Discard this timed exam and return to setup?")) return
    if (session?.focal) void publishFocalTimer(session.focal, "delete")
    saveSession(undefined)
    setMarkingOpen(false)
  }

  function skipReading() {
    if (!session || !timer) return
    const next = { ...session, startedAt: Date.now() - session.readingMinutes * 60_000 }
    saveSession(next)
  }

  function pause() {
    if (!session || session.pausedAt) return
    const focal = session.focal ? pauseFocalTimer(session.focal) : undefined
    const next = { ...session, pausedAt: Date.now(), focal }
    saveSession(next)
    if (focal) void publishFocalTimer(focal, "in-progress")
  }

  function resume() {
    if (!session?.pausedAt) return
    const pauseDuration = Date.now() - session.pausedAt
    const focal = session.focal ? resumeFocalTimer(session.focal) : undefined
    const next = { ...session, startedAt: session.startedAt + pauseDuration, pausedAt: undefined, pausedSeconds: (session.pausedSeconds ?? 0) + Math.floor(pauseDuration / 1000), focal }
    saveSession(next)
    if (focal) void publishFocalTimer(focal, "in-progress")
  }

  function openMarking() {
    if (!session) return
    pause()
    setRawMax(session.marks)
    setMarkingError(null)
    setMarkingOpen(true)
  }

  function closeMarking() {
    setMarkingOpen(false)
    resume()
  }

  function saveMark(event: FormEvent) {
    event.preventDefault()
    if (!session || !timer) return
    const error = validateAttempt({ rawScore, rawMax })
    if (error) {
      setMarkingError(error)
      return
    }
    const questionError = validateQuestionResults(questionResults)
    if (questionError) return setMarkingError(questionError)
    const timestamp = new Date().toISOString()
    onSave({
      id: crypto.randomUUID(),
      subject: session.subject,
      provider: session.provider,
      title: session.title,
      examYear: session.examYear,
      paper: session.paper,
      completedAt,
      rawScore,
      rawMax,
      comment: comment.trim() || undefined,
      performanceContext: hasPerformanceContext(performanceContext) ? performanceContext : undefined,
      questionResults: questionResults.length ? questionResults : undefined,
      timing: {
        plannedReadingMinutes: session.readingMinutes,
        plannedWritingMinutes: session.writingMinutes,
        actualWritingSeconds: timer.writingElapsedSeconds,
        overtimeSeconds: timer.overtimeSeconds,
        pausedSeconds: session.pausedSeconds ?? 0,
      },
      referenceId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    if (session.focal) void publishFocalTimer(session.focal, "completed")
    saveSession(undefined)
    setMarkingOpen(false)
  }

  if (!session || !timer) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Exam timer" description="Choose an exam, set the conditions, then begin when your paper is ready." />
        {suggestions.length || companySuggestions.length ? (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Suggested next exams</CardTitle>
              <CardDescription>
                {latestAttempt
                  ? `Based on your latest logged paper: ${latestAttempt.examYear} ${latestAttempt.subject} · ${latestAttempt.paper}.`
                  : "Based on your preferred subjects and the available VCAA references."}
                {" "}Choose one to fill the setup form.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              {suggestions.length ? <section className="grid gap-2" aria-labelledby="official-suggestions-title">
                <div><h3 id="official-suggestions-title" className="text-sm font-medium">Official VCAA papers</h3><p className="text-xs text-muted-foreground">Continue through available papers and years for your current subject.</p></div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {suggestions.map((suggestion) => (
                    <SuggestionButton key={`${suggestion.subject}-${suggestion.provider}-${suggestion.examYear}-${suggestion.paper}`} suggestion={suggestion} onClick={applySuggestion} />
                  ))}
                </div>
              </section> : null}
              {companySuggestions.length ? <section className="grid gap-2" aria-labelledby="company-suggestions-title">
                <div><h3 id="company-suggestions-title" className="text-sm font-medium">Company exam progression</h3><p className="text-xs text-muted-foreground">Finish this provider&apos;s paper set, then progress from easier companies towards harder ones.</p></div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {companySuggestions.map((suggestion) => (
                    <SuggestionButton key={`${suggestion.subject}-${suggestion.provider}-${suggestion.examYear}-${suggestion.paper}`} suggestion={suggestion} onClick={applySuggestion} showProvider />
                  ))}
                </div>
              </section> : null}
            </CardContent>
          </Card>
        ) : null}
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Set up your exam</CardTitle>
            <CardDescription>Enter the paper details and timed conditions.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={start}>
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="timer-subject">Subject</FieldLabel>
                    <SubjectCombobox subjects={subjects} preferredSubjects={preferredSubjects} value={subject} onValueChange={setSubject} id="timer-subject" allowCustom required placeholder="Search or enter a subject" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="timer-provider">Provider</FieldLabel>
                    <Input id="timer-provider" value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="VCAA" required />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="timer-year">Exam year</FieldLabel>
                    <Input id="timer-year" type="number" min="1990" max="2100" value={examYear} onChange={(event) => setExamYear(event.target.valueAsNumber)} required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="timer-paper">Paper</FieldLabel>
                    <Input id="timer-paper" list="timer-paper-options" value={paper} onChange={(event) => setPaper(event.target.value)} placeholder="Exam, paper, or assessment name" />
                    <datalist id="timer-paper-options">{paperOptions.map((item) => <option key={item} value={item} />)}</datalist>
                  </Field>
                </div>

                <div className="border-t pt-5">
                  <p className="mb-4 text-sm font-medium">Timed conditions</p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="reading-time">Reading (min)</FieldLabel>
                      <Input id="reading-time" type="number" min="0" max="180" value={readingMinutes} onChange={(event) => setReadingMinutes(event.target.valueAsNumber)} required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="writing-time">Writing (min)</FieldLabel>
                      <Input id="writing-time" type="number" min="1" max="360" value={writingMinutes} onChange={(event) => setWritingMinutes(event.target.valueAsNumber)} required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="exam-marks">Total marks</FieldLabel>
                      <Input id="exam-marks" type="number" min="1" max="500" value={marks} onChange={(event) => setMarks(event.target.valueAsNumber)} required />
                    </Field>
                  </div>
                </div>
                <Alert>
                  <Clock3 />
                  <AlertTitle>{(writingMinutes / marks || 0).toFixed(2)} minutes per mark</AlertTitle>
                  <AlertDescription>The timer moves from reading to writing automatically and records overtime.</AlertDescription>
                </Alert>
                <Button type="submit" size="lg">{readingMinutes ? "Begin reading time" : "Begin writing time"}</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  const phaseLabel = timer.phase === "reading" ? "Reading time" : timer.phase === "writing" ? "Writing time" : "Overtime"
  const overtime = timer.phase === "overtime"
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8">
      <PageHeader title={session.title} description={`${session.subject} · ${session.readingMinutes} min reading · ${session.writingMinutes} min writing · ${session.marks} marks`}>
        <Button variant="ghost" onClick={reset}><RotateCcw />Discard</Button>
        <Button variant="outline" onClick={session.pausedAt ? resume : pause}>{session.pausedAt ? <Play /> : <Pause />}{session.pausedAt ? "Resume" : "Pause"}</Button>
        <Button onClick={openMarking}><Check />Finish & mark</Button>
      </PageHeader>

      {session.focal ? <Alert><Clock3 /><AlertTitle>Focal study logging active</AlertTitle><AlertDescription>Timer changes are queued and mirrored when your separate Focal account is connected and online.</AlertDescription></Alert> : null}

      <section className="grid gap-6 py-6 text-center">
        <div>
          <p className={overtime ? "text-sm font-medium text-destructive" : "text-sm font-medium text-muted-foreground"}>{phaseLabel}</p>
          <p role="timer" className={overtime ? "mt-2 text-7xl font-semibold tracking-tight text-destructive tabular-nums sm:text-8xl" : "mt-2 text-7xl font-semibold tracking-tight tabular-nums sm:text-8xl"}>
            {overtime ? `+${formatTimer(timer.overtimeSeconds)}` : formatTimer(timer.remainingSeconds)}
          </p>
        </div>
        <Progress value={timer.progress} className="mx-auto w-full max-w-2xl">
          <ProgressLabel>{phaseLabel}</ProgressLabel>
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">{Math.round(timer.progress)}%</span>
        </Progress>
        {timer.phase === "reading" ? <Button className="mx-auto" variant="outline" onClick={skipReading}>Skip to writing time</Button> : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardHeader><CardDescription>Pace</CardDescription><CardTitle className="text-3xl tabular-nums">{(session.writingMinutes / session.marks).toFixed(2)} min / mark</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Expected progress</CardDescription><CardTitle className="text-3xl tabular-nums">{timer.phase === "reading" ? "Starts in writing time" : `${timer.expectedMarks.toFixed(1)} / ${session.marks} marks`}</CardTitle></CardHeader></Card>
      </div>

      {overtime ? <Alert variant="destructive"><Clock3 /><AlertTitle>Writing time has ended</AlertTitle><AlertDescription>The timer is now recording overtime. Finish and mark when you put your pen down.</AlertDescription></Alert> : null}

      <Dialog open={markingOpen} onOpenChange={(open) => open ? setMarkingOpen(true) : closeMarking()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Mark and log exam</DialogTitle>
            <DialogDescription>Enter your result to add this timed attempt to ExamTrack.</DialogDescription>
          </DialogHeader>
          <form id="timer-marking-form" onSubmit={saveMark}>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-4">
                <Field data-invalid={markingError ? true : undefined}>
                  <FieldLabel htmlFor="timer-score">Mark</FieldLabel>
                  <Input id="timer-score" type="number" min="0" step="0.5" value={rawScore} onChange={(event) => setRawScore(event.target.valueAsNumber)} autoFocus required />
                </Field>
                <Field data-invalid={markingError ? true : undefined}>
                  <FieldLabel htmlFor="timer-maximum">Out of</FieldLabel>
                  <Input id="timer-maximum" type="number" min="0.5" step="0.5" value={rawMax} onChange={(event) => setRawMax(event.target.valueAsNumber)} required />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="timer-completed">Completed</FieldLabel>
                <Input id="timer-completed" type="date" value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} required />
              </Field>
              <PerformanceContextFields value={performanceContext} onChange={setPerformanceContext} idPrefix="exam-timer-context" />
              <QuestionResultsEditor value={questionResults} onChange={setQuestionResults} />
              <Field>
                <FieldLabel htmlFor="timer-comment">Overall comment <span className="text-muted-foreground">(optional)</span></FieldLabel>
                <Textarea id="timer-comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="What went well or what to improve next time?" />
              </Field>
              <FieldError>{markingError}</FieldError>
            </FieldGroup>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={closeMarking}>Keep timing</Button>
            <Button type="submit" form="timer-marking-form">Log exam attempt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
