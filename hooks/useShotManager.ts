// hooks/useShotManager.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toTimecode } from "@/lib/format";
import type { Shot } from "@/lib/types";

type NewShotInput = {
  timeSec: number;
  dataUrl: string;
  label?: string;
  note?: string;
  origin?: Shot["origin"];
  id?: string;
  timecode?: string;
};

type AddShotsOptions = {
  dedupe?: boolean;
};

const DEDUPE_TOLERANCE_SEC = 0.5;

export type ShotManagerOptions = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  notify: (type: "success" | "error" | "info", message: string) => void;
  deriveShotMetadata?: (shot: Shot) => Partial<Shot> | null | undefined;
};

export type ShotManagerReturn = {
  shots: Shot[];
  latestShotId: string | null;
  flashShotId: string | null;
  captureShot: () => void;
  addShots: (inputs: NewShotInput[], options?: AddShotsOptions) => Shot[];
  removeShot: (id: string) => void;
  updateShot: (id: string, changes: Partial<Shot>) => void;
  moveShot: (id: string, direction: "left" | "right") => void;
  resetShots: () => void;
  refreshMetadata: () => void;
};

export function useShotManager({
  videoRef,
  videoUrl,
  notify,
  deriveShotMetadata,
}: ShotManagerOptions): ShotManagerReturn {
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

  const applyDerivedMetadata = useCallback(
    (shot: Shot): Shot => {
      if (!deriveShotMetadata) return shot;
      const derived = deriveShotMetadata(shot);
      if (!derived) return shot;
      let next: Shot | null = null;
      for (const [key, value] of Object.entries(derived)) {
        const k = key as keyof Shot;
        const current = shot[k];
        if (value === undefined) {
          if (current !== undefined) {
            if (!next) next = { ...shot };
            delete (next as Record<string, unknown>)[k];
          }
          continue;
        }
        if (current !== value) {
          if (!next) next = { ...shot };
          next[k] = value as Shot[keyof Shot];
        }
      }
      return next ?? shot;
    },
    [deriveShotMetadata],
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

    const baseShot: Shot = {
      id,
      timeSec,
      timecode,
      dataUrl,
      label: defaultLabel,
      origin: "manual",
    };

    const shotWithMetadata = applyDerivedMetadata(baseShot);

    setShots((prev) => [...prev, shotWithMetadata]);

    setLatestShotId(id);
    setFlashShotId(id);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setFlashShotId(null), 2000);

    notify("success", `Captured ${defaultLabel} @ ${timecode}`);
  }, [applyDerivedMetadata, notify, videoRef, videoUrl]);

  const addShots = useCallback(
    (inputs: NewShotInput[], options: AddShotsOptions = {}) => {
      if (!inputs || inputs.length === 0) return [];
      const dedupe = options.dedupe ?? true;
      const created: Shot[] = [];

      const dedupeKey = (timeSec: number) => Math.round(timeSec / DEDUPE_TOLERANCE_SEC).toString();

      setShots((prev) => {
        if (inputs.length === 0) return prev;
        const existingKeys = new Set(prev.map((shot) => dedupeKey(shot.timeSec)));
        let changed = false;
        const next = [...prev];

        for (const input of inputs) {
          if (!Number.isFinite(input.timeSec) || typeof input.dataUrl !== "string") {
            continue;
          }
          const timeSec = Number(input.timeSec);
          const key = dedupeKey(timeSec);
          if (dedupe && existingKeys.has(key)) {
            continue;
          }

          const id = input.id ?? `s${nextShotIdRef.current}`;
          nextShotIdRef.current += 1;
          const label = input.label ?? `Screenshot ${nextShotIdRef.current - 1}`;
          const baseShot: Shot = {
            id,
            timeSec,
            timecode: input.timecode ?? toTimecode(timeSec),
            dataUrl: input.dataUrl,
            label,
            note: input.note,
            origin: input.origin ?? "suggested",
          };
          const annotated = applyDerivedMetadata(baseShot);
          next.push(annotated);
          existingKeys.add(key);
          created.push(annotated);
          changed = true;
        }

        if (!changed) return prev;
        return next;
      });

      if (created.length > 0) {
        const last = created[created.length - 1];
        setLatestShotId(last.id);
        setFlashShotId(last.id);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => setFlashShotId(null), 2000);
      }

      return created;
    },
    [applyDerivedMetadata],
  );

  const removeShot = useCallback((id: string) => {
    setShots((prev) => prev.filter((shot) => shot.id !== id));
  }, []);

  const updateShot = useCallback(
    (id: string, changes: Partial<Shot>) => {
      setShots((prev) =>
        prev.map((shot) => {
          if (shot.id !== id) return shot;
          const merged: Shot = { ...shot, ...changes };
          return applyDerivedMetadata(merged);
        }),
      );
    },
    [applyDerivedMetadata],
  );

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

  const refreshMetadata = useCallback(() => {
    if (!deriveShotMetadata) return;
    setShots((prev) => prev.map((shot) => applyDerivedMetadata(shot)));
  }, [applyDerivedMetadata, deriveShotMetadata]);

  return {
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
  };
}
