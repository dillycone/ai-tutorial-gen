"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SchemaType, PromptMode, PromptOptimizationMeta } from "@/lib/types";
import { FeatureWeights, defaultsFor, getStorageKey } from "@/lib/featureImportance";
import { useLocalStorage, safeGetItem, safeSetItem } from "@/hooks/useLocalStorage";

export type ResultTab = "formatted" | "json";

export type UseGenerationStateReturn = {
  // Core generation options
  enforceSchema: boolean;
  setEnforceSchema: (v: boolean) => void;
  schemaType: SchemaType;
  setSchemaType: (v: SchemaType) => void;
  titleHint: string;
  setTitleHint: (v: string) => void;

  // Prompt strategy and meta
  promptMode: PromptMode;
  setPromptMode: (mode: PromptMode) => void;
  promptMeta: PromptOptimizationMeta | null;
  setPromptMeta: (meta: PromptOptimizationMeta | null) => void;

  // UI
  showAdvanced: boolean;
  setShowAdvanced: (v: boolean) => void;

  // Baseline promotion
  promoteBaseline: boolean;
  setPromoteBaseline: (v: boolean) => void;

  // DSPy optimization knobs
  jsonBonus: number;
  setJsonBonus: (n: number) => void;
  featureWeights: FeatureWeights;
  setFeatureWeights: (w: FeatureWeights) => void;
  alwaysFullValidation: boolean;
  setAlwaysFullValidation: (v: boolean) => void;
  parallelEvalEnabled: boolean;
  setParallelEvalEnabled: (v: boolean) => void;
  parallelWorkers: number;
  setParallelWorkers: (n: number) => void;
  parallelBatchSize: number;
  setParallelBatchSize: (n: number) => void;

  // Results
  resultText: string | null;
  setResultText: (t: string | null) => void;
  resultTab: ResultTab;
  setResultTab: (tab: ResultTab) => void;

  // Helpers
  resetForNewSource: () => void;
};

const JSON_BONUS_KEY = "dspy.jsonBonus";
const ALWAYS_FULL_VALIDATION_KEY = "dspy.alwaysFullValidation";
const PARALLEL_ENABLED_KEY = "dspy.parallel.enabled";
const PARALLEL_WORKERS_KEY = "dspy.parallel.workers";
const PARALLEL_BATCH_KEY = "dspy.parallel.batchSize";

export function useGenerationState(): UseGenerationStateReturn {
  // Core options
  const [enforceSchema, setEnforceSchema] = useState(true);
  const [schemaType, setSchemaType] = useState<SchemaType>("tutorial");
  const [titleHint, setTitleHint] = useState("");

  // Prompt strategy/meta
  const [promptModeState, setPromptModeState] = useState<PromptMode>("manual");
  const [promptMeta, setPromptMeta] = useState<PromptOptimizationMeta | null>(null);

  // UI
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Baseline
  const [promoteBaseline, setPromoteBaseline] = useState(true);

  // LocalStorage-backed controls
  const [jsonBonus, setJsonBonusLs] = useLocalStorage<number>(JSON_BONUS_KEY, 0.25);
  const [alwaysFullValidation, setAlwaysFullValidationLs] = useLocalStorage<boolean>(ALWAYS_FULL_VALIDATION_KEY, false);
  const [parallelEvalEnabled, setParallelEvalEnabledLs] = useLocalStorage<boolean>(PARALLEL_ENABLED_KEY, false);
  const [parallelWorkers, setParallelWorkersLs] = useLocalStorage<number>(PARALLEL_WORKERS_KEY, 4);
  const [parallelBatchSize, setParallelBatchSizeLs] = useLocalStorage<number>(PARALLEL_BATCH_KEY, 8);

  // Feature weights depend on schema type; initialize from defaults merged with any saved overrides
  const defaultWeights = useMemo(() => defaultsFor(schemaType), [schemaType]);
  const [featureWeights, setFeatureWeightsState] = useState<FeatureWeights>(defaultWeights);

  // Result display state
  const [resultText, setResultText] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>("formatted");

  // Derived setters wrapping LS
  const setJsonBonus = useCallback((n: number) => {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
    setJsonBonusLs(clamped);
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("dspy:jsonBonus", { detail: clamped }));
      } catch {
        // ignore
      }
    }
  }, [setJsonBonusLs]);

  const setAlwaysFullValidation = useCallback((v: boolean) => {
    setAlwaysFullValidationLs(Boolean(v));
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("dspy:alwaysFullValidation", { detail: Boolean(v) }));
      } catch {
        // ignore
      }
    }
  }, [setAlwaysFullValidationLs]);

  const setParallelEvalEnabled = useCallback((v: boolean) => {
    setParallelEvalEnabledLs(Boolean(v));
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("dspy:parallelEval", {
          detail: { enabled: Boolean(v), workers: parallelWorkers, batchSize: parallelBatchSize },
        }));
      } catch {
        // ignore
      }
    }
  }, [parallelBatchSize, parallelWorkers, setParallelEvalEnabledLs]);

  const setParallelWorkers = useCallback((n: number) => {
    const next = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
    setParallelWorkersLs(next);
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("dspy:parallelEval", {
          detail: { enabled: parallelEvalEnabled, workers: next, batchSize: parallelBatchSize },
        }));
      } catch {
        // ignore
      }
    }
  }, [parallelBatchSize, parallelEvalEnabled, setParallelWorkersLs]);

  const setParallelBatchSize = useCallback((n: number) => {
    const next = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
    setParallelBatchSizeLs(next);
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("dspy:parallelEval", {
          detail: { enabled: parallelEvalEnabled, workers: parallelWorkers, batchSize: next },
        }));
      } catch {
        // ignore
      }
    }
  }, [parallelEvalEnabled, parallelWorkers, setParallelBatchSizeLs]);

  // Feature weights setter: persist and broadcast
  const setFeatureWeights = useCallback((w: FeatureWeights) => {
    const key = getStorageKey(schemaType);
    setFeatureWeightsState(w);
    if (typeof window !== "undefined") {
      try {
        safeSetItem(key, JSON.stringify(w));
      } catch {
        // ignore
      }
      try {
        window.dispatchEvent(new CustomEvent("dspy:featureWeights", { detail: { schemaType, weights: w } }));
      } catch {
        // ignore
      }
    }
  }, [schemaType]);

  // Load stored feature weights when schema changes
  useEffect(() => {
    const key = getStorageKey(schemaType);
    try {
      const raw = safeGetItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as FeatureWeights;
        if (parsed && typeof parsed === "object") {
          setFeatureWeightsState({ ...defaultWeights, ...parsed });
          return;
        }
      }
    } catch {
      // ignore parse issues
    }
    setFeatureWeightsState(defaultWeights);
    // Write defaults to storage for consistency
    try {
      safeSetItem(key, JSON.stringify(defaultWeights));
    } catch {
      // ignore
    }
  }, [defaultWeights, schemaType]);

  // Event listeners (mirror existing global coordination)
  useEffect(() => {
    // jsonBonus
    const onJsonBonus = (event: Event) => {
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
        setJsonBonusLs(clamped);
        try {
          safeSetItem(JSON_BONUS_KEY, String(clamped));
        } catch {
          // ignore
        }
      }
    };

    // featureWeights
    const onFeatureWeights = (event: Event) => {
      const ce = event as CustomEvent<any>;
      const detail = (ce as any).detail;
      const obj =
        detail && typeof detail === "object" && detail.weights && typeof detail.weights === "object"
          ? detail.weights
          : typeof detail === "object"
            ? detail
            : null;
      if (obj && typeof obj === "object") {
        const weights: FeatureWeights = {};
        for (const [k, v] of Object.entries(obj)) {
          const num = Number(v);
          if (Number.isFinite(num)) weights[k] = num;
        }
        setFeatureWeightsState(weights);
        try {
          const key = getStorageKey(schemaType);
          safeSetItem(key, JSON.stringify(weights));
        } catch {
          // ignore
        }
      }
    };

    // alwaysFullValidation
    const onAlwaysFullValidation = (event: Event) => {
      const ce = event as CustomEvent<any>;
      const detail = (ce as any).detail;
      const val =
        typeof detail === "boolean"
          ? detail
          : typeof detail?.value === "boolean"
            ? detail.value
            : undefined;
      if (typeof val === "boolean") {
        setAlwaysFullValidationLs(val);
        try {
          safeSetItem(ALWAYS_FULL_VALIDATION_KEY, String(val));
        } catch {
          // ignore
        }
      }
    };

    // parallelEval settings
    const onParallelEval = (event: Event) => {
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
          setParallelEvalEnabledLs(enabled);
          try {
            safeSetItem(PARALLEL_ENABLED_KEY, String(enabled));
          } catch {
            // ignore
          }
        }
        if (Number.isFinite(workers as number) && (workers as number) > 0) {
          setParallelWorkersLs(workers as number);
          try {
            safeSetItem(PARALLEL_WORKERS_KEY, String(workers));
          } catch {
            // ignore
          }
        }
        if (Number.isFinite(batch as number) && (batch as number) > 0) {
          setParallelBatchSizeLs(batch as number);
          try {
            safeSetItem(PARALLEL_BATCH_KEY, String(batch));
          } catch {
            // ignore
          }
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("dspy:jsonBonus", onJsonBonus as EventListener);
      window.addEventListener("dspy:featureWeights", onFeatureWeights as EventListener);
      window.addEventListener("dspy:alwaysFullValidation", onAlwaysFullValidation as EventListener);
      window.addEventListener("dspy:parallelEval", onParallelEval as EventListener);
      return () => {
        window.removeEventListener("dspy:jsonBonus", onJsonBonus as EventListener);
        window.removeEventListener("dspy:featureWeights", onFeatureWeights as EventListener);
        window.removeEventListener("dspy:alwaysFullValidation", onAlwaysFullValidation as EventListener);
        window.removeEventListener("dspy:parallelEval", onParallelEval as EventListener);
      };
    }
    return () => {};
  }, [schemaType, setAlwaysFullValidationLs, setJsonBonusLs, setParallelBatchSizeLs, setParallelEvalEnabledLs, setParallelWorkersLs]);

  const setPromptMode = useCallback((mode: PromptMode) => {
    setPromptModeState(mode);
    setPromptMeta(null);
  }, []);

  const resetForNewSource = useCallback(() => {
    setResultText(null);
    setResultTab("formatted");
    setPromptMeta(null);
  }, []);

  return {
    enforceSchema,
    setEnforceSchema,
    schemaType,
    setSchemaType,
    titleHint,
    setTitleHint,

    promptMode: promptModeState,
    setPromptMode,
    promptMeta,
    setPromptMeta,

    showAdvanced,
    setShowAdvanced,

    promoteBaseline,
    setPromoteBaseline,

    jsonBonus,
    setJsonBonus,
    featureWeights,
    setFeatureWeights,
    alwaysFullValidation,
    setAlwaysFullValidation,
    parallelEvalEnabled,
    setParallelEvalEnabled,
    parallelWorkers,
    setParallelWorkers,
    parallelBatchSize,
    setParallelBatchSize,

    resultText,
    setResultText,
    resultTab,
    setResultTab,

    resetForNewSource,
  };
}