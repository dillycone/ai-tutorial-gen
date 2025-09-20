// components/workbench/TranscriptSection.tsx
"use client";

import { useCallback, useMemo, useRef } from "react";
import { Search, Upload, FileText, Wand2, Loader2, Trash2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TranscriptSegment, TranscriptTrack } from "@/lib/types";

const FORMAT_OPTIONS = {
  minimumIntegerDigits: 2,
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
} as const;

type TranscriptSectionProps = {
  transcript: TranscriptTrack | null;
  status: "idle" | "uploading" | "generating";
  error: string | null;
  searchTerm: string;
  matches: TranscriptSegment[];
  onUpload: (file: File) => Promise<void>;
  onGenerate: (language?: string) => Promise<void>;
  onClear: () => void;
  onSearch: (query: string) => void;
  onFocusSegment: (segmentId: string) => void;
  canGenerate: boolean;
};

export default function TranscriptSection({
  transcript,
  status,
  error,
  searchTerm,
  matches,
  onUpload,
  onGenerate,
  onClear,
  onSearch,
  onFocusSegment,
  canGenerate,
}: TranscriptSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const busy = status !== "idle";

  const handlePickFile = useCallback(() => fileInputRef.current?.click(), []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      void onUpload(file);
      event.target.value = "";
    },
    [onUpload],
  );

  const visibleSegments = useMemo(() => {
    if (searchTerm.trim()) {
      return matches;
    }
    return transcript ? transcript.segments.slice(0, 20) : [];
  }, [matches, searchTerm, transcript]);

  const hasTranscript = Boolean(transcript && transcript.segments.length > 0);

  return (
    <Card className="animate-fade-in-up border-gray-200 bg-white shadow-2xl shadow-gray-200/20 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-3xl hover:shadow-gray-300/30">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FileText className="h-5 w-5" />
            Transcript
          </CardTitle>
          <p className="text-sm text-gray-600">
            Upload caption files or auto-generate a transcript to align voiceover with your screenshots.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasTranscript ? (
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              {transcript?.source === "generated" ? "Auto-generated" : "Uploaded"}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
              No transcript yet
            </Badge>
          )}
          {transcript?.language && (
            <Badge variant="outline" className="border-gray-300 bg-gray-50 text-gray-700">
              {transcript.language.toUpperCase()}
            </Badge>
          )}
          {hasTranscript ? (
            <Badge variant="outline" className="border-gray-300 bg-gray-50 text-gray-700">
              {transcript?.segments.length ?? 0} segments
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={handlePickFile}
                disabled={busy}
                className="border-gray-300 bg-transparent text-gray-700 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
              >
                {status === "uploading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload captions
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Supports .srt, .vtt, and JSON exports</p>
            </TooltipContent>
          </Tooltip>

          <input
            ref={fileInputRef}
            type="file"
            accept=".srt,.vtt,.json,.txt,text/vtt,text/plain,application/x-subrip"
            hidden
            onChange={handleFileChange}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => onGenerate()}
                disabled={!canGenerate || busy}
                className="bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-lg hover:from-sky-600 hover:to-sky-700 hover:shadow-xl transition-all duration-200 disabled:opacity-50"
              >
                {status === "generating" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Suggest transcript
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Let Gemini transcribe the uploaded video</p>
            </TooltipContent>
          </Tooltip>

          <Button
            variant="ghost"
            onClick={onClear}
            disabled={!hasTranscript || busy}
            className="text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(event) => onSearch(event.target.value)}
            placeholder='Search transcript (e.g., "click publish")'
            className="pl-9 pr-12 text-sm bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSearch("")}
              className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 text-gray-500 hover:text-gray-900"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <ScrollArea className="max-h-72 rounded-xl border border-gray-200 bg-gray-50">
          <div className="divide-y divide-gray-200">
            {hasTranscript ? (
              visibleSegments.length > 0 ? (
                visibleSegments.map((segment) => (
                  <button
                    key={segment.id}
                    type="button"
                    onClick={() => onFocusSegment(segment.id)}
                    className="flex w-full items-start gap-3 bg-white px-4 py-3 text-left transition hover:bg-sky-50"
                  >
                    <Badge variant="outline" className="mt-0.5 border-gray-300 bg-gray-100 text-gray-700">
                      {formatRange(segment.startSec, segment.endSec)}
                    </Badge>
                    <div className="space-y-1">
                      {segment.speaker ? (
                        <div className="text-xs font-semibold uppercase text-gray-500 tracking-wide">
                          {segment.speaker}
                        </div>
                      ) : null}
                      <p className="text-sm text-gray-800 leading-relaxed">
                        {renderHighlighted(segment.text, searchTerm)}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-sm text-gray-600">
                  <Sparkles className="mx-auto mb-3 h-5 w-5 text-gray-400" />
                  {searchTerm ? "No transcript segments match your search." : "Transcript is available - start searching to jump to key moments."}
                </div>
              )
            ) : (
              <div className="px-4 py-6 text-center text-sm text-gray-600">
                <Sparkles className="mx-auto mb-3 h-5 w-5 text-gray-400" />
                Upload a caption file or generate a transcript to unlock timeline search.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function formatRange(startSec: number, endSec: number) {
  const start = formatSeconds(startSec);
  const end = formatSeconds(endSec);
  return `${start}-${end}`;
}

function formatSeconds(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds)) return "00:00";
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped - minutes * 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toLocaleString(undefined, FORMAT_OPTIONS)}`;
}

function renderHighlighted(text: string, query: string) {
  const normalized = query.trim();
  if (!normalized) return text;
  try {
    const regex = new RegExp(`(${escapeRegExp(normalized)})`, "ig");
    const parts = text.split(regex);
    return parts.map((part, index) =>
      index % 2 === 1 ? (
        <mark key={index} className="rounded bg-amber-200 px-0.5">
          {part}
        </mark>
      ) : (
        <span key={index}>{part}</span>
      ),
    );
  } catch {
    return text;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
