// hooks/useVideoWorkbench.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatFileSize, toTimecode } from "@/lib/format";
import { PromptMode, PromptOptimizationMeta, SchemaType, Shot } from "@/lib/types";
import type { ExportRequestBody, GenerateRequestBody } from "@/lib/types/api";
import type { GeminiFileRef } from "@/lib/geminiUploads";
import { useShotManager } from "@/hooks/useShotManager";
import { useDspyPreferences } from "@/hooks/useDspyPreferences";
import {
  exportStructuredPdf,
  generateStructuredOutput,
  uploadScreenshotBatch,
  uploadVideoViaApi,
} from "@/lib/services/workbenchApi";

export type BusyPhase = "upload" | "generate" | "export";

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
  busyPhase: BusyPhase | null;
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
  showAdvanced: boolean;
  setShowAdvanced: (value: boolean) => void;
  promoteBaseline: boolean;
  setPromoteBaseline: (value: boolean) => void;
  exportOptions: ExportOptionsState;
  setExportOptions: (next: ExportOptionsState) => void;
  resultText: string | null;
  setResultText: (value: string | null) => void;
  resultTab: "formatted" | "json";
  setResultTab: (value: "formatted" | "json") => void;
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

  const [enforceSchema, setEnforceSchema] = useState(true);
  const [schemaType, setSchemaType] = useState<SchemaType>("tutorial");
  const [titleHint, setTitleHint] = useState("");
  const [promptModeState, setPromptModeState] = useState<PromptMode>("manual");
  const [promptMeta, setPromptMeta] = useState<PromptOptimizationMeta | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [promoteBaseline, setPromoteBaseline] = useState(true);
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

  const [resultText, setResultText] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<"formatted" | "json">("formatted");
  const [previewShotId, setPreviewShotId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const canCapture = Boolean(videoUrl);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ id: Date.now(), type, message });
  }, []);

  const {
    shots,
    latestShotId,
    flashShotId,
    captureShot,
    removeShot,
    updateShot,
    moveShot,
    resetShots,
  } = useShotManager({ videoRef, videoUrl, notify: showToast });

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

    const done = [
      Boolean(videoUrl),
      shots.length > 0,
      Boolean(videoOnGemini) && shots.length > 0,
      Boolean(resultText),
    ];

    const firstIncomplete = done.findIndex((flag) => !flag);
    const currentIndex = firstIncomplete === -1 ? definitions.length - 1 : firstIncomplete;

    return definitions.map((def, index) => {
      let status: StepStatus = "upcoming";
      if (done[index]) status = "complete";
      else if (index === currentIndex) status = "current";
      return { ...def, status };
    });
  }, [resultText, shots.length, videoOnGemini, videoUrl]);

  const resetSelection = useCallback(() => {
    setVideoMetadata(null);
    setVideoOnGemini(null);
    resetShots();
    setResultText(null);
    setResultTab("formatted");
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
    setResultText(null);
    setResultTab("formatted");
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
        shots: shots.map(({ id, timecode, label, note }) => ({ id, timecode, label, note })),
        dspyOptions,
        promoteBaseline: promptModeState === "dspy" ? promoteBaseline : false,
      };

      const { rawText, promptMeta: meta } = await generateStructuredOutput(payload);
      setResultText(rawText ?? "");
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
    shots,
    showToast,
    titleHint,
    videoOnGemini,
    jsonBonus,
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

  const handleExportPdf = useCallback(async () => {
    if (!resultText) {
      showToast("error", "Generate a result before exporting.");
      return;
    }

    setBusyPhase("export");
    showToast("info", "Rendering PDF…");

    try {
      const body: ExportRequestBody = {
        schemaType,
        enforceSchema,
        resultText,
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

      // Prefer filename from Content-Disposition when available
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
  }, [enforceSchema, resultText, schemaType, shots, showToast, exportOptions]);

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
    busyPhase,
    busy,
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
    showAdvanced,
    setShowAdvanced,
    promoteBaseline,
    setPromoteBaseline,
    exportOptions,
    setExportOptions,
    resultText,
    setResultText,
    resultTab,
    setResultTab,
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
    handleGenerate,
    handleExportPdf,
  };
}
