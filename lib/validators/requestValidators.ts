// lib/validators/requestValidators.ts
import { ValidationError } from "@/lib/errors";
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
  return file;
}

export function parseGenerateRequest(body: unknown): GenerateRequestBody {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Invalid request body");
  }
  const b = body as Record<string, any>;
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
  const b = body as Record<string, any>;

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
  const rawOptions = b.options && typeof b.options === "object" ? (b.options as Record<string, any>) : {};
  const docRaw = rawOptions.document && typeof rawOptions.document === "object" ? (rawOptions.document as Record<string, any>) : {};
  const imgRaw = rawOptions.image && typeof rawOptions.image === "object" ? (rawOptions.image as Record<string, any>) : {};

  const toNumber = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN);

  const document: ExportDocumentOptions = {
    includeAppendix: typeof docRaw.includeAppendix === "boolean" ? docRaw.includeAppendix : true,
    includeTOC: typeof docRaw.includeTOC === "boolean" ? docRaw.includeTOC : true,
    includeCover: typeof docRaw.includeCover === "boolean" ? docRaw.includeCover : false,
    runningTitle: typeof docRaw.runningTitle === "string" ? docRaw.runningTitle : undefined,
    author: typeof docRaw.author === "string" ? docRaw.author : undefined,
    subject: typeof docRaw.subject === "string" ? docRaw.subject : undefined,
    keywords: Array.isArray(docRaw.keywords)
      ? (docRaw.keywords as any[]).filter((k) => typeof k === "string")
      : undefined,
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
  const b = body as Record<string, any>;
  if (!Array.isArray(b.screenshots) || b.screenshots.length === 0) {
    throw new ValidationError("No screenshots provided");
  }
  for (const s of b.screenshots) {
    if (
      !s ||
      typeof s !== "object" ||
      typeof s.id !== "string" ||
      typeof s.dataUrl !== "string" ||
      typeof s.timecode !== "string"
    ) {
      throw new ValidationError("Invalid screenshot entry");
    }
  }
  return { screenshots: b.screenshots };
}