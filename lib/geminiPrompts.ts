// lib/geminiPrompts.ts
import fs from "fs";
import { dirname, join } from "path";
import { getSchemaTemplateById } from "@/lib/schemaTemplates";
import type { SchemaTemplate, SchemaType } from "@/lib/types";

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

function cloneTemplate(template: SchemaTemplate): SchemaTemplate {
  let schemaCopy: unknown = template.schema;
  try {
    schemaCopy = JSON.parse(JSON.stringify(template.schema ?? {}));
  } catch {
    // leave schema as-is if cloning fails
  }
  return {
    ...template,
    schema: schemaCopy,
  };
}

function applyOverride(base: SchemaTemplate, override?: PromptOverrideEntry): SchemaTemplate {
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

async function resolveBaseTemplate(type: SchemaType): Promise<SchemaTemplate> {
  const template = await getSchemaTemplateById(type);
  if (!template) {
    throw new Error(`Unknown schema template: ${String(type)}`);
  }
  return cloneTemplate(template);
}

export async function getSchemaConfig(type: SchemaType): Promise<SchemaTemplate> {
  const base = await resolveBaseTemplate(type);
  const overrides = await readOverrides();
  return applyOverride(base, overrides[type]);
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
