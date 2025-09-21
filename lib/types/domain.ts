/* lib/types/domain.ts */

export type Shot = {
  id: string; // s1, s2, ... (unique per capture session)
  timeSec: number;
  timecode: string; // "MM:SS"
  dataUrl: string; // local preview
  label?: string;
  note?: string;
  transcriptSegmentId?: string;
  transcriptSnippet?: string;
  origin?: "manual" | "suggested";
};

export type TranscriptSegment = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
};

export type TranscriptSource = "uploaded" | "generated";

export type TranscriptTrack = {
  id: string;
  segments: TranscriptSegment[];
  source: TranscriptSource;
  language?: string;
  createdAt: number;
  fileName?: string;
};

export type SchemaType = string;

export type SchemaTemplate = {
  id: string;
  name: string;
  description?: string;
  persona: string;
  requirements: string;
  fallbackOutput: string;
  hintLabel: string;
  schema: unknown;
  styleGuide?: string;
  builtIn?: boolean;
  createdAt: string;
  updatedAt: string;
  version?: number;
};

export type SchemaTemplateSummary = Pick<
  SchemaTemplate,
  "id" | "name" | "description" | "hintLabel" | "builtIn" | "updatedAt"
>;

export type SchemaTemplateInput = {
  id: string;
  name: string;
  description?: string;
  persona: string;
  requirements: string;
  fallbackOutput: string;
  hintLabel: string;
  schema: unknown;
  styleGuide?: string;
};

export type PromptMode = "manual" | "dspy";

export type OptimizationProgressUpdate = {
  iteration: number;
  score?: number;
  coverage?: number;
  satisfiedCount?: number;
  message?: string;
  // Progressive validation metadata
  validationSize?: number;
  validationTotal?: number;
  confidence?: number; // 0..1
  stage?: number; // 1-based stage index
  stages?: number; // total stages
};

export type PromptOptimizationMeta = {
  requestedMode: PromptMode;
  appliedMode: PromptMode;
  score?: number;
  coverage?: number;
  parsed?: boolean;
  parseError?: string;
  feedback?: string;
  satisfied?: string[];
  missing?: string[];
  auto?: string | null;
  trainsetSize?: number;
  requestedModel?: string;
  retrievedFromExperience?: number;
  message?: string;
  rawPrompt?: string;
  baselinePromoted?: boolean;
  progress?: OptimizationProgressUpdate[];
  // Caching metadata
  cacheHit?: boolean;
  cacheKey?: string;
  cacheAgeMs?: number;
  cacheSize?: number;
  cacheTTLms?: number;
  cacheCleared?: boolean;
};

/**
 * DSPyOptions – shared options for DSPy GEPA optimization.
 * Extend as needed across the app. Currently only jsonBonus is required for UI control.
 */
export type DSPyOptions = {
  /**
   * Extra weight awarded when the optimizer returns a valid/parsing JSON config.
   * Range: 0.0 – 1.0 (recommended defaults around 0.25).
   */
  jsonBonus?: number;

  /**
   * Feature importance weights used by the optimizer's scoring metric.
   * Keys are category names (e.g., "schemaFocus", "screenshotCitation", "timecodeOrdering",
   * "titleHint", "formatWhenEnforced", "formatWhenNotEnforced", "grounding", "noScreenshotsBehavior")
   * or exact feature strings. Values are numeric weights (e.g., 2.0, 1.0, 0.5).
   */
  featureWeights?: Record<string, number>;

  /**
   * Optional hint: request clearing the server-side optimizer cache on next run.
   * Typically managed via a dedicated API, but included for completeness.
   */
  clearCache?: boolean;

  /**
   * When true, disable progressive validation and always evaluate against the full set.
   */
  alwaysFullValidation?: boolean;

  /**
   * Optional progression schedule as fractions of the full validation set per stage, e.g., [0.25, 0.5, 1.0].
   * Values must be in (0, 1], last value should typically be 1.0.
   */
  progressiveSchedule?: number[];

  // New fields
  /**
   * Stop early when perfect coverage is reached and maintained for a streak.
   */
  earlyStopOnPerfect?: boolean;
  /**
   * Number of consecutive perfect-coverage iterations to trigger early stop.
   */
  earlyStopStreak?: number;
  /**
   * Enforce a minimum validation set size (absolute number of examples).
   */
  minValidationSize?: number;

  /**
   * Rate limit (requests per minute) for LM calls.
   */
  rpmLimit?: number;

  /**
   * Enable local parallel evaluation (no extra LM throughput).
   */
  parallelEval?: boolean;
  /**
   * Number of workers to use for local parallel evaluation.
   */
  parallelWorkers?: number;
  /**
   * Batch size for local parallel evaluation.
   */
  parallelBatchSize?: number;
  /**
   * Timeout for local evaluation (ms).
   */
  evalTimeoutMs?: number;
};

export type ResultViewMode = "preview" | "edit" | "json";

export type TutorialStep = {
  stepTitle: string;
  description: string;
  timecodes?: {
    start?: string;
    end?: string;
  } | null;
  screenshots?: string[] | null;
};

export type TutorialResult = {
  title: string;
  summary: string;
  prerequisites: string[];
  steps: TutorialStep[];
};

export type MeetingAttendee = {
  name: string;
  role?: string;
  department?: string;
};

export type MeetingTopic = {
  order: number;
  title: string;
  details: string;
  startTimecode?: string;
  endTimecode?: string;
  speaker?: string;
};

export type MeetingDecision = {
  description: string;
  owners?: string[];
  status?: string;
  timecode?: string;
};

export type MeetingActionItem = {
  task: string;
  owner: string;
  dueDate?: string;
  timecode?: string;
};

export type MeetingSummaryResult = {
  meetingTitle?: string;
  meetingDate?: string;
  durationMinutes?: number;
  attendees?: MeetingAttendee[];
  summary?: string;
  keyTopics: MeetingTopic[];
  decisions?: MeetingDecision[];
  actionItems?: MeetingActionItem[];
  followUps?: string[];
};

export type StructuredResultData =
  | { templateId: "tutorial"; data: TutorialResult }
  | { templateId: "meetingSummary"; data: MeetingSummaryResult }
  | { templateId: string; data: Record<string, unknown> };

export type StructuredResultSource = "ai" | "edited";

export type WorkbenchResult = {
  templateId: string;
  schema?: unknown;
  rawText: string;
  jsonText: string;
  data: StructuredResultData["data"] | null;
  valid: boolean;
  errors?: string[];
  source: StructuredResultSource;
  updatedAt: number;
};