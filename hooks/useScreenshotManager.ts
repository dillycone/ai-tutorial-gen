"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toTimecode } from "@/lib/format";
import type { Shot } from "@/lib/types";

export type ToastType = "success" | "error" | "info";

export type UseScreenshotManagerOptions = {
  /**
   * Reference to the HTMLVideoElement used for capturing frames.
   */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /**
   * Whether screenshot capture is currently allowed (e.g., a video is loaded).
   * Defaults to false.
   */
  canCapture?: boolean;
  /**
   * Optional toast callback for user feedback.
   */
  onToast?: (type: ToastType, message: string) => void;
  /**
   * Duration in milliseconds for which a newly captured shot should be highlighted.
   * Defaults to 2000 ms.
   */
  flashDurationMs?: number;
  /**
   * Optional initial shots (e.g., when hydrating from persisted state).
   */
  initialShots?: Shot[];
};

export type UseScreenshotManagerReturn = {
  shots: Shot[];
  setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
  latestShotId: string | null;
  flashShotId: string | null;

  captureShot: () => void;
  removeShot: (id: string) => void;
  updateShot: (id: string, changes: Partial<Shot>) => void;
  moveShot: (id: string, direction: "left" | "right") => void;

  resetShots: () => void;
};

function extractMaxShotIndex(shots: Shot[]): number {
  // Extract the numeric part of our "sN" ids to keep sequence stable after rehydration
  let max = 0;
  for (const s of shots) {
    const m = /^s(\d+)$/.exec(s.id);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

export function useScreenshotManager({
  videoRef,
  canCapture = false,
  onToast,
  flashDurationMs = 2000,
  initialShots = [],
}: UseScreenshotManagerOptions): UseScreenshotManagerReturn {
  const [shots, setShots] = useState<Shot[]>(() => [...initialShots]);
  const [latestShotId, setLatestShotId] = useState<string | null>(null);
  const [flashShotId, setFlashShotId] = useState<string | null>(null);

  const nextShotIdRef = useRef<number>(extractMaxShotIndex(initialShots) + 1 || 1);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const notify = useCallback(
    (type: ToastType, message: string) => {
      try {
        onToast?.(type, message);
      } catch {
        // ignore toast errors
      }
    },
    [onToast]
  );

  const resetShots = useCallback(() => {
    setShots([]);
    setLatestShotId(null);
    setFlashShotId(null);
    nextShotIdRef.current = 1;
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
  }, []);

  const captureShot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !canCapture) return;

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
    highlightTimeoutRef.current = setTimeout(() => setFlashShotId(null), flashDurationMs);

    notify("success", `Captured ${defaultLabel} @ ${timecode}`);
  }, [canCapture, flashDurationMs, notify, videoRef]);

  const removeShot = useCallback((id: string) => {
    setShots((prev) => prev.filter((shot) => shot.id !== id));
  }, []);

  const updateShot = useCallback((id: string, changes: Partial<Shot>) => {
    setShots((prev) => prev.map((shot) => (shot.id === id ? { ...shot, ...changes } : shot)));
  }, []);

  const moveShot = useCallback((id: string, direction: "left" | "right") => {
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

  return {
    shots,
    setShots,
    latestShotId,
    flashShotId,
    captureShot,
    removeShot,
    updateShot,
    moveShot,
    resetShots,
  };
}

export default useScreenshotManager;