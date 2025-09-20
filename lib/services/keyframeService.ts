import { createPartFromUri, createUserContent } from "@google/genai";

import { ai } from "@/lib/gemini";
import { AppError, getErrorMessage, logError } from "@/lib/errors";
import { toTimecode } from "@/lib/format";
import type { KeyframeRequestBody, KeyframeResponseBody } from "@/lib/types/api";
import { isTrustedUri, isValidMediaType } from "@/lib/validators/mediaValidators";

const KEYFRAME_MODEL = process.env.GEMINI_KEYFRAME_MODEL ?? "gemini-1.5-pro";
const MAX_SUGGESTIONS_DEFAULT = 8;

const KEYFRAME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["timeSec"],
        properties: {
          timeSec: { type: "number" },
          timecode: { type: "string" },
          description: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

export async function generateKeyframeSuggestions(body: KeyframeRequestBody): Promise<KeyframeResponseBody> {
  const { video } = body;
  const maxSuggestions = Math.max(1, Math.min(body.maxSuggestions ?? MAX_SUGGESTIONS_DEFAULT, 12));

  if (!isTrustedUri(video.uri)) {
    throw new AppError("Untrusted video URI", { status: 400 });
  }
  if (!isValidMediaType(video.mimeType)) {
    throw new AppError("Invalid video content type", { status: 400 });
  }

  const instructions = [
    "You are assisting with tutorial documentation.",
    `Identify up to ${maxSuggestions} key visual frames from the attached video.`,
    "Favor moments showing UI transitions, completed actions, or scene changes.",
    "Return JSON only, matching the provided schema.",
    "Sort the frames in ascending time order.",
    "Provide concise human-readable descriptions (<= 12 words).",
    "Include a confidence score between 0 and 1.",
  ].join("\n");

  const request = {
    model: KEYFRAME_MODEL,
    contents: createUserContent([instructions, createPartFromUri(video.uri, video.mimeType)]),
    config: {
      responseMimeType: "application/json",
      responseSchema: KEYFRAME_SCHEMA,
    },
  } as const;

  let responseText: string | undefined;
  try {
    const result = (await (ai as unknown as {
      models: { generateContent: (payload: typeof request) => Promise<{ text?: string; blocked?: boolean; finishReason?: string }> };
    }).models.generateContent(request)) as { text?: string; blocked?: boolean; finishReason?: string };

    if (result.blocked || !result.text) {
      const reason = result.finishReason && result.finishReason !== "STOP" ? ` finish=${result.finishReason}` : "";
      throw new AppError(`Gemini keyframe request failed.${reason}`, { status: 502 });
    }

    responseText = result.text;
  } catch (error) {
    logError(error);
    throw new AppError(getErrorMessage(error, "Keyframe suggestion failed"), { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText ?? "{}");
  } catch (error) {
    logError(error);
    throw new AppError("Keyframe response was not valid JSON", { status: 500 });
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { suggestions?: unknown }).suggestions)) {
    throw new AppError("Keyframe response missing suggestions", { status: 500 });
  }

  const suggestions = (parsed as { suggestions: Array<Record<string, unknown>> }).suggestions
    .map((entry, index) => {
      const timeSec = Number(entry.timeSec ?? entry.time ?? index);
      if (!Number.isFinite(timeSec) || timeSec < 0) return null;
      const description = typeof entry.description === "string" ? entry.description.trim() : undefined;
      const confidenceRaw = Number(entry.confidence);
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(1, confidenceRaw))
        : undefined;
      const timecode = typeof entry.timecode === "string" ? entry.timecode : toTimecode(timeSec);
      return {
        timeSec,
        timecode,
        description,
        confidence,
      };
    })
    .filter((item): item is { timeSec: number; timecode: string; description?: string; confidence?: number } => Boolean(item))
    .sort((a, b) => a.timeSec - b.timeSec)
    .slice(0, maxSuggestions);

  return { suggestions };
}
