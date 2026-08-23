import { useMemo, useState } from "react"
import { Check, Eye, FileQuestion, Plus, RotateCcw, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader } from "@/components/page-header"
import { createPracticeSession, type LearningWorkspace, type PracticeQuestionRating } from "@/lib/learning-workspace"
import type { AppData } from "@/lib/exam-data"

export function PracticeStudio({ data, initialSubject, onChange, onOpenMistakes }: {
  data: AppData
  initialSubject?: string
  onChange: (learning: LearningWorkspace) => void
  onOpenMistakes: () => void
}) {
  const availableSubjects = useMemo(() => [...new Set(data.attempts.map((attempt) => attempt.subject))].toSorted(), [data.attempts])
  const [subject, setSubject] = useState(initialSubject ?? data.subjects.find((item) => availableSubjects.includes(item)) ?? availableSubjects[0] ?? "")
  const [activeId, setActiveId] = useState(data.learning.practiceSessions.find((session) => !session.completedAt)?.id ?? "")
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const active = data.learning.practiceSessions.find((session) => session.id === activeId)

  function commit(patch: Partial<LearningWorkspace>) {
    onChange({ ...data.learning, ...patch, updatedAt: new Date().toISOString() })
  }

  function create() {
    const session = createPracticeSession(subject, data)
    if (!session) return
    commit({ practiceSessions: [session, ...data.learning.practiceSessions] })
    setActiveId(session.id)
    setRevealed(new Set())
  }

  function rate(questionId: string, rating: PracticeQuestionRating) {
    if (!active) return
    const timestamp = new Date().toISOString()
    const practiceSessions = data.learning.practiceSessions.map((session) => session.id === active.id ? {
      ...session,
      questions: session.questions.map((question) => question.id === questionId ? { ...question, rating } : question),
      updatedAt: timestamp,
    } : session)
    commit({ practiceSessions })
  }

  function complete() {
    if (!active) return
    const timestamp = new Date().toISOString()
    commit({ practiceSessions: data.learning.practiceSessions.map((session) => session.id === active.id ? { ...session, completedAt: timestamp, updatedAt: timestamp } : session) })
  }

  if (active) {
    const correct = active.questions.filter((question) => question.rating === "correct").length
    const finished = active.questions.every((question) => question.rating !== "unattempted")
    return <div className="grid gap-6">
      <PageHeader title={active.title} description={`${active.questions.length} questions · ${active.durationMinutes} minute target · ${correct} correct`}>
        <Button variant="outline" onClick={() => setActiveId("")}>Exit session</Button>
        <Button onClick={complete} disabled={!finished}><Check />Complete session</Button>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">{active.questions.map((question, index) => {
        const isRevealed = revealed.has(question.id)
        return <Card key={question.id} className={question.rating === "needs-review" ? "border-destructive/50" : undefined}>
          <CardHeader><div className="flex items-start justify-between gap-3"><div><CardDescription>Question {index + 1} · {question.skill}</CardDescription><CardTitle className="mt-1 leading-relaxed">{question.question}</CardTitle></div><Badge variant="outline">{question.marks} mark{question.marks === 1 ? "" : "s"}</Badge></div></CardHeader>
          <CardContent>{isRevealed ? <div className="rounded-lg border bg-muted/30 p-4"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Answer</p><p className="whitespace-pre-wrap text-sm">{question.answer}</p></div> : <Button variant="outline" onClick={() => setRevealed((current) => new Set([...current, question.id]))}><Eye />Reveal answer</Button>}</CardContent>
          {isRevealed ? <CardFooter className="gap-2"><Button className="flex-1" variant={question.rating === "needs-review" ? "destructive" : "outline"} onClick={() => rate(question.id, "needs-review")}><X />Needs review</Button><Button className="flex-1" variant={question.rating === "correct" ? "default" : "outline"} onClick={() => rate(question.id, "correct")}><Check />Correct</Button></CardFooter> : null}
        </Card>
      })}</div>
      {finished ? <Card><CardHeader><CardTitle>Session ready to complete</CardTitle><CardDescription>{correct}/{active.questions.length} questions recalled correctly. Items needing review remain linked to their original mistake cards.</CardDescription></CardHeader><CardContent><Button onClick={complete}><Check />Save session result</Button></CardContent></Card> : null}
    </div>
  }

  return <div className="grid gap-6">
    <PageHeader title="Practice studio" description="Build a focused practice set from your logged mistakes and generated alternatives." />
    <Card>
      <CardHeader><CardTitle>Create a targeted session</CardTitle><CardDescription>ExamTrack prioritises active mistake cards and uses generated alternatives where available.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field className="flex-1"><FieldLabel htmlFor="practice-subject">Subject</FieldLabel><Select value={subject} onValueChange={(value) => setSubject(value ?? "")}><SelectTrigger id="practice-subject" className="w-full"><SelectValue>{subject || "Choose a subject"}</SelectValue></SelectTrigger><SelectContent>{availableSubjects.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
        <Button onClick={create} disabled={!subject}><Plus />Build session</Button>
      </CardContent>
    </Card>
    {data.learning.practiceSessions.length ? <section className="grid gap-3"><div><h2 className="text-lg font-semibold">Previous sessions</h2><p className="text-sm text-muted-foreground">Resume unfinished work or revisit completed results.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.learning.practiceSessions.map((session) => {
      const correct = session.questions.filter((question) => question.rating === "correct").length
      return <Card key={session.id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{session.title}</CardTitle><CardDescription>{new Date(session.createdAt).toLocaleDateString("en-AU")} · {session.questions.length} questions</CardDescription></div><Badge variant={session.completedAt ? "secondary" : "outline"}>{session.completedAt ? `${correct}/${session.questions.length}` : "In progress"}</Badge></div></CardHeader><CardContent><Button variant="outline" onClick={() => { setActiveId(session.id); setRevealed(new Set()) }}><RotateCcw />{session.completedAt ? "Review" : "Resume"}</Button></CardContent></Card>
    })}</div></section> : <Empty className="min-h-64 border"><EmptyHeader><EmptyMedia variant="icon"><FileQuestion /></EmptyMedia><EmptyTitle>No practice sessions yet</EmptyTitle><EmptyDescription>Log mistakes for a subject, then build your first targeted set.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={onOpenMistakes}>Open mistakes</Button></EmptyContent></Empty>}
  </div>
}
