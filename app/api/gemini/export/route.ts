// app/api/gemini/export/route.ts
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFImage } from "pdf-lib";
import { SchemaType } from "@/lib/types";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

const FALLBACK_ERROR = "Export failed";

const PAGE_WIDTH = 612; // 8.5in * 72dpi
const PAGE_HEIGHT = 792; // 11in * 72dpi
const PAGE_MARGIN = 48;

const TITLE_SIZE = 24;
const SUBTITLE_SIZE = 18;
const HEADING_SIZE = 16;
const BODY_SIZE = 12;
const SMALL_SIZE = 11;

const LINE_GAP = 4;

type ShotForExport = {
  id: string;
  label?: string;
  note?: string;
  timecode: string;
  dataUrl: string;
};

type ExportRequest = {
  schemaType: SchemaType;
  enforceSchema: boolean;
  resultText: string;
  shots: ShotForExport[];
};

type TutorialSchema = {
  title?: string;
  summary?: string;
  prerequisites?: string[];
  steps?: Array<{
    index?: number;
    title?: string;
    description?: string;
    startTimecode?: string;
    endTimecode?: string;
    screenshotIds?: string[];
  }>;
};

type MeetingSummarySchema = {
  meetingTitle?: string;
  meetingDate?: string;
  durationMinutes?: number;
  attendees?: Array<{ name?: string; role?: string; department?: string }>;
  summary?: string;
  keyTopics?: Array<{
    order?: number;
    title?: string;
    details?: string;
    startTimecode?: string;
    endTimecode?: string;
    speaker?: string;
  }>;
  decisions?: Array<{ description?: string; owners?: string[]; status?: string; timecode?: string }>;
  actionItems?: Array<{ task?: string; owner?: string; dueDate?: string; timecode?: string }>;
  followUps?: string[];
};

type EmbeddedShot = {
  shot: ShotForExport;
  image: PDFImage;
  width: number;
  height: number;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ExportRequest>;
    if (!body || typeof body.resultText !== "string" || !body.schemaType) {
      return NextResponse.json({ error: "Invalid export payload" }, { status: 400 });
    }

    const schemaType = body.schemaType;
    const enforceSchema = Boolean(body.enforceSchema);
    const shots = Array.isArray(body.shots) ? body.shots : [];
    const resultText = body.resultText;

    let parsed: TutorialSchema | MeetingSummarySchema | null = null;
    try {
      parsed = JSON.parse(resultText) as TutorialSchema | MeetingSummarySchema;
    } catch {
      parsed = null;
    }

    const pdfBuffer = await buildPdf({ schemaType, parsed, resultText, shots, enforceSchema });

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${schemaType === "tutorial" ? "tutorial-guide" : "meeting-summary"}.pdf`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err: unknown) {
    console.error("Export error:", err);
    return NextResponse.json({ error: getErrorMessage(err, FALLBACK_ERROR) }, { status: 500 });
  }
}

type BuildPdfArgs = {
  schemaType: SchemaType;
  parsed: TutorialSchema | MeetingSummarySchema | null;
  resultText: string;
  shots: ShotForExport[];
  enforceSchema: boolean;
};

type PdfContext = {
  doc: PDFDocument;
  bold: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>;
  regular: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>;
  embeddedShots: Map<string, EmbeddedShot>;
};

type PageState = {
  page: ReturnType<PDFDocument["addPage"]>;
  y: number;
};

async function buildPdf({ schemaType, parsed, resultText, shots, enforceSchema }: BuildPdfArgs) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const embeddedShots = await embedShots(doc, shots);
  const ctx: PdfContext = { doc, bold, regular, embeddedShots };

  let state = addPage(ctx);

  if (schemaType === "tutorial" && parsed && isTutorial(parsed)) {
    state = renderTutorial(ctx, state, parsed);
  } else if (schemaType === "meetingSummary" && parsed && isMeetingSummary(parsed)) {
    state = renderMeetingSummary(ctx, state, parsed);
  } else {
    state = renderFallback(ctx, state, resultText, schemaType, enforceSchema);
  }

  if (ctx.embeddedShots.size > 0) {
    renderShotsAppendix(ctx, state);
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

function renderTutorial(ctx: PdfContext, state: PageState, tutorial: TutorialSchema) {
  state = drawTitle(ctx, state, tutorial.title || "Tutorial Guide");
  if (tutorial.summary) {
    state = drawParagraph(ctx, state, tutorial.summary, BODY_SIZE);
  }

  if (Array.isArray(tutorial.prerequisites) && tutorial.prerequisites.length) {
    state = drawHeading(ctx, state, "Prerequisites", HEADING_SIZE);
    tutorial.prerequisites.forEach((item, idx) => {
      state = drawParagraph(ctx, state, `${idx + 1}. ${item}`, BODY_SIZE);
    });
  }

  if (Array.isArray(tutorial.steps)) {
    tutorial.steps.forEach((step, index) => {
      state = ensureSpace(ctx, state, SUBTITLE_SIZE * 2);
      state = drawHeading(ctx, state, `Step ${step.index ?? index + 1}: ${step.title ?? "Untitled Step"}`, SUBTITLE_SIZE);
      if (step.description) {
        state = drawParagraph(ctx, state, step.description, BODY_SIZE);
      }

      if (step.startTimecode || step.endTimecode) {
        const timing: string[] = [];
        if (step.startTimecode) timing.push(`Start: ${step.startTimecode}`);
        if (step.endTimecode) timing.push(`End: ${step.endTimecode}`);
        state = drawParagraph(ctx, state, timing.join(" · "), SMALL_SIZE);
      }

      if (Array.isArray(step.screenshotIds) && step.screenshotIds.length > 0) {
        step.screenshotIds.forEach((shotId) => {
          state = drawShot(ctx, state, shotId);
        });
      }
    });
  }

  return state;
}

function renderMeetingSummary(ctx: PdfContext, state: PageState, summary: MeetingSummarySchema) {
  state = drawTitle(ctx, state, summary.meetingTitle || "Meeting Summary");
  const meta: string[] = [];
  if (summary.meetingDate) meta.push(`Date: ${summary.meetingDate}`);
  if (typeof summary.durationMinutes === "number") meta.push(`Duration: ${summary.durationMinutes} minutes`);
  if (meta.length) {
    state = drawParagraph(ctx, state, meta.join(" · "), SMALL_SIZE);
  }
  if (summary.summary) {
    state = drawParagraph(ctx, state, summary.summary, BODY_SIZE);
  }

  if (Array.isArray(summary.attendees) && summary.attendees.length) {
    state = drawHeading(ctx, state, "Attendees", HEADING_SIZE);
    summary.attendees.forEach((attendee) => {
      const line = [attendee.name, attendee.role, attendee.department].filter(Boolean).join(" · ");
      state = drawParagraph(ctx, state, line, BODY_SIZE);
    });
  }

  if (Array.isArray(summary.keyTopics) && summary.keyTopics.length) {
    state = drawHeading(ctx, state, "Key Topics", HEADING_SIZE);
    summary.keyTopics
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((topic, idx) => {
        state = drawHeading(ctx, state, `${idx + 1}. ${topic.title ?? "Topic"}`, SUBTITLE_SIZE);
        const metaLine = [topic.speaker, topic.startTimecode, topic.endTimecode].filter(Boolean).join(" · ");
        if (metaLine) {
          state = drawParagraph(ctx, state, metaLine, SMALL_SIZE);
        }
        if (topic.details) {
          state = drawParagraph(ctx, state, topic.details, BODY_SIZE);
        }
      });
  }

  state = renderListSection(ctx, state, "Decisions", summary.decisions, (decision) => {
    const lines = [decision.description];
    if (decision.status) lines.push(`Status: ${decision.status}`);
    if (Array.isArray(decision.owners) && decision.owners.length) lines.push(`Owners: ${decision.owners.join(", ")}`);
    if (decision.timecode) lines.push(`Timecode: ${decision.timecode}`);
    return lines.filter(Boolean).join("\n");
  });

  state = renderListSection(ctx, state, "Action Items", summary.actionItems, (item) => {
    const lines = [`Task: ${item.task}`, `Owner: ${item.owner}`];
    if (item.dueDate) lines.push(`Due: ${item.dueDate}`);
    if (item.timecode) lines.push(`Timecode: ${item.timecode}`);
    return lines.filter(Boolean).join("\n");
  });

  if (Array.isArray(summary.followUps) && summary.followUps.length) {
    state = drawHeading(ctx, state, "Follow Ups", HEADING_SIZE);
    summary.followUps.forEach((item, idx) => {
      state = drawParagraph(ctx, state, `${idx + 1}. ${item}`, BODY_SIZE);
    });
  }

  return state;
}

function renderListSection<T>(
  ctx: PdfContext,
  state: PageState,
  title: string,
  items: T[] | undefined,
  formatter: (item: T) => string,
) {
  if (!Array.isArray(items) || items.length === 0) return state;

  state = drawHeading(ctx, state, title, HEADING_SIZE);
  items.forEach((item, idx) => {
    const content = formatter(item);
    state = drawParagraph(ctx, state, `${idx + 1}. ${content}`, BODY_SIZE);
  });
  return state;
}

function renderFallback(
  ctx: PdfContext,
  state: PageState,
  resultText: string,
  schemaType: SchemaType,
  enforceSchema: boolean,
) {
  state = drawTitle(ctx, state, schemaType === "tutorial" ? "Tutorial" : "Meeting Summary");
  if (enforceSchema) {
    state = drawParagraph(ctx, state, "Structured output could not be parsed. Showing raw response:", BODY_SIZE);
  }
  state = drawParagraph(ctx, state, resultText, BODY_SIZE);
  return state;
}

function renderShotsAppendix(ctx: PdfContext, state: PageState) {
  state = addPage(ctx);
  state = drawTitle(ctx, state, "Screenshot Appendix");
  for (const shotId of ctx.embeddedShots.keys()) {
    state = drawShot(ctx, state, shotId);
  }
  return state;
}

function drawShot(ctx: PdfContext, state: PageState, shotId: string) {
  const entry = ctx.embeddedShots.get(shotId);
  if (!entry) return state;

  const label = `${entry.shot.label || entry.shot.id} (${entry.shot.timecode})`;
  state = drawParagraph(ctx, state, label, BODY_SIZE, { bold: true });
  const maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const scale = Math.min(1, maxWidth / entry.width, 280 / entry.height);
  const width = entry.width * scale;
  const height = entry.height * scale;

  state = ensureSpaceForImage(ctx, state, height);

  state.page.drawImage(entry.image, {
    x: PAGE_MARGIN + (maxWidth - width) / 2,
    y: state.y - height,
    width,
    height,
  });
  state.y = state.y - height - LINE_GAP;

  if (entry.shot.note) {
    state = drawParagraph(ctx, state, entry.shot.note, SMALL_SIZE);
  }

  state.y -= LINE_GAP;
  return state;
}

function addPage(ctx: PdfContext): PageState {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { page, y: PAGE_HEIGHT - PAGE_MARGIN };
}

function ensureSpace(ctx: PdfContext, state: PageState, requiredHeight: number) {
  if (state.y - requiredHeight <= PAGE_MARGIN) {
    return addPage(ctx);
  }
  return state;
}

function ensureSpaceForImage(ctx: PdfContext, state: PageState, imageHeight: number) {
  if (state.y - imageHeight <= PAGE_MARGIN) {
    state = addPage(ctx);
  }
  return state;
}

function drawTitle(ctx: PdfContext, state: PageState, text: string) {
  state = ensureSpace(ctx, state, TITLE_SIZE + LINE_GAP * 2);
  state.page.drawText(text, {
    x: PAGE_MARGIN,
    y: state.y,
    font: ctx.bold,
    size: TITLE_SIZE,
    color: rgb(0, 0, 0),
  });
  state.y -= TITLE_SIZE + LINE_GAP * 2;
  return state;
}

function drawHeading(ctx: PdfContext, state: PageState, text: string, size: number) {
  state = ensureSpace(ctx, state, size + LINE_GAP);
  state.page.drawText(text, {
    x: PAGE_MARGIN,
    y: state.y,
    font: ctx.bold,
    size,
    color: rgb(0, 0, 0),
  });
  state.y -= size + LINE_GAP;
  return state;
}

function drawParagraph(
  ctx: PdfContext,
  state: PageState,
  text: string,
  size: number,
  options: { bold?: boolean } = {},
) {
  const font = options.bold ? ctx.bold : ctx.regular;
  const maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const paragraphs = text.split(/\n+/).filter(Boolean);

  paragraphs.forEach((paragraph, pIndex) => {
    const lines = wrapText(paragraph, font, size, maxWidth);
    lines.forEach((line) => {
      state = ensureSpace(ctx, state, size + LINE_GAP);
      state.page.drawText(line, {
        x: PAGE_MARGIN,
        y: state.y,
        font,
        size,
        color: rgb(0, 0, 0),
      });
      state.y -= size + LINE_GAP;
    });
    if (pIndex !== paragraphs.length - 1) {
      state.y -= LINE_GAP;
    }
  });

  return state;
}

function wrapText(text: string, font: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>, size: number, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const attempt = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(attempt, size);
    if (width <= maxWidth) {
      current = attempt;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function isTutorial(value: TutorialSchema | MeetingSummarySchema): value is TutorialSchema {
  return Array.isArray((value as TutorialSchema).steps);
}

function isMeetingSummary(value: TutorialSchema | MeetingSummarySchema): value is MeetingSummarySchema {
  const typed = value as MeetingSummarySchema;
  return Array.isArray(typed.keyTopics) || Array.isArray(typed.attendees);
}

async function embedShots(doc: PDFDocument, shots: ShotForExport[]) {
  const map = new Map<string, EmbeddedShot>();
  for (const shot of shots) {
    const decoded = decodeDataUrl(shot.dataUrl);
    if (!decoded) continue;

    try {
      const image = decoded.mime.includes("jpeg")
        ? await doc.embedJpg(decoded.bytes)
        : await doc.embedPng(decoded.bytes);
      map.set(shot.id, {
        shot,
        image,
        width: image.width,
        height: image.height,
      });
    } catch {
      // Skip un-embeddable images
    }
  }
  return map;
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!match) return null;
  const [, mime, base64] = match;
  try {
    const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
    return { bytes, mime };
  } catch {
    return null;
  }
}
