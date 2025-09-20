import { createPartFromUri, createUserContent } from "@google/genai";

import { ai } from "@/lib/gemini";
import { AppError, getErrorMessage, logError } from "@/lib/errors";
import { normalizeTranscriptSegments } from "@/lib/transcript";
import { isTrustedUri, isValidMediaType } from "@/lib/validators/mediaValidators";
import type { TranscriptRequestBody, TranscriptResponseBody } from "@/lib/types/api";

const TRANSCRIPT_MODEL = process.env.GEMINI_TRANSCRIPT_MODEL ?? "gemini-1.5-pro";
const MAX_TRANSCRIPT_SEGMENTS = 600;

const TRANSCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    language: { type: "string" },
    segments: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["startSec", "endSec", "text"],
        properties: {
          id: { type: "string" },
          startSec: { type: "number" },
          endSec: { type: "number" },
          text: { type: "string" },
          speaker: { type: "string" },
        },
      },
    },
  },
  required: ["segments"],
} as const;

export async function generateTranscript(body: TranscriptRequestBody): Promise<TranscriptResponseBody> {
  const { video, language } = body;

  if (!isTrustedUri(video.uri)) {
    throw new AppError("Untrusted video URI", { status: 400 });
  }
  if (!isValidMediaType(video.mimeType)) {
    throw new AppError("Invalid video content type", { status: 400 });
  }

  const instructions = [
    "You are an expert transcription engine. Produce a precise transcript aligned to timestamps.",
    "Respond strictly in JSON using the provided schema.",
    "Use decimal seconds for startSec and endSec. Round to one decimal place when appropriate.",
    "Combine short utterances from the same speaker when they are contiguous.",
    "Retain technical terms, UI labels, and spoken numbers verbatim.",
    language ? `Language hint: ${language}` : "Language: auto-detect.",
  ];

  const request = {
    model: TRANSCRIPT_MODEL,
    contents: createUserContent([
      instructions.join(" \n"),
      createPartFromUri(video.uri, video.mimeType),
    ]),
    config: {
      responseMimeType: "application/json",
      responseSchema: TRANSCRIPT_SCHEMA,
    },
  } as const;

  let responseText: string | undefined;

  try {
    const result = (await (ai as unknown as {
      models: { generateContent: (payload: typeof request) => Promise<{ text?: string; blocked?: boolean; finishReason?: string }> };
    }).models.generateContent(request)) as { text?: string; blocked?: boolean; finishReason?: string };

    if (result.blocked || !result.text) {
      const finish = result.finishReason && result.finishReason !== "STOP" ? ` finish=${result.finishReason}` : "";
      throw new AppError(`Gemini transcript request failed.${finish}`, { status: 502 });
    }

    responseText = result.text;
  } catch (error) {
    logError(error);
    throw new AppError(getErrorMessage(error, "Transcript generation failed"), { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText ?? "{}");
  } catch (error) {
    logError(error);
    throw new AppError("Transcript response was not valid JSON", { status: 500 });
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { segments?: unknown }).segments)) {
    throw new AppError("Transcript response missing segments", { status: 500 });
  }

  const rawSegments = (parsed as { segments: Array<Record<string, unknown>> }).segments.map((segment, index) => {
    const startSec = Number(segment.startSec ?? segment.start ?? segment.begin ?? 0);
    const endSec = Number(segment.endSec ?? segment.end ?? segment.stop ?? startSec);
    const text = typeof segment.text === "string" ? segment.text : "";
    const speaker = typeof segment.speaker === "string" ? segment.speaker : undefined;

    return {
      id: typeof segment.id === "string" ? segment.id : `seg-${index + 1}`,
      startSec,
      endSec,
      text,
      speaker,
    };
  });

  const normalized = normalizeTranscriptSegments(rawSegments).slice(0, MAX_TRANSCRIPT_SEGMENTS);
  if (normalized.length === 0) {
    throw new AppError("Transcript response did not include usable segments", { status: 500 });
  }

  return {
    transcript: {
      id: `transcript-${Date.now()}`,
      source: "generated",
      language: typeof (parsed as { language?: unknown }).language === "string" ? (parsed as { language?: string }).language : language,
      createdAt: Date.now(),
      segments: normalized.map(({ id, startSec, endSec, text, speaker }) => ({
        id,
        startSec,
        endSec,
        text,
        speaker,
      })),
    },
  };
}
