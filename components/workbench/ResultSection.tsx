// components/workbench/ResultSection.tsx
"use client";

import { useCallback } from "react";
import HowToViewer from "../HowToViewer";
import { PromptOptimizationMeta, SchemaType } from "@/lib/types";
import { Shot } from "@/lib/types";
import { safeStringify } from "@/lib/json";
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
      .then(() => onCopy("success", "JSON copied to clipboard"))
      .catch(() => onCopy("error", "Unable to copy JSON"));
  }, [onCopy, resultText]);

  const getContentType = () => {
    if (!resultText) return null;
    return enforceSchema ? schemaType : "markdown";
  };

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
    const jsonContent = enforceSchema ? safeStringify(resultText) : resultText;
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
              {resultText && getContentType() && (
                <Badge variant="outline" className="text-xs border-gray-300 text-gray-700">
                  {getContentType() === "markdown" ? (
                    <><FileText className="w-3 h-3" /> Markdown</>
                  ) : (
                    <><Code className="w-3 h-3" /> {getContentType()}</>
                  )}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-sm text-gray-600">
              Toggle between a formatted view and raw JSON to verify Gemini output.
            </CardDescription>
            {promptMeta && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
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
