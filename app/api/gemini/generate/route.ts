// app/api/gemini/generate/route.ts
import { NextResponse } from "next/server";
import { createUserContent, createPartFromUri } from "@google/genai";
import { join } from "path";
import { ai } from "@/lib/gemini";
import { getSchemaConfig, promoteBaselinePrompt } from "@/lib/geminiPrompts";
import { getErrorMessage } from "@/lib/errors";
import { optimizePromptWithDSPy, type DspyOptimizationPayload, type PromptBlueprint, type PromptShotSummary } from "@/lib/dspy";
import { PromptMode, PromptOptimizationMeta, SchemaType } from "@/lib/types";

function isTrustedUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    // Only allow HTTPS (no HTTP, file://, data:, etc.)
    if (url.protocol !== "https:") {
      console.warn(`Rejected URI with non-HTTPS protocol: ${url.protocol}`);
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Block localhost and loopback
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      console.warn(`Rejected localhost URI: ${hostname}`);
      return false;
    }

    // Block private IP ranges (basic check for IPv4 and common IPv6 link-local/ULA)
    if (
      /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname) || // RFC1918 ranges
      /^(169\.254\.)/.test(hostname) || // link-local IPv4
      /^(fc00:|fd00:|fe80:)/.test(hostname) // ULA and link-local IPv6
    ) {
      console.warn(`Rejected private IP range URI: ${hostname}`);
      return false;
    }

    // Block common suspicious patterns in hostname
    if (hostname.includes("..") || hostname.includes("%")) {
      console.warn(`Rejected URI with suspicious hostname patterns: ${hostname}`);
      return false;
    }

    // Check against allowlist
    let allowedHosts = (process.env.ALLOWED_MEDIA_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    // Provide a developer-friendly fallback list in non-production if not configured
    if (allowedHosts.length === 0) {
      const defaultDevHosts = [
        "googleapis.com",
        "googleusercontent.com",
        "storage.googleapis.com",
        "firebasestorage.googleapis.com",
      ];
      if (process.env.NODE_ENV !== "production") {
        allowedHosts = defaultDevHosts;
        console.warn(
          `[DEV] ALLOWED_MEDIA_HOSTS not set. Using development defaults: ${allowedHosts.join(", ")}`
        );
      } else {
        console.warn(
          "No ALLOWED_MEDIA_HOSTS configured - rejecting all URIs. " +
            "Set ALLOWED_MEDIA_HOSTS to a comma-separated list of trusted hostnames " +
            "(e.g., googleapis.com,googleusercontent.com,storage.googleapis.com,firebasestorage.googleapis.com)."
        );
        return false;
      }
    }

    // Exact or subdomain match
    const isAllowed = allowedHosts.some((allowedHost) => {
      if (!allowedHost) return false;
      if (hostname === allowedHost) return true;
      if (hostname.endsWith(`.${allowedHost}`)) return true;
      return false;
    });

    if (!isAllowed) {
      console.warn(
        `URI hostname not in allowlist: ${hostname}. Allowed: ${allowedHosts.join(", ")}`
      );
      return false;
    }

    // Additional path validation
    const path = url.pathname.toLowerCase();
    const suspiciousPatterns = [
      /\.(php|asp|aspx|jsp|cgi|pl|py|rb)$/, // Server-side scripts
      /\.(exe|bat|cmd|com|scr)$/, // Executables
      /\/\.\./, // Path traversal
      /%2e%2e/i, // URL-encoded path traversal
      /[<>"']/ // Potential XSS chars
    ];
    if (suspiciousPatterns.some((pattern) => pattern.test(path))) {
      console.warn(`URI contains suspicious path patterns: ${path}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`URI validation failed: ${error}`);
    return false;
  }
}

function isValidMediaType(mimeType: string): boolean {
  const allowedTypes = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ];
  const normalizedType = (mimeType || "").toLowerCase().split(";")[0].trim();
  return allowedTypes.includes(normalizedType);
}

export const runtime = "nodejs";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-1.5-pro";

// Types the client sends
type VideoRef = { uri: string; mimeType: string };
type ImgRef = { id: string; uri: string; mimeType: string; timecode: string };
type DspyOptions = Partial<
  Pick<
    DspyOptimizationPayload,
    | "auto"
    | "maxMetricCalls"
    | "model"
    | "reflectionModel"
    | "temperature"
    | "reflectionTemperature"
    | "maxTokens"
    | "reflectionMaxTokens"
    | "seed"
    | "initialInstructions"
    | "timeoutMs"
    | "debug"
    | "checkpointPath"
    | "experiencePath"
    | "experienceTopK"
    | "experienceMinScore"
    | "persistExperience"
    | "rpmLimit"
    | "jsonBonus"
    | "featureWeights"
    | "experiencePruneThreshold"
    | "experienceMaxAge"
    | "alwaysFullValidation"
    | "progressiveSchedule"
    | "parallelEval"
    | "parallelWorkers"
    | "parallelBatchSize"
    | "evalTimeoutMs"
    | "minValidationSize"
    | "earlyStopOnPerfect"
    | "earlyStopStreak"
  >
>;

type RequestBody = {
  video: VideoRef;
  screenshots: ImgRef[];
  enforceSchema: boolean;
  titleHint?: string;
  schemaType?: SchemaType;
  promptMode?: PromptMode;
  shots?: PromptShotSummary[];
  dspyOptions?: DspyOptions;
  promoteBaseline?: boolean;
};

const FALLBACK_ERROR = "Generation failed";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    const video = body.video;
    const screenshots = body.screenshots;
    const enforceSchema = body.enforceSchema;
    const titleHint = body.titleHint;
    const schemaType = body.schemaType;
    const promptMode: PromptMode = body.promptMode === "dspy" ? "dspy" : "manual";
    const shotsMeta: PromptShotSummary[] = (body.shots ?? []).map((shot) => ({ ...shot }));
    const dspyOptions: DspyOptions = body.dspyOptions ?? {};
    const promoteBaseline = Boolean(body.promoteBaseline);

    const mode: SchemaType = schemaType === "meetingSummary" ? "meetingSummary" : "tutorial";

    const toBlueprint = (config: {
      persona: string;
      requirements: string;
      fallbackOutput: string;
      styleGuide?: string;
      hintLabel: string;
    }): PromptBlueprint => ({
      persona: config.persona,
      requirements: config.requirements,
      fallbackOutput: config.fallbackOutput,
      styleGuide: config.styleGuide,
      hintLabel: config.hintLabel,
    });

    const tutorialConfig = await getSchemaConfig("tutorial");
    const meetingConfig = await getSchemaConfig("meetingSummary");
    const schemaConfig = mode === "tutorial" ? tutorialConfig : meetingConfig;

    let personaText = schemaConfig.persona;
    let requirementsText = schemaConfig.requirements;
    let fallbackOutputText = schemaConfig.fallbackOutput;
    let styleGuideText: string | undefined;

    let promptMeta: PromptOptimizationMeta = {
      requestedMode: promptMode,
      appliedMode: "manual",
      message: promptMode === "dspy" ? "DSPy prompt unavailable – manual instructions used." : "Manual Gemini prompt used.",
      baselinePromoted: false,
    };

    if (promptMode === "dspy") {
      try {
        const checkpointPath =
          dspyOptions.checkpointPath ??
          process.env.DSPY_CHECKPOINT_PATH ??
          join(process.cwd(), "python", "checkpoints", `${mode}-optimizer.json`);

        const experiencePath =
          dspyOptions.experiencePath ??
          process.env.DSPY_EXPERIENCE_PATH ??
          join(process.cwd(), "python", "experience", `${mode}-episodes.jsonl`);

        const envTopK = Number.parseInt(process.env.DSPY_EXPERIENCE_TOPK ?? "", 10);
        const rawTopK =
          typeof dspyOptions.experienceTopK === "number"
            ? dspyOptions.experienceTopK
            : Number.isFinite(envTopK) ? envTopK : 8;
        const experienceTopK = Math.max(0, Math.floor(rawTopK));

        const envMinScore = Number.parseFloat(process.env.DSPY_EXPERIENCE_MIN_SCORE ?? "");
        const rawMinScore =
          typeof dspyOptions.experienceMinScore === "number"
            ? dspyOptions.experienceMinScore
            : Number.isFinite(envMinScore) ? envMinScore : 0.75;
        const experienceMinScore = Math.max(0, Math.min(1, rawMinScore));

        const persistExperience =
          typeof dspyOptions.persistExperience === "boolean"
            ? dspyOptions.persistExperience
            : (process.env.DSPY_EXPERIENCE_PERSIST ?? "true").toLowerCase() !== "false";

        const optimizationModel =
          dspyOptions.model ?? process.env.DSPY_MODEL ?? `gemini/${GEMINI_MODEL}`;
        const reflectionModel =
          dspyOptions.reflectionModel ?? process.env.DSPY_REFLECTION_MODEL ?? optimizationModel;
        const rpmLimit =
          typeof dspyOptions.rpmLimit === "number"
            ? dspyOptions.rpmLimit
            : Number.parseInt(process.env.DSPY_RPM_LIMIT ?? "", 10) || 8;

        const optimizationPayload: DspyOptimizationPayload = {
          schemaType: mode,
          enforceSchema,
          titleHint,
          shots: shotsMeta,
          basePrompt: toBlueprint(schemaConfig),
          referencePrompts: {
            tutorial: toBlueprint(tutorialConfig),
            meetingSummary: toBlueprint(meetingConfig),
          },
          checkpointPath,
          experiencePath,
          experienceTopK,
          experienceMinScore,
          persistExperience,
          model: optimizationModel,
          reflectionModel,
          rpmLimit,
          temperature: dspyOptions.temperature,
          reflectionTemperature: dspyOptions.reflectionTemperature,
          maxTokens: dspyOptions.maxTokens,
          reflectionMaxTokens: dspyOptions.reflectionMaxTokens,
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
              baselinePromoted = await promoteBaselinePrompt(mode, {
                persona: personaText,
                requirements: requirementsText,
                fallbackOutput: fallbackOutputText,
                styleGuide: styleGuideText,
                score: optimized.analysis?.score ?? null,
              });
            } catch (promotionError) {
              console.error("Prompt baseline promotion failed:", promotionError);
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
        console.error("DSPy optimization failed:", error);
        promptMeta = {
          requestedMode: promptMode,
          appliedMode: "manual",
          message: error instanceof Error ? error.message : "DSPy optimization failed",
        };
      }
    }

    // Build multimodal contents: video + screenshots + instruction
    // Enhanced multimodal contents validation: video + screenshots + instruction
    // Validate all media URIs to prevent SSRF and content-type validation
    if (!isTrustedUri(video.uri)) {
      console.error(`Untrusted video URI rejected: ${video.uri}`);
      return NextResponse.json({ error: "Untrusted video URI" }, { status: 400 });
    }
    if (!isValidMediaType(video.mimeType)) {
      console.error(`Invalid video MIME type: ${video.mimeType}`);
      return NextResponse.json({ error: "Invalid video content type" }, { status: 400 });
    }
    for (const screenshot of screenshots) {
      if (!isTrustedUri(screenshot.uri)) {
        console.error(`Untrusted screenshot URI rejected: ${screenshot.uri}`);
        return NextResponse.json({ error: "Untrusted screenshot URI" }, { status: 400 });
      }
      if (!isValidMediaType(screenshot.mimeType)) {
        console.error(`Invalid screenshot MIME type: ${screenshot.mimeType}`);
        return NextResponse.json({ error: "Invalid screenshot content type" }, { status: 400 });
      }
    }

    const screenshotList = screenshots.map((s) => `${s.id} -> ${s.timecode}`).join("\n") || "(none)";
    const parts = [
      createPartFromUri(video.uri, video.mimeType),
      "\n\n",
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
      // Force structured output
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

    // Check for blocked or problematic responses
    if (resp.blocked || !resp.text) {
      const errorDetails: string[] = [];
      if (resp.blocked) errorDetails.push("Response was blocked");
      if (resp.finishReason && resp.finishReason !== "STOP")
        errorDetails.push(`Finish reason: ${resp.finishReason}`);
      if (resp.safetyRatings) {
        const concerning = resp.safetyRatings.filter((r) => r.probability !== "NEGLIGIBLE");
        if (concerning.length > 0) {
          errorDetails.push(
            `Safety concerns: ${concerning.map((r) => `${r.category}:${r.probability}`).join(", ")}`
          );
        }
      }

      return NextResponse.json(
        {
          error: `Gemini generation failed: ${errorDetails.join("; ") || "Unknown issue"}`,
          metadata: {
            finishReason: resp.finishReason,
            safetyRatings: resp.safetyRatings,
            blocked: resp.blocked,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      rawText: resp.text ?? "",
      promptMeta,
      appliedPrompt: {
        persona: personaText,
        requirements: requirementsText,
        fallbackOutput: fallbackOutputText,
        styleGuide: styleGuideText,
      },
    });
  } catch (err: unknown) {
    console.error("Generation error:", err);
    return NextResponse.json({ error: getErrorMessage(err, FALLBACK_ERROR) }, { status: 500 });
  }
}
