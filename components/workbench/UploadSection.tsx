// components/workbench/UploadSection.tsx
"use client";

import { BusyPhase } from "@/hooks/useVideoWorkbench";
import { classNames } from "@/lib/ui";
import Spinner from "./Spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Upload, Video, CheckCircle, Camera, FileVideo, Clock, Monitor, HardDrive } from "lucide-react";

type UploadSectionProps = {
  videoFile: File | null;
  videoUrl: string | null;
  videoMetadata: { duration: number; width: number; height: number } | null;
  videoDuration: string | null;
  videoFileSize: string | null;
  dragActive: boolean;
  busyPhase: BusyPhase | null;
  busy: boolean;
  canCapture: boolean;
  currentTimecode: string;
  videoOnGemini: { uri: string; mimeType: string; name: string } | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onPickClick: () => void;
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadVideo: () => Promise<void>;
  onReplaceClick: () => void;
  onCapture: () => void;
  onVideoLoaded: () => void;
  onTimeUpdate: () => void;
};

export default function UploadSection({
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
  videoRef,
  fileInputRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onPickClick,
  onInputChange,
  onUploadVideo,
  onReplaceClick,
  onCapture,
  onVideoLoaded,
  onTimeUpdate,
}: UploadSectionProps) {
  return (
    <Card className="animate-fade-in-up bg-white border-gray-200 shadow-2xl shadow-gray-200/20 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-3xl hover:shadow-gray-300/30">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Video className="h-5 w-5" />
              Step 1 · Upload video
            </CardTitle>
            <CardDescription className="text-sm text-gray-600">
              Drag a file, paste a link, or select from your device to get started.
            </CardDescription>
          </div>
          {videoFile && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-gray-300 bg-gray-50 text-gray-700">
                <FileVideo className="h-3 w-3" />
                {videoFile.name}
              </Badge>
              {videoDuration && (
                <Badge variant="outline" className="border-gray-300 bg-gray-50 text-gray-700">
                  <Clock className="h-3 w-3" />
                  {videoDuration}
                </Badge>
              )}
              {videoFileSize && (
                <Badge variant="outline" className="border-gray-300 bg-gray-50 text-gray-700">
                  <HardDrive className="h-3 w-3" />
                  {videoFileSize}
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),260px]">
          <div>
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              role="button"
              tabIndex={0}
              onClick={onPickClick}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPickClick();
                }
              }}
              className={classNames(
                "flex h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 group",
                dragActive
                  ? "border-sky-400 bg-sky-50 scale-[1.02] shadow-lg shadow-sky-500/20"
                  : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100 hover:scale-[1.01] hover:shadow-lg",
              )}
            >
              <Upload
                className={classNames(
                  "h-12 w-12 transition-all duration-300 group-hover:scale-110",
                  dragActive ? "text-sky-400" : "text-gray-600 group-hover:text-gray-900"
                )}
              />
              <p className="mt-3 text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                Drop your video here or{" "}
                <span className="underline decoration-2 underline-offset-2">browse files</span>
              </p>
              <p className="mt-1 text-xs text-gray-500 group-hover:text-gray-600 transition-colors">
                MP4 or MOV · up to 750 MB
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={onPickClick}
                    className="border-gray-300 bg-transparent text-gray-700 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
                  >
                    <Upload className="h-4 w-4" />
                    Choose file
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Select a video file from your device</p>
                </TooltipContent>
              </Tooltip>

              <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={onInputChange} />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onUploadVideo}
                    disabled={!videoFile || busyPhase === "upload"}
                    className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white shadow-lg hover:shadow-xl hover:shadow-sky-500/25 transition-all duration-200 disabled:opacity-50"
                  >
                    {busyPhase === "upload" ? (
                      <>
                        <Spinner label="Uploading" />
                      </>
                    ) : (
                      <>
                        <Video className="h-4 w-4" />
                        {videoOnGemini ? "Re-upload to Gemini" : "Upload to Gemini"}
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Upload video to Google Gemini for processing</p>
                </TooltipContent>
              </Tooltip>

              {videoUrl && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      onClick={onReplaceClick}
                      className="border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-all duration-200"
                    >
                      <FileVideo className="h-4 w-4" />
                      Replace video
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Choose a different video file</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {videoOnGemini ? (
                <Badge className="bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100">
                  <CheckCircle className="h-3 w-3" />
                  Uploaded to Gemini
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                  <Clock className="h-3 w-3" />
                  Not uploaded to Gemini yet
                </Badge>
              )}
            </div>
        </div>

          <div className="flex flex-col gap-3">
            {videoUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-lg">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full rounded-xl"
                  onLoadedMetadata={onVideoLoaded}
                  onTimeUpdate={onTimeUpdate}
                  crossOrigin="anonymous"
                />
                {busyPhase === "upload" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 text-sm text-gray-900 rounded-xl">
                    <Spinner label="Uploading" />
                    <Progress value={50} className="mt-4 w-32 h-2" />
                    <p className="mt-2 text-xs text-gray-600">Uploading to Gemini...</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500 transition-all hover:border-gray-400 hover:bg-gray-100">
                <div className="text-center">
                  <Monitor className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>Video preview will appear here</p>
                </div>
              </div>
            )}

            <Card className="border-gray-200 bg-gray-50 shadow-lg">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    <span className="font-semibold text-gray-900">Current time:</span>
                    <Badge variant="outline" className="border-gray-300 bg-gray-100 text-gray-700">
                      {currentTimecode}
                    </Badge>
                  </div>
                  {videoMetadata && (
                    <div className="flex items-center gap-2">
                      <Video className="h-3 w-3" />
                      <span className="font-semibold text-gray-900">Duration:</span>
                      <Badge variant="outline" className="border-gray-300 bg-gray-100 text-gray-700">
                        {videoDuration}
                      </Badge>
                      {videoMetadata.width && videoMetadata.height && (
                        <Badge variant="outline" className="border-gray-300 bg-gray-100 text-gray-700">
                          <Monitor className="h-3 w-3" />
                          {videoMetadata.width}×{videoMetadata.height}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={onCapture}
                        disabled={!canCapture || busy}
                        className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl hover:shadow-emerald-500/25 transition-all duration-200 disabled:opacity-50"
                        size="sm"
                      >
                        {busy ? (
                          <Spinner label="Busy" />
                        ) : (
                          <>
                            <Camera className="h-4 w-4" />
                            Capture screenshot
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Capture the current frame (shortcut: C)</p>
                    </TooltipContent>
                  </Tooltip>

                  <Badge variant="outline" className="border-gray-400 bg-gray-100 text-gray-600">
                    <span className="text-xs">Shortcut: press C while on this page</span>
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
