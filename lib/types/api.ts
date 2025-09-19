/* lib/types/api.ts */
import type { SchemaType, PromptMode } from "@/lib/types";

export type VideoRef = { uri: string; mimeType: string };
export type ImgRef = { id: string; uri: string; mimeType: string; timecode: string };

export type GenerateRequestBody = {
  video: VideoRef;
  screenshots: ImgRef[];
  enforceSchema: boolean;
  titleHint?: string;
  schemaType?: SchemaType;
  promptMode?: PromptMode;
  shots?: Array<{ id: string; timecode?: string; label?: string; note?: string }>;
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

export type ExportShotIn = {
  id: string;
  label?: string;
  note?: string;
  timecode: string;
  dataUrl: string;
};

export type ExportRequestBody = {
  schemaType: SchemaType;
  enforceSchema: boolean;
  resultText: string;
  shots: ExportShotIn[];
};

export type UploadImagesRequestBody = {
  screenshots: Array<{ id: string; dataUrl: string; timecode: string }>;
};