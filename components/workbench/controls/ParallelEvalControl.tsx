"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface ParallelEvalControlProps {
  enabled: boolean;
}

export default function ParallelEvalControl({ enabled }: ParallelEvalControlProps) {
  const KEY_ENABLED = "dspy.parallel.enabled";
  const KEY_WORKERS = "dspy.parallel.workers";
  const KEY_BATCH = "dspy.parallel.batchSize";

  const [parallelEnabled, setParallelEnabled] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined") {
        return false;
      }
      const saved = window.localStorage.getItem(KEY_ENABLED);
      if (saved === "true") return true;
      if (saved === "false") return false;
    } catch {
      // ignore
    }
    return false;
  });

  const [workers, setWorkers] = useState<number>(() => {
    try {
      if (typeof window === "undefined") {
        return 4;
      }
      const saved = window.localStorage.getItem(KEY_WORKERS);
      const n = saved != null ? Number.parseInt(saved, 10) : NaN;
      if (Number.isFinite(n) && n > 0) return n;
    } catch {
      // ignore
    }
    return 4;
  });

  const [batch, setBatch] = useState<number>(() => {
    try {
      if (typeof window === "undefined") {
        return 8;
      }
      const saved = window.localStorage.getItem(KEY_BATCH);
      const n = saved != null ? Number.parseInt(saved, 10) : NaN;
      if (Number.isFinite(n) && n > 0) return n;
    } catch {
      // ignore
    }
    return 8;
  });

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(KEY_ENABLED, String(parallelEnabled));
        window.localStorage.setItem(KEY_WORKERS, String(workers));
        window.localStorage.setItem(KEY_BATCH, String(batch));
      }
    } catch {
      // ignore
    }
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("dspy:parallelEval", {
            detail: { enabled: parallelEnabled, workers, batchSize: batch },
          })
        );
      }
    } catch {
      // ignore
    }
  }, [parallelEnabled, workers, batch]);

  const disabled = !enabled;

  return (
    <div className="rounded-lg border border-gray-200 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="space-y-1 pr-4">
          <p className="text-sm font-medium text-gray-800">Parallel evaluation</p>
          <p className="text-xs text-gray-500">
            When enabled, the optimizer evaluates prompt fitness across examples in parallel to speed up analysis.
            This does not increase LLM throughput; it parallelizes local scoring.
          </p>
          {disabled && <p className="text-xs text-gray-400">Switch to DSPy mode to apply these during optimization.</p>}
        </div>
        <Badge variant="outline" className={parallelEnabled ? "border-emerald-300 text-emerald-600" : "border-gray-300 text-gray-700"}>
          {parallelEnabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white/60 p-3">
          <div className="text-sm text-gray-800">Enable parallel</div>
          <Switch checked={parallelEnabled} onCheckedChange={(v) => setParallelEnabled(Boolean(v))} disabled={disabled} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white/60 p-3">
          <div className="text-sm text-gray-800">Workers</div>
          <Input
            type="number"
            min={1}
            max={64}
            step={1}
            value={workers}
            onChange={(e) => setWorkers(Math.max(1, Math.min(64, Number.parseInt(e.target.value || "0", 10) || 1)))}
            disabled={disabled || !parallelEnabled}
            className="w-[120px]"
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white/60 p-3">
          <div className="text-sm text-gray-800">Batch size</div>
          <Input
            type="number"
            min={1}
            max={64}
            step={1}
            value={batch}
            onChange={(e) => setBatch(Math.max(1, Math.min(64, Number.parseInt(e.target.value || "0", 10) || 1)))}
            disabled={disabled || !parallelEnabled}
            className="w-[120px]"
          />
        </div>
      </div>
    </div>
  );
}