import { describe, expect, test } from "bun:test"
import { createChatGPTProgressHandler, formatMistakeAIError, orderMistakeBatchDrafts, selectChatGPTModel, validateMistakeBatchImages, validateMistakeImage, validateMistakeImages } from "../src/lib/mistake-ai"

describe("mistake image analysis", () => {
  test("validates uploads and chooses from the account's available models", () => {
    expect(validateMistakeImage({ type: "application/pdf", size: 100 })).toBe("Choose an image file.")
    expect(validateMistakeImage({ type: "image/jpeg", size: 4 * 1024 * 1024 })).toBe("Choose an image smaller than 3 MB.")
    expect(validateMistakeImage({ type: "image/jpeg", size: 100 })).toBeNull()
    expect(validateMistakeImages([{ type: "image/jpeg", size: 2 * 1024 * 1024 }, { type: "image/png", size: 2 * 1024 * 1024 }])).toBe("Choose images totalling less than 3 MB.")
    expect(validateMistakeBatchImages([{ type: "image/jpeg", size: 2 * 1024 * 1024 }])).toBe("Choose at least two images for a batch import.")
    expect(validateMistakeBatchImages(Array.from({ length: 5 }, () => ({ type: "image/jpeg", size: 2 * 1024 * 1024 })))).toBeNull()
    expect(validateMistakeBatchImages(Array.from({ length: 11 }, () => ({ type: "image/jpeg", size: 100 })))).toBe("Choose no more than 10 images at once.")
    expect(selectChatGPTModel(["gpt-5.6-sol", "gpt-5.5"])).toBe("gpt-5.6-sol")
    expect(selectChatGPTModel(["gpt-5.4-mini", "gpt-5.5"], "gpt-5.4-mini")).toBe("gpt-5.4-mini")
    expect(selectChatGPTModel(["gpt-5.5-pro", "gpt-5.5"])).toBe("gpt-5.5")
    expect(selectChatGPTModel(["gpt-5.5-pro"], "gpt-5.5-pro")).toBeNull()
    expect(selectChatGPTModel(["account-specific-model"])).toBe("account-specific-model")
    expect(selectChatGPTModel([])).toBeNull()
  })

  test("turns proxy failures into useful messages", () => {
    expect(formatMistakeAIError({ statusCode: 400, responseBody: '{"detail":"Streaming is not supported"}' })).toContain("does not support streamed analysis")
    expect(formatMistakeAIError({ statusCode: 413, responseBody: '{"error":"responses_request_too_large"}' })).toContain("too large")
    expect(formatMistakeAIError({ statusCode: 429 })).toContain("Wait a minute")
  })

  test("keeps batch drafts in image order and requires one valid result per image", () => {
    const draft = (imageIndex: number, question: string) => ({
      imageIndex,
      attemptId: "exam-1",
      question,
      questionText: `Prompt ${question}`,
      category: "Concept" as const,
      explanation: "Missed the key idea",
      correction: "Use the key idea",
      areaOfStudy: "Topic",
      criterion: "Accuracy",
      totalMarks: 4,
      marksLost: 1,
    })
    expect(orderMistakeBatchDrafts([draft(1, "Question 2"), draft(0, "Question 1")], 2).map(({ question }) => question)).toEqual(["Question 1", "Question 2"])
    expect(() => orderMistakeBatchDrafts([draft(0, "Question 1"), draft(0, "Duplicate")], 2)).toThrow("one mistake for every image")
    expect(() => orderMistakeBatchDrafts([{ ...draft(0, "Question 1"), marksLost: 5 }], 1)).toThrow("invalid marks")
  })

  test("reports streamed tokens and detected reasoning", () => {
    const updates: unknown[] = []
    const onChunk = createChatGPTProgressHandler((progress) => updates.push(progress))
    onChunk({ chunk: { type: "reasoning-delta", text: "think" } })
    onChunk({ chunk: { type: "text-delta", text: "answer" } })
    onChunk({ chunk: { type: "finish", totalUsage: { outputTokens: 12, outputTokenDetails: { reasoningTokens: 4 } } } })
    expect(updates).toEqual([
      { phase: "thinking", tokens: 2, estimated: true, reasoning: true },
      { phase: "writing", tokens: 3, estimated: true, reasoning: true },
      { phase: "complete", tokens: 12, estimated: false, reasoning: true },
    ])
  })
})
