// app/api/gemini/upload-images/route.ts
import { NextResponse } from "next/server";
import { dataUrlToFile, uploadFileToGemini } from "@/lib/geminiUploads";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

type ShotIn = { id: string; dataUrl: string; timecode: string };

const FALLBACK_ERROR = "Upload failed";

export async function POST(req: Request) {
  try {
    const { screenshots } = (await req.json()) as { screenshots: ShotIn[] };
    if (!Array.isArray(screenshots) || screenshots.length === 0) {
      return NextResponse.json({ error: "No screenshots provided" }, { status: 400 });
    }

    const uploads: Array<{ id: string; timecode: string; name: string; uri: string; mimeType: string }> = [];

    for (const shot of screenshots) {
      let file: File;
      try {
        file = dataUrlToFile({
          id: shot.id,
          dataUrl: shot.dataUrl,
          defaultMimeType: "image/png",
          fileName: `${shot.id}.png`,
        });
      } catch (conversionError) {
        const message = conversionError instanceof Error ? conversionError.message : `Invalid data for ${shot.id}`;
        return NextResponse.json({ error: message }, { status: 400 });
      }

      const uploaded = await uploadFileToGemini(file, {
        mimeType: file.type || "image/png",
        displayName: file.name,
      });

      uploads.push({
        id: shot.id,
        timecode: shot.timecode,
        ...uploaded,
      });
    }

    return NextResponse.json({ files: uploads });
  } catch (err: unknown) {
    console.error("Screenshot upload error:", err);
    return NextResponse.json({ error: getErrorMessage(err, FALLBACK_ERROR) }, { status: 500 });
  }
}
