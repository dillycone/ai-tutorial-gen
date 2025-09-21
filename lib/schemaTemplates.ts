// lib/schemaTemplates.ts
import fs from "fs";
import { dirname, join } from "path";
import { MeetingSummarySchema, TutorialSchema } from "@/lib/schema";
import type { SchemaTemplate, SchemaTemplateInput } from "@/lib/types";

const BUILTIN_CREATED_AT = "2024-01-01T00:00:00.000Z";

const tutorialPersona =
  "You are an expert technical writer.";
const tutorialRequirements = [
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
  "- Where helpful, connect actions to broader workflows or best practices to enhance the tutorial's educational value.",
].join("\n");
const tutorialFallback =
  "If JSON output is not possible, return a well-structured Markdown tutorial with numbered steps. When placing images, include lines like: [screenshots: s3, s5].";
const tutorialStyleGuide =
  "Maintain a clear, thorough, and professional tone. Prioritize completeness and educational clarity over brevity. Use active voice. Avoid unnecessary jargon; define key terms when first introduced. When helpful, include brief rationale, context, and warnings within step descriptions. Ensure all instructions are unambiguous and reproducible.";

const meetingPersona =
  "You are an expert meeting scribe. Analyze the video and provided named screenshots to build an executive-ready meeting summary.";
const meetingRequirements = [
  "- Capture the precise meeting title and ensure it is professional.",
  "- Provide the meeting date in YYYY-MM-DD format (infer from context; if unclear, use your best estimate).",
  "- Summarize the meeting in two to three sentences covering intent and outcome.",
  "- List attendees with roles or departments when mentioned.",
  "- Identify each key topic in chronological order with concise details and relevant speakers/timecodes.",
  "- Record decisions with current status and owners when discussed.",
  "- Capture action items with owners and due dates if provided.",
  "- Note other follow-ups only if they do not fit decisions or action items.",
].join("\n");
const meetingFallback =
  "Return well-structured Markdown that clearly labels sections: Meeting Title, Meeting Date, Summary, Attendees, Key Topics, Decisions, Action Items, Follow Ups.";

const BUILTIN_TEMPLATES: SchemaTemplate[] = [
  {
    id: "tutorial",
    name: "Tutorial",
    description: "Step-by-step product walkthroughs and how-to guides.",
    persona: tutorialPersona,
    requirements: tutorialRequirements,
    fallbackOutput: tutorialFallback,
    hintLabel: "title",
    schema: TutorialSchema,
    styleGuide: tutorialStyleGuide,
    builtIn: true,
    createdAt: BUILTIN_CREATED_AT,
    updatedAt: BUILTIN_CREATED_AT,
    version: 1,
  },
  {
    id: "meetingSummary",
    name: "Meeting Summary",
    description: "Executive-ready recaps of discussions and decisions.",
    persona: meetingPersona,
    requirements: meetingRequirements,
    fallbackOutput: meetingFallback,
    hintLabel: "meeting title",
    schema: MeetingSummarySchema,
    builtIn: true,
    createdAt: BUILTIN_CREATED_AT,
    updatedAt: BUILTIN_CREATED_AT,
    version: 1,
  },
];

type StoredTemplate = SchemaTemplate;

const STORAGE_PATH = (() => {
  if (process.env.SCHEMA_TEMPLATE_PATH) {
    return process.env.SCHEMA_TEMPLATE_PATH;
  }
  const baseDir =
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
      ? "/tmp"
      : join(process.cwd(), "data");
  return join(baseDir, "schema_templates.json");
})();

const ID_PATTERN = /^[a-z][a-z0-9-]{2,48}$/;

let cachedCustom: StoredTemplate[] | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

const writeLocks = new Map<string, Promise<void>>();

function nowIso(): string {
  return new Date().toISOString();
}

function cloneSchema(schema: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(schema ?? {}));
  } catch {
    return {};
  }
}

function normalizeTemplate(template: SchemaTemplate): SchemaTemplate {
  return {
    ...template,
    schema: cloneSchema(template.schema),
    builtIn: Boolean(template.builtIn),
  };
}

async function readCustomTemplates(): Promise<StoredTemplate[]> {
  const useCache = cachedCustom && Date.now() - cacheLoadedAt < CACHE_TTL_MS;
  if (useCache && cachedCustom) {
    return cachedCustom.map((tpl) => normalizeTemplate(tpl));
  }

  try {
    if (!fs.existsSync(STORAGE_PATH)) {
      cachedCustom = [];
      cacheLoadedAt = Date.now();
      return [];
    }
    const raw = await fs.promises.readFile(STORAGE_PATH, "utf-8");
    if (!raw.trim()) {
      cachedCustom = [];
      cacheLoadedAt = Date.now();
      return [];
    }
    const parsed = JSON.parse(raw) as StoredTemplate[];
    const sanitized = Array.isArray(parsed)
      ? parsed
          .map((entry) => ({
            ...entry,
            builtIn: false,
          }))
          .filter((entry): entry is StoredTemplate => entry && typeof entry.id === "string")
      : [];
    cachedCustom = sanitized.map((tpl) => ({ ...tpl, schema: cloneSchema(tpl.schema) }));
    cacheLoadedAt = Date.now();
    return cachedCustom.map((tpl) => normalizeTemplate(tpl));
  } catch {
    cachedCustom = [];
    cacheLoadedAt = Date.now();
    return [];
  }
}

async function writeCustomTemplates(templates: StoredTemplate[]): Promise<void> {
  const directory = dirname(STORAGE_PATH);
  await fs.promises.mkdir(directory, { recursive: true });

  const lockKey = STORAGE_PATH;
  const pending = writeLocks.get(lockKey);
  if (pending) {
    await pending;
  }

  const payload = templates.map((tpl) => ({
    ...tpl,
    builtIn: false,
    schema: cloneSchema(tpl.schema),
  }));

  const writePromise = (async () => {
    const tempPath = `${STORAGE_PATH}.tmp.${Date.now()}`;
    try {
      await fs.promises.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf-8");
      await fs.promises.rename(tempPath, STORAGE_PATH);
    } catch (error) {
      try {
        await fs.promises.unlink(tempPath);
      } catch {
        // ignore cleanup failures
      }
      throw error;
    }
  })();

  writeLocks.set(lockKey, writePromise);

  try {
    await writePromise;
    cachedCustom = templates.map((tpl) => ({ ...tpl, schema: cloneSchema(tpl.schema) }));
    cacheLoadedAt = Date.now();
  } finally {
    writeLocks.delete(lockKey);
  }
}

export function listBuiltInSchemaTemplates(): SchemaTemplate[] {
  return BUILTIN_TEMPLATES.map((tpl) => normalizeTemplate(tpl));
}

export async function listSchemaTemplates(): Promise<SchemaTemplate[]> {
  const custom = await readCustomTemplates();
  return [...listBuiltInSchemaTemplates(), ...custom];
}

export async function getSchemaTemplateById(id: string): Promise<SchemaTemplate | undefined> {
  if (!id) return undefined;
  const builtin = BUILTIN_TEMPLATES.find((tpl) => tpl.id === id);
  if (builtin) {
    return normalizeTemplate(builtin);
  }
  const custom = await readCustomTemplates();
  return custom.find((tpl) => tpl.id === id);
}

export async function schemaTemplateExists(id: string): Promise<boolean> {
  if (!id) return false;
  if (BUILTIN_TEMPLATES.some((tpl) => tpl.id === id)) {
    return true;
  }
  const custom = await readCustomTemplates();
  return custom.some((tpl) => tpl.id === id);
}

export function parseSchemaTemplatePayload(payload: unknown): SchemaTemplateInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid schema template payload");
  }
  const data = payload as Record<string, unknown>;

  let rawSchema: unknown = data.schema;
  if (typeof rawSchema === "string") {
    try {
      rawSchema = JSON.parse(rawSchema);
    } catch {
      throw new Error("Schema must be valid JSON when provided as a string.");
    }
  }

  const input: SchemaTemplateInput = {
    id: typeof data.id === "string" ? data.id.trim() : "",
    name: typeof data.name === "string" ? data.name.trim() : "",
    description: typeof data.description === "string" ? data.description.trim() : undefined,
    persona: typeof data.persona === "string" ? data.persona.trim() : "",
    requirements: typeof data.requirements === "string" ? data.requirements.trim() : "",
    fallbackOutput: typeof data.fallbackOutput === "string" ? data.fallbackOutput.trim() : "",
    hintLabel: typeof data.hintLabel === "string" ? data.hintLabel.trim() : "",
    schema: rawSchema ?? {},
    styleGuide: typeof data.styleGuide === "string" ? data.styleGuide.trim() : undefined,
  };

  assertValidTemplateInput(input);

  return {
    ...input,
    description: input.description && input.description.length > 0 ? input.description : undefined,
    styleGuide: input.styleGuide && input.styleGuide.length > 0 ? input.styleGuide : undefined,
    schema: cloneSchema(rawSchema ?? {}),
  };
}

function assertValidTemplateInput(input: SchemaTemplateInput) {
  if (!ID_PATTERN.test(input.id)) {
    throw new Error(
      "Template id must be 3-49 characters, start with a letter, and contain only lowercase letters, numbers, or hyphens.",
    );
  }
  const requireString = (value: unknown, field: string) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      throw new Error(`${field} is required.`);
    }
    return text;
  };

  requireString(input.name, "Template name");
  requireString(input.persona, "Persona");
  requireString(input.requirements, "Requirements");
  requireString(input.fallbackOutput, "Fallback output");
  requireString(input.hintLabel, "Hint label");

  try {
    cloneSchema(input.schema);
  } catch {
    throw new Error("Schema definition must be serializable JSON.");
  }
}

export async function createSchemaTemplate(input: SchemaTemplateInput): Promise<SchemaTemplate> {
  assertValidTemplateInput(input);

  if (await schemaTemplateExists(input.id)) {
    throw new Error(`A schema template with id "${input.id}" already exists.`);
  }

  const custom = await readCustomTemplates();
  const now = nowIso();
  const normalized: SchemaTemplate = {
    id: input.id,
    name: input.name.trim(),
    description: typeof input.description === "string" ? input.description.trim() : undefined,
    persona: input.persona.trim(),
    requirements: input.requirements.trim(),
    fallbackOutput: input.fallbackOutput.trim(),
    hintLabel: input.hintLabel.trim(),
    schema: cloneSchema(input.schema),
    styleGuide: typeof input.styleGuide === "string" && input.styleGuide.trim() ? input.styleGuide.trim() : undefined,
    builtIn: false,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  const next = [...custom.filter((tpl) => tpl.id !== normalized.id), normalized];
  await writeCustomTemplates(next);
  return normalizeTemplate(normalized);
}
