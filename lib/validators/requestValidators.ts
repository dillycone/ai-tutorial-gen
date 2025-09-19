// lib/validators/requestValidators.ts
import { ValidationError } from "@/lib/errors";
import type {
  GenerateRequestBody,
  ExportRequestBody,
  UploadImagesRequestBody,
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

  return {
    schemaType: b.schemaType,
    enforceSchema,
    resultText: b.resultText,
    shots,
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