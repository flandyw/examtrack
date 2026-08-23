import { useMemo, useState } from "react"
import { CalendarCheck2, Check, Clock3, Plus, RotateCcw, SkipForward } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/page-header"
import type { AppData } from "@/lib/exam-data"
import type { AppView } from "@/lib/app-view"
import { buildPlannerSuggestions, materialiseTask, type LearningWorkspace, type StudyTaskStatus } from "@/lib/learning-workspace"
import type { Timetable } from "@/lib/timetable"

const today = () => new Date().toISOString().slice(0, 10)

export function PlannerPage({ data, timetable, onChange, onNavigate }: {
  data: AppData
  timetable: Timetable | null
  onChange: (learning: LearningWorkspace) => void
  onNavigate: (view: AppView) => void
}) {
  const [customTitle, setCustomTitle] = useState("")
  const [customDate, setCustomDate] = useState(today)
  const [customMinutes, setCustomMinutes] = useState(30)
  const suggestions = useMemo(() => buildPlannerSuggestions(data, timetable), [data, timetable])
  const tasks = data.learning.tasks.toSorted((a, b) => a.plannedFor.localeCompare(b.plannedFor) || a.createdAt.localeCompare(b.createdAt))
  const current = tasks.filter((task) => task.plannedFor >= today() && task.status === "planned")
  const completed = tasks.filter((task) => task.status === "completed").length
  const completion = tasks.length ? completed / tasks.length * 100 : 0

  function commit(patch: Partial<LearningWorkspace>) {
    onChange({ ...data.learning, ...patch, updatedAt: new Date().toISOString() })
  }

  function addSuggested(index: number) {
    const suggestion = suggestions[index]
    if (!suggestion) return
    commit({ tasks: [...data.learning.tasks, materialiseTask(suggestion)] })
  }

  function setStatus(id: string, status: StudyTaskStatus) {
    const updatedAt = new Date().toISOString()
    commit({ tasks: data.learning.tasks.map((task) => task.id === id ? { ...task, status, updatedAt } : task) })
  }

  function addCustom() {
    if (!customTitle.trim()) return
    const now = new Date()
    const timestamp = now.toISOString()
    commit({ tasks: [...data.learning.tasks, {
      id: crypto.randomUUID(), kind: "custom", title: customTitle.trim(), detail: "Personal study task",
      durationMinutes: Math.max(5, customMinutes), plannedFor: customDate, status: "planned",
      createdAt: timestamp, updatedAt: timestamp,
    }] })
    setCustomTitle("")
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Revision planner" description="Turn your exam evidence, due mistakes, SACs, and official dates into a realistic study week.">
        <Button variant="outline" onClick={() => onNavigate("practice")}><RotateCcw />Open practice studio</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>Planned next</CardDescription><CardTitle className="text-3xl tabular-nums">{current.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Available time</CardDescription><CardTitle className="text-3xl tabular-nums">{data.learning.preferences.dailyMinutes} min/day</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Plan completion</CardDescription><CardTitle className="text-3xl tabular-nums">{Math.round(completion)}%</CardTitle></CardHeader><CardContent><Progress value={completion} /></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Planner settings</CardTitle><CardDescription>Recommendations stay within your normal daily study budget.</CardDescription></CardHeader>
        <CardContent className="max-w-xs">
          <Field><FieldLabel htmlFor="planner-minutes">Minutes available per study day</FieldLabel><Input id="planner-minutes" type="number" min="15" max="360" value={data.learning.preferences.dailyMinutes} onChange={(event) => commit({ preferences: { ...data.learning.preferences, dailyMinutes: Math.max(15, event.target.valueAsNumber || 15) } })} /></Field>
        </CardContent>
      </Card>

      <section className="grid gap-3" aria-labelledby="recommendations-title">
        <div><h2 id="recommendations-title" className="text-lg font-semibold">Recommended next actions</h2><p className="text-sm text-muted-foreground">Generated from your current records; nothing is added until you choose it.</p></div>
        {suggestions.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{suggestions.map((suggestion, index) => (
          <Card key={`${suggestion.sourceId}-${suggestion.plannedFor}`}>
            <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{suggestion.title}</CardTitle><CardDescription>{suggestion.detail}</CardDescription></div><Badge variant="outline">{suggestion.plannedFor}</Badge></div></CardHeader>
            <CardContent className="flex items-center justify-between gap-3"><span className="flex items-center gap-1 text-sm text-muted-foreground"><Clock3 className="size-4" />{suggestion.durationMinutes} min</span><Button size="sm" onClick={() => addSuggested(index)}><Plus />Add to plan</Button></CardContent>
          </Card>
        ))}</div> : <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><CalendarCheck2 /></EmptyMedia><EmptyTitle>Your plan is caught up</EmptyTitle><EmptyDescription>Complete or skip current tasks before generating more recommendations.</EmptyDescription></EmptyHeader></Empty>}
      </section>

      <Card>
        <CardHeader><CardTitle>Add your own task</CardTitle><CardDescription>Keep teacher homework or personal commitments beside generated work.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end">
          <Field><FieldLabel htmlFor="custom-task">Task</FieldLabel><Input id="custom-task" value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder="Complete chapter review" /></Field>
          <Field><FieldLabel htmlFor="custom-date">Date</FieldLabel><Input id="custom-date" type="date" value={customDate} onChange={(event) => setCustomDate(event.target.value)} /></Field>
          <Field><FieldLabel htmlFor="custom-duration">Minutes</FieldLabel><Input id="custom-duration" type="number" min="5" value={customMinutes} onChange={(event) => setCustomMinutes(event.target.valueAsNumber)} /></Field>
          <Button onClick={addCustom}><Plus />Add</Button>
        </CardContent>
      </Card>

      <section className="grid gap-3" aria-labelledby="plan-title">
        <div><h2 id="plan-title" className="text-lg font-semibold">Your plan</h2><p className="text-sm text-muted-foreground">Upcoming work first. Completed and skipped tasks remain as evidence.</p></div>
        {tasks.length ? <div className="grid gap-2">{tasks.map((task) => (
          <div key={task.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className={task.status === "completed" ? "font-medium line-through text-muted-foreground" : "font-medium"}>{task.title}</p><Badge variant={task.status === "planned" ? "outline" : "secondary"}>{task.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{task.plannedFor} · {task.durationMinutes} min{task.subject ? ` · ${task.subject}` : ""}</p></div>
            {task.status === "planned" ? <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setStatus(task.id, "skipped")}><SkipForward />Skip</Button><Button size="sm" onClick={() => setStatus(task.id, "completed")}><Check />Complete</Button></div> : <Button size="sm" variant="ghost" onClick={() => setStatus(task.id, "planned")}>Restore</Button>}
          </div>
        ))}</div> : <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><CalendarCheck2 /></EmptyMedia><EmptyTitle>No planned study yet</EmptyTitle><EmptyDescription>Add a recommendation or create your own task.</EmptyDescription></EmptyHeader></Empty>}
      </section>
    </div>
  )
}
