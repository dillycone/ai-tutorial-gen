// components/workbench/ScreenshotSection.tsx
"use client";

import ScreenshotGrid from "../ScreenshotGrid";
import { Shot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";


type ScreenshotSectionProps = {
  shots: Shot[];
  latestShotId: string | null;
  flashShotId: string | null;
  transcriptSearchTerm: string;
  transcriptMatchedShotIds: Set<string>;
  onPreview: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "left" | "right") => void;
  onUpdate: (id: string, changes: Partial<Shot>) => void;
  onSuggestKeyframes: () => void;
  suggestingKeyframes: boolean;
  canSuggestKeyframes: boolean;
};

export default function ScreenshotSection({
  shots,
  latestShotId,
  flashShotId,
  transcriptSearchTerm,
  transcriptMatchedShotIds,
  onPreview,
  onRemove,
  onMove,
  onUpdate,
  onSuggestKeyframes,
  suggestingKeyframes,
  canSuggestKeyframes,
}: ScreenshotSectionProps) {
  return (
    <section className="animate-fade-in-up rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl shadow-gray-200/20 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-3xl hover:shadow-gray-300/30">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Step 2 · Captured screenshots <span className="text-sm text-gray-600">({shots.length})</span>
          </h2>
          <p className="text-sm text-gray-600">
            Reorder, rename, or fine-tune timestamps before generating structured output.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {latestShotId ? (
            <div className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1 text-xs text-emerald-700">
              Most recent: {latestShotId}
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={onSuggestKeyframes}
            disabled={!canSuggestKeyframes || suggestingKeyframes}
            className="flex items-center gap-2 border-sky-300 text-sky-700 hover:bg-sky-50"
          >
            {suggestingKeyframes ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Suggest key frames
          </Button>
        </div>
      </header>

      <div className="mt-6">
        <ScreenshotGrid
          shots={shots}
          latestShotId={latestShotId}
          flashShotId={flashShotId}
          transcriptSearchTerm={transcriptSearchTerm}
          transcriptMatchedShotIds={transcriptMatchedShotIds}
          onMove={onMove}
          onPreview={onPreview}
          onRemove={onRemove}
          onUpdate={onUpdate}
        />
      </div>
    </section>
  );
}
