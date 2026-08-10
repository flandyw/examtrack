import { useMemo, useState } from "react"
import { Check, ExternalLink, Play, Search } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SubjectCombobox } from "@/components/subject-combobox"
import { PageHeader } from "@/components/page-header"
import { normaliseComparisonName, type AssessmentReference, type ExamAttempt } from "@/lib/exam-data"
import type { ExamTimerPreset } from "@/components/exam-timer"
import { firstPreferredSubject, prioritiseSubjects } from "@/lib/subjects"
import { findVcaaExamReference, formatReferenceFreshness, getVcaaExamPaper, getVcaaExamResourcesUrl, getVcaaExams, isVcaaExamLogged, type VcaaExamResource, type VcaaResource, type VcaaStudyResources } from "@/lib/vcaa-resources"

function pickResource(resources: VcaaResource[], kind: VcaaResource["kind"], exam: VcaaExamResource) {
  const candidates = resources.filter((resource) => resource.kind === kind && (resource.year === exam.year || resource.year === null))
  const paper = normaliseComparisonName(getVcaaExamPaper(exam))
  return candidates.find((resource) => normaliseComparisonName(resource.label).includes(paper)) ?? candidates[0]
}

export function ExamLibrary({ references, studies, attempts, completedExamIds, generatedAt, preferredSubjects, onToggleCompleted, onStart }: { references: AssessmentReference[]; studies: VcaaStudyResources[]; attempts: ExamAttempt[]; completedExamIds: string[]; generatedAt: string | null; preferredSubjects: string[]; onToggleCompleted: (id: string) => void; onStart: (preset: ExamTimerPreset) => void }) {
  const exams = useMemo(() => getVcaaExams(studies), [studies])
  const subjects = useMemo(() => prioritiseSubjects(exams.map((exam) => exam.studyName), preferredSubjects), [exams, preferredSubjects])
  const [subject, setSubject] = useState(() => firstPreferredSubject(subjects, preferredSubjects) || "all")
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const priorities = new Map(preferredSubjects.map((item, index) => [normaliseComparisonName(item), index]))
    return exams.filter((exam) =>
      (subject === "all" || exam.studyName === subject) &&
      `${exam.studyName} ${exam.year} ${exam.label}`.toLowerCase().includes(query.trim().toLowerCase()),
    ).toSorted((first, second) =>
      (priorities.get(normaliseComparisonName(first.studyName)) ?? Infinity) - (priorities.get(normaliseComparisonName(second.studyName)) ?? Infinity) ||
      (second.year ?? 0) - (first.year ?? 0) || first.label.localeCompare(second.label))
  }, [exams, preferredSubjects, query, subject])
  const resourcesByStudy = useMemo(() => new Map(studies.map((study) => [normaliseComparisonName(study.studyName), study])), [studies])

  return (
    <div className="grid gap-6">
      <PageHeader title="Exam library" description="Choose an official VCAA assessment reference, open the source material, or launch a correctly named timed attempt." />
      <Alert>
        <Search />
        <AlertTitle>Confirm the current study design before using an older paper</AlertTitle>
        <AlertDescription>VCAA publishes examination specifications, sample papers, assessment guides and external assessment reports on each study page. <a className="font-medium underline underline-offset-4" href={getVcaaExamResourcesUrl()} target="_blank" rel="noreferrer">Browse official study resources</a>.</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-3">
        <SubjectCombobox subjects={subjects} preferredSubjects={preferredSubjects} value={subject} onValueChange={setSubject} includeAll className="w-full sm:w-72" placeholder="Search subjects" />
        <Input className="w-full sm:max-w-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subject, year or paper" aria-label="Search exam library" />
        <span className="self-center text-sm text-muted-foreground">{filtered.length} exams · {formatReferenceFreshness(generatedAt)}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((exam) => {
          const study = resourcesByStudy.get(normaliseComparisonName(exam.studyName))
          const reference = findVcaaExamReference(exam, references)
          const report = pickResource(study?.resources ?? [], "report", exam)
          const specification = pickResource(study?.resources ?? [], "specification", exam)
          const logged = isVcaaExamLogged(exam, attempts)
          const manuallyCompleted = completedExamIds.includes(exam.url)
          const completed = logged || manuallyCompleted
          return (
          <Card key={exam.url} className="min-w-0">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><CardTitle>{exam.studyName}</CardTitle><CardDescription>{exam.year ?? "Unknown year"} · {getVcaaExamPaper(exam)}</CardDescription></div>
                <div className="flex gap-2">{completed ? <Badge><Check />{logged ? "Logged" : "Done"}</Badge> : null}{reference ? <Badge variant="outline">{reference.maxScore} marks</Badge> : <Badge variant="secondary">Archive · no distribution</Badge>}</div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {exam.year !== null ? <Button onClick={() => onStart({ subject: exam.studyName, provider: "VCAA", examYear: exam.year!, paper: getVcaaExamPaper(exam), marks: reference?.maxScore ?? 100 })}><Play />Start timed attempt</Button> : null}
              <Button variant="outline" render={<a href={exam.url} target="_blank" rel="noreferrer" />}><ExternalLink />Exam paper</Button>
              {report ? <Button variant="outline" render={<a href={report.url} target="_blank" rel="noreferrer" />}><ExternalLink />Examiner report</Button> : null}
              {specification ? <Button variant="ghost" render={<a href={specification.url} target="_blank" rel="noreferrer" />}><ExternalLink />Specifications</Button> : null}
              {reference ? <Button variant="ghost" render={<a href={reference.sourceUrl} target="_blank" rel="noreferrer" />}><ExternalLink />Distribution</Button> : null}
              {!logged ? <Button variant="ghost" onClick={() => onToggleCompleted(exam.url)}><Check />{manuallyCompleted ? "Mark not done" : "Mark done"}</Button> : null}
            </CardContent>
          </Card>
        )})}
      </div>
      {!filtered.length ? <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">No matching VCAA exams.</p> : null}
    </div>
  )
}
