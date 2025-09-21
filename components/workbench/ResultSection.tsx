"use client";

import { useCallback, useMemo } from "react";
import HowToViewer from "@/components/HowToViewer";
import TutorialEditor from "@/components/workbench/editors/TutorialEditor";
import MeetingEditor from "@/components/workbench/editors/MeetingEditor";
import GenericSchemaEditor from "@/components/workbench/editors/GenericSchemaEditor";
import {
  PromptOptimizationMeta,
  ResultViewMode,
  SchemaTemplate,
  SchemaType,
  Shot,
  WorkbenchResult,
} from "@/lib/types";
import { ToastState } from "@/hooks/useVideoWorkbench";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  CheckCircle2,
  Code,
  Copy,
  Download,
  Eye,
  RotateCcw,
  Settings,
  Sparkles,
} from "lucide-react";

const renderEmptyState = () => (
  <Alert className="border-gray-200 bg-gray-50">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription className="space-y-2">
      <p className="text-gray-700">No result yet.</p>
      <p className="text-sm text-gray-600">Generate a structured result to preview and edit it here.</p>
    </AlertDescription>
  </Alert>
);

type ResultSectionProps = {
  result: WorkbenchResult | null;
  resultView: ResultViewMode;
  onSetView: (mode: ResultViewMode) => void;
  onEditData: (updater: (draft: Record<string, unknown>) => void) => void;
  onEditJson: (nextJson: string) => void;
  onFormatJson: () => void;
  onResetEdits: () => void;
  onExport: () => Promise<void>;
  onOpenExportSettings?: () => void;
  isExporting: boolean;
  schemaType: SchemaType;
  schemaTemplate?: SchemaTemplate | null;
  shots: Shot[];
  promptMeta: PromptOptimizationMeta | null;
  onCopy: (type: ToastState["type"], message: string) => void;
  isResultDirty: boolean;
};

export default function ResultSection({
  result,
  resultView,
  onSetView,
  onEditData,
  onEditJson,
  onFormatJson,
  onResetEdits,
  onExport,
  isExporting,
  onOpenExportSettings,
  schemaType,
  schemaTemplate = null,
  shots,
  promptMeta,
  onCopy,
  isResultDirty,
}: ResultSectionProps) {
  const templateId = result?.templateId ?? schemaTemplate?.id ?? schemaType;
  const templateLabel = useMemo(() => {
    if (schemaTemplate?.name) return schemaTemplate.name;
    if (templateId === "tutorial") return "Tutorial";
    if (templateId === "meetingSummary") return "Meeting Summary";
    return templateId;
  }, [schemaTemplate?.name, templateId]);

  const hasResult = Boolean(result && (result.data || (result.jsonText && result.jsonText.trim()) || result.rawText));
  const validationErrors = result?.errors ?? [];
  const isValid = result?.valid ?? false;
  const showValidationBanner = validationErrors.length > 0;
  const bannerVariant = result?.data ? "warning" : "destructive";

  const handleCopy = useCallback(() => {
    const payload = result?.jsonText || result?.rawText;
    if (!payload) return;
    navigator.clipboard
      .writeText(payload)
      .then(() => onCopy("success", "Result copied"))
      .catch(() => onCopy("error", "Unable to copy"));
  }, [onCopy, result?.jsonText, result?.rawText]);

  const handleTabChange = useCallback(
    (value: string) => {
      onSetView(value as ResultViewMode);
    },
    [onSetView],
  );

  const previewContent = hasResult ? (
    <HowToViewer
      templateId={templateId}
      data={result?.data ?? null}
      jsonText={result?.jsonText ?? ""}
      rawText={result?.rawText ?? ""}
      localShots={shots}
      schemaTemplate={schemaTemplate}
    />
  ) : (
    renderEmptyState()
  );

  const editContent = !result ? (
    renderEmptyState()
  ) : templateId === "tutorial" ? (
    <TutorialEditor value={result.data} onChange={onEditData} />
  ) : templateId === "meetingSummary" ? (
    <MeetingEditor value={result.data} onChange={onEditData} />
  ) : (
    <GenericSchemaEditor data={result.data} schema={result.schema ?? schemaTemplate?.schema} onChange={onEditData} />
  );

  const jsonContent = !result ? (
    renderEmptyState()
  ) : (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onFormatJson}>
          <Code className="h-3.5 w-3.5" /> Format JSON
        </Button>
        <Button variant="outline" size="sm" onClick={onResetEdits} disabled={!isResultDirty}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset to AI
        </Button>
      </div>
      <Textarea
        value={result.jsonText}
        onChange={(event) => onEditJson(event.target.value)}
        spellCheck={false}
        className="h-[360px] w-full bg-gray-950 font-mono text-xs text-gray-100"
      />
    </div>
  );

  return (
    <Card className="border-gray-200 bg-white shadow-2xl shadow-gray-200/20">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              Step 4 · Result
              {hasResult ? (
                <Badge variant="outline" className="border-gray-300 text-gray-700">
                  <Eye className="mr-1 h-3 w-3" />
                  {templateLabel}
                </Badge>
              ) : null}
              {isResultDirty ? (
                <Badge variant="outline" className="border-amber-300 text-amber-600">
                  <Sparkles className="mr-1 h-3 w-3" /> Edited
                </Badge>
              ) : null}
              {hasResult ? (
                <Badge
                  variant="outline"
                  className={
                    isValid
                      ? "border-emerald-300 text-emerald-600"
                      : "border-rose-300 text-rose-600"
                  }
                >
                  {isValid ? (
                    <>
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Valid
                    </>
                  ) : (
                    <>
                      <AlertCircle className="mr-1 h-3 w-3" /> Needs attention
                    </>
                  )}
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription className="text-sm text-gray-600">
              Preview Gemini&apos;s output, fine-tune the structured data, or jump into the JSON view.
            </CardDescription>
            {promptMeta ? (
              <PromptMetaSummary promptMeta={promptMeta} />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!hasResult}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button variant="outline" size="sm" onClick={onResetEdits} disabled={!isResultDirty}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
            {onOpenExportSettings ? (
              <Button variant="outline" size="sm" onClick={onOpenExportSettings}>
                <Settings className="h-3.5 w-3.5" /> Settings
              </Button>
            ) : null}
            <Button variant="default" size="sm" onClick={onExport} disabled={!hasResult || isExporting}>
              <Download className="h-3.5 w-3.5" /> {isExporting ? "Exporting…" : "Export PDF"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {showValidationBanner ? (
          <Alert variant={bannerVariant === "destructive" ? "destructive" : "default"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="space-y-1 text-sm">
              {validationErrors.slice(0, 3).map((error, index) => (
                <p key={`${error}-${index}`} className="text-gray-700">
                  {error}
                </p>
              ))}
              {validationErrors.length > 3 ? (
                <p className="text-xs text-gray-500">{validationErrors.length - 3} more issues hidden.</p>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <Tabs value={resultView} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="bg-gray-100 text-gray-700">
            <TabsTrigger value="preview">
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
            </TabsTrigger>
            <TabsTrigger value="edit" disabled={!hasResult}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Edit
            </TabsTrigger>
            <TabsTrigger value="json" disabled={!hasResult}>
              <Code className="mr-1.5 h-3.5 w-3.5" /> JSON
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="space-y-4">
            {hasResult ? <ScrollArea className="h-[460px] w-full rounded-xl border border-gray-200 p-4">{previewContent}</ScrollArea> : previewContent}
          </TabsContent>

          <TabsContent value="edit" className="space-y-4">
            {hasResult ? editContent : renderEmptyState()}
          </TabsContent>

          <TabsContent value="json" className="space-y-4">
            {jsonContent}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

type PromptMetaSummaryProps = {
  promptMeta: PromptOptimizationMeta;
};

function PromptMetaSummary({ promptMeta }: PromptMetaSummaryProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
      <Badge
        variant="outline"
        className={
          promptMeta.appliedMode === "dspy"
            ? "border-purple-300 text-purple-600"
            : "border-gray-300 text-gray-600"
        }
      >
        {promptMeta.appliedMode === "dspy" ? "DSPy optimized" : "Manual prompt"}
      </Badge>
      {promptMeta.message ? <span>{promptMeta.message}</span> : null}
      {promptMeta.baselinePromoted ? (
        <Badge variant="outline" className="border-emerald-300 text-emerald-600">
          Baseline saved
        </Badge>
      ) : null}
      {typeof promptMeta.coverage === "number" ? (
        <span>Coverage {(promptMeta.coverage * 100).toFixed(0)}%</span>
      ) : null}
      {typeof promptMeta.score === "number" ? <span>Score {(promptMeta.score * 100).toFixed(0)}%</span> : null}
      {typeof promptMeta.cacheHit === "boolean" ? (
        <Badge
          variant="outline"
          className={promptMeta.cacheHit ? "border-emerald-300 text-emerald-600" : "border-gray-300 text-gray-600"}
        >
          {promptMeta.cacheHit ? "Cache hit" : "Cache miss"}
        </Badge>
      ) : null}
    </div>
  );
}
