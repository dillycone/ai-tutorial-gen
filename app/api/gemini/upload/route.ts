// app/api/gemini/upload/route.ts
import { NextResponse } from "next/server";
import { uploadFileToGemini } from "@/lib/geminiUploads";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

const FALLBACK_ERROR = "Upload failed";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as unknown as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing video file" }, { status: 400 });
    }

    const uploaded = await uploadFileToGemini(file, {
      mimeType: file.type || "video/mp4",
      displayName: file.name || "uploaded_video",
    });

    return NextResponse.json(uploaded);
  } catch (err: unknown) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: getErrorMessage(err, FALLBACK_ERROR) }, { status: 500 });
  }
}
