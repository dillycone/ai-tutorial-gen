/* lib/results.ts */
import type { MeetingSummaryResult, TutorialResult, TutorialStep } from "@/lib/types";

const JSON_FENCE_RE = /```(?:json)?\s*([\s\S]+?)```/i;

const TRAILING_COMMA_RE = /,\s*(?=[}\]])/g;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeLooseJson(value: string): string {
  return value.replace(TRAILING_COMMA_RE, "");
}

function canonicalizeTutorial(data: Record<string, unknown>): TutorialResult | null {
  if (typeof data.title !== "string" || typeof data.summary !== "string" || !Array.isArray(data.steps)) {
    return null;
  }

  const steps: TutorialStep[] = [];
  for (let index = 0; index < data.steps.length; index += 1) {
    const step = data.steps[index];
    if (!isPlainObject(step)) {
      return null;
    }
    if (typeof step.stepTitle !== "string" || typeof step.description !== "string") {
      return null;
    }

    let timecodes: TutorialStep["timecodes"] = null;
    if (isPlainObject(step.timecodes)) {
      const start = typeof step.timecodes.start === "string" ? step.timecodes.start : undefined;
      const end = typeof step.timecodes.end === "string" ? step.timecodes.end : undefined;
      timecodes = start || end ? { start, end } : null;
    }

    const screenshots = Array.isArray(step.screenshots)
      ? step.screenshots.filter((item): item is string => typeof item === "string")
      : null;

    steps.push({
      stepTitle: step.stepTitle,
      description: step.description,
      timecodes,
      screenshots: screenshots && screenshots.length > 0 ? screenshots : null,
    });
  }

  const prerequisites = Array.isArray(data.prerequisites)
    ? data.prerequisites.filter((item): item is string => typeof item === "string")
    : [];

  return {
    title: data.title,
    summary: data.summary,
    prerequisites,
    steps,
  };
}

export function extractFirstJsonBlock(text: string): string | null {
  if (!text) {
    return null;
  }

  const fenceMatch = text.match(JSON_FENCE_RE);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  if (firstBrace === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = firstBrace; i < text.length; i += 1) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        depth = 1;
        continue;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(firstBrace, i + 1).trim();
      }
    }
  }

  return null;
}

export function tryParseJsonLoose(jsonText: string): unknown {
  const trimmed = jsonText.trim();
  if (!trimmed) {
    throw new Error("JSON content is empty");
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    const sanitized = sanitizeLooseJson(trimmed);
    if (sanitized !== trimmed) {
      try {
        return JSON.parse(sanitized) as unknown;
      } catch (retryError) {
        throw retryError instanceof Error ? retryError : new Error("Failed to parse JSON");
      }
    }
    throw error instanceof Error ? error : new Error("Failed to parse JSON");
  }
}

function normalizeStep(step: unknown, fallbackIndex: number): TutorialStep | null {
  if (!isPlainObject(step)) {
    return null;
  }

  const rawTitle = (() => {
    if (typeof step.stepTitle === "string" && step.stepTitle.trim()) {
      return step.stepTitle.trim();
    }
    if (typeof step.title === "string" && step.title.trim()) {
      return step.title.trim();
    }
    if (typeof step.heading === "string" && step.heading.trim()) {
      return step.heading.trim();
    }
    return `Step ${fallbackIndex + 1}`;
  })();

  const descriptionCandidates = [step.description, step.body, step.details, step.text];
  const rawDescription = descriptionCandidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  if (typeof rawDescription !== "string") {
    return null;
  }

  const timecodesSource = step.timecodes;
  let timecodes: TutorialStep["timecodes"] = null;

  if (isPlainObject(timecodesSource)) {
    const start = typeof timecodesSource.start === "string" ? timecodesSource.start.trim() : undefined;
    const end = typeof timecodesSource.end === "string" ? timecodesSource.end.trim() : undefined;
    timecodes = start || end ? { start, end } : null;
  } else {
    const startCandidates = [step.startTimecode, step.start, step.begin, step.timecodeStart];
    const endCandidates = [step.endTimecode, step.end, step.finish, step.timecodeEnd];
    const start = startCandidates.find((candidate) => typeof candidate === "string" && candidate.trim());
    const end = endCandidates.find((candidate) => typeof candidate === "string" && candidate.trim());
    if (start || end) {
      timecodes = {
        start: typeof start === "string" ? start : undefined,
        end: typeof end === "string" ? end : undefined,
      };
    }
  }

  let screenshots: string[] | null = null;
  if (Array.isArray(step.screenshots)) {
    const filtered = step.screenshots.filter((item) => typeof item === "string" && item.trim()) as string[];
    screenshots = filtered.length ? filtered : null;
  } else if (Array.isArray(step.screenshotIds)) {
    const filtered = step.screenshotIds.filter((item) => typeof item === "string" && item.trim()) as string[];
    screenshots = filtered.length ? filtered : null;
  }

  return {
    stepTitle: rawTitle,
    description: (rawDescription as string).trim(),
    timecodes,
    screenshots,
  };
}

export function coerceTutorial(data: unknown): TutorialResult | null {
  if (!isPlainObject(data)) {
    return null;
  }

  const canonical = canonicalizeTutorial(data);
  if (canonical) {
    return canonical;
  }

  const titleCandidate = [data.title, data.tutorialTitle, data.name].find(
    (candidate) => typeof candidate === "string" && candidate.trim(),
  );
  const summaryCandidate = [data.summary, data.overview, data.description].find(
    (candidate) => typeof candidate === "string" && candidate.trim(),
  );

  const rawSteps = Array.isArray(data.steps)
    ? data.steps
    : Array.isArray((data as Record<string, unknown>).outline)
    ? ((data as Record<string, unknown>).outline as unknown[])
    : null;

  if (typeof titleCandidate !== "string" || typeof summaryCandidate !== "string" || !rawSteps) {
    return null;
  }

  const prerequisitesSource = data.prerequisites ?? data.requirements ?? data.beforeYouBegin;
  const prerequisites = (() => {
    if (Array.isArray(prerequisitesSource)) {
      return prerequisitesSource.filter((item) => typeof item === "string" && item.trim()) as string[];
    }
    if (typeof prerequisitesSource === "string") {
      const parts = prerequisitesSource.split(/\r?\n|,|;/).map((item) => item.trim()).filter(Boolean);
      return parts;
    }
    return [] as string[];
  })();

  const steps = rawSteps
    .map((step, index) => normalizeStep(step, index))
    .filter((step): step is TutorialStep => Boolean(step));

  if (!steps.length) {
    return null;
  }

  return {
    title: (titleCandidate as string).trim(),
    summary: (summaryCandidate as string).trim(),
    prerequisites,
    steps,
  };
}

export function validateTutorial(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isPlainObject(data)) {
    return { valid: false, errors: ["Tutorial result must be an object"] };
  }

  if (typeof data.title !== "string" || !data.title.trim()) {
    errors.push("Tutorial title is required");
  }
  if (typeof data.summary !== "string" || !data.summary.trim()) {
    errors.push("Tutorial summary is required");
  }
  if (!Array.isArray(data.prerequisites)) {
    errors.push("Tutorial prerequisites must be an array of strings");
  } else if (data.prerequisites.some((item) => typeof item !== "string")) {
    errors.push("Tutorial prerequisites must contain only strings");
  }

  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    errors.push("At least one tutorial step is required");
  } else {
    data.steps.forEach((step, index) => {
      if (!isPlainObject(step)) {
        errors.push(`Step ${index + 1} must be an object`);
        return;
      }
      if (typeof step.stepTitle !== "string" || !step.stepTitle.trim()) {
        errors.push(`Step ${index + 1} title is required`);
      }
      if (typeof step.description !== "string" || !step.description.trim()) {
        errors.push(`Step ${index + 1} description is required`);
      }
      if (step.timecodes && !isPlainObject(step.timecodes)) {
        errors.push(`Step ${index + 1} timecodes must be an object`);
      } else if (step.timecodes) {
        const { start, end } = step.timecodes as { start?: unknown; end?: unknown };
        if (start !== undefined && typeof start !== "string") {
          errors.push(`Step ${index + 1} start timecode must be a string`);
        }
        if (end !== undefined && typeof end !== "string") {
          errors.push(`Step ${index + 1} end timecode must be a string`);
        }
      }
      if (step.screenshots && !Array.isArray(step.screenshots)) {
        errors.push(`Step ${index + 1} screenshots must be an array of strings`);
      } else if (Array.isArray(step.screenshots)) {
        step.screenshots.forEach((shot, shotIndex) => {
          if (typeof shot !== "string") {
            errors.push(`Step ${index + 1} screenshot ${shotIndex + 1} must be a string`);
          }
        });
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

export function validateMeetingSummary(data: unknown): { valid: boolean; errors: string[] } {
  if (!isPlainObject(data)) {
    return { valid: false, errors: ["Meeting summary must be an object"] };
  }

  const errors: string[] = [];
  const stringFields = ["meetingTitle", "meetingDate", "summary"] as const;
  stringFields.forEach((field) => {
    const value = data[field];
    if (value !== undefined && typeof value !== "string") {
      errors.push(`${field} must be a string`);
    }
  });

  const arrayFields: Array<[keyof MeetingSummaryResult, string]> = [
    ["attendees", "attendees"],
    ["keyTopics", "keyTopics"],
    ["decisions", "decisions"],
    ["actionItems", "actionItems"],
    ["followUps", "followUps"],
  ];

  arrayFields.forEach(([field, label]) => {
    const value = data[field];
    if (value !== undefined && !Array.isArray(value)) {
      errors.push(`${label} must be an array`);
    }
  });

  if (!Array.isArray(data.keyTopics)) {
    errors.push("keyTopics must be an array");
  }

  return { valid: errors.length === 0, errors };
}

export function normalizeResultForTemplate(
  templateId: string,
  raw: unknown,
): { data: Record<string, unknown> | null; valid: boolean; errors: string[] } {
  if (templateId === "tutorial") {
    const tutorial = coerceTutorial(raw);
    if (!tutorial) {
      return {
        data: null,
        valid: false,
        errors: ["Tutorial result is missing required fields"],
      };
    }
    const validation = validateTutorial(tutorial);
    return {
      data: tutorial,
      valid: validation.valid,
      errors: validation.errors,
    };
  }

  if (templateId === "meetingSummary") {
    const base = isPlainObject(raw) ? (raw as MeetingSummaryResult) : null;
    if (!base) {
      return {
        data: null,
        valid: false,
        errors: ["Meeting summary result must be an object"],
      };
    }
    const validation = validateMeetingSummary(base);
    return {
      data: base,
      valid: validation.valid,
      errors: validation.errors,
    };
  }

  if (!isPlainObject(raw)) {
    return {
      data: null,
      valid: false,
      errors: ["Result must be a JSON object"],
    };
  }

  return { data: raw, valid: true, errors: [] };
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }
  if (isPlainObject(value)) {
    const sortedEntries = Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, sortJson(value[key])] as const);
    return Object.fromEntries(sortedEntries);
  }
  return value;
}

export function toPrettyJson(value: unknown): string {
  if (typeof value === "undefined") {
    return "";
  }
  try {
    return JSON.stringify(sortJson(value), null, 2);
  } catch (error) {
    throw error instanceof Error ? error : new Error("Failed to serialize JSON");
  }
}
