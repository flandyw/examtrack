import { useMemo, useState } from "react"
import { Archive, CalendarCheck2, Check, Clock3, Plus, RotateCcw, SkipForward, WandSparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/page-header"
import type { AppData } from "@/lib/exam-data"
import type { AppView } from "@/lib/app-view"
import { buildPlannerSuggestions, localDate, materialiseTask, type LearningWorkspace, type LearningWorkspaceUpdate, type PlannerSuggestion, type StudyTaskStatus } from "@/lib/learning-workspace"
import type { Timetable } from "@/lib/timetable"

const today = () => localDate(new Date())

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : value
}

export function PlannerPage({ data, timetable, onChange, onNavigate }: {
  data: AppData
  timetable: Timetable | null
  onChange: (learning: LearningWorkspaceUpdate) => void
  onNavigate: (view: AppView) => void
}) {
  const [customTitle, setCustomTitle] = useState("")
  const [customDate, setCustomDate] = useState(today)
  const [customMinutes, setCustomMinutes] = useState(30)
  const [customError, setCustomError] = useState<string | null>(null)
  const suggestions = useMemo(() => buildPlannerSuggestions(data, timetable), [data, timetable])
  const tasks = data.learning.tasks.filter((task) => !task.archivedAt).toSorted((a, b) => a.plannedFor.localeCompare(b.plannedFor) || a.createdAt.localeCompare(b.createdAt))
  const archivedTasks = data.learning.tasks.filter((task) => task.archivedAt)
  const current = tasks.filter((task) => task.status === "planned")
  const dueToday = current.filter((task) => task.plannedFor <= today())
  const overdue = current.filter((task) => task.plannedFor < today()).length
  const completed = tasks.filter((task) => task.status === "completed").length
  const completion = tasks.length ? completed / tasks.length * 100 : 0

  function commit(update: (current: LearningWorkspace) => LearningWorkspace) {
    onChange((current) => ({ ...update(current), updatedAt: new Date().toISOString() }))
  }

  function addSuggested(suggestion: PlannerSuggestion) {
    commit((current) => ({ ...current, tasks: [...current.tasks, materialiseTask(suggestion)] }))
  }

  function setStatus(id: string, status: StudyTaskStatus) {
    const updatedAt = new Date().toISOString()
    commit((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, status, updatedAt } : task) }))
  }

  function reschedule(id: string, plannedFor: string) {
    if (!plannedFor) return
    const updatedAt = new Date().toISOString()
    commit((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, plannedFor, status: "planned", updatedAt } : task) }))
  }

  function archive(id: string) {
    const updatedAt = new Date().toISOString()
    commit((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, archivedAt: updatedAt, updatedAt } : task) }))
  }

  function restore(id: string) {
    const updatedAt = new Date().toISOString()
    commit((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, archivedAt: undefined, updatedAt } : task) }))
  }

  function addCustom() {
    if (!customTitle.trim()) return setCustomError("Enter a task name.")
    if (!customDate) return setCustomError("Choose a valid date.")
    if (!Number.isFinite(customMinutes) || customMinutes < 5 || customMinutes > 360) return setCustomError("Duration must be between 5 and 360 minutes.")
    const now = new Date()
    const timestamp = now.toISOString()
    commit((current) => ({ ...current, tasks: [...current.tasks, {
      id: crypto.randomUUID(), kind: "custom", title: customTitle.trim(), detail: "Personal study task",
      durationMinutes: customMinutes, plannedFor: customDate, status: "planned",
      createdAt: timestamp, updatedAt: timestamp,
    }] }))
    setCustomTitle("")
    setCustomError(null)
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Revision planner" description="Turn your exam evidence, due mistakes, SACs, and official dates into a realistic study week.">
        <Button variant="outline" onClick={() => onNavigate("practice")}><RotateCcw />Open practice studio</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>Due now</CardDescription><CardTitle className="text-3xl tabular-nums">{dueToday.length}</CardTitle></CardHeader><CardContent><p className={overdue ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{overdue ? `${overdue} overdue` : "Nothing overdue"}</p></CardContent></Card>
        <Card><CardHeader><CardDescription>Available time</CardDescription><CardTitle className="text-3xl tabular-nums">{data.learning.preferences.dailyMinutes} min/day</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Plan completion</CardDescription><CardTitle className="text-3xl tabular-nums">{Math.round(completion)}%</CardTitle></CardHeader><CardContent><Progress value={completion} /></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Planner settings</CardTitle><CardDescription>Recommendations stay within your normal daily study budget.</CardDescription></CardHeader>
        <CardContent className="max-w-xs">
          <Field><FieldLabel htmlFor="planner-minutes">Minutes available per study day</FieldLabel><Input id="planner-minutes" type="number" min="15" max="360" value={data.learning.preferences.dailyMinutes} onChange={(event) => { const dailyMinutes = Math.min(360, Math.max(15, event.target.valueAsNumber || 15)); commit((current) => ({ ...current, preferences: { ...current.preferences, dailyMinutes }, preferencesUpdatedAt: new Date().toISOString() })) }} /></Field>
        </CardContent>
      </Card>

      <section className="grid gap-3" aria-labelledby="recommendations-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="recommendations-title" className="text-lg font-semibold">Recommended next actions</h2><p className="text-sm text-muted-foreground">Capacity-aware recommendations generated from your current records.</p></div>{suggestions.length > 1 ? <Button variant="outline" size="sm" onClick={() => commit((current) => ({ ...current, tasks: [...current.tasks, ...suggestions.map((suggestion) => materialiseTask(suggestion))] }))}><WandSparkles />Add all to plan</Button> : null}</div>
        {suggestions.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{suggestions.map((suggestion) => (
          <Card key={`${suggestion.sourceId}-${suggestion.plannedFor}`}>
            <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{suggestion.title}</CardTitle><CardDescription>{suggestion.detail}</CardDescription></div><Badge variant="outline">{formatDate(suggestion.plannedFor)}</Badge></div></CardHeader>
            <CardContent className="flex items-center justify-between gap-3"><span className="flex items-center gap-1 text-sm text-muted-foreground"><Clock3 className="size-4" />{suggestion.durationMinutes} min</span><Button size="sm" onClick={() => addSuggested(suggestion)}><Plus />Add to plan</Button></CardContent>
          </Card>
        ))}</div> : <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><CalendarCheck2 /></EmptyMedia><EmptyTitle>Your plan is caught up</EmptyTitle><EmptyDescription>Complete or skip current tasks before generating more recommendations.</EmptyDescription></EmptyHeader></Empty>}
      </section>

      <Card>
        <CardHeader><CardTitle>Add your own task</CardTitle><CardDescription>Keep teacher homework or personal commitments beside generated work.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end">
          <Field data-invalid={customError ? true : undefined}><FieldLabel htmlFor="custom-task">Task</FieldLabel><Input id="custom-task" value={customTitle} onChange={(event) => { setCustomTitle(event.target.value); setCustomError(null) }} placeholder="Complete chapter review" /></Field>
          <Field><FieldLabel htmlFor="custom-date">Date</FieldLabel><Input id="custom-date" type="date" value={customDate} onChange={(event) => setCustomDate(event.target.value)} /></Field>
          <Field><FieldLabel htmlFor="custom-duration">Minutes</FieldLabel><Input id="custom-duration" type="number" min="5" value={customMinutes} onChange={(event) => setCustomMinutes(event.target.valueAsNumber)} /></Field>
          <Button onClick={addCustom}><Plus />Add</Button>
          <FieldError className="sm:col-span-full">{customError}</FieldError>
        </CardContent>
      </Card>

      <section className="grid gap-3" aria-labelledby="plan-title">
        <div><h2 id="plan-title" className="text-lg font-semibold">Your plan</h2><p className="text-sm text-muted-foreground">Upcoming work first. Completed and skipped tasks remain as evidence.</p></div>
        {tasks.length ? <div className="grid gap-2">{tasks.map((task) => (
          <div key={task.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className={task.status === "completed" ? "font-medium line-through text-muted-foreground" : "font-medium"}>{task.title}</p><Badge variant={task.status === "planned" && task.plannedFor < today() ? "destructive" : task.status === "planned" ? "outline" : "secondary"}>{task.status === "planned" && task.plannedFor < today() ? "overdue" : task.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{formatDate(task.plannedFor)} · {task.durationMinutes} min{task.subject ? ` · ${task.subject}` : ""}</p></div>
            <div className="flex flex-wrap items-center gap-2"><Input aria-label={`Reschedule ${task.title}`} className="w-36" type="date" value={task.plannedFor} onChange={(event) => reschedule(task.id, event.target.value)} />{task.status === "planned" ? <><Button size="sm" variant="outline" onClick={() => setStatus(task.id, "skipped")}><SkipForward />Skip</Button><Button size="sm" onClick={() => setStatus(task.id, "completed")}><Check />Complete</Button></> : <Button size="sm" variant="ghost" onClick={() => setStatus(task.id, "planned")}>Restore</Button>}<Button size="icon-sm" variant="ghost" onClick={() => archive(task.id)}><Archive /><span className="sr-only">Archive task</span></Button></div>
          </div>
        ))}</div> : <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><CalendarCheck2 /></EmptyMedia><EmptyTitle>No planned study yet</EmptyTitle><EmptyDescription>Add a recommendation or create your own task.</EmptyDescription></EmptyHeader></Empty>}
      </section>
      {archivedTasks.length ? <Card><CardHeader><CardTitle>Archived tasks</CardTitle><CardDescription>Archived work stays in synced history and can be restored.</CardDescription></CardHeader><CardContent className="grid gap-2">{archivedTasks.map((task) => <div key={task.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div><p className="text-sm font-medium">{task.title}</p><p className="text-xs text-muted-foreground">{formatDate(task.plannedFor)} · {task.durationMinutes} min</p></div><Button size="sm" variant="outline" onClick={() => restore(task.id)}>Restore</Button></div>)}</CardContent></Card> : null}
    </div>
  )
}
