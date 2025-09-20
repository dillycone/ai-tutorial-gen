import type { TranscriptSegment, TranscriptTrack, TranscriptSource } from "@/lib/types";

const TIME_PATTERN = /^(\d{2}):(\d{2}):(\d{2})([\.,](\d{1,3}))?$/;

const DEFAULT_LANGUAGE = "en";

export type TranscriptParseOptions = {
  fileName?: string;
  languageHint?: string;
  source: TranscriptSource;
};

export type TranscriptParseResult = {
  track: TranscriptTrack;
};

export async function parseTranscriptFile(file: File, options: TranscriptParseOptions): Promise<TranscriptParseResult> {
  const content = await file.text();
  const format = detectFormat(file.name, file.type, content);
  const segments = parseTranscriptContent(content, format);
  const language = options.languageHint || detectLanguageFromContent(content) || DEFAULT_LANGUAGE;

  return {
    track: {
      id: options.fileName || file.name || `transcript-${Date.now()}`,
      segments: segments.map((segment, index) => ({
        ...segment,
        id: segment.id || `seg-${index + 1}`,
      })),
      source: options.source,
      language,
      createdAt: Date.now(),
      fileName: file.name,
    },
  };
}

export function parseTranscriptContent(content: string, format: TranscriptFormat): TranscriptSegment[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  switch (format) {
    case "vtt":
      return parseVtt(trimmed);
    case "srt":
      return parseSrt(trimmed);
    case "json":
      return parseJsonTranscript(trimmed);
    default:
      return parsePlainText(trimmed);
  }
}

type TranscriptFormat = "srt" | "vtt" | "json" | "text";

function detectFormat(name: string | undefined, mimeType: string | undefined, content: string): TranscriptFormat {
  const normalizedName = (name || "").toLowerCase();
  if (normalizedName.endsWith(".vtt") || mimeType === "text/vtt") {
    return "vtt";
  }
  if (normalizedName.endsWith(".srt") || mimeType === "application/x-subrip") {
    return "srt";
  }
  if (normalizedName.endsWith(".json")) {
    return "json";
  }
  if (content.trimStart().startsWith("WEBVTT")) {
    return "vtt";
  }
  if (/"startSec"\s*:/.test(content) && /"text"\s*:/.test(content)) {
    return "json";
  }
  return "text";
}

function parseVtt(content: string): TranscriptSegment[] {
  const lines = content.split(/\r?\n/);
  const segments: TranscriptSegment[] = [];
  let index = 0;
  while (index < lines.length) {
    let timeLine = lines[index]?.trim();
    if (!timeLine || timeLine === "WEBVTT") {
      index += 1;
      continue;
    }
    if (!timeLine.includes("-->") && index + 1 < lines.length) {
      index += 1;
      timeLine = lines[index]?.trim();
    }
    if (!timeLine || !timeLine.includes("-->")) {
      index += 1;
      continue;
    }
    const [startRaw, endRaw] = timeLine.split("-->").map((entry) => entry.trim());
    const startSec = parseTime(startRaw);
    const endSec = parseTime(endRaw);
    index += 1;
    const textLines: string[] = [];
    while (index < lines.length && lines[index]?.trim()) {
      textLines.push(lines[index]!.trim());
      index += 1;
    }
    const text = textLines.join(" ");
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || !text) {
      continue;
    }
    segments.push({
      id: `seg-${segments.length + 1}`,
      startSec,
      endSec: Math.max(endSec, startSec),
      text,
    });
    index += 1;
  }
  return normalizeSegments(segments);
}

function parseSrt(content: string): TranscriptSegment[] {
  const blocks = content.split(/\r?\n\r?\n+/);
  const segments: TranscriptSegment[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim());
    if (lines.length < 2) continue;
    const timeLine = lines[1]?.includes("-->") ? lines[1] : lines[0];
    if (!timeLine || !timeLine.includes("-->")) continue;
    const [startRaw, endRaw] = timeLine.split("-->").map((entry) => entry.trim());
    const startSec = parseTime(startRaw);
    const endSec = parseTime(endRaw);
    const textLines = lines.slice(lines[1]?.includes("-->") ? 2 : 1).filter(Boolean);
    const text = textLines.join(" ").trim();
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || !text) continue;
    segments.push({
      id: `seg-${segments.length + 1}`,
      startSec,
      endSec: Math.max(endSec, startSec),
      text,
    });
  }
  return normalizeSegments(segments);
}

function parseJsonTranscript(content: string): TranscriptSegment[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return normalizeSegments(
        parsed
          .map((entry, index) => {
            if (!entry || typeof entry !== "object") return null;
            const e = entry as Record<string, unknown>;
            const startSec = Number(e.startSec ?? e.start ?? e.start_seconds ?? e.startTime);
            const endSec = Number(e.endSec ?? e.end ?? e.end_seconds ?? e.endTime ?? startSec);
            const text = typeof e.text === "string" ? e.text.trim() : "";
            if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || !text) return null;
            const speaker = typeof e.speaker === "string" ? e.speaker : undefined;
            return {
              id: typeof e.id === "string" ? e.id : `seg-${index + 1}`,
              startSec,
              endSec: Math.max(endSec, startSec),
              text,
              speaker,
            } satisfies TranscriptSegment;
          })
          .filter((segment): segment is TranscriptSegment => Boolean(segment)),
      );
    }
  } catch {
    // ignore parse failure
  }
  return [];
}

function parsePlainText(content: string): TranscriptSegment[] {
  const text = content.replace(/\s+/g, " ").trim();
  if (!text) return [];
  return [
    {
      id: "seg-1",
      startSec: 0,
      endSec: Number.POSITIVE_INFINITY,
      text,
    },
  ];
}

function parseTime(raw: string | undefined): number {
  if (!raw) return NaN;
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  const match = trimmed.match(TIME_PATTERN);
  if (!match) {
    // try mm:ss
    const simple = trimmed.match(/^(\d{1,2}):(\d{2})([\.,](\d{1,3}))?$/);
    if (simple) {
      const minutes = Number(simple[1]);
      const seconds = Number(simple[2]);
      const fraction = simple[4] ? Number(simple[4]) / Math.pow(10, simple[4].length) : 0;
      return minutes * 60 + seconds + fraction;
    }
    return Number(trimmed);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fractionRaw = match[5] ? Number(match[5]) : 0;
  const fraction = fractionRaw / Math.pow(10, match[5]?.length ?? 0);
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

function normalizeSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments
    .map((segment) => {
      const startSec = clampNumber(segment.startSec, 0, Number.POSITIVE_INFINITY);
      const endSec = clampNumber(segment.endSec, startSec, Number.POSITIVE_INFINITY);
      return {
        id: segment.id,
        startSec,
        endSec,
        text: segment.text.trim(),
        speaker: segment.speaker,
      } satisfies TranscriptSegment;
    })
    .filter((segment) => segment.text.length > 0)
    .sort((a, b) => a.startSec - b.startSec)
    .map((segment, index, array) => {
      const nextStart = array[index + 1]?.startSec;
      if (Number.isFinite(nextStart) && segment.endSec > nextStart!) {
        return { ...segment, endSec: nextStart! };
      }
      return segment;
    });
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function detectLanguageFromContent(content: string): string | undefined {
  if (/\b(el|la|los|las|de|para|con)\b/i.test(content)) return "es";
  if (/\b(le|la|les|des|pour|avec)\b/i.test(content)) return "fr";
  if (/\b(der|die|das|und|mit)\b/i.test(content)) return "de";
  return undefined;
}

export function findTranscriptSegment(segments: TranscriptSegment[], timeSec: number): TranscriptSegment | undefined {
  if (!Number.isFinite(timeSec)) return undefined;
  return segments.find((segment) => timeSec >= segment.startSec && timeSec <= segment.endSec + 0.5);
}

export function buildTranscriptSearchIndex(segments: TranscriptSegment[]) {
  return segments.map((segment) => ({
    ...segment,
    searchable: segment.text.toLowerCase(),
  }));
}

export function searchTranscriptSegments(
  segments: ReturnType<typeof buildTranscriptSearchIndex>,
  query: string,
): TranscriptSegment[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const results: TranscriptSegment[] = [];
  for (const segment of segments) {
    if (segment.searchable.includes(normalized)) {
      const { searchable: _ignored, ...rest } = segment;
      void _ignored;
      results.push(rest);
    }
  }
  return results;
}

export const normalizeTranscriptSegments = normalizeSegments;
