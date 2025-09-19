// lib/geminiPrompts.ts
import fs from "fs";
import { dirname, join } from "path";
import { MeetingSummarySchema, TutorialSchema } from "@/lib/schema";
import { SchemaType } from "@/lib/types";

type SchemaConfig = {
  persona: string;
  requirements: string;
  fallbackOutput: string;
  schema: unknown;
  hintLabel: string;
  styleGuide?: string;
};

const MEETING_SCHEMA_CONFIG: SchemaConfig = {
  persona:
    "You are an expert meeting scribe. Analyze the video and provided named screenshots to build an executive-ready meeting summary.",
  requirements: [
    "- Capture the precise meeting title and ensure it is professional.",
    "- Provide the meeting date in YYYY-MM-DD format (infer from context; if unclear, use your best estimate).",
    "- Summarize the meeting in two to three sentences covering intent and outcome.",
    "- List attendees with roles or departments when mentioned.",
    "- Identify each key topic in chronological order with concise details and relevant speakers/timecodes.",
    "- Record decisions with current status and owners when discussed.",
    "- Capture action items with owners and due dates if provided.",
    "- Note other follow-ups only if they do not fit decisions or action items.",
  ].join("\n"),
  fallbackOutput:
    "Return well-structured Markdown that clearly labels sections: Meeting Title, Meeting Date, Summary, Attendees, Key Topics, Decisions, Action Items, Follow Ups.",
  schema: MeetingSummarySchema,
  hintLabel: "meeting title",
};

const TUTORIAL_SCHEMA_CONFIG: SchemaConfig = {
  persona:
    "You are an expert technical writer.",
  requirements: [
    "- Analyze the video and the provided named screenshots to produce a complete, detailed, comprehensive step-by-step tutorial.",
    "- Focus strictly on observable actions and visual cues present in the video.",
    "- Provide a short, descriptive title and a 2-3 sentence summary for the tutorial.",
    "- Include any necessary prerequisites.",
    "- Return steps in the exact chronological order they should be performed.",
    "- For each step: include a concise title, a clear, actionable description, and (if evident) precise start/end timecodes from the video.",
    "- Explicitly reference the provided screenshot IDs (s1, s2, s3, s4, s5, s6, s7) exactly as given, matching them to the most relevant step(s) based on their content and timecodes.",
    "- Ensure descriptions are actionable, specific, and directly grounded in both the video actions and the content of the captured screenshots.",
    "- Utilize screenshot timecodes (e.g., s1 @01:32) to reinforce chronological ordering and relevance of steps.",
    "- The final tutorial MUST be returned as STRICT JSON. The JSON structure should include top-level keys for 'title' (string), 'summary' (string), 'prerequisites' (an array of strings), and 'steps' (an array of objects). Each step object must contain 'stepTitle' (string), 'description' (string), 'timecodes' (an object with 'start' and 'end' strings, if available), and 'screenshots' (an array of strings, listing relevant screenshot IDs). Ensure all JSON is valid and well-formatted.",
    "- Provide in-depth explanations for non-trivial steps: include the purpose, expected outcome, and any relevant context behind the action.",
    "- When settings, parameters, or UI choices are visible, briefly justify why they are chosen and note viable alternatives when applicable.",
    "- Call out common pitfalls, warnings, and troubleshooting tips inline where relevant to help users avoid errors.",
    "- Define or clarify domain-specific terms encountered in the interface the first time they appear.",
    "- Where helpful, connect actions to broader workflows or best practices to enhance the tutorial's educational value."
  ].join("\n"),
  fallbackOutput:
    "If JSON output is not possible, return a well-structured Markdown tutorial with numbered steps. When placing images, include lines like: [screenshots: s3, s5].",
  schema: TutorialSchema,
  hintLabel: "title",
  styleGuide: "Maintain a clear, thorough, and professional tone. Prioritize completeness and educational clarity over brevity. Use active voice. Avoid unnecessary jargon; define key terms when first introduced. When helpful, include brief rationale, context, and warnings within step descriptions. Ensure all instructions are unambiguous and reproducible.",
};

const CONFIG_MAP: Record<SchemaType, SchemaConfig> = {
  tutorial: TUTORIAL_SCHEMA_CONFIG,
  meetingSummary: MEETING_SCHEMA_CONFIG,
};

const OVERRIDE_PATH = (() => {
  if (process.env.PROMPT_OVERRIDE_PATH) {
    return process.env.PROMPT_OVERRIDE_PATH;
  }

  // Use /tmp in serverless environments
  const baseDir =
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
      ? "/tmp"
      : join(process.cwd(), "data");

  return join(baseDir, "prompt_overrides.json");
})();

type PromptOverrideEntry = {
  persona?: string;
  requirements?: string;
  fallbackOutput?: string;
  styleGuide?: string;
  score?: number;
  updatedAt?: string;
};

type PromptOverrides = Partial<Record<SchemaType, PromptOverrideEntry>>;

async function readOverrides(): Promise<PromptOverrides> {
  try {
    if (!fs.existsSync(OVERRIDE_PATH)) {
      return {};
    }
    const raw = await fs.promises.readFile(OVERRIDE_PATH, "utf-8");
    if (!raw.trim()) {
      return {};
    }
    const parsed = JSON.parse(raw) as PromptOverrides;
    return parsed ?? {};
  } catch {
    return {};
  }
}

const writeLocks = new Map<string, Promise<void>>();

async function writeOverridesAtomic(overrides: PromptOverrides): Promise<void> {
  const lockKey = OVERRIDE_PATH;

  // Simple in-memory lock to prevent concurrent writes to the same file
  if (writeLocks.has(lockKey)) {
    const inflight = writeLocks.get(lockKey);
    if (inflight) {
      await inflight;
    }
  }

  const writePromise = (async () => {
    const directory = dirname(OVERRIDE_PATH);
    if (directory) {
      await fs.promises.mkdir(directory, { recursive: true });
    }

    // Atomic write: write to temp file, then rename
    const tempPath = `${OVERRIDE_PATH}.tmp.${Date.now()}`;
    try {
      await fs.promises.writeFile(tempPath, JSON.stringify(overrides, null, 2), "utf-8");
      await fs.promises.rename(tempPath, OVERRIDE_PATH);
    } catch (error) {
      try {
        await fs.promises.unlink(tempPath);
      } catch {
        // ignore cleanup errors
      }
      throw error;
    }
  })();

  writeLocks.set(lockKey, writePromise);

  try {
    await writePromise;
  } finally {
    writeLocks.delete(lockKey);
  }
}

function applyOverride(base: SchemaConfig, override?: PromptOverrideEntry): SchemaConfig {
  if (!override) {
    return base;
  }
  return {
    ...base,
    persona: override.persona?.trim() || base.persona,
    requirements: override.requirements?.trim() || base.requirements,
    fallbackOutput: override.fallbackOutput?.trim() || base.fallbackOutput,
    styleGuide: override.styleGuide?.trim() || base.styleGuide,
  };
}

export async function getSchemaConfig(type: SchemaType) {
  const base = CONFIG_MAP[type];
  const overrides = await readOverrides();
  return applyOverride({ ...base }, overrides[type]);
}

export async function promoteBaselinePrompt(
  type: SchemaType,
  candidate: {
    persona: string;
    requirements: string;
    fallbackOutput: string;
    styleGuide?: string | null;
    score: number | null | undefined;
  },
): Promise<boolean> {
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "Baseline prompt promotion disabled in production environment. " +
        "Promoted prompts will not persist in serverless environments."
    );
    return false;
  }

  const persona = candidate.persona?.trim();
  const requirements = candidate.requirements?.trim();
  if (!persona || !requirements) {
    return false;
  }

  const fallback = candidate.fallbackOutput?.trim() ?? "";
  const styleGuide = candidate.styleGuide?.trim() || undefined;
  const rawScore =
    typeof candidate.score === "number"
      ? candidate.score
      : candidate.score != null
        ? Number(candidate.score)
        : Number.NaN;
  const normalizedScore = Number.isFinite(rawScore) ? Math.max(0, Math.min(1, rawScore)) : 0;
  if (normalizedScore <= 0) {
    return false;
  }

  const overrides = await readOverrides();
  const currentEntry = overrides[type];
  const currentScore =
    currentEntry && typeof currentEntry.score === "number" ? currentEntry.score : 0;

  if (normalizedScore <= currentScore) {
    return false;
  }

  overrides[type] = {
    persona,
    requirements,
    fallbackOutput: fallback || undefined,
    styleGuide,
    score: normalizedScore,
    updatedAt: new Date().toISOString(),
  };

  await writeOverridesAtomic(overrides);
  return true;
}
