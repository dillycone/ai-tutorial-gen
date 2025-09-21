// app/api/schemas/route.ts
import { NextResponse } from "next/server";
import { getErrorMessage, logError } from "@/lib/errors";
import {
  createSchemaTemplate,
  listSchemaTemplates,
  parseSchemaTemplatePayload,
  schemaTemplateExists,
} from "@/lib/schemaTemplates";

export const runtime = "nodejs";

const LIST_ERROR = "Failed to load schema templates";
const CREATE_ERROR = "Unable to create schema template";

export async function GET() {
  try {
    const templates = await listSchemaTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    logError(error);
    return NextResponse.json({ error: getErrorMessage(error, LIST_ERROR) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = parseSchemaTemplatePayload(body);

    if (await schemaTemplateExists(input.id)) {
      return NextResponse.json(
        { error: `A schema template with id "${input.id}" already exists.` },
        { status: 409 },
      );
    }

    const template = await createSchemaTemplate(input);
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    logError(error);
    const message = error instanceof Error ? error.message : "";
    const isClientError =
      error instanceof SyntaxError ||
      (typeof message === "string" && /schema|template|required|invalid/i.test(message));
    const status = isClientError ? 400 : 500;
    return NextResponse.json({ error: getErrorMessage(error, CREATE_ERROR) }, { status });
  }
}
