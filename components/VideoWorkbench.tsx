// components/VideoWorkbench.tsx
"use client";

import dynamic from "next/dynamic";
import WorkbenchToast from "./workbench/Toast";
import WorkflowSteps from "./workbench/WorkflowSteps";
import UploadSection from "./workbench/UploadSection";
import ScreenshotSection from "./workbench/ScreenshotSection";
import OptionsSection from "./workbench/OptionsSection";
import { useVideoWorkbench } from "@/hooks/useVideoWorkbench";

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
    setPreviewShotId,
    previewShot,
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
    showAdvanced,
    setShowAdvanced,
    readyToGenerate,
    handleGenerate,
    resultText,
    resultTab,
    setResultTab,
    showToast,
    handleRemoveShot,
    handleUpdateShot,
    handleMoveShot,
    handleExportPdf,
  } = useVideoWorkbench();

  const isExporting = busyPhase === "export";

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

      <ScreenshotSection
        shots={shots}
        latestShotId={latestShotId}
        flashShotId={flashShotId}
        onPreview={(id) => setPreviewShotId(id)}
        onRemove={handleRemoveShot}
        onMove={handleMoveShot}
        onUpdate={handleUpdateShot}
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
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
        readyToGenerate={readyToGenerate}
        busyPhase={busyPhase}
        onGenerate={handleGenerate}
      />

      <ResultSection
        resultText={resultText}
        resultTab={resultTab}
        setResultTab={setResultTab}
        enforceSchema={enforceSchema}
        schemaType={schemaType}
        shots={shots}
        promptMeta={promptMeta}
        onCopy={(type, message) => showToast(type, message)}
        onExportPdf={handleExportPdf}
        isExporting={isExporting}
      />

      <PreviewModal previewShot={previewShot} onClose={() => setPreviewShotId(null)} />
    </div>
  );
}
