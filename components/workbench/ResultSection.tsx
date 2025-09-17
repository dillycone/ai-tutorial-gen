// components/workbench/ResultSection.tsx
"use client";

import { useCallback } from "react";
import HowToViewer from "../HowToViewer";
import { PromptOptimizationMeta, SchemaType } from "@/lib/types";
import { Shot } from "@/lib/types";
import { markdownToHtml } from "@/lib/markdown";
import { ToastState } from "@/hooks/useVideoWorkbench";

// ShadCN UI Components
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";

// Lucide React Icons
import {
  Copy,
  Download,
  FileText,
  Code,
  Eye,
  AlertCircle,
  Loader2
} from "lucide-react";

// Safer JSON formatting helper that avoids double-quoting strings
const prettyOrRaw = (text: string) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

type ResultSectionProps = {
  resultText: string | null;
  resultTab: "formatted" | "json";
  setResultTab: (value: "formatted" | "json") => void;
  enforceSchema: boolean;
  schemaType: SchemaType;
  shots: Shot[];
  promptMeta: PromptOptimizationMeta | null;
  onCopy: (type: ToastState["type"], message: string) => void;
  onExportPdf: () => Promise<void>;
  isExporting: boolean;
};

export default function ResultSection({
  resultText,
  resultTab,
  setResultTab,
  enforceSchema,
  schemaType,
  shots,
  promptMeta,
  onCopy,
  onExportPdf,
  isExporting,
}: ResultSectionProps) {
  const handleCopy = useCallback(() => {
    if (!resultText) return;
    navigator.clipboard
      .writeText(resultText)
      .then(() => onCopy("success", enforceSchema ? "JSON copied" : "Content copied"))
      .catch(() => onCopy("error", "Unable to copy"));
  }, [onCopy, resultText, enforceSchema]);

  const contentType = enforceSchema ? "JSON" : (schemaType === "meetingSummary" ? "Meeting Summary" : "Tutorial");

  const renderEmptyState = () => (
    <Alert className="border-gray-200 bg-gray-50">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="space-y-2">
        <p className="text-gray-700">No result yet.</p>
        <p className="text-sm text-gray-600">
          Finish the steps above and select &quot;Generate&quot; to preview Gemini&apos;s structured output here.
        </p>
      </AlertDescription>
    </Alert>
  );


  const renderJsonContent = () => {
    if (!resultText) return null;
    const jsonContent = prettyOrRaw(resultText);
    return (
      <ScrollArea className="h-[420px] w-full">
        <pre className="text-xs text-gray-900 font-mono whitespace-pre-wrap p-4 bg-gray-50 rounded-lg border border-gray-200">
          {jsonContent}
        </pre>
      </ScrollArea>
    );
  };

  const renderFormattedContent = () => {
    if (!resultText) return null;

    if (enforceSchema) {
      return <HowToViewer jsonText={resultText} localShots={shots} schemaType={schemaType} />;
    }

    return (
      <ScrollArea className="h-[420px] w-full">
        <div
          className="prose prose-invert prose-sm max-w-none p-4"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(resultText) }}
        />
      </ScrollArea>
    );
  };

  return (
    <Card className="animate-fade-in-up border-gray-200 bg-white shadow-2xl shadow-gray-200/20 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-3xl hover:shadow-gray-300/30">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              Step 4 · Result
              {resultText && (
                <Badge variant="outline" className="text-xs border-gray-300 text-gray-700">
                  {contentType === "JSON" ? (
                    <>
                      <Code className="w-3 h-3" /> JSON
                    </>
                  ) : (
                    <>
                      <FileText className="w-3 h-3" /> {contentType}
                    </>
                  )}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-sm text-gray-600">
              Toggle between a formatted view and raw JSON to verify Gemini output.
            </CardDescription>
            {promptMeta && (
              <div className="flex flex-col gap-2 text-xs text-gray-500">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`border ${
                      promptMeta.appliedMode === "dspy"
                        ? "border-purple-300 text-purple-600"
                        : "border-gray-300 text-gray-600"
                    }`}
                  >
                    {promptMeta.appliedMode === "dspy" ? "DSPy optimized" : "Manual prompt"}
                  </Badge>
                  <span>{promptMeta.message || "Prompt strategy evaluated."}</span>
                  {promptMeta.baselinePromoted ? (
                    <Badge variant="outline" className="border-emerald-300 text-emerald-600">
                      Baseline saved
                    </Badge>
                  ) : null}
                  {typeof promptMeta.coverage === "number" && (
                    <span className="text-[11px] text-gray-400">
                      Coverage {(promptMeta.coverage * 100).toFixed(0)}%
                    </span>
                  )}
                  {typeof promptMeta.score === "number" && (
                    <span className="text-[11px] text-gray-400">
                      Score {(promptMeta.score * 100).toFixed(0)}%
                    </span>
                  )}
                  {typeof promptMeta.cacheHit === "boolean" && (
                    <Badge
                      variant="outline"
                      className={
                        promptMeta.cacheHit
                          ? "border-emerald-300 text-emerald-600"
                          : "border-gray-300 text-gray-600"
                      }
                    >
                      {promptMeta.cacheHit ? "Cache hit" : "Cache miss"}
                    </Badge>
                  )}
                  {typeof promptMeta.cacheAgeMs === "number" && (
                    <span className="text-[11px] text-gray-400">
                      Age {Math.max(0, Math.round(promptMeta.cacheAgeMs / 1000))}s
                    </span>
                  )}
                </div>

                {Array.isArray(promptMeta.progress) && promptMeta.progress.length > 0 && (
                  <div className="w-full rounded-md border border-gray-200 bg-white/60 p-3">
                    {(() => {
                      const iters = promptMeta.progress!.length;
                      const bestScore = Math.max(
                        ...(promptMeta.progress!.map((p) => p.score ?? 0)),
                        typeof promptMeta.score === "number" ? promptMeta.score : 0,
                      );
                      const bestCoverage = Math.max(
                        ...(promptMeta.progress!.map((p) => p.coverage ?? 0)),
                        typeof promptMeta.coverage === "number" ? promptMeta.coverage : 0,
                      );
                      const last = promptMeta.progress![promptMeta.progress!.length - 1];
                      const percent = Math.max(0, Math.min(100, Math.round((bestScore || 0) * 100)));
                      const valSize = typeof last?.validationSize === "number" ? last.validationSize : undefined;
                      const valTotal = typeof last?.validationTotal === "number" ? last.validationTotal : undefined;
                      const conf = typeof last?.confidence === "number" ? last.confidence : undefined;
                      const stage = typeof last?.stage === "number" ? last.stage : undefined;
                      const stages = typeof last?.stages === "number" ? last.stages : undefined;

                      return (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between text-[11px] text-gray-600">
                            <span>Optimization progress{typeof stage === "number" && typeof stages === "number" ? ` • stage ${stage}/${stages}` : ""}</span>
                            <span>
                              iter {iters} • best score {(bestScore * 100).toFixed(0)}% • cov {(bestCoverage * 100).toFixed(0)}%
                              {valSize && valTotal ? ` • val ${valSize}/${valTotal}` : ""}
                              {typeof conf === "number" ? ` • conf ${(conf * 100).toFixed(0)}%` : ""}
                            </span>
                          </div>
                          <Progress value={percent} className="h-2" />
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                            {typeof last?.satisfiedCount === "number" && (
                              <Badge variant="outline" className="border-gray-300 text-gray-600">
                                Satisfied features {last.satisfiedCount}
                              </Badge>
                            )}
                            {Array.isArray(promptMeta.satisfied) && promptMeta.satisfied.length > 0 && (
                              <span className="text-gray-500">
                                Final satisfied: {promptMeta.satisfied.length}
                              </span>
                            )}
                            {Array.isArray(promptMeta.missing) && promptMeta.missing.length > 0 && (
                              <span className="text-gray-500">
                                Final missing: {promptMeta.missing.length}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          <CardAction>
            <div className="flex items-center gap-2">
              {resultText && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopy}
                        className="border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                      >
                        <Copy className="w-4 h-4" />
                        Copy
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Copy content to clipboard</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onExportPdf}
                        disabled={isExporting}
                        className="border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {isExporting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Exporting
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            Export PDF
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Export as PDF document</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </CardAction>
        </div>
      </CardHeader>

      <CardContent className="min-h-[200px]">
        {!resultText ? (
          renderEmptyState()
        ) : (
          <Tabs
            value={resultTab}
            onValueChange={(value) => setResultTab(value as "formatted" | "json")}
            className="w-full"
          >
            <TabsList className="grid w-fit grid-cols-2 bg-gray-100 border border-gray-300">
              <TabsTrigger value="formatted" className="flex items-center gap-2 text-xs">
                <Eye className="w-3 h-3" />
                Formatted
              </TabsTrigger>
              <TabsTrigger value="json" className="flex items-center gap-2 text-xs">
                <Code className="w-3 h-3" />
                Raw JSON
              </TabsTrigger>
            </TabsList>

            <div className="mt-4">
              <TabsContent value="formatted" className="mt-0">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  {renderFormattedContent()}
                </div>
              </TabsContent>

              <TabsContent value="json" className="mt-0">
                <div className="rounded-lg border border-gray-200 bg-gray-50">
                  {renderJsonContent()}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
