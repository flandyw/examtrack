import { createChatGPTProxyProvider } from "@opencoredev/loginwithchatgpt-ai"
import { jsonSchema, Output, streamText } from "ai"
import { MISTAKE_CATEGORIES, type AlternativeMistakeCard, type ExamAttempt, type Mistake, type MistakeCategory, type MistakeInsights } from "@/lib/exam-data"
import { loadAISettings } from "@/lib/ai-settings"
import { findVcaaExamForAttempt, type VcaaStudyResources } from "@/lib/vcaa-resources"

const MAX_IMAGE_BYTES = 3 * 1024 * 1024

export type MistakeDraft = {
  attemptId: string
  question: string
  questionText: string
  category: MistakeCategory
  explanation: string
  correction: string
}

export type ChatGPTProgress = {
  phase: "connecting" | "thinking" | "writing" | "complete"
  tokens: number
  estimated: boolean
  reasoning: boolean
}

type ProgressChunk = {
  type: string
  text?: string
  totalUsage?: {
    outputTokens?: number
    outputTokenDetails?: { reasoningTokens?: number }
  }
}

export function createChatGPTProgressHandler(onProgress?: (progress: ChatGPTProgress) => void) {
  let characters = 0
  let reasoning = false
  let phase: ChatGPTProgress["phase"] = "connecting"
  let last = ""
  return ({ chunk }: { chunk: ProgressChunk }) => {
    if (chunk.type === "reasoning-start" || chunk.type === "reasoning-delta") {
      phase = "thinking"
      reasoning = true
    } else if (chunk.type === "text-start" || chunk.type === "text-delta") {
      phase = "writing"
    }
    if ((chunk.type === "reasoning-delta" || chunk.type === "text-delta") && chunk.text) characters += chunk.text.length
    const finished = chunk.type === "finish"
    if (finished) {
      phase = "complete"
      reasoning ||= (chunk.totalUsage?.outputTokenDetails?.reasoningTokens ?? 0) > 0
    }
    const tokens = finished && chunk.totalUsage?.outputTokens !== undefined
      ? chunk.totalUsage.outputTokens
      : Math.ceil(characters / 4)
    const progress = { phase, tokens, estimated: !finished, reasoning }
    const key = JSON.stringify(progress)
    if (key !== last) onProgress?.(progress)
    last = key
  }
}

export function formatChatGPTProgress({ phase, tokens, estimated, reasoning }: ChatGPTProgress) {
  const status = phase === "connecting" ? "Connecting to ChatGPT" : phase === "thinking" ? "ChatGPT is thinking" : phase === "writing" ? "ChatGPT is writing" : "ChatGPT finished"
  return `${status} · ${estimated && tokens ? "~" : ""}${tokens} streamed tokens${reasoning ? " · reasoning detected" : ""}`
}

export function validateMistakeImage(file: Pick<File, "size" | "type">): string | null {
  if (!file.type.startsWith("image/")) return "Choose an image file."
  if (file.size > MAX_IMAGE_BYTES) return "Choose an image smaller than 3 MB."
  return null
}

export function validateMistakeImages(files: Pick<File, "size" | "type">[]): string | null {
  if (!files.length) return "Choose at least one image."
  for (const file of files) {
    const error = validateMistakeImage(file)
    if (error) return error
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_IMAGE_BYTES) return "Choose images totalling less than 3 MB."
  return null
}

export function selectChatGPTModel(models: string[], preferredModel = "auto"): string | null {
  if (preferredModel !== "auto" && models.includes(preferredModel)) return preferredModel
  return models[0] ?? null
}

async function getChatGPTModel() {
  const chatgpt = createChatGPTProxyProvider()
  let models: string[]
  try {
    models = await chatgpt.listModels()
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 401) {
      throw new Error("Connect ChatGPT in Settings first.")
    }
    throw error
  }
  const settings = loadAISettings()
  const model = selectChatGPTModel(models, settings.model)
  if (!model) throw new Error("This ChatGPT account has no available model.")
  return { chatgpt, model, settings }
}

function mistakeContext(mistakes: Mistake[], attempts: ExamAttempt[]) {
  const attemptMap = new Map(attempts.map((attempt) => [attempt.id, attempt]))
  return mistakes.map((mistake) => ({
    id: mistake.id,
    subject: attemptMap.get(mistake.attemptId)?.subject,
    exam: attemptMap.get(mistake.attemptId)?.title,
    question: mistake.question,
    questionText: mistake.questionText,
    category: mistake.category,
    explanation: mistake.explanation,
    correction: mistake.correction,
    areaOfStudy: mistake.areaOfStudy,
    criterion: mistake.criterion,
    marksLost: mistake.marksLost,
    totalMarks: mistake.totalMarks,
    resolved: mistake.resolved,
    reviewState: mistake.reviewState,
    dueAt: mistake.dueAt,
    intervalDays: mistake.intervalDays,
    lapses: mistake.lapses,
    suspended: mistake.suspended,
    reviews: mistake.reviewHistory?.map(({ result }) => result),
  }))
}

type GeneratedAlternativeMistakeCard = Omit<AlternativeMistakeCard, "generatedAt">

export async function generateAlternativeMistakeQuestions(mistakes: Mistake[], attempts: ExamAttempt[], onProgress?: (progress: ChatGPTProgress) => void): Promise<GeneratedAlternativeMistakeCard[]> {
  if (!mistakes.length) throw new Error("Log at least one mistake before generating an alternative deck.")
  onProgress?.({ phase: "connecting", tokens: 0, estimated: true, reasoning: false })
  const { chatgpt, model, settings } = await getChatGPTModel()
  const batches = Array.from({ length: Math.ceil(mistakes.length / 8) }, (_, index) => mistakes.slice(index * 8, index * 8 + 8))
  const generatedCards: GeneratedAlternativeMistakeCard[] = []

  for (const batch of batches) {
    const sourceIds = batch.map((mistake) => mistake.id)
    const schema = jsonSchema<{ cards: GeneratedAlternativeMistakeCard[] }>({
      type: "object",
      additionalProperties: false,
      required: ["cards"],
      properties: {
        cards: {
          type: "array",
          minItems: batch.length,
          maxItems: batch.length,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["sourceMistakeId", "skill", "question", "answer", "marks"],
            properties: {
              sourceMistakeId: { type: "string", enum: sourceIds },
              skill: { type: "string", description: "A short label for the knowledge or process skill being tested" },
              question: { type: "string", description: "A fully self-contained original question in Markdown, using LaTeX where useful" },
              answer: { type: "string", description: "A concise worked answer in Markdown, using LaTeX where useful" },
              marks: { type: "integer", minimum: 1, maximum: 20 },
            },
          },
        },
      },
    })
    const result = streamText({
      model: chatgpt(model),
      output: Output.object({ schema, name: "alternative_mistake_deck" }),
      maxOutputTokens: Math.max(1400, batch.length * 500),
      headers: { "x-login-with-chatgpt-reasoning-effort": settings.reasoningEffort },
      onChunk: createChatGPTProgressHandler(onProgress),
      prompt: `Create exactly one original alternative question for every mistake record. Each question must test the same underlying knowledge or process as its source, while changing the values, wording, scenario, or required reasoning enough that it cannot be answered by memorising the source. Keep the difficulty and curriculum level comparable. Make every question self-contained, assign a realistic mark value, and provide a correct worked answer based on the corrected method. Do not copy source wording or reproduce proprietary exam material. Return every source id exactly once. Records: ${JSON.stringify(mistakeContext(batch, attempts))}`,
    })
    const cards = (await result.output).cards
    const returnedIds = new Set(cards.map((card) => card.sourceMistakeId))
    if (cards.length !== sourceIds.length || returnedIds.size !== sourceIds.length || sourceIds.some((id) => !returnedIds.has(id))) {
      throw new Error("ChatGPT did not create one alternative for every mistake. Try generating the deck again.")
    }
    generatedCards.push(...cards)
  }

  return generatedCards.map((card) => ({
    ...card,
    skill: card.skill.trim(),
    question: card.question.trim(),
    answer: card.answer.trim(),
  }))
}

export async function analyseMistakes(mistakes: Mistake[], attempts: ExamAttempt[], onProgress?: (progress: ChatGPTProgress) => void): Promise<MistakeInsights> {
  if (!mistakes.length) throw new Error("Log at least one mistake before generating insights.")
  onProgress?.({ phase: "connecting", tokens: 0, estimated: true, reasoning: false })
  const { chatgpt, model, settings } = await getChatGPTModel()
  const schema = jsonSchema<Omit<MistakeInsights, "generatedAt" | "practiceQuestions" | "questionsGeneratedAt">>({
    type: "object",
    additionalProperties: false,
    required: ["summary", "biggestErrors", "otherInsights", "nextStep"],
    properties: {
      summary: { type: "string" },
      biggestErrors: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "evidence", "action"],
          properties: {
            title: { type: "string" },
            evidence: { type: "string" },
            action: { type: "string" },
          },
        },
      },
      otherInsights: { type: "array", maxItems: 3, items: { type: "string" } },
      nextStep: { type: "string" },
    },
  })
  const result = streamText({
    model: chatgpt(model),
    output: Output.object({ schema, name: "mistake_insights" }),
    maxOutputTokens: 900,
    headers: { "x-login-with-chatgpt-reasoning-effort": settings.reasoningEffort },
    onChunk: createChatGPTProgressHandler(onProgress),
    prompt: `Analyse this student's logged mistakes. Identify the most important recurring knowledge or process gaps, cite concise evidence from the records, notice useful patterns such as subjects, marks, resolution or review history, and give one practical next step. Do not claim a pattern unless the records support it. Use concise student-friendly plain text. Records: ${JSON.stringify(mistakeContext(mistakes, attempts))}`,
  })
  return { ...await result.output, generatedAt: new Date().toISOString() }
}

export async function generateMistakePracticeQuestions(insights: MistakeInsights, mistakes: Mistake[], attempts: ExamAttempt[], onProgress?: (progress: ChatGPTProgress) => void) {
  onProgress?.({ phase: "connecting", tokens: 0, estimated: true, reasoning: false })
  const { chatgpt, model, settings } = await getChatGPTModel()
  const schema = jsonSchema<{ practiceQuestions: string }>({
    type: "object",
    additionalProperties: false,
    required: ["practiceQuestions"],
    properties: {
      practiceQuestions: { type: "string", description: "A Markdown worksheet with 4-6 original questions using LaTeX for mathematical notation, followed by a separate answer section" },
    },
  })
  const { practiceQuestions: _oldQuestions, questionsGeneratedAt: _oldQuestionsGeneratedAt, ...diagnosis } = insights
  const result = streamText({
    model: chatgpt(model),
    output: Output.object({ schema, name: "practice_questions" }),
    maxOutputTokens: 1400,
    headers: { "x-login-with-chatgpt-reasoning-effort": settings.reasoningEffort },
    onChunk: createChatGPTProgressHandler(onProgress),
    prompt: `Create 4-6 original practice questions that directly target these diagnosed gaps. Use Markdown with valid LaTeX ($...$ and $$...$$), do not copy the logged questions, order from easier to harder, include marks, then put worked answers in a separate section. Insights: ${JSON.stringify(diagnosis)}. Records: ${JSON.stringify(mistakeContext(mistakes, attempts))}`,
  })
  return (await result.output).practiceQuestions.trim()
}

export async function analyseMistakeImages(
  files: File[],
  attempts: ExamAttempt[],
  selectedAttemptId: string,
  studies: VcaaStudyResources[],
  onProgress?: (progress: ChatGPTProgress) => void,
): Promise<MistakeDraft> {
  const validationError = validateMistakeImages(files)
  if (validationError) throw new Error(validationError)
  const selectedAttempt = attempts.find((attempt) => attempt.id === selectedAttemptId)
  if (!selectedAttempt) throw new Error("Choose the exam first so ChatGPT can use the correct paper.")
  const examPdf = findVcaaExamForAttempt(selectedAttempt, studies)
  if (selectedAttempt.provider.trim().toLowerCase() === "vcaa" && !examPdf) {
    throw new Error("This attempt could not be matched to an exam PDF in the VCAA library.")
  }

  onProgress?.({ phase: "connecting", tokens: 0, estimated: true, reasoning: false })
  const { chatgpt, model, settings } = await getChatGPTModel()

  const mistakeSchema = jsonSchema<MistakeDraft>({
    type: "object",
    additionalProperties: false,
    required: ["attemptId", "question", "questionText", "category", "explanation", "correction"],
    properties: {
      attemptId: { type: "string", enum: ["", ...attempts.map((attempt) => attempt.id)] },
      question: { type: "string", description: "Short question identifier, such as Question 4b" },
      questionText: { type: "string", description: "A fully self-contained, solvable version of the complete exam question, including every stem, stimulus, diagram, table, definition and referenced context needed to answer it, in Markdown with LaTeX where useful" },
      category: { type: "string", enum: [...MISTAKE_CATEGORIES] },
      explanation: { type: "string", description: "What the student did wrong, in concise Markdown with LaTeX where useful" },
      correction: { type: "string", description: "The correct method, in concise Markdown with LaTeX where useful" },
    },
  })
  const examOptions = attempts.map(({ id, subject, provider, title, examYear, paper }) => ({
    id, subject, provider, title, examYear, paper,
  }))

  const imageParts = await Promise.all(files.map(async (file) => ({
    type: "image" as const,
    image: await file.arrayBuffer(),
    mediaType: file.type,
  })))
  const result = streamText({
    model: chatgpt(model),
    output: Output.object({ schema: mistakeSchema, name: "mistake_log" }),
    maxOutputTokens: 1200,
    headers: { "x-login-with-chatgpt-reasoning-effort": settings.reasoningEffort },
    onChunk: createChatGPTProgressHandler(onProgress),
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: `Read all attached images of the student's question and working. The selected logged exam is ${JSON.stringify(selectedAttempt)}. ${examPdf ? "The attached official VCAA exam PDF is the source of truth: locate the exact question there and use it to restore anything cropped or omitted from the images." : "No official exam PDF is available, so use only the supplied images."} Fill every field for a study mistake log. questionText must stand alone and be solvable without the original paper: include the full stem plus all stimuli, diagrams, tables, definitions, subpart dependencies and other referenced context; describe non-text visuals precisely when needed. Never leave phrases such as 'using the information above' without including that information. Keep the explanation diagnostic and correction actionable, preserve mathematical notation as Markdown LaTeX, use an exact schema category, and use 'Question unclear' instead of inventing an unreadable question number. Available logged exams: ${JSON.stringify(examOptions)}.`,
        },
        ...(examPdf ? [{ type: "file" as const, data: new URL(examPdf.url), mediaType: "application/pdf", filename: examPdf.label }] : []),
        ...imageParts,
      ],
    }],
  })

  const draft = await result.output
  if (!draft.question.trim() || !draft.questionText.trim() || !draft.explanation.trim() || !draft.correction.trim()) {
    throw new Error("ChatGPT could not read enough of the supplied context to fill the mistake.")
  }
  return {
    ...draft,
    question: draft.question.trim(),
    questionText: draft.questionText.trim(),
    explanation: draft.explanation.trim(),
    correction: draft.correction.trim(),
  }
}
