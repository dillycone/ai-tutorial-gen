/* lib/types/api.ts */
import type { SchemaType, PromptMode, TranscriptSource } from "@/lib/types";

export type VideoRef = { uri: string; mimeType: string };
export type ImgRef = { id: string; uri: string; mimeType: string; timecode: string };

export type TranscriptSegmentPayload = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
};

export type TranscriptPayload = {
  id?: string;
  segments: TranscriptSegmentPayload[];
  source: TranscriptSource;
  language?: string;
  fileName?: string;
  createdAt?: number;
};

export type GenerateRequestBody = {
  video: VideoRef;
  screenshots: ImgRef[];
  enforceSchema: boolean;
  titleHint?: string;
  schemaType?: SchemaType;
  promptMode?: PromptMode;
  shots?: Array<{
    id: string;
    timecode?: string;
    timeSec?: number;
    label?: string;
    note?: string;
    transcriptSegmentId?: string;
    transcriptSnippet?: string;
    origin?: "manual" | "suggested";
  }>;
  transcript?: TranscriptPayload;
  dspyOptions?: Partial<Record<string, unknown>> & {
    auto?: "light" | "medium" | "heavy" | null;
    maxMetricCalls?: number | null;
    model?: string;
    reflectionModel?: string;
    temperature?: number;
    reflectionTemperature?: number;
    maxTokens?: number;
    reflectionMaxTokens?: number;
    seed?: number;
    initialInstructions?: string;
    timeoutMs?: number;
    debug?: boolean;
    checkpointPath?: string;
    experiencePath?: string;
    experienceTopK?: number;
    experienceMinScore?: number;
    persistExperience?: boolean;
    rpmLimit?: number;
    jsonBonus?: number;
    featureWeights?: Record<string, number>;
    experiencePruneThreshold?: number;
    experienceMaxAge?: number;
    alwaysFullValidation?: boolean;
    progressiveSchedule?: number[];
    parallelEval?: boolean;
    parallelWorkers?: number;
    parallelBatchSize?: number;
    evalTimeoutMs?: number;
    minValidationSize?: number;
    earlyStopOnPerfect?: boolean;
    earlyStopStreak?: number;
  };
  promoteBaseline?: boolean;
};

export type TranscriptRequestBody = {
  video: VideoRef;
  language?: string;
};

export type TranscriptResponseBody = {
  transcript: TranscriptPayload;
};

export type KeyframeSuggestionPayload = {
  timeSec: number;
  timecode?: string;
  description?: string;
  confidence?: number;
};

export type KeyframeRequestBody = {
  video: VideoRef;
  maxSuggestions?: number;
};

export type KeyframeResponseBody = {
  suggestions: KeyframeSuggestionPayload[];
};

export type ExportShotIn = {
  id: string;
  label?: string;
  note?: string;
  timecode: string;
  dataUrl: string;
};

/**
 * Options to control server-side image processing for screenshots embedded in PDF.
 * When omitted, sensible defaults will be applied by the validator/service.
 */
export type ExportImageOptions = {
  format?: "jpeg" | "png";
  quality?: number; // 0..1
  maxWidth?: number;
  maxHeight?: number;
  progressive?: boolean;
};

/**
 * Options to control document-level formatting, metadata, and behavior.
 * Many of these are reserved for Phase 2 features but typed now for forward-compatibility.
 */
export type ExportDocumentOptions = {
  includeAppendix?: boolean; // default true
  includeTOC?: boolean;      // default true (Phase 2)
  includeCover?: boolean;    // default false (Phase 2)
  runningTitle?: string;
  author?: string;           // Phase 2
  subject?: string;          // Phase 2
  keywords?: string[];       // Phase 2
  linkifyUrls?: boolean;     // default true (Phase 2)
  language?: string;         // e.g., "en" (Phase 2)
  headingStartOnNewPage?: boolean; // default false (Phase 2)
  pageNumberOffset?: number; // default 0 (Phase 2)
};

export type ExportOptions = {
  document?: ExportDocumentOptions;
  image?: ExportImageOptions;
};

export type StructuredExportPayload = {
  templateId: string;
  data: Record<string, unknown>;
};

export type ExportRequestBody = {
  schemaType: SchemaType;
  enforceSchema: boolean;
  structuredResult?: StructuredExportPayload;
  rawText?: string;
  /**
   * @deprecated Use rawText instead. Kept for backward compatibility with older clients.
   */
  resultText?: string;
  shots: ExportShotIn[];
  options?: ExportOptions;
};

export type UploadImagesRequestBody = {
  screenshots: Array<{ id: string; dataUrl: string; timecode: string }>;
};