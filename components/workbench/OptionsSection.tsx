"use client";
// components/workbench/OptionsSection.tsx

import { BusyPhase } from "@/hooks/useVideoWorkbench";
import { PromptMode, PromptOptimizationMeta, SchemaType } from "@/lib/types";
import Spinner from "./Spinner";
import clsx from "clsx";

// ShadCN/UI Components
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// Icons
import {
  Settings,
  ChevronDown,
  ChevronUp,
  Info,
  Zap,
  ExternalLink,
  Loader2,
  Shield,
  BookOpen,
  Users,
} from "lucide-react";

import JSONBonusControl from "./controls/JSONBonusControl";
import FeatureImportanceControl from "./controls/FeatureImportanceControl";
import ValidationModeControl from "./controls/ValidationModeControl";
import ParallelEvalControl from "./controls/ParallelEvalControl";
import DSPyCacheControl from "./controls/DSPyCacheControl";

type OptionsSectionProps = {
  schemaType: SchemaType;
  setSchemaType: (value: SchemaType) => void;
  enforceSchema: boolean;
  setEnforceSchema: (value: boolean) => void;
  titleHint: string;
  setTitleHint: (value: string) => void;
  promptMode: PromptMode;
  setPromptMode: (value: PromptMode) => void;
  promptMeta: PromptOptimizationMeta | null;
  showAdvanced: boolean;
  setShowAdvanced: (value: boolean) => void;
  promoteBaseline: boolean;
  setPromoteBaseline: (value: boolean) => void;
  readyToGenerate: boolean;
  busyPhase: BusyPhase | null;
  onGenerate: () => Promise<void>;
};

export default function OptionsSection({
  schemaType,
  setSchemaType,
  enforceSchema,
  setEnforceSchema,
  titleHint,
  setTitleHint,
  promptMode,
  setPromptMode,
  promptMeta,
  showAdvanced,
  setShowAdvanced,
  promoteBaseline,
  setPromoteBaseline,
  readyToGenerate,
  busyPhase,
  onGenerate,
}: OptionsSectionProps) {
  const schemaDocs = "https://ai.google.dev/gemini-api/docs";

  return (
    <TooltipProvider>
      <Card className="animate-fade-in-up border border-gray-200 bg-white shadow-2xl shadow-gray-200/20 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-3xl hover:shadow-gray-300/30">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Settings className="size-5 text-indigo-400" />
                <CardTitle className="text-lg font-semibold text-gray-900">
                  Step 3 · Generate structured output
                </CardTitle>
              </div>
              <CardDescription className="text-sm text-gray-600">
                Configure the schema, provide context, and trigger Gemini to assemble the guide.
              </CardDescription>
            </div>
            <CardAction>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-gray-600 hover:text-gray-900 h-auto p-2"
                    asChild
                  >
                    <a
                      href={schemaDocs}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1"
                    >
                      <ExternalLink className="size-3" />
                      Schema docs
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>View JSON schema documentation</p>
                </TooltipContent>
              </Tooltip>
            </CardAction>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Schema Configuration */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="schema-select" className="text-sm font-medium text-gray-700">
                Schema Type
              </Label>
              <Select
                value={schemaType}
                onValueChange={(value) => setSchemaType(value as SchemaType)}
              >
                <SelectTrigger
                  id="schema-select"
                  className="bg-white border-gray-300 text-gray-900 hover:bg-gray-50 focus:border-sky-500 focus:ring-sky-500/50"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  <SelectItem value="tutorial" className="text-gray-900 hover:bg-gray-100">
                    <div className="flex items-center gap-2">
                      <BookOpen className="size-4 text-blue-400" />
                      Tutorial
                    </div>
                  </SelectItem>
                  <SelectItem value="meetingSummary" className="text-gray-900 hover:bg-gray-100">
                    <div className="flex items-center gap-2">
                      <Users className="size-4 text-green-400" />
                      Meeting Summary
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-3 mt-8">
              <Checkbox
                id="enforce-schema"
                checked={enforceSchema}
                onCheckedChange={(checked) => setEnforceSchema(checked as boolean)}
                className="border-gray-300 data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
              />
              <div className="flex items-center gap-2">
                <Label htmlFor="enforce-schema" className="text-sm text-gray-700 font-medium">
                  Enforce JSON schema
                </Label>
                <Badge variant="secondary" className="bg-sky-500/20 text-sky-300 text-xs">
                  Recommended
                </Badge>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-4 text-gray-500 hover:text-gray-700 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Ensures consistent output format and structure</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Title Hint Input */}
          <div className="space-y-2">
            <Label htmlFor="title-hint" className="text-sm font-medium text-gray-700">
              Title Hint
            </Label>
            <Input
              id="title-hint"
              value={titleHint}
              onChange={(event) => setTitleHint(event.target.value)}
              placeholder={
                schemaType === "tutorial"
                  ? "Optional hint (e.g., How to set up product launch workspace)"
                  : "Optional meeting title hint (e.g., Q3 OKR Planning)"
              }
              className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 hover:bg-gray-50 focus:border-sky-500 focus:ring-sky-500/50"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-gray-700">Prompt Strategy</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busyPhase === "generate"}
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
                disabled={busyPhase === "generate"}
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

          {/* Advanced Options */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 h-auto p-2"
              >
                {showAdvanced ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
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
        </CardContent>

        <CardFooter className="flex flex-col items-start gap-3">
          <Button
            onClick={onGenerate}
            disabled={!readyToGenerate}
            size="lg"
            className={`
              w-full sm:w-auto inline-flex items-center gap-2
              bg-gradient-to-r from-indigo-500 to-indigo-600
              hover:from-indigo-600 hover:to-indigo-700
              shadow-lg hover:shadow-xl hover:shadow-indigo-500/25
              transition-all duration-200 hover:scale-105 active:scale-95
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
              text-white font-semibold
            `}
          >
            {busyPhase === "generate" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <Spinner label="Generating" />
              </>
            ) : (
              <>
                <Zap className="size-4" />
                {schemaType === "tutorial" ? "Generate Tutorial" : "Generate Meeting Summary"}
              </>
            )}
          </Button>

          {!readyToGenerate && (
            <Alert className="border-amber-200 bg-amber-50">
              <Shield className="size-4 text-amber-500" />
              <AlertDescription className="text-amber-700 text-xs">
                Upload the video to Gemini and capture at least one screenshot to enable generation.
              </AlertDescription>
            </Alert>
          )}
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}
