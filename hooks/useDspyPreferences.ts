// hooks/useDspyPreferences.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { SchemaType } from "@/lib/types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readNumberSetting = (key: string, fallback: number, min: number, max: number, integer = false) => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw != null) {
      const num = Number(raw);
      if (Number.isFinite(num)) {
        const value = integer ? Math.floor(num) : num;
        return clamp(value, min, max);
      }
    }
  } catch {
    // ignore
  }
  return fallback;
};

const readBooleanSetting = (key: string, fallback: boolean) => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    // ignore
  }
  return fallback;
};

const safeSetItem = (key: string, value: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore persistence failures
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const extractNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (isRecord(value) && typeof value.value === "number" && Number.isFinite(value.value)) {
    return value.value;
  }
  return undefined;
};

const extractBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  if (isRecord(value) && typeof value.value === "boolean") {
    return value.value;
  }
  return undefined;
};

const extractWeights = (value: unknown): Record<string, number> | undefined => {
  if (!isRecord(value)) return undefined;
  const source = value.weights && isRecord(value.weights) ? value.weights : value;
  const weights: Record<string, number> = {};
  for (const [key, entry] of Object.entries(source)) {
    const num = Number(entry);
    if (Number.isFinite(num)) {
      weights[key] = num;
    }
  }
  return Object.keys(weights).length > 0 ? weights : undefined;
};

const extractInteger = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
  }
  if (isRecord(value)) {
    return extractInteger(value.value);
  }
  return undefined;
};

export type DspyPreferences = {
  jsonBonus: number;
  featureWeights: Record<string, number>;
  alwaysFullValidation: boolean;
  parallelEvalEnabled: boolean;
  parallelWorkers: number;
  parallelBatchSize: number;
  setFeatureWeights: (weights: Record<string, number>) => void;
};

export function useDspyPreferences(schemaType: SchemaType): DspyPreferences {
  const [jsonBonus, setJsonBonus] = useState(() => readNumberSetting("dspy.jsonBonus", 0.25, 0, 1));
  const [featureWeights, setFeatureWeightsState] = useState<Record<string, number>>({});
  const [alwaysFullValidation, setAlwaysFullValidation] = useState(() =>
    readBooleanSetting("dspy.alwaysFullValidation", false),
  );
  const [parallelEvalEnabled, setParallelEvalEnabled] = useState(() =>
    readBooleanSetting("dspy.parallel.enabled", false),
  );
  const [parallelWorkers, setParallelWorkers] = useState(() =>
    readNumberSetting("dspy.parallel.workers", 4, 1, Number.MAX_SAFE_INTEGER, true),
  );
  const [parallelBatchSize, setParallelBatchSize] = useState(() =>
    readNumberSetting("dspy.parallel.batchSize", 8, 1, Number.MAX_SAFE_INTEGER, true),
  );

  const persistFeatureWeights = useCallback(
    (weights: Record<string, number>) => {
      setFeatureWeightsState(weights);
      safeSetItem(`dspy.featureWeights.${schemaType}`, JSON.stringify(weights));
    },
    [schemaType],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`dspy.featureWeights.${schemaType}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") {
          const sanitized: Record<string, number> = {};
          for (const [key, value] of Object.entries(parsed)) {
            const num = Number(value);
            if (Number.isFinite(num)) sanitized[key] = num;
          }
          persistFeatureWeights(sanitized);
          return;
        }
      }
    } catch {
      // ignore stored value errors
    }
    setFeatureWeightsState({});
  }, [persistFeatureWeights, schemaType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const raw = extractNumber(detail);
      if (typeof raw === "number") {
        const clamped = clamp(raw, 0, 1);
        setJsonBonus(clamped);
        safeSetItem("dspy.jsonBonus", String(clamped));
      }
    };
    window.addEventListener("dspy:jsonBonus", handler as EventListener);
    return () => window.removeEventListener("dspy:jsonBonus", handler as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const weights = extractWeights(detail);
      if (weights) {
        persistFeatureWeights(weights);
      }
    };
    window.addEventListener("dspy:featureWeights", handler as EventListener);
    return () => window.removeEventListener("dspy:featureWeights", handler as EventListener);
  }, [persistFeatureWeights]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const value = extractBoolean(detail);
      if (typeof value === "boolean") {
        setAlwaysFullValidation(value);
        safeSetItem("dspy.alwaysFullValidation", String(value));
      }
    };
    window.addEventListener("dspy:alwaysFullValidation", handler as EventListener);
    return () => window.removeEventListener("dspy:alwaysFullValidation", handler as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const topLevelEnabled = extractBoolean(detail);
      if (typeof topLevelEnabled === "boolean") {
        setParallelEvalEnabled(topLevelEnabled);
        safeSetItem("dspy.parallel.enabled", String(topLevelEnabled));
      }

      if (!isRecord(detail)) return;

      const enabled = extractBoolean(detail.enabled ?? detail.value);
      if (typeof enabled === "boolean") {
        setParallelEvalEnabled(enabled);
        safeSetItem("dspy.parallel.enabled", String(enabled));
      }

      const workers = extractInteger(detail.workers);
      if (typeof workers === "number" && workers > 0) {
        const next = clamp(workers, 1, Number.MAX_SAFE_INTEGER);
        setParallelWorkers(next);
        safeSetItem("dspy.parallel.workers", String(next));
      }

      const batch = extractInteger(detail.batchSize);
      if (typeof batch === "number" && batch > 0) {
        const next = clamp(batch, 1, Number.MAX_SAFE_INTEGER);
        setParallelBatchSize(next);
        safeSetItem("dspy.parallel.batchSize", String(next));
      }
    };
    window.addEventListener("dspy:parallelEval", handler as EventListener);
    return () => window.removeEventListener("dspy:parallelEval", handler as EventListener);
  }, []);

  return {
    jsonBonus,
    featureWeights,
    alwaysFullValidation,
    parallelEvalEnabled,
    parallelWorkers,
    parallelBatchSize,
    setFeatureWeights: persistFeatureWeights,
  };
}
