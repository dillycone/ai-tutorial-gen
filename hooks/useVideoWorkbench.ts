// hooks/useVideoWorkbench.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatFileSize, toTimecode } from "@/lib/format";
import { SchemaType, Shot } from "@/lib/types";

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
  showAdvanced: boolean;
  setShowAdvanced: (value: boolean) => void;
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [resultText, setResultText] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<"formatted" | "json">("formatted");
  const [previewShotId, setPreviewShotId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const canCapture = Boolean(videoUrl);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ id: Date.now(), type, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

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

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        setVideoFile(file);
        setVideoUrl(URL.createObjectURL(file));
        setVideoMetadata(null);
        setVideoOnGemini(null);
        setShots([]);
        setResultText(null);
        setLatestShotId(null);
        setFlashShotId(null);
        setResultTab("formatted");
        nextShotIdRef.current = 1;
        showToast("info", `Ready to work with ${file.name}`);
      }
    },
    [showToast],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const resetSelection = useCallback(() => {
    setVideoMetadata(null);
    setVideoOnGemini(null);
    setShots([]);
    setResultText(null);
    setLatestShotId(null);
    setFlashShotId(null);
    setResultTab("formatted");
    nextShotIdRef.current = 1;
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
        } satisfies GeneratePayload),
      });
      const genJson = (await genRes.json()) as { rawText?: string; error?: string };
      if (!genRes.ok) {
        throw new Error(genJson.error || "Generation failed");
      }

      setResultText(genJson.rawText ?? "");
      showToast("success", "Structured result is ready");
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Unexpected error during generation",
      );
    } finally {
      setBusyPhase(null);
    }
  }, [captureAndUploadScreenshots, enforceSchema, schemaType, showToast, shots.length, titleHint, videoOnGemini]);

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
    showAdvanced,
    setShowAdvanced,
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
