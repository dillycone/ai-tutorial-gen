// hooks/useShotManager.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toTimecode } from "@/lib/format";
import type { Shot } from "@/lib/types";

export type ShotManagerOptions = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  notify: (type: "success" | "error" | "info", message: string) => void;
};

export type ShotManagerReturn = {
  shots: Shot[];
  latestShotId: string | null;
  flashShotId: string | null;
  captureShot: () => void;
  removeShot: (id: string) => void;
  updateShot: (id: string, changes: Partial<Shot>) => void;
  moveShot: (id: string, direction: "left" | "right") => void;
  resetShots: () => void;
};

export function useShotManager({ videoRef, videoUrl, notify }: ShotManagerOptions): ShotManagerReturn {
  const nextShotIdRef = useRef(1);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [latestShotId, setLatestShotId] = useState<string | null>(null);
  const [flashShotId, setFlashShotId] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    },
    [],
  );

  const resetShots = useCallback(() => {
    setShots([]);
    setLatestShotId(null);
    setFlashShotId(null);
    nextShotIdRef.current = 1;
  }, []);

  const captureShot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
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

    notify("success", `Captured ${defaultLabel} @ ${timecode}`);
  }, [notify, videoRef, videoUrl]);

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
    latestShotId,
    flashShotId,
    captureShot,
    removeShot,
    updateShot,
    moveShot,
    resetShots,
  };
}
