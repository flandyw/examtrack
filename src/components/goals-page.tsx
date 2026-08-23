import { useMemo, useState } from "react"
import { Flag, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader } from "@/components/page-header"
import { SubjectCombobox } from "@/components/subject-combobox"
import type { AppData, AssessmentReference } from "@/lib/exam-data"
import { getGoalProgress, type LearningWorkspace, type StudyGoalKind } from "@/lib/learning-workspace"

function defaultDeadline() {
  const date = new Date()
  date.setMonth(date.getMonth() + 3)
  return date.toISOString().slice(0, 10)
}

function kindLabel(kind: StudyGoalKind) {
  return kind === "study-score" ? "Raw study score" : kind === "exam-percentage" ? "Exam average" : "ATAR"
}

export function GoalsPage({ data, references, subjects, onChange, onOpenPlanner }: {
  data: AppData
  references: AssessmentReference[]
  subjects: string[]
  onChange: (learning: LearningWorkspace) => void
  onOpenPlanner: () => void
}) {
  const [kind, setKind] = useState<StudyGoalKind>("exam-percentage")
  const [subject, setSubject] = useState(data.subjects[0] ?? subjects[0] ?? "")
  const [target, setTarget] = useState(80)
  const [deadline, setDeadline] = useState(defaultDeadline)
  const progress = useMemo(() => data.learning.goals.map((goal) => ({ goal, progress: getGoalProgress(goal, data, references) })), [data, references])

  function commit(patch: Partial<LearningWorkspace>) {
    onChange({ ...data.learning, ...patch, updatedAt: new Date().toISOString() })
  }

  function addGoal() {
    if (!Number.isFinite(target) || target <= 0 || (kind !== "atar" && !subject.trim())) return
    const timestamp = new Date().toISOString()
    commit({ goals: [...data.learning.goals, { id: crypto.randomUUID(), kind, subject: kind === "atar" ? undefined : subject.trim(), target, deadline, createdAt: timestamp, updatedAt: timestamp }] })
  }

  function removeGoal(id: string) {
    commit({ goals: data.learning.goals.filter((goal) => goal.id !== id) })
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Score goals" description="Set an outcome, measure the gap from current evidence, and turn it into a revision pathway.">
        <Button variant="outline" onClick={onOpenPlanner}>Open revision plan</Button>
      </PageHeader>
      <Card>
        <CardHeader><CardTitle>Set a goal</CardTitle><CardDescription>Predictions remain estimates. Goals show direction and evidence, not guaranteed outcomes.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[12rem_minmax(0,1fr)_8rem_11rem_auto] lg:items-end">
          <Field><FieldLabel htmlFor="goal-kind">Measure</FieldLabel><Select value={kind} onValueChange={(value) => setKind((value ?? "exam-percentage") as StudyGoalKind)}><SelectTrigger id="goal-kind" className="w-full"><SelectValue>{kindLabel(kind)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="exam-percentage">Exam average</SelectItem><SelectItem value="study-score">Raw study score</SelectItem><SelectItem value="atar">ATAR</SelectItem></SelectContent></Select></Field>
          {kind !== "atar" ? <Field><FieldLabel htmlFor="goal-subject">Subject</FieldLabel><SubjectCombobox id="goal-subject" subjects={subjects} preferredSubjects={data.subjects} value={subject} onValueChange={setSubject} allowCustom required /></Field> : <div />}
          <Field><FieldLabel htmlFor="goal-target">Target</FieldLabel><Input id="goal-target" type="number" min="1" max={kind === "study-score" ? 50 : 99.95} step={kind === "atar" ? 0.05 : 1} value={target} onChange={(event) => setTarget(event.target.valueAsNumber)} /></Field>
          <Field><FieldLabel htmlFor="goal-deadline">By</FieldLabel><Input id="goal-deadline" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></Field>
          <Button onClick={addGoal}><Plus />Add goal</Button>
        </CardContent>
      </Card>

      {progress.length ? <div className="grid gap-4 md:grid-cols-2">{progress.map(({ goal, progress: item }) => {
        const achieved = item.current !== null && item.current >= goal.target
        return <Card key={goal.id}>
          <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{goal.subject ? `${goal.subject} · ` : ""}{kindLabel(goal.kind)}</CardTitle><CardDescription>Target {goal.target} by {new Date(`${goal.deadline}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</CardDescription></div><Badge variant={achieved ? "secondary" : "outline"}>{achieved ? "Reached" : item.gap === null ? "Needs baseline" : `${item.gap.toFixed(goal.kind === "atar" ? 2 : 1)} to go`}</Badge></div></CardHeader>
          <CardContent className="grid gap-4"><div><div className="mb-2 flex justify-between text-sm"><span>{item.label}</span><strong className="tabular-nums">{item.current === null ? "—" : item.current.toFixed(goal.kind === "atar" ? 2 : 1)} / {goal.target}</strong></div><Progress value={item.progress} /></div><p className="text-sm text-muted-foreground">{item.evidence}</p><div className="flex items-center justify-between"><p className="text-sm">{item.gap === null ? "Log compatible evidence to calculate a pathway." : achieved ? "Maintain this result with spaced review and full-paper practice." : `Next milestone: close roughly ${Math.max(1, item.gap / 3).toFixed(1)} points in each of three review cycles.`}</p><Button variant="ghost" size="icon-sm" onClick={() => removeGoal(goal.id)}><Trash2 /><span className="sr-only">Delete goal</span></Button></div></CardContent>
        </Card>
      })}</div> : <Empty className="min-h-72 border"><EmptyHeader><EmptyMedia variant="icon"><Flag /></EmptyMedia><EmptyTitle>No score goals yet</EmptyTitle><EmptyDescription>Add a target above to see your current baseline and the gap to close.</EmptyDescription></EmptyHeader></Empty>}
    </div>
  )
}
