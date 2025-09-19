"use client";

import { useCallback, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { ExportOptionsState } from "@/hooks/useVideoWorkbench";
import { HelpCircle, Trash2, X } from "lucide-react";

type ExportSettingsDialogProps = {
  open: boolean;
  options: ExportOptionsState;
  onChange: (next: ExportOptionsState) => void;
  onClose: () => void;
};

function clamp(num: number, min: number, max: number) {
  return Math.min(max, Math.max(min, num));
}

export default function ExportSettingsDialog({ open, options, onChange, onClose }: ExportSettingsDialogProps) {
  const [keywordInput, setKeywordInput] = useState("");

  // Derived UI values (quality 60..95% -> 0.6..0.95 for service)
  const qualityPercent = useMemo(() => Math.round(clamp(options.imageQuality, 0, 1) * 100), [options.imageQuality]);

  const handleToggle = useCallback(
    (key: keyof ExportOptionsState) => (checked: boolean) => {
      onChange({ ...options, [key]: checked });
    },
    [onChange, options],
  );

  const handleText = useCallback(
    (key: keyof ExportOptionsState) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      onChange({ ...options, [key]: val });
    },
    [onChange, options],
  );

  const handleQualityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const pct = clamp(Math.round(Number(e.target.value)), 60, 95); // 60..95
      const val = clamp(pct / 100, 0, 1);
      onChange({ ...options, imageQuality: val });
    },
    [onChange, options],
  );

  const handleMaxWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const w = clamp(Math.round(Number(e.target.value)), 800, 1920);
      onChange({ ...options, imageMaxWidth: w });
    },
    [onChange, options],
  );

  const addKeyword = useCallback(
    (raw: string) => {
      const k = raw.trim();
      if (!k) return;
      const set = new Set([...(options.keywords || [])]);
      set.add(k);
      onChange({ ...options, keywords: Array.from(set) });
      setKeywordInput("");
    },
    [onChange, options],
  );

  const removeKeyword = useCallback(
    (k: string) => {
      const list = (options.keywords || []).filter((x) => x !== k);
      onChange({ ...options, keywords: list });
    },
    [onChange, options],
  );

  const onKeywordKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
        e.preventDefault();
        addKeyword(keywordInput);
      }
      if (e.key === "Backspace" && keywordInput.length === 0 && (options.keywords?.length || 0) > 0) {
        // quick-delete last tag on backspace from empty field
        const last = options.keywords![options.keywords!.length - 1];
        removeKeyword(last);
      }
    },
    [addKeyword, keywordInput, options.keywords, removeKeyword],
  );

  const onKeywordBlur = useCallback(() => {
    if (keywordInput.trim()) addKeyword(keywordInput);
  }, [addKeyword, keywordInput]);

  const clearKeywords = useCallback(() => {
    onChange({ ...options, keywords: [] });
  }, [onChange, options]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Export Settings</DialogTitle>
          <DialogDescription>Configure document structure and image optimization for your PDF export.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Document</h3>
            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor="include-toc" className="flex items-center gap-2">
                    Include Table of Contents
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Adds a clickable Table of Contents to the beginning of the document.
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <p className="text-xs text-gray-500">Recommended for longer documents.</p>
                </div>
                <Switch id="include-toc" checked={options.includeTOC} onCheckedChange={handleToggle("includeTOC")} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor="include-appendix" className="flex items-center gap-2">
                    Include Appendix
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Adds a screenshot appendix after the main content.
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <p className="text-xs text-gray-500">Includes all screenshots referenced in the document.</p>
                </div>
                <Switch id="include-appendix" checked={options.includeAppendix} onCheckedChange={handleToggle("includeAppendix")} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor="include-cover" className="flex items-center gap-2">
                    Include Cover (Beta)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Adds a simple cover page. Additional customization coming in a future update.
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <p className="text-xs text-gray-500">Experimental feature.</p>
                </div>
                <Switch id="include-cover" checked={options.includeCover} onCheckedChange={handleToggle("includeCover")} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor="linkify-urls" className="flex items-center gap-2">
                    Linkify URLs
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Automatically detects URLs in text and makes them clickable in the PDF.
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <p className="text-xs text-gray-500">Improves navigation to external resources.</p>
                </div>
                <Switch id="linkify-urls" checked={options.linkifyUrls} onCheckedChange={handleToggle("linkifyUrls")} />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <div className="space-y-1">
                <Label htmlFor="custom-title">Custom Title</Label>
                <Input
                  id="custom-title"
                  placeholder="Override running title (optional)"
                  value={options.runningTitle ?? ""}
                  onChange={handleText("runningTitle")}
                />
                <p className="text-xs text-gray-500">
                  Used in footers and as the PDF title if provided. Otherwise derived from content.
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="author">Author</Label>
                <Input
                  id="author"
                  placeholder="Author name (optional)"
                  value={options.author ?? ""}
                  onChange={handleText("author")}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  placeholder="Document subject (optional)"
                  value={options.subject ?? ""}
                  onChange={handleText("subject")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="keywords">Keywords</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {(options.keywords ?? []).map((k) => (
                    <Badge key={k} variant="secondary" className="flex items-center gap-1">
                      <span>{k}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${k}`}
                        className="ml-1 rounded p-0.5 hover:bg-gray-200"
                        onClick={() => removeKeyword(k)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="keywords"
                    placeholder="Type a keyword and press Enter"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={onKeywordKeyDown}
                    onBlur={onKeywordBlur}
                  />
                  <Button type="button" variant="outline" onClick={() => addKeyword(keywordInput)}>
                    Add
                  </Button>
                  {(options.keywords?.length ?? 0) > 0 && (
                    <Button type="button" variant="ghost" onClick={clearKeywords}>
                      <Trash2 className="mr-1 h-4 w-4" />
                      Clear
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-500">Keywords help with document search and classification.</p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Images</h3>
            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor="compress-images" className="flex items-center gap-2">
                    Compress Images
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Reduces PDF size by converting screenshots to JPEG and resizing when needed.
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <p className="text-xs text-gray-500">Recommended; significant size savings with minimal quality loss.</p>
                </div>
                <Switch id="compress-images" checked={options.compressImages} onCheckedChange={handleToggle("compressImages")} />
              </div>

              <div className={`space-y-2 ${options.compressImages ? "" : "opacity-50 pointer-events-none"}`}>
                <div className="flex items-center justify-between">
                  <Label htmlFor="image-quality">Image Quality</Label>
                  <span className="text-xs text-gray-500">{qualityPercent}%</span>
                </div>
                <input
                  id="image-quality"
                  type="range"
                  min={60}
                  max={95}
                  step={1}
                  value={clamp(qualityPercent, 60, 95)}
                  onChange={handleQualityChange}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">Controls JPEG compression; higher is better quality but larger size.</p>
              </div>

              <div className={`space-y-2 ${options.compressImages ? "" : "opacity-50 pointer-events-none"}`}>
                <div className="flex items-center justify-between">
                  <Label htmlFor="image-maxwidth">Max Width</Label>
                  <span className="text-xs text-gray-500">{clamp(options.imageMaxWidth, 800, 1920)} px</span>
                </div>
                <input
                  id="image-maxwidth"
                  type="range"
                  min={800}
                  max={1920}
                  step={10}
                  value={clamp(options.imageMaxWidth, 800, 1920)}
                  onChange={handleMaxWidthChange}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">Larger widths improve clarity but increase file size.</p>
              </div>
            </div>

            <Separator />

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              <p className="mb-1">Tips</p>
              <ul className="list-disc pl-5">
                <li>Use Table of Contents for long tutorials.</li>
                <li>Enable image compression for faster sharing.</li>
                <li>Customize the title, author, and subject for better organization.</li>
              </ul>
            </div>
          </section>
        </div>

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}