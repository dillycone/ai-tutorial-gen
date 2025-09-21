import { createUserContent, createPartFromUri } from "@google/genai";
import { join } from "path";
import { ai } from "@/lib/gemini";
import { getSchemaConfig, promoteBaselinePrompt } from "@/lib/geminiPrompts";
import { listBuiltInSchemaTemplates } from "@/lib/schemaTemplates";
import {
  optimizePromptWithDSPy,
  type DspyOptimizationPayload,
  type PromptBlueprint,
  type PromptShotSummary,
} from "@/lib/dspy";
import { isTrustedUri, isValidMediaType } from "@/lib/validators/mediaValidators";
import { AppError, logError } from "@/lib/errors";
import { PromptMode, PromptOptimizationMeta, SchemaTemplate, SchemaType } from "@/lib/types";
import type { GenerateRequestBody } from "@/lib/types/api";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-1.5-pro";

export type GenerationResult = {
  rawText: string;
  promptMeta: PromptOptimizationMeta;
  appliedPrompt: {
    persona: string;
    requirements: string;
    fallbackOutput: string;
    styleGuide?: string;
  };
};

function toBlueprint(config: {
  persona: string;
  requirements: string;
  fallbackOutput: string;
  styleGuide?: string;
  hintLabel: string;
}): PromptBlueprint {
  return {
    persona: config.persona,
    requirements: config.requirements,
    fallbackOutput: config.fallbackOutput,
    styleGuide: config.styleGuide,
    hintLabel: config.hintLabel,
  };
}

export async function generateStructuredOutput(body: GenerateRequestBody): Promise<GenerationResult> {
  const video = body.video;
  const screenshots = body.screenshots;
  const enforceSchema = body.enforceSchema;
  const titleHint = body.titleHint;
  const schemaType = body.schemaType;
  const promptMode: PromptMode = body.promptMode === "dspy" ? "dspy" : "manual";
  const shotsMeta: PromptShotSummary[] = (body.shots ?? []).map((shot) => ({ ...shot }));
  const dspyOptions = body.dspyOptions ?? {};
  const promoteBaseline = Boolean(body.promoteBaseline);

  const requestedSchemaId: SchemaType =
    typeof schemaType === "string" && schemaType.trim().length > 0 ? (schemaType as string).trim() : "tutorial";

  let schemaConfig: SchemaTemplate;
  try {
    schemaConfig = await getSchemaConfig(requestedSchemaId);
  } catch {
    throw new AppError(`Unknown schema template: ${requestedSchemaId}`, { status: 400 });
  }
  const referenceTemplates = new Map<SchemaType, SchemaTemplate>();
  for (const template of listBuiltInSchemaTemplates()) {
    const hydrated = await getSchemaConfig(template.id);
    referenceTemplates.set(hydrated.id, hydrated);
  }
  referenceTemplates.set(schemaConfig.id, schemaConfig);
  const referencePrompts = Array.from(referenceTemplates.values()).reduce<Record<SchemaType, PromptBlueprint>>(
    (acc, template) => {
      acc[template.id] = toBlueprint(template);
      return acc;
    },
    {},
  );

  let personaText = schemaConfig.persona;
  let requirementsText = schemaConfig.requirements;
  let fallbackOutputText = schemaConfig.fallbackOutput;
  let styleGuideText: string | undefined;

  let promptMeta: PromptOptimizationMeta = {
    requestedMode: promptMode,
    appliedMode: "manual",
    message:
      promptMode === "dspy"
        ? "DSPy prompt unavailable – manual instructions used."
        : "Manual Gemini prompt used.",
    baselinePromoted: false,
  };

  if (promptMode === "dspy") {
    try {
      const checkpointPath =
        dspyOptions.checkpointPath ??
        process.env.DSPY_CHECKPOINT_PATH ??
        join(process.cwd(), "python", "checkpoints", `${requestedSchemaId}-optimizer.json`);

      const experiencePath =
        dspyOptions.experiencePath ??
        process.env.DSPY_EXPERIENCE_PATH ??
        join(process.cwd(), "python", "experience", `${requestedSchemaId}-episodes.jsonl`);

      const envTopK = Number.parseInt(process.env.DSPY_EXPERIENCE_TOPK ?? "", 10);
      const rawTopK =
        typeof dspyOptions.experienceTopK === "number"
          ? dspyOptions.experienceTopK
          : Number.isFinite(envTopK)
          ? envTopK
          : 8;
      const experienceTopK = Math.max(0, Math.floor(rawTopK));

      const envMinScore = Number.parseFloat(process.env.DSPY_EXPERIENCE_MIN_SCORE ?? "");
      const rawMinScore =
        typeof dspyOptions.experienceMinScore === "number"
          ? dspyOptions.experienceMinScore
          : Number.isFinite(envMinScore)
          ? envMinScore
          : 0.75;
      const experienceMinScore = Math.max(0, Math.min(1, rawMinScore));

      const persistExperience =
        typeof dspyOptions.persistExperience === "boolean"
          ? dspyOptions.persistExperience
          : (process.env.DSPY_EXPERIENCE_PERSIST ?? "true").toLowerCase() !== "false";

      const optimizationModel = dspyOptions.model ?? process.env.DSPY_MODEL ?? `gemini/${GEMINI_MODEL}`;
      const reflectionModel = dspyOptions.reflectionModel ?? process.env.DSPY_REFLECTION_MODEL ?? optimizationModel;
      const rpmLimit =
        typeof dspyOptions.rpmLimit === "number"
          ? dspyOptions.rpmLimit
          : Number.parseInt(process.env.DSPY_RPM_LIMIT ?? "", 10) || 8;

      const optimizationPayload: DspyOptimizationPayload = {
        schemaType: requestedSchemaId,
        enforceSchema,
        titleHint,
        shots: shotsMeta,
        basePrompt: toBlueprint(schemaConfig),
        referencePrompts,
        checkpointPath,
        experiencePath,
        experienceTopK,
        experienceMinScore,
        persistExperience,
        model: optimizationModel,
        reflectionModel,
        rpmLimit,
        temperature: dspyOptions.temperature ?? 0.7,
        reflectionTemperature: dspyOptions.reflectionTemperature,
        maxTokens: dspyOptions.maxTokens ?? 65536,
        reflectionMaxTokens: dspyOptions.reflectionMaxTokens ?? 65536,
        jsonBonus: dspyOptions.jsonBonus,
        featureWeights: dspyOptions.featureWeights,
        experiencePruneThreshold: dspyOptions.experiencePruneThreshold,
        experienceMaxAge: dspyOptions.experienceMaxAge,
        alwaysFullValidation: dspyOptions.alwaysFullValidation,
        progressiveSchedule: dspyOptions.progressiveSchedule,
        parallelEval: dspyOptions.parallelEval,
        parallelWorkers: dspyOptions.parallelWorkers,
        parallelBatchSize: dspyOptions.parallelBatchSize,
        evalTimeoutMs: dspyOptions.evalTimeoutMs,
        minValidationSize: dspyOptions.minValidationSize,
        earlyStopOnPerfect: dspyOptions.earlyStopOnPerfect,
        earlyStopStreak: dspyOptions.earlyStopStreak,
        auto: (dspyOptions.auto ?? null) as DspyOptimizationPayload["auto"],
        maxMetricCalls: dspyOptions.maxMetricCalls ?? 600,
        seed: dspyOptions.seed,
        initialInstructions: dspyOptions.initialInstructions,
        timeoutMs: dspyOptions.timeoutMs,
        debug: dspyOptions.debug,
      };

      const optimized = await optimizePromptWithDSPy(optimizationPayload);

      const parsed = Boolean(optimized.analysis?.parsed);
      const personaCandidate = optimized.optimizedPrompt?.persona?.trim();
      const requirementCandidate = optimized.optimizedPrompt?.requirements?.trim();
      const fallbackCandidate = optimized.optimizedPrompt?.fallbackOutput?.trim();
      const styleCandidate = optimized.optimizedPrompt?.styleGuide?.trim();

      if (parsed && personaCandidate && requirementCandidate) {
        personaText = personaCandidate;
        requirementsText = requirementCandidate;
        fallbackOutputText = fallbackCandidate || schemaConfig.fallbackOutput;
        styleGuideText = styleCandidate || undefined;

        let baselinePromoted = false;
        if (promoteBaseline && optimized.analysis?.score != null) {
          try {
            baselinePromoted = await promoteBaselinePrompt(requestedSchemaId, {
              persona: personaText,
              requirements: requirementsText,
              fallbackOutput: fallbackOutputText,
              styleGuide: styleGuideText,
              score: optimized.analysis?.score ?? null,
            });
          } catch (promotionError) {
            logError(promotionError);
          }
        }

        promptMeta = {
          requestedMode: promptMode,
          appliedMode: "dspy",
          score: optimized.analysis?.score,
          coverage: optimized.analysis?.coverage,
          parsed: optimized.analysis?.parsed,
          parseError: optimized.analysis?.parseError,
          feedback: optimized.analysis?.feedback,
          satisfied: optimized.analysis?.satisfied,
          missing: optimized.analysis?.missing,
          auto: optimized.analysis?.auto ?? null,
          trainsetSize: optimized.analysis?.trainsetSize,
          requestedModel: optimized.analysis?.requestedModel,
          retrievedFromExperience: optimized.analysis?.retrievedFromExperience,
          rawPrompt: optimized.optimizedPrompt?.raw,
          baselinePromoted,
          message: "DSPy GEPA optimized prompt applied.",
          progress: optimized.progress,
          cacheHit: Boolean(optimized.cache?.hit),
          cacheKey: optimized.cache?.key,
          cacheAgeMs: typeof optimized.cache?.ageMs === "number" ? optimized.cache?.ageMs : undefined,
          cacheSize: typeof optimized.cache?.size === "number" ? optimized.cache?.size : undefined,
          cacheTTLms: typeof optimized.cache?.ttlMs === "number" ? optimized.cache?.ttlMs : undefined,
        };
      } else {
        promptMeta = {
          requestedMode: promptMode,
          appliedMode: "manual",
          score: optimized.analysis?.score,
          coverage: optimized.analysis?.coverage,
          parsed: optimized.analysis?.parsed,
          parseError: optimized.analysis?.parseError,
          feedback: optimized.analysis?.feedback,
          satisfied: optimized.analysis?.satisfied,
          missing: optimized.analysis?.missing,
          auto: optimized.analysis?.auto ?? null,
          trainsetSize: optimized.analysis?.trainsetSize,
          requestedModel: optimized.analysis?.requestedModel,
          retrievedFromExperience: optimized.analysis?.retrievedFromExperience,
          rawPrompt: optimized.optimizedPrompt?.raw,
          baselinePromoted: false,
          message: optimized.analysis?.parsed
            ? "DSPy output lacked required fields – manual prompt restored."
            : optimized.analysis?.parseError
              ? `DSPy prompt parse failed: ${optimized.analysis?.parseError}`
              : "DSPy prompt unavailable – manual instructions used.",
          progress: optimized.progress,
          cacheHit: Boolean(optimized.cache?.hit),
          cacheKey: optimized.cache?.key,
          cacheAgeMs: typeof optimized.cache?.ageMs === "number" ? optimized.cache?.ageMs : undefined,
          cacheSize: typeof optimized.cache?.size === "number" ? optimized.cache?.size : undefined,
          cacheTTLms: typeof optimized.cache?.ttlMs === "number" ? optimized.cache?.ttlMs : undefined,
        };
      }
    } catch (error) {
      logError(error);
      promptMeta = {
        requestedMode: promptMode,
        appliedMode: "manual",
        message: error instanceof Error ? error.message : "DSPy optimization failed",
      };
    }
  }

  // Validate all media URIs and types
  if (!isTrustedUri(video.uri)) {
    logError(`Untrusted video URI rejected: ${video.uri}`);
    throw new AppError("Untrusted video URI", { status: 400 });
  }
  if (!isValidMediaType(video.mimeType)) {
    logError(`Invalid video MIME type: ${video.mimeType}`);
    throw new AppError("Invalid video content type", { status: 400 });
  }
  for (const screenshot of screenshots) {
    if (!isTrustedUri(screenshot.uri)) {
      logError(`Untrusted screenshot URI rejected: ${screenshot.uri}`);
      throw new AppError("Untrusted screenshot URI", { status: 400 });
    }
    if (!isValidMediaType(screenshot.mimeType)) {
      logError(`Invalid screenshot MIME type: ${screenshot.mimeType}`);
      throw new AppError("Invalid screenshot content type", { status: 400 });
    }
  }

  const screenshotList = (() => {
    if (shotsMeta.length > 0) {
      return shotsMeta
        .map((shot) => {
          const parts: string[] = [];
          parts.push(`${shot.id} @ ${shot.timecode ?? "??"}`);
          if (shot.label) parts.push(`label: ${shot.label}`);
          if (shot.note) parts.push(`note: ${shot.note}`);
          if (shot.transcriptSnippet) {
            const snippet = shot.transcriptSnippet.length > 180
              ? `${shot.transcriptSnippet.slice(0, 177)}…`
              : shot.transcriptSnippet;
            parts.push(`transcript: ${snippet}`);
          }
          if (shot.origin) parts.push(`origin: ${shot.origin}`);
          return parts.join(" | ");
        })
        .join("\n");
    }
    return screenshots.map((s) => `${s.id} -> ${s.timecode}`).join("\n");
  })() || "(none)";
  const parts = [
    createPartFromUri(video.uri, video.mimeType),
    "\n\n",
    // persona and instructions
    personaText,
    "\n\nRequirements:\n",
    requirementsText,
    ...(styleGuideText ? ["\n\nStyle Guide:\n", styleGuideText] : []),
    "\n\nProvided screenshots (id → timecode):\n",
    screenshotList,
    "\n\nIf the user provided a " + schemaConfig.hintLabel + " hint, align with it. Title hint: ",
    titleHint || "(none)",
    "\n\nOutput format:\n",
    enforceSchema ? "Return STRICT JSON according to the provided schema." : fallbackOutputText,
    "\n",
    // Add the screenshots as file parts at the end so the model can see them:
    ...screenshots.flatMap((s) => [createPartFromUri(s.uri, s.mimeType)]),
  ];

  const request: {
    model: string;
    contents: ReturnType<typeof createUserContent>;
    config?: { responseMimeType: string; responseSchema: unknown };
  } = {
    model: GEMINI_MODEL,
    contents: createUserContent(parts),
  };

  if (enforceSchema) {
    request.config = {
      responseMimeType: "application/json",
      responseSchema: schemaConfig.schema,
    };
  }

  const resp = (await (ai as unknown as {
    models: { generateContent: (r: typeof request) => Promise<unknown> };
  }).models.generateContent(request)) as {
    text?: string;
    finishReason?: string;
    safetyRatings?: Array<{ category: string; probability: string }>;
    blocked?: boolean;
  };

  if (resp.blocked || !resp.text) {
    const errorDetails: string[] = [];
    if (resp.blocked) errorDetails.push("Response was blocked");
    if (resp.finishReason && resp.finishReason !== "STOP") errorDetails.push(`Finish reason: ${resp.finishReason}`);
    if (resp.safetyRatings) {
      const concerning = resp.safetyRatings.filter((r) => r.probability !== "NEGLIGIBLE");
      if (concerning.length > 0) {
        errorDetails.push(
          `Safety concerns: ${concerning.map((r) => `${r.category}:${r.probability}`).join(", ")}`
        );
      }
    }
    throw new AppError(`Gemini generation failed: ${errorDetails.join("; ") || "Unknown issue"}`, { status: 400 });
  }

  return {
    rawText: resp.text ?? "",
    promptMeta,
    appliedPrompt: {
      persona: personaText,
      requirements: requirementsText,
      fallbackOutput: fallbackOutputText,
      styleGuide: styleGuideText,
    },
  };
}