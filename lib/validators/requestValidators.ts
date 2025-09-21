// lib/validators/requestValidators.ts
import { ValidationError } from "@/lib/errors";
import {
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_SCREENSHOT_COUNT,
  MAX_SCREENSHOT_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  SCREENSHOT_DATA_URL_PATTERN,
} from "@/lib/constants/uploads";
import type {
  GenerateRequestBody,
  ExportRequestBody,
  UploadImagesRequestBody,
  ExportOptions,
  ExportDocumentOptions,
  ExportImageOptions,
  TranscriptPayload,
  TranscriptRequestBody,
  KeyframeRequestBody,
} from "@/lib/types/api";
import type { TranscriptSegmentPayload } from "@/lib/types/api";
import type { SchemaType, PromptMode, TranscriptSource } from "@/lib/types";

function isSchemaType(v: unknown): v is SchemaType {
  return typeof v === "string" && v.trim().length > 0;
}

function isPromptMode(v: unknown): v is PromptMode {
  return v === "manual" || v === "dspy";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireFileFromForm(form: FormData): File {
  const file = form.get("file") as unknown as File | null;
  if (!file) {
    throw new ValidationError("Missing video file");
  }
  if (typeof file.size === "number") {
    if (file.size <= 0) {
      throw new ValidationError("Video file is empty");
    }
    if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
      throw new ValidationError(
        `Video file exceeds ${(MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)}MB limit`,
      );
    }
  }

  const type = typeof file.type === "string" ? file.type.toLowerCase() : "";
  const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
  const extension = (() => {
    if (!name) return "";
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot) : "";
  })();

  const typeAllowed = type ? ALLOWED_VIDEO_MIME_TYPES.has(type) || type.startsWith("video/") : false;
  const extensionAllowed = extension ? ALLOWED_VIDEO_EXTENSIONS.has(extension) : false;

  if (!typeAllowed && !extensionAllowed) {
    throw new ValidationError("Unsupported video type");
  }

  return file;
}

function isTranscriptSource(value: unknown): value is TranscriptSource {
  return value === "uploaded" || value === "generated";
}

function parseTranscriptSegments(value: unknown): TranscriptSegmentPayload[] {
  if (!Array.isArray(value)) {
    throw new ValidationError("Transcript segments must be an array");
  }
  return value.map((segment, index) => {
    if (!segment || typeof segment !== "object") {
      throw new ValidationError(`Transcript segment ${index + 1} is invalid`);
    }
    const s = segment as Record<string, unknown>;
    const id = typeof s.id === "string" && s.id.trim() ? s.id.trim() : `seg-${index + 1}`;
    const startSec = Number(s.startSec);
    const endSec = Number(s.endSec);
    const text = typeof s.text === "string" ? s.text.trim() : "";
    const speaker = typeof s.speaker === "string" && s.speaker.trim() ? s.speaker.trim() : undefined;

    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
      throw new ValidationError(`Transcript segment ${index + 1} has invalid timestamps`);
    }
    if (startSec < 0 || endSec < 0 || endSec < startSec) {
      throw new ValidationError(`Transcript segment ${index + 1} has inconsistent timestamps`);
    }
    if (!text) {
      throw new ValidationError(`Transcript segment ${index + 1} is missing text`);
    }

    return { id, startSec, endSec, text, speaker };
  });
}

function parseTranscriptPayload(value: unknown, allowUndefined = true): TranscriptPayload | undefined {
  if (value == null) {
    if (allowUndefined) return undefined;
    throw new ValidationError("Transcript payload missing");
  }
  if (typeof value !== "object") {
    throw new ValidationError("Transcript payload must be an object");
  }
  const payload = value as Record<string, unknown>;
  const source = payload.source;
  if (!isTranscriptSource(source)) {
    throw new ValidationError("Transcript payload missing valid source");
  }
  const segments = parseTranscriptSegments(payload.segments);
  const language = typeof payload.language === "string" ? payload.language : undefined;
  const fileName = typeof payload.fileName === "string" ? payload.fileName : undefined;
  const id = typeof payload.id === "string" ? payload.id : undefined;
  const createdAt = Number(payload.createdAt);
  const sanitizedCreatedAt = Number.isFinite(createdAt) ? createdAt : Date.now();

  return {
    id,
    source,
    segments,
    language,
    fileName,
    createdAt: sanitizedCreatedAt,
  };
}

export function parseGenerateRequest(body: unknown): GenerateRequestBody {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid request body");
  }
  const b = body as Record<string, unknown>;
  const video = b.video;
  const screenshots = b.screenshots;

  if (!video || typeof video !== "object" || typeof video.uri !== "string" || typeof video.mimeType !== "string") {
    throw new ValidationError("Invalid or missing video reference");
  }
  if (!Array.isArray(screenshots)) {
    throw new ValidationError("Invalid screenshots payload");
  }
  for (const s of screenshots) {
    if (
      !s ||
      typeof s !== "object" ||
      typeof s.id !== "string" ||
      typeof s.uri !== "string" ||
      typeof s.mimeType !== "string" ||
      typeof s.timecode !== "string"
    ) {
      throw new ValidationError("Invalid screenshot reference");
    }
  }

  const enforceSchema = Boolean(b.enforceSchema);
  const titleHint = typeof b.titleHint === "string" ? b.titleHint : undefined;
  const schemaType = isSchemaType(b.schemaType) ? (b.schemaType as string).trim() : (undefined as unknown as SchemaType | undefined);
  const promptMode = isPromptMode(b.promptMode) ? b.promptMode : (undefined as unknown as PromptMode | undefined);
  let shots: GenerateRequestBody["shots"];
  if (Array.isArray(b.shots)) {
    shots = b.shots.map((shot, index) => {
      if (!shot || typeof shot !== "object") {
        throw new ValidationError(`Invalid shot entry at index ${index}`);
      }
      const s = shot as Record<string, unknown>;
      if (typeof s.id !== "string" || !s.id) {
        throw new ValidationError(`Shot ${index + 1} is missing an id`);
      }
      const timecode = typeof s.timecode === "string" ? s.timecode : undefined;
      const timeSec = typeof s.timeSec === "number" && Number.isFinite(s.timeSec) ? s.timeSec : undefined;
      const label = typeof s.label === "string" ? s.label : undefined;
      const note = typeof s.note === "string" ? s.note : undefined;
      const transcriptSegmentId = typeof s.transcriptSegmentId === "string" ? s.transcriptSegmentId : undefined;
      const transcriptSnippet = typeof s.transcriptSnippet === "string" ? s.transcriptSnippet : undefined;
      const origin = s.origin === "manual" || s.origin === "suggested" ? s.origin : undefined;

      return { id: s.id, timecode, timeSec, label, note, transcriptSegmentId, transcriptSnippet, origin };
    });
  }
  const transcript = parseTranscriptPayload(b.transcript);
  const dspyOptions = b.dspyOptions && typeof b.dspyOptions === "object" ? (b.dspyOptions as GenerateRequestBody["dspyOptions"]) : undefined;
  const promoteBaseline = Boolean(b.promoteBaseline);

  return {
    video,
    screenshots,
    enforceSchema,
    titleHint,
    schemaType,
    promptMode,
    shots,
    transcript,
    dspyOptions,
    promoteBaseline,
  };
}

export function parseExportRequest(body: unknown): ExportRequestBody {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid export payload");
  }
  const b = body as Record<string, unknown>;

  if (!isSchemaType(b.schemaType)) {
    throw new ValidationError("Invalid or missing schemaType");
  }
  const schemaType = (b.schemaType as string).trim() as SchemaType;
  const enforceSchema = Boolean(b.enforceSchema);

  let structuredResult: ExportRequestBody["structuredResult"];
  if (b.structuredResult !== undefined) {
    if (!isPlainObject(b.structuredResult)) {
      throw new ValidationError("structuredResult must be an object when provided");
    }
    const sr = b.structuredResult as Record<string, unknown>;
    const templateId = typeof sr.templateId === "string" && sr.templateId.trim() ? sr.templateId.trim() : null;
    if (!templateId) {
      throw new ValidationError("structuredResult.templateId is required");
    }
    if (!isPlainObject(sr.data)) {
      throw new ValidationError("structuredResult.data must be an object");
    }
    structuredResult = {
      templateId,
      data: sr.data as Record<string, unknown>,
    };
  }

  const legacyResultText = typeof b.resultText === "string" ? b.resultText : undefined;
  const rawText = typeof b.rawText === "string" ? b.rawText : legacyResultText;

  if (!structuredResult && (rawText === undefined || rawText.trim().length === 0)) {
    throw new ValidationError("Export request requires structuredResult or rawText");
  }

  const shots = Array.isArray(b.shots) ? b.shots : [];
  for (const s of shots) {
    if (
      !s ||
      typeof s !== "object" ||
      typeof s.id !== "string" ||
      typeof s.timecode !== "string" ||
      typeof s.dataUrl !== "string"
    ) {
      throw new ValidationError("Invalid shot entry in export request");
    }
  }

  // Parse and validate optional export options with sensible defaults
  const rawOptions =
    b.options && typeof b.options === "object" ? (b.options as Record<string, unknown>) : {};
  const docRaw =
    rawOptions.document && typeof rawOptions.document === "object"
      ? (rawOptions.document as Record<string, unknown>)
      : {};
  const imgRaw =
    rawOptions.image && typeof rawOptions.image === "object"
      ? (rawOptions.image as Record<string, unknown>)
      : {};

  const toNumber = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN);

  const keywords = Array.isArray(docRaw.keywords)
    ? docRaw.keywords.filter((keyword): keyword is string => typeof keyword === "string")
    : undefined;

  const document: ExportDocumentOptions = {
    includeAppendix: typeof docRaw.includeAppendix === "boolean" ? docRaw.includeAppendix : true,
    includeTOC: typeof docRaw.includeTOC === "boolean" ? docRaw.includeTOC : true,
    includeCover: typeof docRaw.includeCover === "boolean" ? docRaw.includeCover : false,
    runningTitle: typeof docRaw.runningTitle === "string" ? docRaw.runningTitle : undefined,
    author: typeof docRaw.author === "string" ? docRaw.author : undefined,
    subject: typeof docRaw.subject === "string" ? docRaw.subject : undefined,
    keywords,
    linkifyUrls: typeof docRaw.linkifyUrls === "boolean" ? docRaw.linkifyUrls : true,
    language: typeof docRaw.language === "string" ? docRaw.language : undefined,
    headingStartOnNewPage:
      typeof docRaw.headingStartOnNewPage === "boolean" ? docRaw.headingStartOnNewPage : false,
    pageNumberOffset: Number.isFinite(toNumber(docRaw.pageNumberOffset))
      ? Number(toNumber(docRaw.pageNumberOffset))
      : 0,
  };

  const imgFormat = imgRaw.format === "png" || imgRaw.format === "jpeg" ? imgRaw.format : "jpeg";
  const imgQualityRaw = toNumber(imgRaw.quality);
  const imgMaxWidthRaw = toNumber(imgRaw.maxWidth);
  const imgMaxHeightRaw = toNumber(imgRaw.maxHeight);

  const image: ExportImageOptions = {
    format: imgFormat,
    quality: Number.isFinite(imgQualityRaw) ? Math.max(0, Math.min(1, imgQualityRaw)) : 0.82,
    maxWidth: Number.isFinite(imgMaxWidthRaw) ? Math.max(1, Math.floor(imgMaxWidthRaw)) : 1280,
    maxHeight: Number.isFinite(imgMaxHeightRaw) ? Math.max(1, Math.floor(imgMaxHeightRaw)) : undefined,
    progressive: typeof imgRaw.progressive === "boolean" ? imgRaw.progressive : true,
  };

  const options: ExportOptions = {
    document,
    image,
  };

  return {
    schemaType,
    enforceSchema,
    structuredResult,
    rawText,
    resultText: legacyResultText,
    shots,
    options,
  };
}

export function parseTranscriptRequest(body: unknown): TranscriptRequestBody {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid transcript payload");
  }
  const b = body as Record<string, unknown>;
  const video = b.video;
  if (!video || typeof video !== "object") {
    throw new ValidationError("Transcript request missing video reference");
  }
  const ref = video as Record<string, unknown>;
  if (typeof ref.uri !== "string" || typeof ref.mimeType !== "string") {
    throw new ValidationError("Transcript request video reference invalid");
  }
  const language = typeof b.language === "string" ? b.language : undefined;
  return { video: { uri: ref.uri, mimeType: ref.mimeType }, language };
}

export function parseKeyframeRequest(body: unknown): KeyframeRequestBody {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid keyframe payload");
  }
  const b = body as Record<string, unknown>;
  const video = b.video;
  if (!video || typeof video !== "object") {
    throw new ValidationError("Keyframe request missing video reference");
  }
  const ref = video as Record<string, unknown>;
  if (typeof ref.uri !== "string" || typeof ref.mimeType !== "string") {
    throw new ValidationError("Keyframe request video reference invalid");
  }
  const maxSuggestionsRaw = Number(b.maxSuggestions);
  const maxSuggestions = Number.isFinite(maxSuggestionsRaw) ? Math.max(1, Math.min(12, Math.floor(maxSuggestionsRaw))) : undefined;
  return {
    video: { uri: ref.uri, mimeType: ref.mimeType },
    maxSuggestions,
  };
}

export function parseUploadImagesRequest(body: unknown): UploadImagesRequestBody {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid request body");
  }
  const b = body as Record<string, unknown>;
  const rawScreenshots = Array.isArray(b.screenshots) ? b.screenshots : [];
  if (rawScreenshots.length === 0) {
    throw new ValidationError("No screenshots provided");
  }
  if (rawScreenshots.length > MAX_SCREENSHOT_COUNT) {
    throw new ValidationError(`Too many screenshots (max ${MAX_SCREENSHOT_COUNT})`);
  }

  const maxDataUrlLength = Math.ceil(MAX_SCREENSHOT_UPLOAD_BYTES / 3) * 4 + 512;
  const screenshots: Array<{ id: string; dataUrl: string; timecode: string }> = rawScreenshots.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { id?: unknown }).id !== "string" ||
      typeof (entry as { dataUrl?: unknown }).dataUrl !== "string" ||
      typeof (entry as { timecode?: unknown }).timecode !== "string"
    ) {
      throw new ValidationError("Invalid screenshot entry");
    }

    const id = (entry as { id: string }).id;
    const dataUrl = (entry as { dataUrl: string }).dataUrl;
    const timecode = (entry as { timecode: string }).timecode;

    if (id.length > 64) {
      throw new ValidationError("Screenshot id is too long");
    }
    if (timecode.length > 32) {
      throw new ValidationError("Screenshot timecode is too long");
    }
    if (!SCREENSHOT_DATA_URL_PATTERN.test(dataUrl)) {
      throw new ValidationError("Unsupported screenshot format");
    }
    if (dataUrl.length > maxDataUrlLength) {
      throw new ValidationError("Screenshot data URL exceeds size limit");
    }

    return { id, dataUrl, timecode };
  });

  return { screenshots };
}