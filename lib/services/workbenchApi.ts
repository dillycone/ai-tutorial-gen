// lib/services/workbenchApi.ts

import type { GeminiFileRef } from "@/lib/geminiUploads";
import type { PromptOptimizationMeta, SchemaTemplate, SchemaTemplateInput } from "@/lib/types";
import type {
  ExportRequestBody,
  GenerateRequestBody,
  TranscriptRequestBody,
  TranscriptResponseBody,
  KeyframeRequestBody,
  KeyframeResponseBody,
} from "@/lib/types/api";
import type { UploadedScreenshot } from "@/lib/services/videoService";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

const parseJson = async <T>(response: Response): Promise<T | Record<string, unknown>> => {
  try {
    return (await response.json()) as T;
  } catch {
    return {};
  }
};

export async function uploadVideoViaApi(file: File): Promise<GeminiFileRef> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch("/api/gemini/upload", {
    method: "POST",
    body: form,
  });

  const payload = (await parseJson<GeminiFileRef & { error?: string }>(response)) as Partial<
    GeminiFileRef
  > & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Upload failed");
  }

  if (!payload.uri || !payload.mimeType || !payload.name) {
    throw new Error("Upload response missing file metadata");
  }

  return {
    name: payload.name,
    uri: payload.uri,
    mimeType: payload.mimeType,
  };
}

export async function uploadScreenshotBatch(
  screenshots: Array<{ id: string; dataUrl: string; timecode: string }>,
): Promise<UploadedScreenshot[]> {
  const response = await fetch("/api/gemini/upload-images", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ screenshots }),
  });

  const payload = (await parseJson<{ files?: UploadedScreenshot[]; error?: string }>(response)) as {
    files?: UploadedScreenshot[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Screenshot upload failed");
  }

  if (!Array.isArray(payload.files)) {
    throw new Error("Screenshot upload response malformed");
  }

  return payload.files;
}

export type GenerateStructuredOutputResponse = {
  rawText?: string;
  promptMeta?: PromptOptimizationMeta;
};

export async function generateStructuredOutput(
  payload: GenerateRequestBody,
): Promise<GenerateStructuredOutputResponse> {
  const response = await fetch("/api/gemini/generate", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });

  const json = (await parseJson<
    GenerateStructuredOutputResponse & { error?: string }
  >(response)) as GenerateStructuredOutputResponse & { error?: string };

  if (!response.ok) {
    throw new Error(json.error || "Generation failed");
  }

  return {
    rawText: json.rawText ?? "",
    promptMeta: json.promptMeta ?? undefined,
  };
}

export type ExportPdfResult = {
  blob: Blob;
  warnings: string[];
  filename?: string;
};

const parseWarningsHeader = (header: string | null): string[] => {
  if (!header) return [];
  try {
    const decoded = decodeURIComponent(header);
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // ignore malformed warnings header
  }
  return [];
};

const parseContentDispositionFilename = (header: string | null): string | undefined => {
  if (!header) return undefined;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match && match[1] ? match[1] : undefined;
};

export async function generateTranscriptFromVideo(
  payload: TranscriptRequestBody,
): Promise<TranscriptResponseBody> {
  const response = await fetch("/api/gemini/transcript", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });

  const json = (await parseJson<TranscriptResponseBody & { error?: string }>(response)) as TranscriptResponseBody & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(json.error || "Transcript generation failed");
  }

  if (!json.transcript || !Array.isArray(json.transcript.segments)) {
    throw new Error("Transcript response malformed");
  }

  return json;
}

export async function requestKeyframeSuggestions(
  payload: KeyframeRequestBody,
): Promise<KeyframeResponseBody> {
  const response = await fetch("/api/gemini/keyframes", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });

  const json = (await parseJson<KeyframeResponseBody & { error?: string }>(response)) as KeyframeResponseBody & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(json.error || "Keyframe suggestion failed");
  }

  if (!Array.isArray(json.suggestions)) {
    throw new Error("Keyframe response malformed");
  }

  return json;
}

export async function exportStructuredPdf(body: ExportRequestBody): Promise<ExportPdfResult> {
  const response = await fetch("/api/gemini/export", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await parseJson<{ error?: string }>(response)) as { error?: string };
    throw new Error(payload.error || "Export failed");
  }

  const warnings = parseWarningsHeader(response.headers.get("X-Export-Warnings"));
  const filename = parseContentDispositionFilename(response.headers.get("Content-Disposition"));
  const blob = await response.blob();

  return { blob, warnings, filename };
}

export async function fetchSchemaTemplates(): Promise<SchemaTemplate[]> {
  const response = await fetch("/api/schemas", {
    method: "GET",
  });

  const payload = (await parseJson<{ templates?: SchemaTemplate[]; error?: string }>(response)) as {
    templates?: SchemaTemplate[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Failed to load schema templates");
  }

  return Array.isArray(payload.templates) ? payload.templates : [];
}

export async function createSchemaTemplateViaApi(payload: SchemaTemplateInput): Promise<SchemaTemplate> {
  const response = await fetch("/api/schemas", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });

  const json = (await parseJson<{ template?: SchemaTemplate; error?: string }>(response)) as {
    template?: SchemaTemplate;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(json.error || "Failed to create schema template");
  }
  if (!json.template) {
    throw new Error("Schema template response missing template payload");
  }
  return json.template;
}
