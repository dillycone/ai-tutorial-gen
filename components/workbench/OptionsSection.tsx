// components/workbench/OptionsSection.tsx
"use client";

import { BusyPhase } from "@/hooks/useVideoWorkbench";
import { PromptMode, PromptOptimizationMeta, SchemaType } from "@/lib/types";
import Spinner from "./Spinner";
import { useMemo } from "react";

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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Icons
import {
  Settings,
  ExternalLink,
  Loader2,
  Shield,
  Zap,
} from "lucide-react";

// Extracted subcomponents
import SchemaConfig from "@/components/workbench/options/SchemaConfig";
import PromptStrategy from "@/components/workbench/options/PromptStrategy";
import AdvancedOptionsPanel from "@/components/workbench/options/AdvancedOptionsPanel";
import TextField from "@/components/workbench/form/TextField";

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
  const titlePlaceholder = useMemo(
    () =>
      schemaType === "tutorial"
        ? "Optional hint (e.g., How to set up product launch workspace)"
        : "Optional meeting title hint (e.g., Q3 OKR Planning)",
    [schemaType]
  );

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
          <SchemaConfig
            schemaType={schemaType}
            setSchemaType={setSchemaType}
            enforceSchema={enforceSchema}
            setEnforceSchema={setEnforceSchema}
          />

          {/* Title Hint Input */}
          <TextField
            id="title-hint"
            label="Title Hint"
            value={titleHint}
            onChange={setTitleHint}
            placeholder={titlePlaceholder}
          />

          {/* Prompt Strategy */}
          <PromptStrategy
            promptMode={promptMode}
            setPromptMode={setPromptMode}
            busy={busyPhase === "generate"}
            promptMeta={promptMeta}
          />

          {/* Advanced Options */}
          <AdvancedOptionsPanel
            open={showAdvanced}
            onOpenChange={setShowAdvanced}
            schemaType={schemaType}
            promptMode={promptMode}
            promoteBaseline={promoteBaseline}
            setPromoteBaseline={setPromoteBaseline}
            promptMeta={promptMeta}
          />
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
