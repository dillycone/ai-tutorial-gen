// components/VideoWorkbench.tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import WorkbenchToast from "./workbench/Toast";
import WorkflowSteps from "./workbench/WorkflowSteps";
import UploadSection from "./workbench/UploadSection";
import ScreenshotSection from "./workbench/ScreenshotSection";
import OptionsSection from "./workbench/OptionsSection";
import TranscriptSection from "./workbench/TranscriptSection";
import { useVideoWorkbench } from "@/hooks/useVideoWorkbench";
import type { ToastState } from "@/hooks/useVideoWorkbench";

const ResultSection = dynamic(
  () => import("./workbench/ResultSection"),
  {
    ssr: false,
    loading: () => (
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl shadow-gray-200/20">
        <div className="h-10 w-40 animate-pulse rounded-full bg-gray-200" />
        <div className="mt-6 h-40 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
      </section>
    ),
  },
);

const ExportSettingsDialog = dynamic(
  () => import("./workbench/ExportSettingsDialog"),
  {
    ssr: false,
  },
);

const PreviewModal = dynamic(
  () => import("./workbench/PreviewModal"),
  {
    ssr: false,
  },
);

export default function VideoWorkbench() {
  const {
    videoRef,
    fileInputRef,
    videoFile,
    videoUrl,
    videoMetadata,
    videoDuration,
    videoFileSize,
    dragActive,
    busyPhase,
    busy,
    canCapture,
    currentTimecode,
    videoOnGemini,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handlePickClick,
    handleInputChange,
    handleUploadVideo,
    handleReplaceClick,
    handleCaptureShot,
    handleVideoLoaded,
    handleTimeUpdate,
    shots,
    latestShotId,
    flashShotId,
    transcriptTrack,
    transcriptStatus,
    transcriptError,
    transcriptSearchTerm,
    transcriptMatches,
    transcriptMatchedShotIds,
    setPreviewShotId,
    previewShot,
    suggestingKeyframes,
    toast,
    steps,
    enforceSchema,
    setEnforceSchema,
    schemaType,
    setSchemaType,
    titleHint,
    setTitleHint,
    promptMode,
    setPromptMode,
    promptMeta,
    schemaTemplates,
    schemaTemplatesLoading,
    schemaTemplatesError,
    createSchemaTemplate,
    showAdvanced,
    setShowAdvanced,
    promoteBaseline,
    setPromoteBaseline,
    exportOptions,
    setExportOptions,
    readyToGenerate,
    handleTranscriptFile,
    handleGenerateTranscript,
    handleClearTranscript,
    handleTranscriptSearch,
    handleTranscriptSegmentFocus,
    handleSuggestKeyframes,
    handleGenerate,
    result,
    resultView,
    setResultView,
    isResultDirty,
    updateResultData,
    setResultJsonText,
    formatResultJson,
    resetResultEdits,
    showToast,
    handleRemoveShot,
    handleUpdateShot,
    handleMoveShot,
    handleExportPdf,
  } = useVideoWorkbench();

  const isExporting = useMemo(() => busyPhase === "export", [busyPhase]);

  const handlePreview = useCallback((id: string) => setPreviewShotId(id), [setPreviewShotId]);
  const handleClosePreview = useCallback(() => setPreviewShotId(null), [setPreviewShotId]);
  const handleCopyToast = useCallback(
    (type: ToastState["type"], message: string) => showToast(type, message),
    [showToast]
  );

  const [showExportSettings, setShowExportSettings] = useState(false);
  const handleOpenExportSettings = useCallback(() => setShowExportSettings(true), []);
  const handleCloseExportSettings = useCallback(() => setShowExportSettings(false), []);

  const selectedSchemaTemplate = useMemo(
    () => schemaTemplates.find((template) => template.id === schemaType) ?? null,
    [schemaTemplates, schemaType],
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <WorkbenchToast toast={toast} />

      <WorkflowSteps steps={steps} />

      <UploadSection
        videoFile={videoFile}
        videoUrl={videoUrl}
        videoMetadata={videoMetadata}
        videoDuration={videoDuration}
        videoFileSize={videoFileSize}
        dragActive={dragActive}
        busyPhase={busyPhase}
        busy={busy}
        canCapture={canCapture}
        currentTimecode={currentTimecode}
        videoOnGemini={videoOnGemini}
        videoRef={videoRef}
        fileInputRef={fileInputRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onPickClick={handlePickClick}
        onInputChange={handleInputChange}
        onUploadVideo={handleUploadVideo}
        onReplaceClick={handleReplaceClick}
        onCapture={handleCaptureShot}
        onVideoLoaded={handleVideoLoaded}
        onTimeUpdate={handleTimeUpdate}
      />

      <TranscriptSection
        transcript={transcriptTrack}
        status={transcriptStatus}
        error={transcriptError}
        searchTerm={transcriptSearchTerm}
        matches={transcriptMatches}
        onUpload={handleTranscriptFile}
        onGenerate={handleGenerateTranscript}
        onClear={handleClearTranscript}
        onSearch={handleTranscriptSearch}
        onFocusSegment={handleTranscriptSegmentFocus}
        canGenerate={Boolean(videoOnGemini)}
      />

      <ScreenshotSection
        shots={shots}
        latestShotId={latestShotId}
        flashShotId={flashShotId}
        transcriptSearchTerm={transcriptSearchTerm}
        transcriptMatchedShotIds={transcriptMatchedShotIds}
        onPreview={handlePreview}
        onRemove={handleRemoveShot}
        onMove={handleMoveShot}
        onUpdate={handleUpdateShot}
        onSuggestKeyframes={handleSuggestKeyframes}
        suggestingKeyframes={suggestingKeyframes}
        canSuggestKeyframes={Boolean(videoOnGemini && videoUrl)}
      />

      <OptionsSection
        schemaType={schemaType}
        setSchemaType={setSchemaType}
        enforceSchema={enforceSchema}
        setEnforceSchema={setEnforceSchema}
        titleHint={titleHint}
        setTitleHint={setTitleHint}
        promptMode={promptMode}
        setPromptMode={setPromptMode}
        promptMeta={promptMeta}
        schemaTemplates={schemaTemplates}
        schemaTemplatesLoading={schemaTemplatesLoading}
        schemaTemplatesError={schemaTemplatesError}
        onCreateSchemaTemplate={createSchemaTemplate}
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
        promoteBaseline={promoteBaseline}
        setPromoteBaseline={setPromoteBaseline}
        readyToGenerate={readyToGenerate}
        busyPhase={busyPhase}
        onGenerate={handleGenerate}
      />

      <ResultSection
        result={result}
        resultView={resultView}
        onSetView={setResultView}
        onEditData={updateResultData}
        onEditJson={setResultJsonText}
        onFormatJson={formatResultJson}
        onResetEdits={resetResultEdits}
        onExport={handleExportPdf}
        isExporting={isExporting}
        schemaType={schemaType}
        schemaTemplate={selectedSchemaTemplate}
        shots={shots}
        promptMeta={promptMeta}
        onCopy={handleCopyToast}
        isResultDirty={isResultDirty}
        onOpenExportSettings={handleOpenExportSettings}
      />

      <PreviewModal previewShot={previewShot} onClose={handleClosePreview} />

      {/* REPOMARK:SCOPE: 5 - Render the Export Settings dialog, controlled by local state */}
      <ExportSettingsDialog
        open={showExportSettings}
        options={exportOptions}
        onChange={setExportOptions}
        onClose={handleCloseExportSettings}
      />
    </div>
  );
}
