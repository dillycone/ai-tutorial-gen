// hooks/useVideoWorkbench.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatFileSize, toTimecode } from "@/lib/format";
import {
  PromptMode,
  PromptOptimizationMeta,
  ResultViewMode,
  SchemaTemplate,
  SchemaTemplateInput,
  SchemaType,
  Shot,
  TranscriptSegment,
  TranscriptTrack,
  WorkbenchResult,
} from "@/lib/types";
import type { ExportRequestBody, GenerateRequestBody } from "@/lib/types/api";
import type { GeminiFileRef } from "@/lib/geminiUploads";
import {
  extractFirstJsonBlock,
  normalizeResultForTemplate,
  toPrettyJson,
  tryParseJsonLoose,
} from "@/lib/results";
import { useShotManager } from "@/hooks/useShotManager";
import { useDspyPreferences } from "@/hooks/useDspyPreferences";
import {
  exportStructuredPdf,
  generateStructuredOutput,
  uploadScreenshotBatch,
  uploadVideoViaApi,
  generateTranscriptFromVideo,
  requestKeyframeSuggestions,
  fetchSchemaTemplates,
  createSchemaTemplateViaApi,
} from "@/lib/services/workbenchApi";
import {
  parseTranscriptFile,
  buildTranscriptSearchIndex,
  searchTranscriptSegments,
  findTranscriptSegment,
} from "@/lib/transcript";

export type BusyPhase = "upload" | "generate" | "export" | "suggest";

type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
};

export type ToastState = {
  id: number;
  type: "success" | "error" | "info";
  message: string;
};

export type StepStatus = "complete" | "current" | "upcoming";

export type WorkbenchStep = {
  id: number;
  title: string;
  description: string;
  status: StepStatus;
};

export type ExportOptionsState = {
  // Document options
  includeAppendix: boolean;
  includeTOC: boolean;
  includeCover: boolean; // reserved for phase 2 UI
  linkifyUrls: boolean;
  runningTitle?: string;
  author?: string;
  subject?: string;
  keywords?: string[];

  // Image options
  compressImages: boolean;
  imageQuality: number;   // 0..1
  imageMaxWidth: number;  // pixels
};


const MAX_TRANSCRIPT_SEGMENTS = 400;
const TRANSCRIPT_SNIPPET_LIMIT = 240;
const SUGGESTION_DEDUPE_TOLERANCE = 0.5;
const TIMECODE_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

const compareSchemaTemplates = (a: SchemaTemplate, b: SchemaTemplate) => {
  if (a.builtIn && !b.builtIn) return -1;
  if (!a.builtIn && b.builtIn) return 1;
  return a.name.localeCompare(b.name);
};

function parseTimecodeToSeconds(timecode?: string | null): number | null {
  if (!timecode) return null;
  const match = timecode.trim().match(TIMECODE_PATTERN);
  if (!match) return null;
  const hours = match[3] ? Number(match[1]) : 0;
  const minutes = match[3] ? Number(match[2]) : Number(match[1]);
  const seconds = match[3] ? Number(match[3]) : Number(match[2]);
  if ([hours, minutes, seconds].some((value) => Number.isNaN(value))) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

export type UseVideoWorkbenchReturn = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  videoFile: File | null;
  videoUrl: string | null;
  videoMetadata: VideoMetadata | null;
  videoOnGemini: GeminiFileRef | null;
  shots: Shot[];
  latestShotId: string | null;
  flashShotId: string | null;
  transcriptTrack: TranscriptTrack | null;
  transcriptStatus: "idle" | "uploading" | "generating";
  transcriptError: string | null;
  transcriptSearchTerm: string;
  transcriptMatches: TranscriptSegment[];
  transcriptMatchedShotIds: Set<string>;
  busyPhase: BusyPhase | null;
  suggestingKeyframes: boolean;
  busy: boolean;
  dragActive: boolean;
  steps: WorkbenchStep[];
  toast: ToastState | null;
  previewShotId: string | null;
  setPreviewShotId: (id: string | null) => void;
  enforceSchema: boolean;
  setEnforceSchema: (value: boolean) => void;
  schemaType: SchemaType;
  setSchemaType: (value: SchemaType) => void;
  titleHint: string;
  setTitleHint: (value: string) => void;
  promptMode: PromptMode;
  setPromptMode: (mode: PromptMode) => void;
  promptMeta: PromptOptimizationMeta | null;
  schemaTemplates: SchemaTemplate[];
  schemaTemplatesLoading: boolean;
  schemaTemplatesError: string | null;
  refreshSchemaTemplates: () => Promise<void>;
  createSchemaTemplate: (input: SchemaTemplateInput) => Promise<SchemaTemplate>;
  showAdvanced: boolean;
  setShowAdvanced: (value: boolean) => void;
  promoteBaseline: boolean;
  setPromoteBaseline: (value: boolean) => void;
  exportOptions: ExportOptionsState;
  setExportOptions: (next: ExportOptionsState) => void;
  result: WorkbenchResult | null;
  resultView: ResultViewMode;
  setResultView: (mode: ResultViewMode) => void;
  isResultDirty: boolean;
  updateResultData: (updater: (draft: Record<string, unknown>) => void) => void;
  setResultJsonText: (nextJson: string) => void;
  formatResultJson: () => void;
  resetResultEdits: () => void;
  currentTimecode: string;
  videoDuration: string | null;
  videoFileSize: string | null;
  previewShot: Shot | null;
  readyToGenerate: boolean;
  canCapture: boolean;
  showToast: (type: ToastState["type"], message: string) => void;
  handleDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: () => void;
  handlePickClick: () => void;
  handleReplaceClick: () => void;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleUploadVideo: () => Promise<void>;
  handleCaptureShot: () => void;
  handleVideoLoaded: () => void;
  handleTimeUpdate: () => void;
  handleRemoveShot: (id: string) => void;
  handleUpdateShot: (id: string, changes: Partial<Shot>) => void;
  handleMoveShot: (id: string, direction: "left" | "right") => void;
  handleTranscriptFile: (file: File) => Promise<void>;
  handleGenerateTranscript: (options?: { language?: string }) => Promise<void>;
  handleClearTranscript: () => void;
  handleTranscriptSearch: (query: string) => void;
  handleTranscriptSegmentFocus: (segmentId: string) => void;
  handleSeekToTime: (timeSec: number) => void;
  handleSuggestKeyframes: () => Promise<void>;
  handleGenerate: () => Promise<void>;
  handleExportPdf: () => Promise<void>;
};

export function useVideoWorkbench(): UseVideoWorkbenchReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previousUrlRef = useRef<string | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [videoOnGemini, setVideoOnGemini] = useState<GeminiFileRef | null>(null);

  const [busyPhase, setBusyPhase] = useState<BusyPhase | null>(null);
  const busy = busyPhase !== null;

  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [transcriptTrack, setTranscriptTrack] = useState<TranscriptTrack | null>(null);
  const [transcriptStatus, setTranscriptStatus] = useState<"idle" | "uploading" | "generating">("idle");
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [transcriptSearchTerm, setTranscriptSearchTerm] = useState("");

  const [enforceSchema, setEnforceSchema] = useState(true);
  const [schemaType, setSchemaType] = useState<SchemaType>("tutorial");
  const [titleHint, setTitleHint] = useState("");
  const [promptModeState, setPromptModeState] = useState<PromptMode>("manual");
  const [promptMeta, setPromptMeta] = useState<PromptOptimizationMeta | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [promoteBaseline, setPromoteBaseline] = useState(true);
  const [schemaTemplates, setSchemaTemplates] = useState<SchemaTemplate[]>([]);
  const [schemaTemplatesLoading, setSchemaTemplatesLoading] = useState(false);
  const [schemaTemplatesError, setSchemaTemplatesError] = useState<string | null>(null);
  const {
    jsonBonus,
    featureWeights,
    alwaysFullValidation,
    parallelEvalEnabled,
    parallelWorkers,
    parallelBatchSize,
  } = useDspyPreferences(schemaType);

  const [exportOptions, setExportOptions] = useState<ExportOptionsState>({
    includeAppendix: true,
    includeTOC: true,
    includeCover: false,
    linkifyUrls: true,
    runningTitle: undefined,
    author: undefined,
    subject: undefined,
    keywords: [],
    compressImages: true,
    imageQuality: 0.82,
    imageMaxWidth: 1280,
  });

  const [result, setResult] = useState<WorkbenchResult | null>(null);
  const [resultView, setResultView] = useState<ResultViewMode>("preview");
  const resultBaselineRef = useRef<WorkbenchResult | null>(null);
  const [previewShotId, setPreviewShotId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const canCapture = Boolean(videoUrl);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ id: Date.now(), type, message });
  }, []);

  const setResultFromAi = useCallback(
    ({ rawText, templateId, schema }: { rawText: string; templateId: string; schema?: unknown }) => {
      const candidate = extractFirstJsonBlock(rawText) ?? rawText;
      let jsonText = candidate.trim() || rawText.trim();
      let data: Record<string, unknown> | null = null;
      let valid = false;
      let errors: string[] = [];

      try {
        const parsed = tryParseJsonLoose(candidate);
        const normalized = normalizeResultForTemplate(templateId, parsed);
        data = normalized.data;
        valid = normalized.valid;
        errors = normalized.errors;
        if (data) {
          jsonText = toPrettyJson(data);
        } else if (parsed && typeof parsed === "object") {
          jsonText = toPrettyJson(parsed);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to parse result JSON";
        errors = [message];
      }

      const nextResult: WorkbenchResult = {
        templateId,
        schema,
        rawText,
        jsonText,
        data,
        valid,
        errors: errors.length ? errors : undefined,
        source: "ai",
        updatedAt: Date.now(),
      };

      setResult(nextResult);
      setResultView("preview");
      resultBaselineRef.current = nextResult;
    },
    [],
  );

  const updateResultData = useCallback((updater: (draft: Record<string, unknown>) => void) => {
    setResult((current) => {
      if (!current) return current;
      const clone = current.data
        ? (JSON.parse(JSON.stringify(current.data)) as Record<string, unknown>)
        : ({} as Record<string, unknown>);

      updater(clone);
      const normalized = normalizeResultForTemplate(current.templateId, clone);
      const dataForState = (normalized.data ?? clone) as Record<string, unknown>;
      let jsonText = current.jsonText;
      try {
        jsonText = toPrettyJson(dataForState);
      } catch {
        // keep previous jsonText on serialization failure
      }

      return {
        ...current,
        data: dataForState,
        jsonText,
        valid: normalized.valid,
        errors: normalized.errors.length ? normalized.errors : undefined,
        source: "edited",
        updatedAt: Date.now(),
      };
    });
  }, []);

  const setResultJsonText = useCallback((nextJson: string) => {
    setResult((current) => {
      if (!current) return current;
      try {
        const parsed = tryParseJsonLoose(nextJson);
        const normalized = normalizeResultForTemplate(current.templateId, parsed);
        const dataForState = normalized.data ?? (parsed as Record<string, unknown> | null);
        return {
          ...current,
          data: dataForState ?? current.data,
          jsonText: normalized.data ? toPrettyJson(normalized.data) : nextJson,
          valid: normalized.valid,
          errors: normalized.errors.length ? normalized.errors : undefined,
          source: "edited",
          updatedAt: Date.now(),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid JSON";
        return {
          ...current,
          jsonText: nextJson,
          valid: false,
          errors: [message],
          source: "edited",
          updatedAt: Date.now(),
        };
      }
    });
  }, []);

  const formatResultJson = useCallback(() => {
    setResult((current) => {
      if (!current || !current.jsonText.trim()) return current;
      try {
        const parsed = tryParseJsonLoose(current.jsonText);
        const normalized = normalizeResultForTemplate(current.templateId, parsed);
        const dataForState = normalized.data ?? (parsed as Record<string, unknown> | null) ?? current.data ?? {};
        const jsonText = toPrettyJson(dataForState);
        return {
          ...current,
          data: dataForState,
          jsonText,
          valid: normalized.valid,
          errors: normalized.errors.length ? normalized.errors : undefined,
          source: "edited",
          updatedAt: Date.now(),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid JSON";
        return {
          ...current,
          valid: false,
          errors: [message],
          source: "edited",
          updatedAt: Date.now(),
        };
      }
    });
  }, []);

  const resetResultEdits = useCallback(() => {
    const baseline = resultBaselineRef.current;
    if (!baseline) return;
    setResult({
      ...baseline,
      source: "ai",
      updatedAt: Date.now(),
    });
    setResultView("preview");
  }, []);

  const changeResultView = useCallback((mode: ResultViewMode) => {
    setResultView(mode);
  }, []);

  const refreshSchemaTemplates = useCallback(async () => {
    setSchemaTemplatesLoading(true);
    try {
      const templates = await fetchSchemaTemplates();
      const ordered = templates.slice().sort(compareSchemaTemplates);
      setSchemaTemplates(ordered);
      setSchemaTemplatesError(null);
      if (ordered.length > 0 && !ordered.some((tpl) => tpl.id === schemaType)) {
        const fallback = ordered.find((tpl) => tpl.builtIn) ?? ordered[0];
        if (fallback && fallback.id !== schemaType) {
          setSchemaType(fallback.id as SchemaType);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load schema templates";
      setSchemaTemplatesError(message);
      showToast("error", message);
    } finally {
      setSchemaTemplatesLoading(false);
    }
  }, [schemaType, setSchemaType, showToast]);

  useEffect(() => {
    void refreshSchemaTemplates();
  }, [refreshSchemaTemplates]);

  const handleCreateSchemaTemplate = useCallback(
    async (input: SchemaTemplateInput) => {
      try {
        const template = await createSchemaTemplateViaApi(input);
        setSchemaTemplates((prev) => {
          const merged = [...prev.filter((tpl) => tpl.id !== template.id), template];
          return merged.sort(compareSchemaTemplates);
        });
        setSchemaTemplatesError(null);
        if (template.id !== schemaType) {
          setSchemaType(template.id as SchemaType);
        }
        showToast("success", `Saved template ${template.name}`);
        return template;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create schema template";
        showToast("error", message);
        throw error instanceof Error ? error : new Error(message);
      }
    },
    [schemaType, setSchemaType, showToast],
  );

  const transcriptSegments = useMemo(
    () => (transcriptTrack ? transcriptTrack.segments ?? [] : []),
    [transcriptTrack],
  );

  const transcriptSearchIndex = useMemo(
    () => (transcriptSegments.length > 0 ? buildTranscriptSearchIndex(transcriptSegments) : []),
    [transcriptSegments],
  );

  const transcriptById = useMemo(() => {
    if (transcriptSegments.length === 0) return new Map<string, TranscriptSegment>();
    return new Map(transcriptSegments.map((segment) => [segment.id, segment]));
  }, [transcriptSegments]);

  const deriveShotMetadata = useCallback(
    (shot: Shot): Partial<Shot> | null => {
      if (transcriptSegments.length === 0) {
        if (shot.transcriptSegmentId || shot.transcriptSnippet) {
          return { transcriptSegmentId: undefined, transcriptSnippet: undefined };
        }
        return null;
      }
      const baseTimeCandidate = Number.isFinite(shot.timeSec) ? shot.timeSec : parseTimecodeToSeconds(shot.timecode);
      if (typeof baseTimeCandidate !== "number" || !Number.isFinite(baseTimeCandidate)) {
        if (shot.transcriptSegmentId || shot.transcriptSnippet) {
          return { transcriptSegmentId: undefined, transcriptSnippet: undefined };
        }
        return null;
      }
      const segment = findTranscriptSegment(transcriptSegments, baseTimeCandidate);
      if (!segment) {
        if (shot.transcriptSegmentId || shot.transcriptSnippet) {
          return { transcriptSegmentId: undefined, transcriptSnippet: undefined };
        }
        return null;
      }
      const snippet = segment.text.length > TRANSCRIPT_SNIPPET_LIMIT
        ? `${segment.text.slice(0, TRANSCRIPT_SNIPPET_LIMIT - 1)}…`
        : segment.text;
      if (shot.transcriptSegmentId === segment.id && shot.transcriptSnippet === snippet) {
        return null;
      }
      return { transcriptSegmentId: segment.id, transcriptSnippet: snippet };
    },
    [transcriptSegments],
  );

  const {
    shots,
    latestShotId,
    flashShotId,
    captureShot,
    addShots,
    removeShot,
    updateShot,
    moveShot,
    resetShots,
    refreshMetadata,
  } = useShotManager({ videoRef, videoUrl, notify: showToast, deriveShotMetadata });

  const setPromptMode = useCallback(
    (mode: PromptMode) => {
      setPromptModeState(mode);
      setPromptMeta(null);
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    refreshMetadata();
  }, [refreshMetadata, transcriptSegments]);

  const transcriptMatches = useMemo(() => {
    if (!transcriptSearchTerm.trim()) return [] as TranscriptSegment[];
    const results = searchTranscriptSegments(transcriptSearchIndex, transcriptSearchTerm);
    return results.slice(0, 50);
  }, [transcriptSearchIndex, transcriptSearchTerm]);

  const transcriptMatchedShotIds = useMemo(() => {
    const term = transcriptSearchTerm.trim().toLowerCase();
    if (!term) return new Set<string>();
    const ids = new Set<string>();
    for (const shot of shots) {
      if (shot.transcriptSnippet && shot.transcriptSnippet.toLowerCase().includes(term)) {
        ids.add(shot.id);
      }
    }
    return ids;
  }, [shots, transcriptSearchTerm]);


  useEffect(() => {
    if (!videoUrl) return;
    const previousUrl = previousUrlRef.current;
    if (previousUrl && previousUrl !== videoUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    previousUrlRef.current = videoUrl;

    return () => {
      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current);
        previousUrlRef.current = null;
      }
    };
  }, [videoUrl]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Only handle the shortcut if we're not typing in an input field
      const target = event.target as HTMLElement;
      const isInputField = target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true" ||
        target.isContentEditable
      );

      if ((event.key === "c" || event.key === "C") && canCapture && !busy && !isInputField) {
        event.preventDefault();
        captureShot();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, canCapture, captureShot]);

  const steps = useMemo<WorkbenchStep[]>(() => {
    const definitions = [
      { id: 1, title: "Upload", description: "Add your source video" },
      { id: 2, title: "Screenshots", description: "Mark key story beats" },
      { id: 3, title: "Options", description: "Choose schema & context" },
      { id: 4, title: "Result", description: "Review the structured output" },
    ];

    const hasResult = Boolean(
      (result?.data && Object.keys(result.data).length > 0) ||
        (typeof result?.jsonText === "string" && result.jsonText.trim().length > 0) ||
        (typeof result?.rawText === "string" && result.rawText.trim().length > 0),
    );

    const done = [
      Boolean(videoUrl),
      shots.length > 0,
      Boolean(videoOnGemini) && shots.length > 0,
      hasResult,
    ];

    const firstIncomplete = done.findIndex((flag) => !flag);
    const currentIndex = firstIncomplete === -1 ? definitions.length - 1 : firstIncomplete;

    return definitions.map((def, index) => {
      let status: StepStatus = "upcoming";
      if (done[index]) status = "complete";
      else if (index === currentIndex) status = "current";
      return { ...def, status };
    });
  }, [result, shots.length, videoOnGemini, videoUrl]);

  const resetSelection = useCallback(() => {
    setVideoMetadata(null);
    setVideoOnGemini(null);
    resetShots();
    setTranscriptTrack(null);
    setTranscriptStatus("idle");
    setTranscriptError(null);
    setTranscriptSearchTerm("");
    setResult(null);
    setResultView("preview");
    resultBaselineRef.current = null;
    setPromptMeta(null);
  }, [resetShots]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        setVideoFile(file);
        setVideoUrl(URL.createObjectURL(file));
        resetSelection();
        showToast("info", `Ready to work with ${file.name}`);
      }
    },
    [resetSelection, showToast],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const handlePickFile = useCallback(
    (file: File) => {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      resetSelection();
      showToast("info", `Ready to work with ${file.name}`);
    },
    [resetSelection, showToast],
  );

  const handlePickClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleReplaceClick = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) return;
    try {
      input.value = "";
    } catch {
      /* no-op */
    }
    input.click();
  }, []);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) handlePickFile(file);
    },
    [handlePickFile],
  );

  const handleUploadVideo = useCallback(async () => {
    if (!videoFile || busyPhase === "upload") return;
    setBusyPhase("upload");
    showToast("info", "Uploading video to Gemini…");

    try {
      const uploaded = await uploadVideoViaApi(videoFile);
      setVideoOnGemini(uploaded);
      showToast("success", "Video uploaded to Gemini");
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusyPhase(null);
    }
  }, [busyPhase, showToast, videoFile]);

  const handleTranscriptFile = useCallback(
    async (file: File) => {
      if (!file) return;
      setTranscriptStatus("uploading");
      setTranscriptError(null);
      try {
        const { track } = await parseTranscriptFile(file, {
          source: "uploaded",
          fileName: file.name,
        });
        if (!track.segments.length) {
          throw new Error("Transcript file did not include any timestamped captions");
        }
        const limitedSegments = track.segments.slice(0, MAX_TRANSCRIPT_SEGMENTS).map((segment, index) => ({
          ...segment,
          id: segment.id || `seg-${index + 1}`,
        }));
        const normalized: TranscriptTrack = {
          id: track.id,
          source: track.source,
          language: track.language,
          fileName: track.fileName,
          createdAt: Date.now(),
          segments: limitedSegments,
        };
        setTranscriptTrack(normalized);
        setTranscriptSearchTerm("");
        setTranscriptError(null);
        showToast("success", `Loaded transcript (${limitedSegments.length} segments)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to parse transcript";
        setTranscriptError(message);
        showToast("error", message);
      } finally {
        setTranscriptStatus("idle");
      }
    },
    [showToast],
  );

  const handleGenerateTranscript = useCallback(
    async (options?: { language?: string }) => {
      if (!videoOnGemini) {
        showToast("error", "Upload the video to Gemini before generating a transcript.");
        return;
      }
      setTranscriptStatus("generating");
      setTranscriptError(null);
      try {
        const response = await generateTranscriptFromVideo({
          video: { uri: videoOnGemini.uri, mimeType: videoOnGemini.mimeType },
          language: options?.language,
        });
        const payload = response.transcript;
        if (!payload) {
          throw new Error("Transcript generation did not return a transcript payload");
        }
        const segments = payload.segments.slice(0, MAX_TRANSCRIPT_SEGMENTS);
        if (segments.length === 0) {
          throw new Error("Transcript generation returned no segments");
        }
        const normalized: TranscriptTrack = {
          id: payload.id ?? `transcript-${Date.now()}`,
          source: payload.source ?? "generated",
          language: payload.language,
          fileName: payload.fileName,
          createdAt: payload.createdAt ?? Date.now(),
          segments: segments.map((segment, index) => ({
            ...segment,
            id: segment.id || `seg-${index + 1}`,
          })),
        };
        setTranscriptTrack(normalized);
        setTranscriptSearchTerm("");
        setTranscriptError(null);
        showToast("success", `Generated transcript (${segments.length} segments)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate transcript";
        setTranscriptError(message);
        showToast("error", message);
      } finally {
        setTranscriptStatus("idle");
      }
    },
    [showToast, videoOnGemini],
  );

  const handleClearTranscript = useCallback(() => {
    setTranscriptTrack(null);
    setTranscriptStatus("idle");
    setTranscriptError(null);
    setTranscriptSearchTerm("");
    showToast("info", "Transcript cleared");
  }, [showToast]);

  const handleTranscriptSearch = useCallback((query: string) => {
    setTranscriptSearchTerm(query);
  }, []);

  const handleTranscriptSegmentFocus = useCallback(
    (segmentId: string) => {
      const segment = transcriptById.get(segmentId);
      if (!segment) return;
      handleSeekToTime(segment.startSec);

      let candidate = shots.find((shot) => shot.transcriptSegmentId === segmentId) ?? null;
      if (!candidate && shots.length > 0) {
        let bestShot: Shot | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const shot of shots) {
          const timeCandidate = Number.isFinite(shot.timeSec)
            ? shot.timeSec
            : parseTimecodeToSeconds(shot.timecode);
          if (typeof timeCandidate !== "number" || !Number.isFinite(timeCandidate)) {
            continue;
          }
          const distance = Math.abs(timeCandidate - segment.startSec);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestShot = shot;
          }
        }
        candidate = bestShot;
      }
      if (candidate) {
        setPreviewShotId(candidate.id);
      }
    },
    [handleSeekToTime, transcriptById, shots, setPreviewShotId],
  );

  const handleSuggestKeyframes = useCallback(async () => {
    if (!videoOnGemini) {
      showToast("error", "Upload the video to Gemini before suggesting key frames.");
      return;
    }
    const video = videoRef.current;
    if (!video || !videoUrl) {
      showToast("error", "Load the video before suggesting key frames.");
      return;
    }
    if (busy || busyPhase === "suggest") {
      showToast("info", "Please wait for the current operation to finish.");
      return;
    }
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.readyState < 2) {
      showToast("error", "Wait for the video to finish loading before requesting key frames.");
      return;
    }

    setBusyPhase("suggest");
    showToast("info", "Analyzing video for key frames…");

    const clampTime = (value: number) => {
      const duration = Number.isFinite(video.duration) ? video.duration : value;
      return Math.min(Math.max(0, value), Math.max(0, duration - 0.05));
    };

    const seekTo = (target: number) =>
      new Promise<number>((resolve, reject) => {
        const safeTarget = clampTime(target);
        if (Math.abs(video.currentTime - safeTarget) < 0.05) {
          resolve(video.currentTime);
          return;
        }
        const handleSeeked = () => {
          cleanup();
          resolve(video.currentTime);
        };
        const handleError = () => {
          cleanup();
          reject(new Error("Video seek failed"));
        };
        const cleanup = () => {
          video.removeEventListener("seeked", handleSeeked);
          video.removeEventListener("error", handleError);
        };
        video.addEventListener("seeked", handleSeeked, { once: true });
        video.addEventListener("error", handleError, { once: true });
        try {
          video.currentTime = safeTarget;
        } catch (error) {
          cleanup();
          reject(error instanceof Error ? error : new Error("Unable to seek"));
        }
      });

    const captureFrames = async (suggestions: Array<{ timeSec: number; description?: string }>) => {
      const results: Array<{ timeSec: number; dataUrl: string; description?: string }> = [];
      if (suggestions.length === 0) return results;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Unable to capture frames from video");
      }
      const ensureCanvasSize = () => {
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
      };

      const originalTime = video.currentTime;
      const wasPlaying = !video.paused;
      if (wasPlaying) {
        video.pause();
      }

      try {
        for (const suggestion of suggestions) {
          const actual = await seekTo(suggestion.timeSec);
          ensureCanvasSize();
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/png");
          results.push({ timeSec: actual, dataUrl, description: suggestion.description });
        }
      } finally {
        try {
          await seekTo(originalTime);
        } catch {
          // ignore restore failures
        }
        if (wasPlaying) {
          void video.play().catch(() => {});
        }
      }

      return results;
    };

    try {
      const { suggestions = [] } = await requestKeyframeSuggestions({
        video: { uri: videoOnGemini.uri, mimeType: videoOnGemini.mimeType },
        maxSuggestions: 8,
      });

      const normalized = suggestions
        .map((suggestion, index) => {
          const direct = Number(suggestion.timeSec);
          const parsedTime = Number.isFinite(direct) ? direct : parseTimecodeToSeconds(suggestion.timecode);
          if (typeof parsedTime !== "number" || !Number.isFinite(parsedTime) || parsedTime < 0) {
            return null;
          }
          return {
            timeSec: clampTime(parsedTime),
            description: suggestion.description?.trim() || `Suggested frame ${index + 1}`,
          };
        })
        .filter((item): item is { timeSec: number; description: string } => Boolean(item));

      if (normalized.length === 0) {
        showToast("info", "No key frames detected. Try capturing manually.");
        return;
      }

      const dedupeKeys = new Set<string>();
      const deduped: Array<{ timeSec: number; description: string }> = [];
      const keyFor = (timeSec: number) => Math.round(timeSec / SUGGESTION_DEDUPE_TOLERANCE).toString();
      for (const item of normalized.sort((a, b) => a.timeSec - b.timeSec)) {
        const key = keyFor(item.timeSec);
        if (dedupeKeys.has(key)) continue;
        dedupeKeys.add(key);
        deduped.push(item);
      }

      const captures = await captureFrames(deduped);
      if (captures.length === 0) {
        showToast("info", "Unable to capture the suggested frames.");
        return;
      }

      const created = addShots(
        captures.map((capture) => ({
          timeSec: capture.timeSec,
          dataUrl: capture.dataUrl,
          label: capture.description,
          note: capture.description,
          origin: "suggested",
        })),
      );

      if (created.length > 0) {
        const summary = created.length === 1 ? "Added 1 suggested frame" : `Added ${created.length} suggested frames`;
        showToast("success", summary);
      } else {
        showToast("info", "Suggested frames were already part of your shot list.");
      }
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Failed to suggest key frames");
    } finally {
      setBusyPhase(null);
    }
  }, [addShots, busy, busyPhase, showToast, videoOnGemini, videoRef, videoUrl]);

  const handleGenerate = useCallback(async () => {
    if (!videoOnGemini) {
      showToast("error", "Upload the video to Gemini first.");
      return;
    }
    if (shots.length === 0) {
      showToast("error", "Capture at least one screenshot before generating.");
      return;
    }

    setBusyPhase("generate");
    setResult(null);
    setResultView("preview");
    resultBaselineRef.current = null;
    setPromptMeta(null);
    showToast("info", "Preparing screenshots for Gemini…");

    try {
      const uploadedScreenshots = await uploadScreenshotBatch(
        shots.map((shot) => ({
          id: shot.id,
          dataUrl: shot.dataUrl,
          timecode: shot.timecode,
        })),
      );

      showToast("info", "Generating structured output…");

      const screenshotRefs = uploadedScreenshots.map(({ id, uri, mimeType, timecode }) => ({
        id,
        uri,
        mimeType,
        timecode,
      }));

      const dspyOptions =
        promptModeState === "dspy"
          ? ({
              auto: "medium",
              maxMetricCalls: 200,
              timeoutMs: 300_000,
              experienceTopK: 12,
              experienceMinScore: 0.8,
              persistExperience: true,
              model: "gemini/gemini-2.5-flash",
              reflectionModel: "gemini/gemini-2.5-flash",
              jsonBonus,
              featureWeights,
              rpmLimit: 8,
              alwaysFullValidation,
              parallelEval: parallelEvalEnabled,
              parallelWorkers,
              parallelBatchSize,
              earlyStopOnPerfect: true,
              earlyStopStreak: 15,
              minValidationSize: 4,
            } satisfies GenerateRequestBody["dspyOptions"])
          : undefined;

      const payload: GenerateRequestBody = {
        video: { uri: videoOnGemini.uri, mimeType: videoOnGemini.mimeType },
        screenshots: screenshotRefs,
        enforceSchema,
        titleHint,
        schemaType,
        promptMode: promptModeState,
        shots: shots.map(
          ({ id, timecode, timeSec, label, note, transcriptSegmentId, transcriptSnippet, origin }) => ({
            id,
            timecode,
            timeSec,
            label,
            note,
            transcriptSegmentId,
            transcriptSnippet,
            origin,
          }),
        ),
        transcript: transcriptTrack
          ? {
              id: transcriptTrack.id,
              source: transcriptTrack.source,
              language: transcriptTrack.language,
              fileName: transcriptTrack.fileName,
              createdAt: transcriptTrack.createdAt,
              segments: transcriptTrack.segments.slice(0, MAX_TRANSCRIPT_SEGMENTS).map(({
                id,
                startSec,
                endSec,
                text,
                speaker,
              }) => ({ id, startSec, endSec, text, speaker })),
            }
          : undefined,
        dspyOptions,
        promoteBaseline: promptModeState === "dspy" ? promoteBaseline : false,
      };

      const { rawText = "", promptMeta: meta } = await generateStructuredOutput(payload);
      const activeTemplate = schemaTemplates.find((template) => template.id === schemaType) ?? null;
      const templateId = activeTemplate?.id ?? schemaType;
      setResultFromAi({ rawText, templateId, schema: activeTemplate?.schema });
      setPromptMeta(meta ?? null);
      showToast("success", "Structured result is ready");
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Unexpected error during generation",
      );
    } finally {
      setBusyPhase(null);
    }
  }, [
    alwaysFullValidation,
    enforceSchema,
    featureWeights,
    parallelBatchSize,
    parallelEvalEnabled,
    parallelWorkers,
    promoteBaseline,
    promptModeState,
    schemaType,
    schemaTemplates,
    shots,
    showToast,
    titleHint,
    transcriptTrack,
    videoOnGemini,
    jsonBonus,
    setResultFromAi,
  ]);

  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setVideoMetadata({
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    });
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
  }, []);

  const handleSeekToTime = useCallback(
    (timeSec: number) => {
      if (!Number.isFinite(timeSec)) return;
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.max(0, timeSec);
    },
    [videoRef],
  );

  const handleExportPdf = useCallback(async () => {
    if (!result || (!result.data && !result.jsonText && !result.rawText)) {
      showToast("error", "Generate a result before exporting.");
      return;
    }

    const structuredResultPayload =
      result.valid && result.data
        ? { templateId: result.templateId, data: result.data }
        : undefined;

    if (!structuredResultPayload && result.errors?.length) {
      showToast("info", "Result has validation issues; exporting fallback text.");
    }

    setBusyPhase("export");
    showToast("info", "Rendering PDF…");

    try {
      const body: ExportRequestBody = {
        schemaType,
        enforceSchema,
        structuredResult: structuredResultPayload,
        rawText: result.rawText || result.jsonText || "",
        shots: shots.map(({ id, label, note, timecode, dataUrl }) => ({
          id,
          label,
          note,
          timecode,
          dataUrl,
        })),
        options: {
          document: {
            includeAppendix: exportOptions.includeAppendix,
            includeTOC: exportOptions.includeTOC,
            includeCover: exportOptions.includeCover,
            runningTitle: exportOptions.runningTitle && exportOptions.runningTitle.trim()
              ? exportOptions.runningTitle.trim()
              : undefined,
            author: exportOptions.author && exportOptions.author.trim() ? exportOptions.author.trim() : undefined,
            subject: exportOptions.subject && exportOptions.subject.trim() ? exportOptions.subject.trim() : undefined,
            keywords:
              Array.isArray(exportOptions.keywords) && exportOptions.keywords.length > 0
                ? exportOptions.keywords.filter((k) => typeof k === "string" && k.trim().length > 0)
                : undefined,
            linkifyUrls: exportOptions.linkifyUrls,
          },
          image: exportOptions.compressImages
            ? {
                format: "jpeg",
                quality: Math.max(0, Math.min(1, exportOptions.imageQuality)),
                maxWidth: Math.max(1, Math.floor(exportOptions.imageMaxWidth)),
                progressive: true,
              }
            : undefined,
        },
      };

      const { blob, warnings, filename: serverFilename } = await exportStructuredPdf(body);

      if (warnings.length > 0) {
        const summary = warnings.slice(0, 2).join(" • ");
        const extra = warnings.length > 2 ? ` +${warnings.length - 2} more` : "";
        showToast("info", `Exported with warnings: ${summary}${extra}`);
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;

      const fallbackFilename = schemaType === "tutorial" ? "tutorial-guide.pdf" : "meeting-summary.pdf";
      anchor.download = serverFilename ?? fallbackFilename;

      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      showToast("success", "PDF download started");
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusyPhase(null);
    }
  }, [enforceSchema, exportOptions, result, schemaType, shots, showToast]);

  const isResultDirty = result?.source === "edited";
  const suggestingKeyframes = busyPhase === "suggest";
  const readyToGenerate = Boolean(videoOnGemini) && shots.length > 0 && !busy;

  const previewShot = previewShotId ? shots.find((shot) => shot.id === previewShotId) ?? null : null;
  const currentTimecode = toTimecode(currentTime);
  const videoDuration = videoMetadata ? toTimecode(videoMetadata.duration) : null;
  const videoFileSize = videoFile ? formatFileSize(videoFile.size) : null;

  return {
    videoRef,
    fileInputRef,
    videoFile,
    videoUrl,
    videoMetadata,
    videoOnGemini,
    shots,
    latestShotId,
    flashShotId,
    transcriptTrack,
    transcriptStatus,
    transcriptError,
    transcriptSearchTerm,
    transcriptMatches,
    transcriptMatchedShotIds,
    busyPhase,
    busy,
    suggestingKeyframes,
    dragActive,
    steps,
    toast,
    previewShotId,
    setPreviewShotId,
    enforceSchema,
    setEnforceSchema,
    schemaType,
    setSchemaType,
    titleHint,
    setTitleHint,
    promptMode: promptModeState,
    setPromptMode,
    promptMeta,
    schemaTemplates,
    schemaTemplatesLoading,
    schemaTemplatesError,
    refreshSchemaTemplates,
    createSchemaTemplate: handleCreateSchemaTemplate,
    showAdvanced,
    setShowAdvanced,
    promoteBaseline,
    setPromoteBaseline,
    exportOptions,
    setExportOptions,
    result,
    resultView,
    setResultView: changeResultView,
    isResultDirty,
    updateResultData,
    setResultJsonText,
    formatResultJson,
    resetResultEdits,
    currentTimecode,
    videoDuration,
    videoFileSize,
    previewShot,
    readyToGenerate,
    canCapture,
    showToast,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handlePickClick,
    handleReplaceClick,
    handleInputChange,
    handleUploadVideo,
    handleCaptureShot: captureShot,
    handleVideoLoaded,
    handleTimeUpdate,
    handleRemoveShot: removeShot,
    handleUpdateShot: updateShot,
    handleMoveShot: moveShot,
    handleTranscriptFile,
    handleGenerateTranscript,
    handleClearTranscript,
    handleTranscriptSearch,
    handleTranscriptSegmentFocus,
    handleSeekToTime,
    handleSuggestKeyframes,
    handleGenerate,
    handleExportPdf,
  };
}
