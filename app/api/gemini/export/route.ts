// app/api/gemini/export/route.ts
import { NextResponse } from "next/server";
import { getErrorMessage, logError } from "@/lib/errors";
import { buildPdfBuffer } from "@/lib/services/exportService";
import { parseExportRequest } from "@/lib/validators/requestValidators";
import { SchemaType } from "@/lib/types";

export const runtime = "nodejs";

const FALLBACK_ERROR = "Export failed";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { schemaType, enforceSchema, resultText, shots } = parseExportRequest(body);

    const pdfBuffer = await buildPdfBuffer({ schemaType, enforceSchema, resultText, shots });

    const filename = schemaType === "tutorial" ? "tutorial-guide" : "meeting-summary";
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${filename}.pdf`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err: unknown) {
    logError(err);
    return NextResponse.json({ error: getErrorMessage(err, FALLBACK_ERROR) }, { status: 500 });
  }
}
