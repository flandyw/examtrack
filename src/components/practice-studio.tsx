import { useMemo, useState } from "react"
import { Archive, Check, Clock3, Eye, FileQuestion, Plus, RotateCcw, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader } from "@/components/page-header"
import { MetricCard, MetricGrid, SectionHeading, WorkspacePage } from "@/components/workspace-layout"
import { useTickingNow } from "@/hooks/use-ticking-now"
import { formatTimer } from "@/lib/exam-timer"
import { createPracticeSession, type LearningWorkspace, type LearningWorkspaceUpdate, type PracticeQuestionRating, type PracticeSession } from "@/lib/learning-workspace"
import type { AppData } from "@/lib/exam-data"

export function PracticeStudio({ data, initialSubject, onChange, onComplete, onOpenMistakes }: {
  data: AppData
  initialSubject?: string
  onChange: (learning: LearningWorkspaceUpdate) => void
  onComplete: (session: PracticeSession) => void
  onOpenMistakes: () => void
}) {
  const availableSubjects = useMemo(() => [...new Set(data.attempts.map((attempt) => attempt.subject))].toSorted(), [data.attempts])
  const [subject, setSubject] = useState(initialSubject ?? data.subjects.find((item) => availableSubjects.includes(item)) ?? availableSubjects[0] ?? "")
  const [area, setArea] = useState("all")
  const [questionCount, setQuestionCount] = useState(6)
  const sessions = data.learning.practiceSessions.filter((session) => !session.archivedAt)
  const archivedSessions = data.learning.practiceSessions.filter((session) => session.archivedAt)
  const [activeId, setActiveId] = useState(sessions.find((session) => !session.completedAt)?.id ?? "")
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const active = sessions.find((session) => session.id === activeId)
  const now = useTickingNow(1000)
  const attemptMap = useMemo(() => new Map(data.attempts.map((attempt) => [attempt.id, attempt])), [data.attempts])
  const availableAreas = useMemo(() => [...new Set(data.mistakes.flatMap((mistake) => {
    if (attemptMap.get(mistake.attemptId)?.subject.toLowerCase() !== subject.toLowerCase() || mistake.suspended) return []
    return [mistake.areaOfStudy ?? mistake.criterion ?? mistake.category]
  }))].toSorted(), [attemptMap, data.mistakes, subject])
  const completedSessions = sessions.filter((session) => session.completedAt)
  const averageRecall = completedSessions.length
    ? completedSessions.reduce((total, session) => total + session.questions.filter((question) => question.rating === "correct").length / session.questions.length * 100, 0) / completedSessions.length
    : null

  function commit(update: (current: LearningWorkspace) => LearningWorkspace) {
    onChange((current) => ({ ...update(current), updatedAt: new Date().toISOString() }))
  }

  function create() {
    if (!subject) return setError("Choose a subject.")
    const session = createPracticeSession(subject, data, { limit: questionCount, area: area === "all" ? undefined : area })
    if (!session) return setError(area === "all" ? "Log an active mistake for this subject before building a session." : "No active mistakes match that focus area.")
    commit((current) => ({ ...current, practiceSessions: [session, ...current.practiceSessions] }))
    setActiveId(session.id)
    setRevealed(new Set())
    setError(null)
  }

  function rate(questionId: string, rating: PracticeQuestionRating) {
    if (!active || active.completedAt) return
    const timestamp = new Date().toISOString()
    commit((current) => ({
      ...current,
      practiceSessions: current.practiceSessions.map((session) => session.id === active.id ? {
        ...session,
        questions: session.questions.map((question) => question.id === questionId ? { ...question, rating } : question),
        updatedAt: timestamp,
      } : session),
    }))
  }

  function archiveSession(id: string) {
    const timestamp = new Date().toISOString()
    commit((current) => ({ ...current, practiceSessions: current.practiceSessions.map((session) => session.id === id ? { ...session, archivedAt: timestamp, updatedAt: timestamp } : session) }))
    if (activeId === id) setActiveId("")
  }

  function restoreSession(id: string) {
    const timestamp = new Date().toISOString()
    commit((current) => ({ ...current, practiceSessions: current.practiceSessions.map((session) => session.id === id ? { ...session, archivedAt: undefined, updatedAt: timestamp } : session) }))
  }

  if (active) {
    const correct = active.questions.filter((question) => question.rating === "correct").length
    const finished = active.questions.every((question) => question.rating !== "unattempted")
    const elapsed = active.elapsedSeconds ?? (active.startedAt ? Math.max(0, Math.round((now.getTime() - new Date(active.startedAt).getTime()) / 1000)) : 0)
    return <WorkspacePage>
      <PageHeader title={active.title} description={`${active.questions.length} questions · ${active.durationMinutes} minute target · ${correct} correct`}>
        <Badge variant={elapsed > active.durationMinutes * 60 ? "destructive" : "outline"}><Clock3 />{formatTimer(elapsed)}</Badge>
        <Button variant="outline" onClick={() => setActiveId("")}>Exit session</Button>
        {!active.completedAt ? <Button onClick={() => onComplete(active)} disabled={!finished}><Check />Complete session</Button> : null}
      </PageHeader>
      {active.completedAt ? <Card><CardHeader><CardTitle>Completed practice</CardTitle><CardDescription>{correct}/{active.questions.length} recalled correctly in {formatTimer(elapsed)}. The linked mistake schedules were updated when this session was completed.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setSubject(active.subject); setArea("all"); setActiveId("") }}><RotateCcw />Build follow-up session</Button><Button variant="ghost" onClick={() => archiveSession(active.id)}><Archive />Archive result</Button></CardContent></Card> : null}
      <div className="grid items-start gap-4 lg:grid-cols-2">{active.questions.map((question, index) => {
        const isRevealed = Boolean(active.completedAt) || revealed.has(question.id)
        return <Card key={question.id} className={question.rating === "needs-review" ? "border-destructive/50" : undefined}>
          <CardHeader><div className="flex items-start justify-between gap-3"><div><CardDescription>Question {index + 1} · {question.skill}</CardDescription><CardTitle className="mt-1 leading-relaxed">{question.question}</CardTitle></div><Badge variant="outline">{question.marks} mark{question.marks === 1 ? "" : "s"}</Badge></div></CardHeader>
          <CardContent>{isRevealed ? <div className="rounded-lg border bg-muted/30 p-4"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Answer</p><p className="whitespace-pre-wrap text-sm">{question.answer}</p></div> : <Button variant="outline" onClick={() => setRevealed((current) => new Set([...current, question.id]))}><Eye />Reveal answer</Button>}</CardContent>
          {isRevealed ? <CardFooter className="gap-2">{active.completedAt ? <Badge variant={question.rating === "correct" ? "secondary" : "destructive"}>{question.rating === "correct" ? "Recalled correctly" : "Scheduled for review"}</Badge> : <><Button className="flex-1" variant={question.rating === "needs-review" ? "destructive" : "outline"} onClick={() => rate(question.id, "needs-review")}><X />Needs review</Button><Button className="flex-1" variant={question.rating === "correct" ? "default" : "outline"} onClick={() => rate(question.id, "correct")}><Check />Correct</Button></>}</CardFooter> : null}
        </Card>
      })}</div>
      {!active.completedAt && finished ? <Card><CardHeader><CardTitle>Session ready to complete</CardTitle><CardDescription>{correct}/{active.questions.length} questions recalled correctly. Completing will record Good or Again against every linked mistake card.</CardDescription></CardHeader><CardContent><Button onClick={() => onComplete(active)}><Check />Save result and update reviews</Button></CardContent></Card> : null}
    </WorkspacePage>
  }

  return <WorkspacePage>
    <PageHeader title="Practice studio" description="Build a focused practice set from due mistakes and generated alternatives." />
    <MetricGrid>
      <MetricCard label="Completed sessions" value={completedSessions.length}><span>Saved practice results</span></MetricCard>
      <MetricCard label="Average recall" value={averageRecall === null ? "—" : `${Math.round(averageRecall)}%`}><span>Across completed sessions</span></MetricCard>
      <MetricCard label="Active mistake cards" value={data.mistakes.filter((mistake) => !mistake.suspended).length}><span>Available for targeted work</span></MetricCard>
    </MetricGrid>
    <Card className="gap-5">
      <CardHeader><CardTitle>Create a targeted session</CardTitle><CardDescription>Due cards and recurring errors are prioritised. Generated alternatives are used where available.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-12 xl:items-end">
        <Field className="xl:col-span-4"><FieldLabel htmlFor="practice-subject">Subject</FieldLabel><Select value={subject} onValueChange={(value) => { setSubject(value ?? ""); setArea("all"); setError(null) }}><SelectTrigger id="practice-subject" className="w-full"><SelectValue>{subject || "Choose a subject"}</SelectValue></SelectTrigger><SelectContent>{availableSubjects.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
        <Field className="xl:col-span-4"><FieldLabel htmlFor="practice-area">Focus</FieldLabel><Select value={area} onValueChange={(value) => { setArea(value ?? "all"); setError(null) }}><SelectTrigger id="practice-area" className="w-full"><SelectValue>{area === "all" ? "All weak areas" : area}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All weak areas</SelectItem>{availableAreas.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
        <Field className="xl:col-span-2"><FieldLabel htmlFor="practice-count">Questions</FieldLabel><Select value={String(questionCount)} onValueChange={(value) => setQuestionCount(Number(value ?? 6))}><SelectTrigger id="practice-count" className="w-full"><SelectValue>{questionCount}</SelectValue></SelectTrigger><SelectContent><SelectItem value="3">3 questions</SelectItem><SelectItem value="6">6 questions</SelectItem><SelectItem value="10">10 questions</SelectItem></SelectContent></Select></Field>
        <Button className="w-full xl:col-span-2" onClick={create} disabled={!subject}><Plus />Build session</Button>
        <FieldError className="sm:col-span-2 xl:col-span-full">{error}</FieldError>
      </CardContent>
    </Card>
    {sessions.length ? <section className="grid gap-4"><SectionHeading title="Session history" description="Resume unfinished work or inspect completed evidence." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sessions.map((session) => {
      const correct = session.questions.filter((question) => question.rating === "correct").length
      return <Card key={session.id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{session.title}</CardTitle><CardDescription>{new Date(session.createdAt).toLocaleDateString("en-AU")} · {session.questions.length} questions{session.elapsedSeconds !== undefined ? ` · ${formatTimer(session.elapsedSeconds)}` : ""}</CardDescription></div><Badge variant={session.completedAt ? "secondary" : "outline"}>{session.completedAt ? `${correct}/${session.questions.length}` : "In progress"}</Badge></div></CardHeader><CardContent className="flex gap-2"><Button variant="outline" onClick={() => { setActiveId(session.id); setRevealed(new Set()) }}><RotateCcw />{session.completedAt ? "Review" : "Resume"}</Button><Button variant="ghost" size="icon-sm" onClick={() => archiveSession(session.id)}><Archive /><span className="sr-only">Archive session</span></Button></CardContent></Card>
    })}</div></section> : <Empty className="min-h-56 border"><EmptyHeader><EmptyMedia variant="icon"><FileQuestion /></EmptyMedia><EmptyTitle>No practice sessions yet</EmptyTitle><EmptyDescription>Log mistakes for a subject, then build your first targeted set.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={onOpenMistakes}>Open mistakes</Button></EmptyContent></Empty>}
    {archivedSessions.length ? <Card><CardHeader><CardTitle>Archived sessions</CardTitle><CardDescription>Restore a session to inspect its questions and result.</CardDescription></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{archivedSessions.map((session) => <div key={session.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div><p className="text-sm font-medium">{session.title}</p><p className="text-xs text-muted-foreground">{session.questions.length} questions</p></div><Button size="sm" variant="outline" onClick={() => restoreSession(session.id)}>Restore</Button></div>)}</CardContent></Card> : null}
  </WorkspacePage>
}
