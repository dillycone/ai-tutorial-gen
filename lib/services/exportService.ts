import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFImage } from "pdf-lib";
import { SchemaType } from "@/lib/types";

// Page and style constants
const PAGE_WIDTH = 612; // 8.5in * 72dpi
const PAGE_HEIGHT = 792; // 11in * 72dpi
const PAGE_MARGIN = 64;

// Spacing scale (in points)
const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

// Color palette for text and lines
const COLORS = {
  text: rgb(0, 0, 0),
  muted: rgb(0.35, 0.35, 0.35),
  divider: rgb(0.86, 0.86, 0.86),
  figureBorder: rgb(0.8, 0.8, 0.8),
};

const TITLE_SIZE = 24;
const SUBTITLE_SIZE = 18;
const HEADING_SIZE = 16;
const BODY_SIZE = 12;
const SMALL_SIZE = 11;

const LINE_GAP = 4;
const FOOTER_SIZE = 10;
const MIN_LINES_AFTER_HEADING = 2;

const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const BASE_LEADING = 1.35;

function lineHeightFor(size: number) {
  return Math.round(size * BASE_LEADING);
}

export type ShotForExport = {
  id: string;
  label?: string;
  note?: string;
  timecode: string;
  dataUrl: string;
};

export type ExportBuildArgs = {
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

type PdfContext = {
  doc: PDFDocument;
  bold: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>;
  regular: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>;
  italic: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>;
  embeddedShots: Map<string, EmbeddedShot>;
  figureNumbers: Map<string, number>;
};

type PageState = {
  page: ReturnType<PDFDocument["addPage"]>;
  y: number;
};

export async function buildPdfBuffer(args: ExportBuildArgs): Promise<Buffer> {
  const { schemaType, enforceSchema, resultText, shots } = args;

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const { embeddedShots, figureNumbers } = await embedShots(doc, shots);
  const ctx: PdfContext = { doc, bold, regular, italic, embeddedShots, figureNumbers };

  let state = addPage(ctx);

  // Decide a running title for footers
  let runningTitle = schemaType === "tutorial" ? "Tutorial Guide" : "Meeting Summary";

  let parsed: TutorialSchema | MeetingSummarySchema | null = null;
  try {
    parsed = JSON.parse(resultText) as TutorialSchema | MeetingSummarySchema;
  } catch {
    parsed = null;
  }

  if (schemaType === "tutorial" && parsed && isTutorial(parsed)) {
    runningTitle = (parsed.title && parsed.title.trim()) || runningTitle;
    state = renderTutorial(ctx, state, parsed);
  } else if (schemaType === "meetingSummary" && parsed && isMeetingSummary(parsed)) {
    runningTitle = (parsed.meetingTitle && parsed.meetingTitle.trim()) || runningTitle;
    state = renderMeetingSummary(ctx, state, parsed);
  } else {
    state = renderFallback(ctx, state, resultText, schemaType, enforceSchema);
  }

  if (ctx.embeddedShots.size > 0) {
    renderShotsAppendix(ctx, state);
  }

  // Add footers with page numbers and running title
  addFooters(ctx, runningTitle);

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
    state = drawBulletedList(ctx, state, tutorial.prerequisites);
  }

  if (Array.isArray(tutorial.steps)) {
    tutorial.steps.forEach((step, index) => {
      state = drawHeading(
        ctx,
        state,
        `Step ${step.index ?? index + 1}: ${step.title ?? "Untitled Step"}`,
        SUBTITLE_SIZE,
        { keepNextLines: 3, marginTop: SP.xl, marginBottom: SP.sm },
      );
      if (step.description) {
        state = drawParagraph(ctx, state, step.description, BODY_SIZE);
      }

      if (step.startTimecode || step.endTimecode) {
        const timing: string[] = [];
        if (step.startTimecode) timing.push(`Start: ${step.startTimecode}`);
        if (step.endTimecode) timing.push(`End: ${step.endTimecode}`);
        state = drawMeta(ctx, state, timing.join(" · "));
      }

      if (Array.isArray(step.screenshotIds) && step.screenshotIds.length > 0) {
        step.screenshotIds.forEach((shotId) => {
          state = drawFigure(ctx, state, shotId);
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
    state = drawMeta(ctx, state, meta.join(" · "));
  }

  if (summary.summary) {
    state = drawParagraph(ctx, state, summary.summary, BODY_SIZE);
  }

  if (Array.isArray(summary.attendees) && summary.attendees.length) {
    state = drawHeading(ctx, state, "Attendees", HEADING_SIZE, { marginTop: SP.lg });
    const attendeeLines = summary.attendees.map((attendee) =>
      [attendee.name, attendee.role, attendee.department].filter(Boolean).join(" · ")
    );
    state = drawBulletedList(ctx, state, attendeeLines);
  }

  if (Array.isArray(summary.keyTopics) && summary.keyTopics.length) {
    state = drawHeading(ctx, state, "Key Topics", HEADING_SIZE, { marginTop: SP.lg });
    summary.keyTopics
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((topic, idx) => {
        state = drawHeading(
          ctx,
          state,
          `${idx + 1}. ${topic.title ?? "Topic"}`,
          SUBTITLE_SIZE,
          { keepNextLines: 2 },
        );
        const metaLine = [topic.speaker, topic.startTimecode, topic.endTimecode].filter(Boolean).join(" · ");
        if (metaLine) {
          state = drawMeta(ctx, state, metaLine);
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
    state = drawHeading(ctx, state, "Follow Ups", HEADING_SIZE, { marginTop: SP.lg });
    state = drawBulletedList(ctx, state, summary.followUps);
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

  // Render figures in ascending figure number order
  const orderedIds = Array.from(ctx.figureNumbers.entries())
    .sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0))
    .map(([id]) => id);

  for (const shotId of orderedIds) {
    state = drawFigure(ctx, state, shotId);
  }
  return state;
}

function addFooters(ctx: PdfContext, title?: string) {
  const pages = ctx.doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const dividerY = 36;
    const textY = 28;
    const num = `${i + 1}/${pages.length}`;
    const numWidth = ctx.regular.widthOfTextAtSize(num, FOOTER_SIZE);

    // Subtle divider above footer text
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: dividerY,
      width: CONTENT_WIDTH,
      height: 0.6,
      fillColor: COLORS.divider,
    });

    if (title) {
      page.drawText(title, {
        x: PAGE_MARGIN,
        y: textY,
        font: ctx.regular,
        size: FOOTER_SIZE,
        color: COLORS.muted,
      });
    }

    page.drawText(num, {
      x: PAGE_WIDTH - PAGE_MARGIN - numWidth,
      y: textY,
      font: ctx.regular,
      size: FOOTER_SIZE,
      color: COLORS.muted,
    });
  }
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

function ensureSpaceForGroup(ctx: PdfContext, state: PageState, requiredHeight: number) {
  if (state.y - requiredHeight <= PAGE_MARGIN) {
    return addPage(ctx);
  }
  return state;
}

function drawFigure(ctx: PdfContext, state: PageState, shotId: string) {
  const entry = ctx.embeddedShots.get(shotId);
  if (!entry) return state;

  const figNo = ctx.figureNumbers.get(shotId) ?? 0;
  const baseTitle =
    entry.shot.label && entry.shot.label.trim()
      ? entry.shot.label.trim()
      : (figNo ? `Screenshot ${figNo}` : "Screenshot");
  const time = entry.shot.timecode ? ` (${entry.shot.timecode})` : "";
  const labelText = `Figure ${figNo || ""}${figNo ? ": " : ""}${baseTitle}${time}`;
  const captionText = entry.shot.note && entry.shot.note.trim() ? entry.shot.note.trim() : "";

  // Measure label and caption to compute total block height.
  const labelH = measureParagraphHeight(ctx, labelText, SMALL_SIZE, ctx.bold);
  const captionH = captionText ? measureParagraphHeight(ctx, captionText, SMALL_SIZE, ctx.italic) : 0;

  // Spacing within the figure block
  const gapAfterLabel = SP.sm;
  const gapBeforeCaption = captionText ? SP.xs : 0;
  const bottomMargin = SP.md;

  // First pass: compute image scale with current page space.
  const widthScale = Math.min(1, CONTENT_WIDTH / entry.width);
  const nonImageSpace = labelH + gapAfterLabel + gapBeforeCaption + captionH + bottomMargin;
  let availableForImage = state.y - PAGE_MARGIN - nonImageSpace;
  let scale = availableForImage > 0 ? Math.min(widthScale, availableForImage / entry.height) : widthScale;
  let imgW = entry.width * scale;
  let imgH = entry.height * scale;

  // Compute full block height
  let blockH = labelH + gapAfterLabel + imgH + (captionText ? gapBeforeCaption + captionH : 0) + bottomMargin;

  // If the whole block won't fit, add a page and recalc with fresh space.
  if (state.y - blockH <= PAGE_MARGIN) {
    state = addPage(ctx);
    availableForImage = state.y - PAGE_MARGIN - nonImageSpace;
    scale = Math.min(widthScale, Math.max(0, availableForImage) / entry.height);
    imgW = entry.width * scale;
    imgH = entry.height * scale;
    blockH = labelH + gapAfterLabel + imgH + (captionText ? gapBeforeCaption + captionH : 0) + bottomMargin;
  }

  // Ensure space for the entire block to avoid overlays.
  state = ensureSpaceForGroup(ctx, state, blockH);

  // Draw label (bold, small) with wrapping
  const labelLines = wrapText(labelText, ctx.bold, SMALL_SIZE, CONTENT_WIDTH);
  for (const line of labelLines) {
    state = ensureSpace(ctx, state, lineHeightFor(SMALL_SIZE));
    state.page.drawText(line, {
      x: PAGE_MARGIN,
      y: state.y,
      font: ctx.bold,
      size: SMALL_SIZE,
      color: COLORS.text,
    });
    state.y -= lineHeightFor(SMALL_SIZE);
  }

  // Gap between label and image
  state.y -= gapAfterLabel;

  // Draw image with subtle border, centered
  const imgX = PAGE_MARGIN + (CONTENT_WIDTH - imgW) / 2;
  const imgY = state.y - imgH;

  state.page.drawRectangle({
    x: imgX - 2,
    y: imgY - 2,
    width: imgW + 4,
    height: imgH + 4,
    borderColor: COLORS.figureBorder,
    borderWidth: 1,
  });

  state.page.drawImage(entry.image, {
    x: imgX,
    y: imgY,
    width: imgW,
    height: imgH,
  });
  state.y -= imgH;

  // Caption (italic, muted)
  if (captionText) {
    state.y -= gapBeforeCaption;
    const captionLines = wrapText(captionText, ctx.italic, SMALL_SIZE, CONTENT_WIDTH);
    for (const line of captionLines) {
      state = ensureSpace(ctx, state, lineHeightFor(SMALL_SIZE));
      state.page.drawText(line, {
        x: PAGE_MARGIN,
        y: state.y,
        font: ctx.italic,
        size: SMALL_SIZE,
        color: COLORS.muted,
      });
      state.y -= lineHeightFor(SMALL_SIZE);
    }
  }

  // Bottom margin after figure
  state.y -= bottomMargin;

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

function drawHeading(
  ctx: PdfContext,
  state: PageState,
  text: string,
  size: number,
  options: { keepNextLines?: number; marginTop?: number; marginBottom?: number } = {},
) {
  const keepNext = options.keepNextLines ?? (size >= SUBTITLE_SIZE ? 3 : 2);
  const marginTop = options.marginTop ?? (size >= SUBTITLE_SIZE ? SP.xl : SP.lg);
  const marginBottom = options.marginBottom ?? SP.sm;

  if (state.y < PAGE_HEIGHT - PAGE_MARGIN && marginTop) {
    state.y -= marginTop;
  }

  const reserve = lineHeightFor(size) + keepNext * lineHeightFor(BODY_SIZE) + SP.sm;
  state = ensureSpaceForGroup(ctx, state, reserve);

  state.page.drawText(text, {
    x: PAGE_MARGIN,
    y: state.y,
    font: ctx.bold,
    size,
    color: COLORS.text,
  });
  state.y -= lineHeightFor(size);

  if (marginBottom) {
    state.y -= marginBottom;
  }
  return state;
}

function drawParagraph(
  ctx: PdfContext,
  state: PageState,
  text: string,
  size: number,
  options: {
    bold?: boolean;
    keepTogether?: boolean;
    marginTop?: number;
    marginBottom?: number;
    color?: ReturnType<typeof rgb>;
  } = {},
) {
  const font = options.bold ? ctx.bold : ctx.regular;
  const color = options.color ?? COLORS.text;
  const marginTop = options.marginTop ?? 0;
  const marginBottom = options.marginBottom ?? SP.sm;

  if (state.y < PAGE_HEIGHT - PAGE_MARGIN && marginTop) {
    state.y -= marginTop;
  }

  const paragraphs = text.split(/\n+/).filter(Boolean);

  paragraphs.forEach((paragraph, pIndex) => {
    const lines = wrapText(paragraph, font, size, CONTENT_WIDTH);
    const blockHeight = lines.length * lineHeightFor(size);

    if (options.keepTogether) {
      state = ensureSpaceForGroup(ctx, state, blockHeight);
    }
    for (const line of lines) {
      state = ensureSpace(ctx, state, lineHeightFor(size));
      state.page.drawText(line, {
        x: PAGE_MARGIN,
        y: state.y,
        font,
        size,
        color,
      });
      state.y -= lineHeightFor(size);
    }
    if (pIndex !== paragraphs.length - 1) {
      state.y -= SP.xs;
    }
  });

  if (marginBottom) {
    state.y -= marginBottom;
  }

  return state;
}

function drawMeta(
  ctx: PdfContext,
  state: PageState,
  text: string,
  options: { italic?: boolean; marginTop?: number; marginBottom?: number } = {},
) {
  const useItalic = options.italic ?? true;
  const font = useItalic ? ctx.italic : ctx.regular;
  const marginTop = options.marginTop ?? 0;
  const marginBottom = options.marginBottom ?? SP.sm;
  const color = COLORS.muted;

  if (state.y < PAGE_HEIGHT - PAGE_MARGIN && marginTop) {
    state.y -= marginTop;
  }

  const paragraphs = text.split(/\n+/).filter(Boolean);
  for (let p = 0; p < paragraphs.length; p++) {
    const lines = wrapText(paragraphs[p], font, SMALL_SIZE, CONTENT_WIDTH);
    for (const line of lines) {
      state = ensureSpace(ctx, state, lineHeightFor(SMALL_SIZE));
      state.page.drawText(line, {
        x: PAGE_MARGIN,
        y: state.y,
        font,
        size: SMALL_SIZE,
        color,
      });
      state.y -= lineHeightFor(SMALL_SIZE);
    }
    if (p < paragraphs.length - 1) {
      state.y -= SP.xs;
    }
  }

  if (marginBottom) {
    state.y -= marginBottom;
  }

  return state;
}

function drawBulletedList(
  ctx: PdfContext,
  state: PageState,
  items: string[],
  options: {
    size?: number;
    indent?: number;
    bullet?: string;
    gap?: number;
    color?: ReturnType<typeof rgb>;
  } = {},
) {
  const size = options.size ?? BODY_SIZE;
  const indent = options.indent ?? 14;
  const bullet = options.bullet ?? "•";
  const gap = options.gap ?? SP.xs;
  const color = options.color ?? COLORS.text;
  const font = ctx.regular;

  const textX = PAGE_MARGIN + indent;
  const maxTextWidth = CONTENT_WIDTH - indent;

  for (const raw of items) {
    const item = String(raw ?? "").trim();
    if (!item) continue;

    const lines = wrapText(item, font, size, maxTextWidth);

    state = ensureSpace(ctx, state, lineHeightFor(size));

    state.page.drawText(bullet, {
      x: PAGE_MARGIN,
      y: state.y,
      font,
      size,
      color,
    });

    if (lines.length > 0) {
      state.page.drawText(lines[0], {
        x: textX,
        y: state.y,
        font,
        size,
        color,
      });
      state.y -= lineHeightFor(size);
    }

    for (let i = 1; i < lines.length; i++) {
      state = ensureSpace(ctx, state, lineHeightFor(size));
      state.page.drawText(lines[i], {
        x: textX,
        y: state.y,
        font,
        size,
        color,
      });
      state.y -= lineHeightFor(size);
    }

    state.y -= gap;
  }

  return state;
}

function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>,
  size: number,
  maxWidth: number,
) {
  const lines: string[] = [];
  let current = "";

  const measure = (s: string) => font.widthOfTextAtSize(s, size);

  function splitLongToken(token: string): string[] {
    if (measure(token) <= maxWidth) return [token];

    const parts: string[] = [];
    let start = 0;
    while (start < token.length) {
      let lo = 1;
      let hi = token.length - start;
      let best = 1;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const seg = token.slice(start, start + mid);
        const w = measure(seg + (start + mid < token.length ? "-" : ""));
        if (w <= maxWidth) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      parts.push(token.slice(start, start + best));
      start += best;
    }
    return parts;
  }

  const rawTokens = text.split(/\s+/);
  for (const token of rawTokens) {
    const pieces = splitLongToken(token);
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i] + (i < pieces.length - 1 ? "-" : "");
      const attempt = current ? `${current} ${piece}` : piece;
      if (measure(attempt) <= maxWidth) {
        current = attempt;
      } else {
        if (current) lines.push(current);
        current = piece;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function measureParagraphHeight(
  ctx: PdfContext,
  text: string,
  size: number,
  font: Awaited<ReturnType<PDFDocument["embedStandardFont"]>> = ctx.regular,
) {
  const paragraphs = text.split(/\n+/).filter(Boolean);
  let lines = 0;
  for (const p of paragraphs) {
    lines += wrapText(p, font, size, CONTENT_WIDTH).length;
  }
  return lines * lineHeightFor(size) + (paragraphs.length > 1 ? (paragraphs.length - 1) * LINE_GAP : 0);
}

function isTutorial(value: TutorialSchema | MeetingSummarySchema): value is TutorialSchema {
  return Array.isArray((value as TutorialSchema).steps);
}

function isMeetingSummary(value: TutorialSchema | MeetingSummarySchema): value is MeetingSummarySchema {
  const typed = value as MeetingSummarySchema;
  return Array.isArray(typed.keyTopics) || Array.isArray(typed.attendees);
}

async function embedShots(doc: PDFDocument, shots: ShotForExport[]) {
  const embeddedShots = new Map<string, EmbeddedShot>();
  const figureNumbers = new Map<string, number>();
  let n = 1;

  for (const shot of shots) {
    const decoded = decodeDataUrl(shot.dataUrl);
    if (!decoded) continue;

    try {
      const image = decoded.mime.includes("jpeg")
        ? await doc.embedJpg(decoded.bytes)
        : await doc.embedPng(decoded.bytes);
      embeddedShots.set(shot.id, {
        shot,
        image,
        width: image.width,
        height: image.height,
      });
      figureNumbers.set(shot.id, n++);
    } catch {
      // Skip un-embeddable images
    }
  }
  return { embeddedShots, figureNumbers };
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