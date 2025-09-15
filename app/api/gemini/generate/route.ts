// app/api/gemini/generate/route.ts
import { NextResponse } from "next/server";
import { createUserContent, createPartFromUri } from "@google/genai";
import { ai } from "@/lib/gemini";
import { getSchemaConfig } from "@/lib/geminiPrompts";
import { getErrorMessage } from "@/lib/errors";
import { optimizePromptWithDSPy, type DspyOptimizationPayload, type PromptBlueprint, type PromptShotSummary } from "@/lib/dspy";
import { PromptMode, PromptOptimizationMeta, SchemaType } from "@/lib/types";

export const runtime = "nodejs";

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

    const mode: SchemaType = schemaType === "meetingSummary" ? "meetingSummary" : "tutorial";
    const tutorialConfig = getSchemaConfig("tutorial");
    const meetingConfig = getSchemaConfig("meetingSummary");
    const schemaConfig = mode === "tutorial" ? tutorialConfig : meetingConfig;

    const toBlueprint = (config: ReturnType<typeof getSchemaConfig>): PromptBlueprint => ({
      persona: config.persona,
      requirements: config.requirements,
      fallbackOutput: config.fallbackOutput,
      hintLabel: config.hintLabel,
    });

    let personaText = schemaConfig.persona;
    let requirementsText = schemaConfig.requirements;
    let fallbackOutputText = schemaConfig.fallbackOutput;
    let styleGuideText: string | undefined;

    let promptMeta: PromptOptimizationMeta = {
      requestedMode: promptMode,
      appliedMode: "manual",
      message: promptMode === "dspy" ? "DSPy prompt unavailable – manual instructions used." : "Manual Gemini prompt used.",
    };

    if (promptMode === "dspy") {
      try {
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
          model: dspyOptions.model,
          reflectionModel: dspyOptions.reflectionModel,
          temperature: dspyOptions.temperature,
          reflectionTemperature: dspyOptions.reflectionTemperature,
          maxTokens: dspyOptions.maxTokens,
          reflectionMaxTokens: dspyOptions.reflectionMaxTokens,
          auto: (dspyOptions.auto ?? null) as DspyOptimizationPayload["auto"],
          maxMetricCalls: dspyOptions.maxMetricCalls ?? null,
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
            rawPrompt: optimized.optimizedPrompt?.raw,
            message: "DSPy GEPA optimized prompt applied.",
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
            rawPrompt: optimized.optimizedPrompt?.raw,
            message: optimized.analysis?.parsed
              ? "DSPy output lacked required fields – manual prompt restored."
              : optimized.analysis?.parseError
                ? `DSPy prompt parse failed: ${optimized.analysis?.parseError}`
                : "DSPy prompt unavailable – manual instructions used.",
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
      model: "gemini-2.5-pro",
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
    }).models.generateContent(request)) as { text?: string };

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
