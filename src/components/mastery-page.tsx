import { useMemo, useState } from "react"
import { BookOpenCheck, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/page-header"
import { SubjectCombobox } from "@/components/subject-combobox"
import type { AppData } from "@/lib/exam-data"
import { buildMasteryAreas, type LearningWorkspace } from "@/lib/learning-workspace"

function masteryLabel(value: number | null) {
  if (value === null) return "Untested"
  if (value >= 85) return "Secure"
  if (value >= 70) return "Developing"
  return "Priority"
}

export function MasteryPage({ data, subjects, onChange, onOpenPractice }: {
  data: AppData
  subjects: string[]
  onChange: (learning: LearningWorkspace) => void
  onOpenPractice: (subject: string) => void
}) {
  const [subject, setSubject] = useState(data.subjects[0] ?? subjects[0] ?? "")
  const [name, setName] = useState("")
  const areas = useMemo(() => buildMasteryAreas(data), [data])
  const grouped = useMemo(() => {
    const result = new Map<string, typeof areas>()
    for (const area of areas) result.set(area.subject, [...(result.get(area.subject) ?? []), area])
    return result
  }, [areas])

  function commit(patch: Partial<LearningWorkspace>) {
    onChange({ ...data.learning, ...patch, updatedAt: new Date().toISOString() })
  }

  function addArea() {
    if (!subject.trim() || !name.trim()) return
    const timestamp = new Date().toISOString()
    commit({ curriculumAreas: [...data.learning.curriculumAreas, { id: crypto.randomUUID(), subject: subject.trim(), name: name.trim(), createdAt: timestamp, updatedAt: timestamp }] })
    setName("")
  }

  function removeArea(subjectName: string, areaName: string) {
    commit({ curriculumAreas: data.learning.curriculumAreas.filter((area) => !(area.subject === subjectName && area.name === areaName)) })
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Curriculum mastery" description="See which areas are secure, weak, or still untested from question-level results and mistake evidence." />
      <Card>
        <CardHeader><CardTitle>Add a curriculum area</CardTitle><CardDescription>Create the map from your study design, teacher course outline, or current Areas of Study.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <Field><FieldLabel htmlFor="mastery-subject">Subject</FieldLabel><SubjectCombobox id="mastery-subject" subjects={subjects} preferredSubjects={data.subjects} value={subject} onValueChange={setSubject} allowCustom required /></Field>
          <Field><FieldLabel htmlFor="mastery-area">Area, skill, or outcome</FieldLabel><Input id="mastery-area" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Differentiation" /></Field>
          <Button onClick={addArea}><Plus />Add area</Button>
        </CardContent>
      </Card>

      {areas.length ? [...grouped.entries()].map(([subjectName, subjectAreas]) => (
        <section key={subjectName} className="grid gap-3" aria-labelledby={`mastery-${subjectName}`}>
          <div className="flex items-end justify-between gap-3"><div><h2 id={`mastery-${subjectName}`} className="text-lg font-semibold">{subjectName}</h2><p className="text-sm text-muted-foreground">{subjectAreas.length} mapped area{subjectAreas.length === 1 ? "" : "s"}</p></div><Button size="sm" variant="outline" onClick={() => onOpenPractice(subjectName)}>Practise priorities</Button></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{subjectAreas.map((area) => {
            const manual = data.learning.curriculumAreas.some((item) => item.subject === area.subject && item.name === area.name)
            return <Card key={area.key}>
              <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{area.name}</CardTitle><CardDescription>{area.evidenceCount ? `${area.evidenceCount} evidence item${area.evidenceCount === 1 ? "" : "s"} · ${area.mistakes} mistake${area.mistakes === 1 ? "" : "s"}` : "No linked evidence yet"}</CardDescription></div><Badge variant={area.mastery !== null && area.mastery < 70 ? "destructive" : "outline"}>{masteryLabel(area.mastery)}</Badge></div></CardHeader>
              <CardContent className="grid gap-3"><div className="flex items-center gap-3"><Progress value={area.mastery ?? 0} className="flex-1" /><span className="w-10 text-right text-sm font-medium tabular-nums">{area.mastery === null ? "—" : `${Math.round(area.mastery)}%`}</span></div><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{area.availableMarks ? `${area.awardedMarks}/${area.availableMarks} question marks` : `${area.reviews} completed reviews`}</span>{manual ? <Button variant="ghost" size="icon-sm" onClick={() => removeArea(area.subject, area.name)}><Trash2 /><span className="sr-only">Remove area</span></Button> : null}</div></CardContent>
            </Card>
          })}</div>
        </section>
      )) : <Empty className="min-h-72 border"><EmptyHeader><EmptyMedia variant="icon"><BookOpenCheck /></EmptyMedia><EmptyTitle>Build your mastery map</EmptyTitle><EmptyDescription>Add curriculum areas above, or label Areas of Study while recording question results and mistakes.</EmptyDescription></EmptyHeader></Empty>}
    </div>
  )
}
