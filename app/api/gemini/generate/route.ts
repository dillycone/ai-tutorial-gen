// app/api/gemini/generate/route.ts
import { NextResponse } from "next/server";
import { createUserContent, createPartFromUri } from "@google/genai";
import { ai } from "@/lib/gemini";
import { getSchemaConfig } from "@/lib/geminiPrompts";
import { SchemaType } from "@/lib/types";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

// Types the client sends
type VideoRef = { uri: string; mimeType: string };
type ImgRef = { id: string; uri: string; mimeType: string; timecode: string };

const FALLBACK_ERROR = "Generation failed";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      video: VideoRef;
      screenshots: ImgRef[];
      enforceSchema: boolean;
      titleHint?: string;
      schemaType?: SchemaType;
    };

    const { video, screenshots, enforceSchema, titleHint, schemaType } = body;

    const mode: SchemaType = schemaType === "meetingSummary" ? "meetingSummary" : "tutorial";
    const schemaConfig = getSchemaConfig(mode);

    // Build multimodal contents: video + screenshots + instruction
    const parts = [
      createPartFromUri(video.uri, video.mimeType),
      "\n\n",
      schemaConfig.persona,
      "\n\nRequirements:\n",
      schemaConfig.requirements,
      "\n\nProvided screenshots (id → timecode):\n",
      screenshots.map((s) => `${s.id} -> ${s.timecode}`).join("\n"),
      "\n\nIf the user provided a " + schemaConfig.hintLabel + " hint, align with it. Title hint: ",
      titleHint || "(none)",
      "\n\nOutput format:\n",
      enforceSchema ? "Return STRICT JSON according to the provided schema." : schemaConfig.fallbackOutput,
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
    });
  } catch (err: unknown) {
    console.error("Generation error:", err);
    return NextResponse.json({ error: getErrorMessage(err, FALLBACK_ERROR) }, { status: 500 });
  }
}
