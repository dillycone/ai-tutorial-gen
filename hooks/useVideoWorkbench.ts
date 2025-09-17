// hooks/useVideoWorkbench.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatFileSize, toTimecode } from "@/lib/format";
import { PromptMode, PromptOptimizationMeta, SchemaType, Shot, DSPyOptions } from "@/lib/types";

export type BusyPhase = "upload" | "generate" | "export";

type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
};

type GeminiVideoRef = {
  uri: string;
  name: string;
  mimeType: string;
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

type UploadResponse = {
  name: string;
  uri: string;
  mimeType: string;
};

type UploadedScreenshot = {
  id: string;
  timecode: string;
  name: string;
  uri: string;
  mimeType: string;
};

type GeneratePayload = {
  video: { uri: string; mimeType: string };
  screenshots: UploadedScreenshot[];
  enforceSchema: boolean;
  titleHint?: string;
  schemaType?: SchemaType;
  promptMode?: PromptMode;
  shots?: Array<{ id: string; timecode: string; label?: string; note?: string }>;
  dspyOptions?: DSPyOptions & {
    auto?: "light" | "medium" | "heavy";
    maxMetricCalls?: number;
    model?: string;
    reflectionModel?: string;
    temperature?: number;
    reflectionTemperature?: number;
    initialInstructions?: string;
    timeoutMs?: number;
    debug?: boolean;
    checkpointPath?: string;
    experiencePath?: string;
    experienceTopK?: number;
    experienceMinScore?: number;
    persistExperience?: boolean;
  };
  promoteBaseline?: boolean;
};

export type UseVideoWorkbenchReturn = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  videoFile: File | null;
  videoUrl: string | null;
  videoMetadata: VideoMetadata | null;
  videoOnGemini: GeminiVideoRef | null;
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
  const nextShotIdRef = useRef(1);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousUrlRef = useRef<string | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [videoOnGemini, setVideoOnGemini] = useState<GeminiVideoRef | null>(null);

  const [shots, setShots] = useState<Shot[]>([]);
  const [latestShotId, setLatestShotId] = useState<string | null>(null);
  const [flashShotId, setFlashShotId] = useState<string | null>(null);

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
  const [promoteBaseline, setPromoteBaseline] = useState(false);
  const [jsonBonus, setJsonBonus] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("dspy.jsonBonus");
        const num = raw != null ? Number.parseFloat(raw) : NaN;
        if (Number.isFinite(num)) return Math.max(0, Math.min(1, num));
      } catch {
        // ignore
      }
    }
    return 0.25;
  });
  const [featureWeights, setFeatureWeights] = useState<Record<string, number>>({});
  const [alwaysFullValidation, setAlwaysFullValidation] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("dspy.alwaysFullValidation");
        return raw === "true";
      } catch {
        // ignore
      }
    }
    return false;
  });
  const [parallelEvalEnabled, setParallelEvalEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("dspy.parallel.enabled");
        if (raw === "true") return true;
        if (raw === "false") return false;
      } catch {
        // ignore
      }
    }
    return false;
  });
  const [parallelWorkers, setParallelWorkers] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("dspy.parallel.workers");
        const num = raw != null ? Number.parseInt(raw, 10) : NaN;
        if (Number.isFinite(num) && num > 0) return num;
      } catch {
        // ignore
      }
    }
    return 4;
  });
  const [parallelBatchSize, setParallelBatchSize] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("dspy.parallel.batchSize");
        const num = raw != null ? Number.parseInt(raw, 10) : NaN;
        if (Number.isFinite(num) && num > 0) return num;
      } catch {
        // ignore
      }
    }
    return 8;
  });

  const [resultText, setResultText] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<"formatted" | "json">("formatted");
  const [previewShotId, setPreviewShotId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const canCapture = Boolean(videoUrl);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ id: Date.now(), type, message });
  }, []);

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
    const handler = (event: Event) => {
      const ce = event as CustomEvent<any>;
      const detail = (ce as any).detail;
      const val =
        typeof detail === "number"
          ? detail
          : typeof detail?.value === "number"
            ? detail.value
            : undefined;
      if (typeof val === "number") {
        const clamped = Math.max(0, Math.min(1, val));
        setJsonBonus(clamped);
        try {
          window.localStorage.setItem("dspy.jsonBonus", String(clamped));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("dspy:jsonBonus", handler as EventListener);
    return () => window.removeEventListener("dspy:jsonBonus", handler as EventListener);
  }, []);

  // Feature importance updates from OptionsSection
  useEffect(() => {
    const handler = (event: Event) => {
      const ce = event as CustomEvent<any>;
      const detail = (ce as any).detail;
      const obj =
        detail && typeof detail === "object" && detail.weights && typeof detail.weights === "object"
          ? detail.weights
          : typeof detail === "object"
            ? detail
            : null;
      if (obj && typeof obj === "object") {
        const weights: Record<string, number> = {};
        for (const [k, v] of Object.entries(obj)) {
          const num = Number(v);
          if (Number.isFinite(num)) weights[k] = num;
        }
        setFeatureWeights(weights);
        try {
          const key = `dspy.featureWeights.${schemaType}`;
          window.localStorage.setItem(key, JSON.stringify(weights));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("dspy:featureWeights", handler as EventListener);
    return () => window.removeEventListener("dspy:featureWeights", handler as EventListener);
  }, [schemaType]);

  // Handle always-full-validation toggle from OptionsSection
  useEffect(() => {
    const handler = (event: Event) => {
      const ce = event as CustomEvent<any>;
      const detail = (ce as any).detail;
      const val = typeof detail === "boolean" ? detail : typeof detail?.value === "boolean" ? detail.value : undefined;
      if (typeof val === "boolean") {
        setAlwaysFullValidation(val);
        try {
          window.localStorage.setItem("dspy.alwaysFullValidation", String(val));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("dspy:alwaysFullValidation", handler as EventListener);
    return () => window.removeEventListener("dspy:alwaysFullValidation", handler as EventListener);
  }, []);

  // Parallel evaluation settings from OptionsSection
  useEffect(() => {
    const handler = (event: Event) => {
      const ce = event as CustomEvent<any>;
      const detail = (ce as any).detail;
      if (detail && typeof detail === "object") {
        const enabled =
          typeof detail.enabled === "boolean"
            ? detail.enabled
            : typeof detail?.value === "boolean"
              ? detail.value
              : undefined;
        const workers =
          typeof detail.workers === "number"
            ? detail.workers
            : typeof detail.workers === "string"
              ? Number.parseInt(detail.workers, 10)
              : undefined;
        const batch =
          typeof detail.batchSize === "number"
            ? detail.batchSize
            : typeof detail.batchSize === "string"
              ? Number.parseInt(detail.batchSize, 10)
              : undefined;

        if (typeof enabled === "boolean") {
          setParallelEvalEnabled(enabled);
          try {
            window.localStorage.setItem("dspy.parallel.enabled", String(enabled));
          } catch {
            // ignore
          }
        }
        if (Number.isFinite(workers as number) && (workers as number) > 0) {
          setParallelWorkers(workers as number);
          try {
            window.localStorage.setItem("dspy.parallel.workers", String(workers));
          } catch {
            // ignore
          }
        }
        if (Number.isFinite(batch as number) && (batch as number) > 0) {
          setParallelBatchSize(batch as number);
          try {
            window.localStorage.setItem("dspy.parallel.batchSize", String(batch));
          } catch {
            // ignore
          }
        }
      }
    };
    window.addEventListener("dspy:parallelEval", handler as EventListener);
    return () => window.removeEventListener("dspy:parallelEval", handler as EventListener);
  }, []);

  // Load stored feature weights when schema changes
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`dspy.featureWeights.${schemaType}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>;
        if (parsed && typeof parsed === "object") {
          setFeatureWeights(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    setFeatureWeights({});
  }, [schemaType]);

  useEffect(() => () => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
  }, []);

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

  const handleCaptureShot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    const timeSec = video.currentTime;
    const timecode = toTimecode(timeSec);

    const id = `s${nextShotIdRef.current}`;
    nextShotIdRef.current += 1;
    const defaultLabel = `Screenshot ${nextShotIdRef.current - 1}`;

    setShots((prev) => [
      ...prev,
      {
        id,
        timeSec,
        timecode,
        dataUrl,
        label: defaultLabel,
      },
    ]);

    setLatestShotId(id);
    setFlashShotId(id);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setFlashShotId(null), 2000);

    showToast("success", `Captured ${defaultLabel} @ ${timecode}`);
  }, [showToast, videoUrl]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.key === "c" || event.key === "C") && canCapture && !busy) {
        event.preventDefault();
        handleCaptureShot();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, canCapture, handleCaptureShot]);

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
    setShots([]);
    setResultText(null);
    setLatestShotId(null);
    setFlashShotId(null);
    setResultTab("formatted");
    setPromptMeta(null);
    nextShotIdRef.current = 1;
  }, []);

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
      const form = new FormData();
      form.append("file", videoFile);
      const res = await fetch("/api/gemini/upload", { method: "POST", body: form });
      const json = (await res.json()) as UploadResponse & { error?: string };
      if (!res.ok) {
        showToast("error", json.error || "Upload failed");
      } else {
        setVideoOnGemini(json);
        showToast("success", "Video uploaded to Gemini");
      }
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusyPhase(null);
    }
  }, [busyPhase, showToast, videoFile]);

  const captureAndUploadScreenshots = useCallback(async () => {
    const upRes = await fetch("/api/gemini/upload-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        screenshots: shots.map((shot) => ({
          id: shot.id,
          dataUrl: shot.dataUrl,
          timecode: shot.timecode,
        })),
      }),
    });
    const upJson = (await upRes.json()) as { files: UploadedScreenshot[]; error?: string };
    if (!upRes.ok) {
      throw new Error(upJson.error || "Screenshot upload failed");
    }
    return upJson.files;
  }, [shots]);

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
      const uploadedScreenshots = await captureAndUploadScreenshots();
      showToast("info", "Generating structured output…");
      const genRes = await fetch("/api/gemini/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video: { uri: videoOnGemini.uri, mimeType: videoOnGemini.mimeType },
          screenshots: uploadedScreenshots,
          enforceSchema,
          titleHint,
          schemaType,
          promptMode: promptModeState,
          shots: shots.map(({ id, timecode, label, note }) => ({ id, timecode, label, note })),
          dspyOptions:
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
                  jsonBonus: jsonBonus,
                  featureWeights: featureWeights,
                  rpmLimit: 8,
                  alwaysFullValidation: alwaysFullValidation,
                  parallelEval: parallelEvalEnabled,
                  parallelWorkers: parallelWorkers,
                  parallelBatchSize: parallelBatchSize,
                  earlyStopOnPerfect: true,
                  earlyStopStreak: 15,
                  minValidationSize: 4,
                } satisfies GeneratePayload["dspyOptions"])
              : undefined,
          promoteBaseline: promptModeState === "dspy" ? promoteBaseline : false,
        } satisfies GeneratePayload),
      });
      const genJson = (await genRes.json()) as {
        rawText?: string;
        error?: string;
        promptMeta?: PromptOptimizationMeta;
      };
      if (!genRes.ok) {
        throw new Error(genJson.error || "Generation failed");
      }

      setResultText(genJson.rawText ?? "");
      setPromptMeta(genJson.promptMeta ?? null);
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
    captureAndUploadScreenshots,
    enforceSchema,
    promptModeState,
    schemaType,
    shots,
    showToast,
    titleHint,
    videoOnGemini,
    promoteBaseline,
    featureWeights,
    alwaysFullValidation,
    parallelEvalEnabled,
    parallelWorkers,
    parallelBatchSize,
  ]);

  const handleRemoveShot = useCallback((id: string) => {
    setShots((prev) => prev.filter((shot) => shot.id !== id));
  }, []);

  const handleUpdateShot = useCallback((id: string, changes: Partial<Shot>) => {
    setShots((prev) => prev.map((shot) => (shot.id === id ? { ...shot, ...changes } : shot)));
  }, []);

  const handleMoveShot = useCallback((id: string, direction: "left" | "right") => {
    setShots((prev) => {
      const index = prev.findIndex((shot) => shot.id === id);
      if (index === -1) return prev;
      const delta = direction === "left" ? -1 : 1;
      const newIndex = index + delta;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const updated = [...prev];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated;
    });
  }, []);

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
      const res = await fetch("/api/gemini/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error.error || "Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = schemaType === "tutorial" ? "tutorial-guide.pdf" : "meeting-summary.pdf";
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
  }, [enforceSchema, resultText, schemaType, shots, showToast]);

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
    handleCaptureShot,
    handleVideoLoaded,
    handleTimeUpdate,
    handleRemoveShot,
    handleUpdateShot,
    handleMoveShot,
    handleGenerate,
    handleExportPdf,
  };
}
