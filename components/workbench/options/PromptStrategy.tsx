// components/workbench/options/PromptStrategy.tsx
"use client";

import clsx from "clsx";
import { PromptMode, PromptOptimizationMeta } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type PromptStrategyProps = {
  promptMode: PromptMode;
  setPromptMode: (mode: PromptMode) => void;
  busy: boolean;
  promptMeta: PromptOptimizationMeta | null;
};

export default function PromptStrategy({
  promptMode,
  setPromptMode,
  busy,
  promptMeta,
}: PromptStrategyProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-gray-700">Prompt Strategy</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setPromptMode("manual")}
          className={clsx(
            "px-4 py-2 text-sm font-medium transition-colors",
            promptMode === "manual"
              ? "border-indigo-500 bg-indigo-50 text-indigo-600 shadow-sm"
              : "border-gray-300 text-gray-700 hover:bg-gray-50",
          )}
        >
          Manual prompt
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setPromptMode("dspy")}
          className={clsx(
            "px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2",
            promptMode === "dspy"
              ? "border-purple-500 bg-purple-50 text-purple-600 shadow-sm"
              : "border-gray-300 text-gray-700 hover:bg-gray-50",
          )}
        >
          DSPy GEPA
          <Badge variant="outline" className="border-purple-200 text-purple-500 text-[10px]">
            beta
          </Badge>
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        Toggle between handcrafted guidance and DSPy 3 + GEPA optimized instructions.
      </p>
      {promptMeta && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <Badge
            variant="outline"
            className={`border ${
              promptMeta.appliedMode === "dspy"
                ? "border-purple-300 text-purple-600"
                : "border-gray-300 text-gray-600"
            }`}
          >
            {promptMeta.appliedMode === "dspy" ? "DSPy applied" : "Manual prompt"}
          </Badge>
          <span className="font-medium text-gray-700">
            {promptMeta.message || "Prompt strategy evaluated."}
          </span>
          {typeof promptMeta.coverage === "number" && (
            <span className="text-[11px] text-gray-500">
              Coverage {(promptMeta.coverage * 100).toFixed(0)}%
            </span>
          )}
          {typeof promptMeta.score === "number" && (
            <span className="text-[11px] text-gray-500">
              Score {(promptMeta.score * 100).toFixed(0)}%
            </span>
          )}
          {typeof promptMeta.retrievedFromExperience === "number" && promptMeta.retrievedFromExperience > 0 && (
            <span className="text-[11px] text-gray-500">
              Memory {promptMeta.retrievedFromExperience}
            </span>
          )}
        </div>
      )}
    </div>
  );
}