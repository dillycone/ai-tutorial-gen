// components/ScreenshotGrid.tsx
"use client";

import React, { useMemo, memo } from "react";
import { Shot } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Keyboard, Image as ImageIcon } from "lucide-react";
import ScreenshotCard from "@/components/workbench/ScreenshotCard";

type Props = {
  shots: Shot[];
  onRemove: (id: string) => void;
  onPreview: (id: string) => void;
  onMove: (id: string, direction: "left" | "right") => void;
  onUpdate: (id: string, changes: Partial<Shot>) => void;
  latestShotId: string | null;
  flashShotId: string | null;
};

function ScreenshotGridComponent({
  shots,
  onRemove,
  onPreview,
  onMove,
  onUpdate,
  latestShotId,
  flashShotId,
}: Props) {
  const mostRecentIndex = useMemo(
    () => shots.findIndex((shot) => shot.id === latestShotId),
    [latestShotId, shots]
  );

  if (shots.length === 0) {
    return (
      <Alert className="border-dashed border-gray-200 bg-gray-50 text-gray-600">
        <ImageIcon className="h-4 w-4 text-gray-500" />
        <AlertDescription className="space-y-4">
          <div className="font-medium text-gray-800">2) Capture your key frames</div>
          <p className="leading-relaxed">
            Play the video and click{" "}
            <span className="font-semibold text-gray-900">Capture screenshot</span>{" "}
            whenever you see a critical step. They will appear here with the newest capture highlighted automatically.
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Keyboard className="h-3 w-3" />
            <span>
              Tip: Use the keyboard shortcut{" "}
              <Badge
                variant="secondary"
                className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 border-gray-200"
              >
                C
              </Badge>{" "}
              to capture quickly while reviewing footage.
            </span>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shots.map((shot, index) => (
            <ScreenshotCard
              key={shot.id}
              shot={shot}
              index={index}
              total={shots.length}
              isLatest={index === mostRecentIndex}
              flash={flashShotId === shot.id}
              onPreview={onPreview}
              onRemove={onRemove}
              onMove={onMove}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

function areEqual(prev: Props, next: Props) {
  if (prev.latestShotId !== next.latestShotId) return false;
  if (prev.flashShotId !== next.flashShotId) return false;
  if (prev.shots.length !== next.shots.length) return false;
  for (let i = 0; i < prev.shots.length; i++) {
    const a = prev.shots[i];
    const b = next.shots[i];
    if (
      a.id !== b.id ||
      a.timecode !== b.timecode ||
      a.timeSec !== b.timeSec ||
      a.label !== b.label ||
      a.note !== b.note ||
      a.dataUrl !== b.dataUrl
    ) {
      return false;
    }
  }
  return (
    prev.onRemove === next.onRemove &&
    prev.onPreview === next.onPreview &&
    prev.onMove === next.onMove &&
    prev.onUpdate === next.onUpdate
  );
}

export default memo(ScreenshotGridComponent, areEqual);
