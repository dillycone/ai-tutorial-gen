// components/workbench/OptionsSection.tsx
"use client";

import { BusyPhase } from "@/hooks/useVideoWorkbench";
import { SchemaType } from "@/lib/types";
import Spinner from "./Spinner";

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

type OptionsSectionProps = {
  schemaType: SchemaType;
  setSchemaType: (value: SchemaType) => void;
  enforceSchema: boolean;
  setEnforceSchema: (value: boolean) => void;
  titleHint: string;
  setTitleHint: (value: string) => void;
  showAdvanced: boolean;
  setShowAdvanced: (value: boolean) => void;
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
  showAdvanced,
  setShowAdvanced,
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
            <CollapsibleContent className="mt-3">
              <Alert className="border-gray-200 bg-gray-50">
                <Info className="size-4" />
                <AlertDescription className="text-gray-600">
                  More controls coming soon — language preferences, transcript syncing, and export formats.
                </AlertDescription>
              </Alert>
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
