// components/ScreenshotGrid.tsx
"use client";

import Image from "next/image";
import { useMemo } from "react";
import { Shot } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Eye,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  Clock,
  Keyboard,
} from "lucide-react";

type Props = {
  shots: Shot[];
  onRemove: (id: string) => void;
  onPreview: (id: string) => void;
  onMove: (id: string, direction: "left" | "right") => void;
  onUpdate: (id: string, changes: Partial<Shot>) => void;
  latestShotId: string | null;
  flashShotId: string | null;
};

export default function ScreenshotGrid({
  shots,
  onRemove,
  onPreview,
  onMove,
  onUpdate,
  latestShotId,
  flashShotId,
}: Props) {
  const mostRecentIndex = useMemo(() => shots.findIndex((shot) => shot.id === latestShotId), [latestShotId, shots]);

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
              <Badge variant="secondary" className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 border-gray-200">
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
            <ContextMenu key={shot.id}>
              <ContextMenuTrigger asChild>
                <Card
                  className={cn(
                    "group h-full overflow-hidden border-gray-200 bg-white shadow-sm shadow-gray-100 transition-all duration-300 hover:translate-y-[-4px] hover:shadow-lg hover:shadow-gray-200 hover:border-gray-300",
                    "animate-in fade-in-0 zoom-in-95 duration-300",
                    flashShotId === shot.id && "ring-2 ring-emerald-500/70 animate-pulse",
                    index === mostRecentIndex && "ring-1 ring-blue-500/50 shadow-blue-100"
                  )}
                >
                  <div className="relative overflow-hidden">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="relative cursor-pointer">
                          <Image
                            src={shot.dataUrl}
                            alt={`Screenshot ${index + 1} at ${shot.timecode}`}
                            width={640}
                            height={360}
                            className="h-40 w-full object-cover transition-all duration-500 group-hover:scale-110 group-hover:brightness-110"
                          />
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-white/90 px-3 py-1 text-xs text-gray-800 backdrop-blur-sm border-t border-gray-100">
                            <Badge variant="secondary" className="text-xs font-semibold bg-gray-100 text-gray-700 border-gray-200">
                              {shot.id}
                            </Badge>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{shot.timecode}</span>
                            </div>
                          </div>
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80 bg-white border-gray-200 shadow-lg" side="top">
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-gray-900">
                            {shot.label || `Screenshot ${index + 1}`}
                          </h4>
                          <p className="text-sm text-gray-600">
                            Captured at {shot.timecode} • {shot.id}
                          </p>
                          {shot.note && (
                            <p className="text-sm text-gray-600 italic">
                              &ldquo;{shot.note}&rdquo;
                            </p>
                          )}
                        </div>
                      </HoverCardContent>
                    </HoverCard>

                    <div className="absolute left-3 top-3 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs bg-white/90 text-gray-700 border-gray-300">
                        {index + 1} / {shots.length}
                      </Badge>
                      {index === mostRecentIndex && (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                          Latest
                        </Badge>
                      )}
                    </div>

                    <div className="absolute inset-x-0 top-0 flex translate-y-[-100%] items-center justify-end gap-2 bg-white/95 backdrop-blur-sm px-3 py-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 border-b border-gray-200">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPreview(shot.id)}
                            className="h-7 text-xs bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                          >
                            <Eye className="h-3 w-3" />
                            Preview
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-gray-900 text-white border-gray-700">
                          <p>Preview this screenshot</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => onRemove(shot.id)}
                            className="h-7 text-xs"
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-gray-900 text-white border-gray-700">
                          <p>Delete this screenshot</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <CardContent className="flex-1 space-y-4 p-4">
                    <div className="space-y-2">
                      <Label htmlFor={`label-${shot.id}`} className="text-xs text-gray-600 font-medium">
                        Label
                      </Label>
                      <Input
                        id={`label-${shot.id}`}
                        value={shot.label ?? ""}
                        onChange={(event) => onUpdate(shot.id, { label: event.target.value })}
                        placeholder={`Screenshot ${index + 1}`}
                        className="h-8 text-sm bg-white border-gray-200 text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                      <div className="space-y-2">
                        <Label htmlFor={`timecode-${shot.id}`} className="text-xs text-gray-600 font-medium">
                          Timecode
                        </Label>
                        <Input
                          id={`timecode-${shot.id}`}
                          value={shot.timecode}
                          onChange={(event) => handleTimecodeChange({ value: event.target.value, shot, onUpdate })}
                          placeholder="mm:ss"
                          className="h-8 text-sm bg-white border-gray-200 text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onMove(shot.id, "left")}
                              className="h-7 w-7 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                              disabled={index === 0}
                            >
                              <ArrowLeft className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-gray-900 text-white border-gray-700">
                            <p>Move earlier in sequence</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onMove(shot.id, "right")}
                              className="h-7 w-7 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                              disabled={index === shots.length - 1}
                            >
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-gray-900 text-white border-gray-700">
                            <p>Move later in sequence</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`notes-${shot.id}`} className="text-xs text-gray-600 font-medium">
                        Notes
                      </Label>
                      <Textarea
                        id={`notes-${shot.id}`}
                        value={shot.note ?? ""}
                        onChange={(event) => onUpdate(shot.id, { note: event.target.value })}
                        placeholder="Optional: add context or reminders for this frame"
                        className="min-h-[60px] resize-none text-sm bg-white border-gray-200 text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
                        rows={2}
                      />
                    </div>
                  </CardContent>
                </Card>
              </ContextMenuTrigger>
              <ContextMenuContent className="bg-white border-gray-200 shadow-lg">
                <ContextMenuItem onClick={() => onPreview(shot.id)} className="text-gray-700 hover:bg-gray-100 focus:bg-gray-100">
                  <Eye className="mr-2 h-4 w-4" />
                  Preview
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onMove(shot.id, "left")}
                  disabled={index === 0}
                  className="text-gray-700 hover:bg-gray-100 focus:bg-gray-100 disabled:text-gray-400"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Move Left
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onMove(shot.id, "right")}
                  disabled={index === shots.length - 1}
                  className="text-gray-700 hover:bg-gray-100 focus:bg-gray-100 disabled:text-gray-400"
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Move Right
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onRemove(shot.id)} className="text-red-600 hover:bg-red-50 focus:bg-red-50">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

function handleTimecodeChange({
  value,
  shot,
  onUpdate,
}: {
  value: string;
  shot: Shot;
  onUpdate: (id: string, changes: Partial<Shot>) => void;
}) {
  const sanitized = value.replace(/[^0-9:]/g, "");
  const updates: Partial<Shot> = { timecode: sanitized };

  const parts = sanitized.split(":");
  if (parts.length === 2) {
    const minutes = Number.parseInt(parts[0], 10);
    const seconds = Number.parseInt(parts[1], 10);
    if (!Number.isNaN(minutes) && !Number.isNaN(seconds)) {
      updates.timeSec = minutes * 60 + seconds;
    }
  }

  onUpdate(shot.id, updates);
}

