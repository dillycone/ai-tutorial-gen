// components/workbench/options/AdvancedOptionsPanel.tsx
"use client";

import { SchemaType, PromptMode, PromptOptimizationMeta } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import JSONBonusControl from "@/components/workbench/controls/JSONBonusControl";
import FeatureImportanceControl from "@/components/workbench/controls/FeatureImportanceControl";
import ValidationModeControl from "@/components/workbench/controls/ValidationModeControl";
import ParallelEvalControl from "@/components/workbench/controls/ParallelEvalControl";
import DSPyCacheControl from "@/components/workbench/controls/DSPyCacheControl";
import { Switch } from "@/components/ui/switch";

type AdvancedOptionsPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schemaType: SchemaType;
  promptMode: PromptMode;
  promoteBaseline: boolean;
  setPromoteBaseline: (value: boolean) => void;
  promptMeta: PromptOptimizationMeta | null;
};

export default function AdvancedOptionsPanel({
  open,
  onOpenChange,
  schemaType,
  promptMode,
  promoteBaseline,
  setPromoteBaseline,
  promptMeta,
}: AdvancedOptionsPanelProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 h-auto p-2"
        >
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          Advanced Options
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-4">
        <Alert className="border-gray-200 bg-gray-50">
          <Info className="size-4" />
          <AlertDescription className="text-gray-600">
            More controls coming soon — language preferences, transcript syncing, and export formats.
          </AlertDescription>
        </Alert>

        {/* JSON Bonus (DSPy) */}
        <JSONBonusControl enabled={promptMode === "dspy"} />

        {/* Feature Importance (DSPy) */}
        <FeatureImportanceControl enabled={promptMode === "dspy"} schemaType={schemaType} />

        {/* Validation Mode (DSPy) */}
        <ValidationModeControl enabled={promptMode === "dspy"} />

        {/* Parallel Evaluation (DSPy) */}
        <ParallelEvalControl enabled={promptMode === "dspy"} />

        {/* DSPy Cache Controls */}
        <DSPyCacheControl schemaType={schemaType} promptMeta={promptMeta} />

        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white/80 p-4 shadow-sm">
          <div className="space-y-1 pr-4">
            <p className="text-sm font-medium text-gray-800">Promote DSPy prompt to baseline defaults</p>
            <p className="text-xs text-gray-500">
              When enabled, any parsed DSPy run that beats the stored score will overwrite the default prompt for this
              schema. Handy for letting strong runs become the new baseline.
            </p>
            {promptMode !== "dspy" ? (
              <p className="text-xs text-gray-400">Switch to DSPy mode to activate this setting.</p>
            ) : null}
            {promptMeta?.baselinePromoted ? (
              <Badge variant="outline" className="mt-1 border-emerald-300 bg-emerald-50 text-emerald-600">
                Baseline updated this run
              </Badge>
            ) : null}
          </div>
          <Switch
            checked={promoteBaseline}
            onCheckedChange={(checked) => setPromoteBaseline(Boolean(checked))}
            aria-label="Toggle prompt baseline promotion"
            disabled={promptMode !== "dspy"}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}