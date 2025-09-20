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
} from "@/lib/types/api";
import type { SchemaType, PromptMode } from "@/lib/types";

function isSchemaType(v: unknown): v is SchemaType {
  return v === "tutorial" || v === "meetingSummary";
}

function isPromptMode(v: unknown): v is PromptMode {
  return v === "manual" || v === "dspy";
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
  const schemaType = isSchemaType(b.schemaType) ? b.schemaType : (undefined as unknown as SchemaType | undefined);
  const promptMode = isPromptMode(b.promptMode) ? b.promptMode : (undefined as unknown as PromptMode | undefined);
  const shots = Array.isArray(b.shots) ? b.shots : undefined;
  const dspyOptions = b.dspyOptions && typeof b.dspyOptions === "object" ? (b.dspyOptions as GenerateRequestBody["dspyOptions"]) : undefined;
  const promoteBaseline = Boolean(b.promoteBaseline);

  return { video, screenshots, enforceSchema, titleHint, schemaType, promptMode, shots, dspyOptions, promoteBaseline };
}

export function parseExportRequest(body: unknown): ExportRequestBody {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid export payload");
  }
  const b = body as Record<string, unknown>;

  if (!isSchemaType(b.schemaType)) {
    throw new ValidationError("Invalid or missing schemaType");
  }
  if (typeof b.resultText !== "string") {
    throw new ValidationError("Invalid or missing resultText");
  }
  const enforceSchema = Boolean(b.enforceSchema);
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
    schemaType: b.schemaType,
    enforceSchema,
    resultText: b.resultText,
    shots,
    options,
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