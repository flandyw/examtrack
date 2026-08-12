import { useState, type FormEvent } from "react"
import { useLoginWithChatGPT } from "@opencoredev/loginwithchatgpt-react"
import { CheckCircle2, Copy, ExternalLink, Images, LogOut, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownPreview } from "@/components/markdown-preview"
import {
  GENERAL_MISTAKE_CATEGORIES,
  MATHEMATICS_MISTAKE_CATEGORIES,
  type ExamAttempt,
  type Mistake,
  type MistakeCategory,
  validateMistakeMarks,
} from "@/lib/exam-data"
import { analyseMistakeImageBatch, analyseMistakeImages, formatChatGPTProgress, validateMistakeBatchImages, validateMistakeImages, type ChatGPTProgress, type MistakeDraft } from "@/lib/mistake-ai"
import type { VcaaStudyResources } from "@/lib/vcaa-resources"

type MistakeSheetProps = {
  open: boolean
  attempts: ExamAttempt[]
  studies: VcaaStudyResources[]
  initialAttemptId?: string | null
  initialMistake?: Mistake | null
  onOpenChange: (open: boolean) => void
  onSave: (mistake: Mistake) => void
}

export function MistakeSheet({
  open,
  attempts,
  studies,
  initialAttemptId,
  initialMistake,
  onOpenChange,
  onSave,
}: MistakeSheetProps) {
  const auth = useLoginWithChatGPT()
  const [attemptId, setAttemptId] = useState(initialMistake?.attemptId ?? initialAttemptId ?? "")
  const [question, setQuestion] = useState(initialMistake?.question ?? "")
  const [questionText, setQuestionText] = useState(initialMistake?.questionText ?? "")
  const [category, setCategory] = useState<MistakeCategory>(initialMistake?.category ?? "Concept")
  const [explanation, setExplanation] = useState(initialMistake?.explanation ?? "")
  const [correction, setCorrection] = useState(initialMistake?.correction ?? "")
  const [areaOfStudy, setAreaOfStudy] = useState(initialMistake?.areaOfStudy ?? "")
  const [criterion, setCriterion] = useState(initialMistake?.criterion ?? "")
  const [totalMarks, setTotalMarks] = useState(initialMistake?.totalMarks ?? 0)
  const [marksLost, setMarksLost] = useState(initialMistake?.marksLost ?? 0)
  const [images, setImages] = useState<File[]>([])
  const [importMode, setImportMode] = useState<"single" | "batch">("single")
  const [batchDrafts, setBatchDrafts] = useState<MistakeDraft[]>([])
  const [activeBatchIndex, setActiveBatchIndex] = useState(0)
  const [analysing, setAnalysing] = useState(false)
  const [progress, setProgress] = useState<ChatGPTProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedAttempt = attemptId || initialAttemptId || ""
  const attemptOptions = attempts.map((attempt) => ({
    value: attempt.id,
    label: `${attempt.title} · ${attempt.paper}`,
  }))
  const selectedAttemptOption = attemptOptions.find((attempt) => attempt.value === selectedAttempt) ?? null

  function reset() {
    setAttemptId("")
    setQuestion("")
    setQuestionText("")
    setCategory("Concept")
    setExplanation("")
    setCorrection("")
    setAreaOfStudy("")
    setCriterion("")
    setTotalMarks(0)
    setMarksLost(0)
    setImages([])
    setImportMode("single")
    setBatchDrafts([])
    setActiveBatchIndex(0)
    setProgress(null)
    setError(null)
  }

  function applyDraft(draft: MistakeDraft) {
    if (draft.attemptId) setAttemptId(draft.attemptId)
    setQuestion(draft.question)
    setQuestionText(draft.questionText)
    setCategory(draft.category)
    setExplanation(draft.explanation)
    setCorrection(draft.correction)
    setAreaOfStudy(draft.areaOfStudy)
    setCriterion(draft.criterion)
    setTotalMarks(draft.totalMarks)
    setMarksLost(draft.marksLost)
  }

  async function analyse() {
    const validationError = importMode === "batch" ? validateMistakeBatchImages(images) : validateMistakeImages(images)
    if (validationError) return setError(validationError)

    setAnalysing(true)
    setError(null)
    try {
      if (importMode === "batch") {
        const drafts = await analyseMistakeImageBatch(images, attempts, selectedAttempt, studies, setProgress)
        setBatchDrafts(drafts)
        setActiveBatchIndex(0)
        applyDraft(drafts[0])
      } else {
        setBatchDrafts([])
        applyDraft(await analyseMistakeImages(images, attempts, selectedAttempt, studies, setProgress))
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not analyse this image.")
    } finally {
      setAnalysing(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const marksError = validateMistakeMarks(totalMarks, marksLost)
    if (!selectedAttempt || !question.trim() || !questionText.trim() || !explanation.trim() || !correction.trim()) {
      setError("Exam, item label, prompt, mistake, and improved response are required.")
      return
    }
    if (marksError) return setError(marksError)
    const timestamp = new Date().toISOString()
    const mistake: Mistake = {
      id: initialMistake?.id ?? crypto.randomUUID(),
      attemptId: selectedAttempt,
      question: question.trim(),
      questionText: questionText.trim(),
      category,
      explanation: explanation.trim(),
      correction: correction.trim(),
      areaOfStudy: areaOfStudy.trim() || undefined,
      criterion: criterion.trim() || undefined,
      totalMarks,
      marksLost,
      dueAt: initialMistake?.dueAt ?? timestamp,
      reviewHistory: initialMistake?.reviewHistory,
      reviewState: initialMistake?.reviewState,
      intervalDays: initialMistake?.intervalDays,
      easeFactor: initialMistake?.easeFactor,
      repetitions: initialMistake?.repetitions,
      lapses: initialMistake?.lapses,
      lastReviewedAt: initialMistake?.lastReviewedAt,
      suspended: initialMistake?.suspended,
      resolved: initialMistake?.resolved ?? false,
      createdAt: initialMistake?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
    onSave(mistake)
    const nextBatchIndex = activeBatchIndex + 1
    if (!initialMistake && batchDrafts.length > nextBatchIndex) {
      setActiveBatchIndex(nextBatchIndex)
      applyDraft(batchDrafts[nextBatchIndex])
      setProgress(null)
      setError(null)
      return
    }
    reset()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent resizable className="w-full">
        <SheetHeader>
          <SheetTitle>{initialMistake ? "Edit mistake" : "Log mistake"}</SheetTitle>
          <SheetDescription>
            Capture any knowledge, reasoning, evidence, expression, process, or accuracy issue. Markdown and optional LaTeX are supported.
          </SheetDescription>
        </SheetHeader>
        <form id="mistake-form" className="px-4 pb-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="mistake-image">Prompt, response, and feedback images</FieldLabel>
              {!initialMistake ? (
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
                  <Button type="button" size="sm" variant={importMode === "single" ? "secondary" : "ghost"} disabled={analysing || batchDrafts.length > 0} onClick={() => { setImportMode("single"); setBatchDrafts([]); setActiveBatchIndex(0); setProgress(null); setError(null) }}>
                    <Sparkles />One mistake
                  </Button>
                  <Button type="button" size="sm" variant={importMode === "batch" ? "secondary" : "ghost"} disabled={analysing || batchDrafts.length > 0} onClick={() => { setImportMode("batch"); setBatchDrafts([]); setActiveBatchIndex(0); setProgress(null); setError(null) }}>
                    <Images />Separate questions
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="mistake-image"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={analysing || batchDrafts.length > 0}
                  onChange={(event) => {
                    setImages(Array.from(event.target.files ?? []))
                    setBatchDrafts([])
                    setActiveBatchIndex(0)
                    setProgress(null)
                    setError(null)
                  }}
                />
                <Button type="button" variant="secondary" disabled={!images.length || !selectedAttempt || analysing || batchDrafts.length > 0 || !auth.isAuthenticated} onClick={() => void analyse()}>
                  <Sparkles />{analysing ? "Analysing…" : importMode === "batch" ? `Import ${images.length || ""} questions` : "Fill with AI"}
                </Button>
              </div>
              <FieldDescription>{importMode === "batch" ? "Choose the shared exam, then add 2–10 images. Each image becomes a separate mistake in the same order; each can be up to 3 MB and the batch up to 15 MB." : "Choose the exam, then upload one or more related images totalling up to 3 MB. Matching VCAA attempts also include the official exam PDF for context."}</FieldDescription>
              {batchDrafts.length ? <p role="status" className="text-sm font-medium">Reviewing question {activeBatchIndex + 1} of {batchDrafts.length}. Saving will advance to the next one.</p> : null}
              {progress ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground tabular-nums">{formatChatGPTProgress(progress)}</p> : null}
              <div className="rounded-lg border bg-muted/30 p-3">
                {auth.status === "loading" ? <p className="text-sm text-muted-foreground">Checking ChatGPT connection…</p> : null}

                {auth.isAuthenticated ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span className="truncate text-sm font-medium">Connected{auth.user?.email ? ` as ${auth.user.email}` : ""}</span>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void auth.logout()}><LogOut />Disconnect</Button>
                  </div>
                ) : null}

                {auth.status === "pending" ? (
                  <div className="grid gap-3">
                    <p className="text-sm">Enter <strong className="font-mono">{auth.userCode}</strong> in the ChatGPT authorization window.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void auth.copyCode()}><Copy />{auth.copied ? "Copied" : "Copy code"}</Button>
                      <Button size="sm" variant="outline" render={<a href={auth.verificationUrl} target="_blank" rel="noopener noreferrer" />}><ExternalLink />Reopen</Button>
                    </div>
                  </div>
                ) : null}

                {auth.status !== "loading" && !auth.isAuthenticated && auth.status !== "pending" ? (
                  <div className="grid gap-3">
                    <p className="text-sm leading-5 text-muted-foreground">AI requests use your ChatGPT plan. The photo passes through this server; ExamTrack never receives your password, and disconnecting deletes the session.</p>
                    <div>
                      <Button type="button" size="sm" variant="outline" disabled={auth.isConnecting} onClick={() => void auth.login({ popup: window.open("about:blank", "_blank") })}>
                        <Sparkles />{auth.isConnecting ? "Connecting…" : "I understand, connect ChatGPT"}
                      </Button>
                    </div>
                    {auth.error ? <p role="alert" className="text-sm text-destructive">{auth.error}</p> : null}
                  </div>
                ) : null}
              </div>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="mistake-exam">Exam</FieldLabel>
                <Combobox items={attemptOptions} value={selectedAttemptOption} onValueChange={(value) => setAttemptId(value?.value ?? "")} autoHighlight>
                  <ComboboxInput id="mistake-exam" className="w-full" placeholder="Search practice exams" />
                  <ComboboxContent>
                    <ComboboxEmpty>No matching practice exams.</ComboboxEmpty>
                    <ComboboxList>{(item) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}</ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </Field>
              <Field>
                <FieldLabel htmlFor="question">Item label</FieldLabel>
                <Input id="question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Section B, Question 4 or Essay 1" />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="mistake-total-marks">Total marks</FieldLabel>
                <Input id="mistake-total-marks" type="number" min="0.5" step="0.5" value={totalMarks || ""} onChange={(event) => setTotalMarks(event.target.valueAsNumber)} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="mistake-marks-lost">Marks lost</FieldLabel>
                <Input id="mistake-marks-lost" type="number" min="0" step="0.5" value={marksLost} onChange={(event) => setMarksLost(event.target.valueAsNumber)} required />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="question-text">Prompt or task</FieldLabel>
              <Textarea id="question-text" rows={4} value={questionText} onChange={(event) => setQuestionText(event.target.value)} placeholder="Enter the full question, essay prompt, stimulus task, or practical requirement." />
              <MarkdownPreview>{questionText}</MarkdownPreview>
            </Field>

            <Field>
              <FieldLabel>Category</FieldLabel>
              <Select value={category} onValueChange={(value) => setCategory(value as MistakeCategory)}>
                <SelectTrigger className="w-full"><SelectValue>{category}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>All subjects</SelectLabel>
                    {GENERAL_MISTAKE_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Mathematics-specific</SelectLabel>
                    {MATHEMATICS_MISTAKE_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="mistake-area">Topic, skill, or Area of Study <span className="text-muted-foreground">(optional)</span></FieldLabel>
                <Input id="mistake-area" value={areaOfStudy} onChange={(event) => setAreaOfStudy(event.target.value)} placeholder="e.g. Cellular respiration, argument analysis, or a key process" />
              </Field>
              <Field>
                <FieldLabel htmlFor="mistake-criterion">Assessment criterion <span className="text-muted-foreground">(optional)</span></FieldLabel>
                <Input id="mistake-criterion" value={criterion} onChange={(event) => setCriterion(event.target.value)} placeholder="Use evidence precisely" />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="explanation">What went wrong?</FieldLabel>
              <Textarea id="explanation" rows={5} value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Describe the gap: what was misunderstood, omitted, unsupported, unclear, or done inaccurately?" />
              <FieldDescription>Describe the error precisely enough to recognise it next time.</FieldDescription>
              <MarkdownPreview>{explanation}</MarkdownPreview>
            </Field>

            <Field>
              <FieldLabel htmlFor="correction">Improved response or method</FieldLabel>
              <Textarea id="correction" rows={5} value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="Write the correct idea, evidence, structure, process, or answer you should use next time." />
              <MarkdownPreview>{correction}</MarkdownPreview>
            </Field>
            <FieldError>{error}</FieldError>
          </FieldGroup>
        </form>
        <SheetFooter>
          <Button type="submit" form="mistake-form" disabled={attempts.length === 0 || analysing}>{initialMistake ? "Save changes" : batchDrafts.length > activeBatchIndex + 1 ? "Save & review next" : batchDrafts.length ? "Save final mistake" : "Save mistake"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
