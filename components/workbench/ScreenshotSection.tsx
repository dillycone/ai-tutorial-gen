// components/workbench/ScreenshotSection.tsx
"use client";

import ScreenshotGrid from "../ScreenshotGrid";
import { Shot } from "@/lib/types";

type ScreenshotSectionProps = {
  shots: Shot[];
  latestShotId: string | null;
  flashShotId: string | null;
  onPreview: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "left" | "right") => void;
  onUpdate: (id: string, changes: Partial<Shot>) => void;
};

export default function ScreenshotSection({
  shots,
  latestShotId,
  flashShotId,
  onPreview,
  onRemove,
  onMove,
  onUpdate,
}: ScreenshotSectionProps) {
  return (
    <section className="animate-fade-in-up rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl shadow-gray-200/20 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-3xl hover:shadow-gray-300/30">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Step 2 · Captured screenshots <span className="text-sm text-gray-600">({shots.length})</span>
          </h2>
          <p className="text-sm text-gray-600">
            Reorder, rename, or fine-tune timestamps before generating structured output.
          </p>
        </div>
        {latestShotId ? (
          <div className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1 text-xs text-emerald-700">
            Most recent: {latestShotId}
          </div>
        ) : null}
      </header>

      <div className="mt-6">
        <ScreenshotGrid
          shots={shots}
          latestShotId={latestShotId}
          flashShotId={flashShotId}
          onMove={onMove}
          onPreview={onPreview}
          onRemove={onRemove}
          onUpdate={onUpdate}
        />
      </div>
    </section>
  );
}
