import { useMemo, useState } from "react"
import { ExternalLink, Flag, ListChecks, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ExamWorkspaceItem, ExamWorkspaceStatus } from "@/lib/ongoing-timers"

const nextStatus: Record<ExamWorkspaceStatus, ExamWorkspaceStatus> = {
  "not-started": "in-progress",
  "in-progress": "done",
  "done": "not-started",
  "flagged": "done",
}

export function ExamWorkspace({ items, expectedMarks, totalMarks, paperUrl, reportUrl, onChange }: {
  items: ExamWorkspaceItem[]
  expectedMarks: number
  totalMarks: number
  paperUrl?: string
  reportUrl?: string
  onChange: (items: ExamWorkspaceItem[]) => void
}) {
  const [label, setLabel] = useState("")
  const [marks, setMarks] = useState(1)
  const doneMarks = useMemo(() => items.filter((item) => item.status === "done").reduce((total, item) => total + item.marks, 0), [items])
  const mappedMarks = items.reduce((total, item) => total + item.marks, 0)
  const paceDelta = doneMarks - expectedMarks

  function add() {
    if (!label.trim() || !Number.isFinite(marks) || marks <= 0) return
    onChange([...items, { id: crypto.randomUUID(), label: label.trim(), marks, status: "not-started", confidence: "medium" }])
    setLabel("")
  }

  function update(id: string, patch: Partial<ExamWorkspaceItem>) {
    onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  return <Card>
    <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Exam workspace</CardTitle><CardDescription>Track question progress, confidence, and flags without leaving the timed session.</CardDescription></div><div className="flex gap-2">{paperUrl ? <Button variant="outline" size="sm" render={<a href={paperUrl} target="_blank" rel="noreferrer" />}><ExternalLink />Exam paper</Button> : null}{reportUrl ? <Button variant="outline" size="sm" render={<a href={reportUrl} target="_blank" rel="noreferrer" />}><ExternalLink />Assessment report</Button> : null}</div></div></CardHeader>
    <CardContent className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
        <Field><FieldLabel htmlFor="workspace-label">Question or section</FieldLabel><Input id="workspace-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Question 4" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add() } }} /></Field>
        <Field><FieldLabel htmlFor="workspace-marks">Marks</FieldLabel><Input id="workspace-marks" type="number" min="0.5" step="0.5" value={marks} onChange={(event) => setMarks(event.target.valueAsNumber)} /></Field>
        <Button onClick={add}><Plus />Add</Button>
      </div>
      {items.length ? <>
        <div className="grid gap-2"><div className="flex justify-between text-sm"><span>{doneMarks}/{mappedMarks || totalMarks} mapped marks complete</span><span className={paceDelta < -5 ? "text-destructive" : "text-muted-foreground"}>{paceDelta < -5 ? `${Math.abs(Math.round(paceDelta))} marks behind expected pace` : paceDelta > 5 ? `${Math.round(paceDelta)} marks ahead` : "On expected pace"}</span></div><Progress value={mappedMarks ? doneMarks / mappedMarks * 100 : 0} /></div>
        <div className="grid gap-2">{items.map((item) => <div key={item.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_8rem_9rem_auto] md:items-center">
          <button type="button" className="min-w-0 text-left" onClick={() => update(item.id, { status: nextStatus[item.status] })}><span className={item.status === "done" ? "font-medium line-through text-muted-foreground" : "font-medium"}>{item.label}</span><span className="ml-2 text-xs text-muted-foreground">{item.marks} marks</span><span className="mt-1 block text-xs text-muted-foreground">Click to advance status</span></button>
          <Select value={item.status} onValueChange={(value) => update(item.id, { status: (value ?? "not-started") as ExamWorkspaceStatus })}><SelectTrigger size="sm"><SelectValue>{item.status}</SelectValue></SelectTrigger><SelectContent><SelectItem value="not-started">Not started</SelectItem><SelectItem value="in-progress">In progress</SelectItem><SelectItem value="flagged">Flagged</SelectItem><SelectItem value="done">Done</SelectItem></SelectContent></Select>
          <Select value={item.confidence} onValueChange={(value) => update(item.id, { confidence: (value ?? "medium") as ExamWorkspaceItem["confidence"] })}><SelectTrigger size="sm"><SelectValue>{item.confidence} confidence</SelectValue></SelectTrigger><SelectContent><SelectItem value="low">Low confidence</SelectItem><SelectItem value="medium">Medium confidence</SelectItem><SelectItem value="high">High confidence</SelectItem></SelectContent></Select>
          <div className="flex items-center justify-end gap-1"><Button variant={item.status === "flagged" ? "secondary" : "ghost"} size="icon-sm" onClick={() => update(item.id, { status: item.status === "flagged" ? "in-progress" : "flagged" })}><Flag /><span className="sr-only">Toggle flag</span></Button><Button variant="ghost" size="icon-sm" onClick={() => onChange(items.filter((candidate) => candidate.id !== item.id))}><Trash2 /><span className="sr-only">Remove</span></Button></div>
        </div>)}</div>
        {mappedMarks !== totalMarks ? <p className="text-xs text-muted-foreground">Workspace covers {mappedMarks} of {totalMarks} exam marks. Add broad sections or individual questions—the final marking form will use whatever you map.</p> : null}
      </> : <div className="flex items-center gap-3 rounded-lg border border-dashed p-5 text-sm text-muted-foreground"><ListChecks className="size-5" /><span>Add questions or sections to enable checkpoint pacing and prefill question-level marking.</span></div>}
    </CardContent>
  </Card>
}
