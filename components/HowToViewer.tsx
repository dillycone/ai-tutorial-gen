// components/HowToViewer.tsx
"use client";

import Image from "next/image";
import type { SchemaTemplate, Shot, TutorialResult, TutorialStep, MeetingSummaryResult } from "@/lib/types";
import { markdownToHtml } from "@/lib/markdown";

const formatJson = (input: string) => {
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
};

type HowToViewerProps = {
  templateId: string;
  data: Record<string, unknown> | null;
  jsonText: string;
  rawText: string;
  localShots: Shot[];
  schemaTemplate?: SchemaTemplate | null;
};

export default function HowToViewer({
  templateId,
  data,
  jsonText,
  rawText,
  localShots,
  schemaTemplate = null,
}: HowToViewerProps) {
  if (templateId === "tutorial" && data) {
    return <TutorialView tutorial={data as TutorialResult} localShots={localShots} />;
  }

  if (templateId === "meetingSummary" && data) {
    return <MeetingSummaryView summary={data as MeetingSummaryResult} />;
  }

  if (data) {
    return (
      <div className="space-y-3 text-sm text-gray-700">
        <p className="text-xs text-gray-500">
          Preview not yet available for {schemaTemplate?.name ?? templateId}. Showing structured JSON instead.
        </p>
        <pre className="rounded-md border border-gray-200 bg-gray-950 p-3 text-xs text-gray-100 whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  }

  if (jsonText.trim()) {
    return (
      <pre className="rounded-md border border-gray-200 bg-gray-950 p-3 text-xs text-gray-100 whitespace-pre-wrap">
        {formatJson(jsonText)}
      </pre>
    );
  }

  if (rawText.trim()) {
    return (
      <div
        className="prose prose-sm max-w-none text-gray-800"
        dangerouslySetInnerHTML={{ __html: markdownToHtml(rawText) }}
      />
    );
  }

  return (
    <p className="text-sm text-gray-500">No preview available yet.</p>
  );
}

function MeetingSummaryView({ summary }: { summary: MeetingSummaryResult }) {
  const sortedTopics = Array.isArray(summary.keyTopics)
    ? [...summary.keyTopics].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">{summary.meetingTitle || "Meeting"}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span>{summary.meetingDate || "Date TBD"}</span>
          {typeof summary.durationMinutes === "number" && summary.durationMinutes > 0 ? (
            <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5">
              {summary.durationMinutes} min
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-sm text-gray-700">
          {summary.summary || "No summary provided."}
        </p>
      </header>

      {Array.isArray(summary.attendees) && summary.attendees.length > 0 ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Attendees</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {summary.attendees.map((attendee, index) => (
              <span
                key={`${attendee.name}-${index}`}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-1 text-xs text-gray-800"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700">
                  {initials(attendee.name)}
                </span>
                <span>{attendee.name}</span>
                {attendee.role || attendee.department ? (
                  <span className="text-gray-600">
                    {attendee.role}
                    {attendee.role && attendee.department ? " · " : ""}
                    {attendee.department}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {sortedTopics.length ? (
        <section className="grid gap-6 lg:grid-cols-[220px,1fr]">
          <aside className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">Agenda timeline</h3>
            <ol className="mt-4 space-y-4 text-sm">
              {sortedTopics.map((topic) => (
                <li key={topic.order} className="flex gap-3">
                  <div className="relative flex flex-col items-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-300 bg-indigo-100 text-xs font-semibold text-indigo-700">
                      {topic.order}
                    </span>
                    <span className="mt-2 h-full w-px bg-gray-200" aria-hidden />
                  </div>
                  <div>
                    <div className="text-gray-800">{topic.startTimecode || topic.endTimecode || "Time TBD"}</div>
                    <div className="text-xs text-gray-600">{topic.title}</div>
                  </div>
                </li>
              ))}
            </ol>
          </aside>

          <div className="space-y-4">
            {sortedTopics.map((topic) => (
              <article key={topic.order} className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-800 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-base font-semibold text-gray-900">{topic.title}</h4>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                    {topic.speaker ? <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5">{topic.speaker}</span> : null}
                    {topic.startTimecode ? <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5">{topic.startTimecode}</span> : null}
                    {topic.endTimecode ? <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5">{topic.endTimecode}</span> : null}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm text-gray-700">{topic.details}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {Array.isArray(summary.decisions) && summary.decisions.length > 0 ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Decisions</h3>
          <ul className="mt-3 space-y-3 text-sm text-gray-800">
            {summary.decisions.map((decision, index) => (
              <li key={`${decision.description}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="font-medium text-gray-900">{decision.description}</div>
                <div className="mt-2 text-xs text-gray-600">
                  {decision.status ? `Status: ${decision.status}` : null}
                  {decision.owners?.length ? ` · Owners: ${decision.owners.join(", ")}` : ""}
                  {decision.timecode ? ` · ${decision.timecode}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {Array.isArray(summary.actionItems) && summary.actionItems.length > 0 ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Action items</h3>
          <ul className="mt-3 space-y-3 text-sm text-gray-800">
            {summary.actionItems.map((item, index) => (
              <li key={`${item.task}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="font-medium text-gray-900">{item.task}</div>
                <div className="mt-2 text-xs text-gray-600">
                  Owner: {item.owner}
                  {item.dueDate ? ` · Due ${item.dueDate}` : ""}
                  {item.timecode ? ` · ${item.timecode}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {Array.isArray(summary.followUps) && summary.followUps.length > 0 ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Follow ups</h3>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm text-gray-800">
            {summary.followUps.map((item, index) => (
              <li key={`${item}-${index}`} className="rounded-full border border-gray-200 bg-gray-50 px-4 py-1">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function TutorialView({ tutorial, localShots }: { tutorial: TutorialResult; localShots: Shot[] }) {
  const shotMap = new Map(localShots.map((shot) => [shot.id, shot]));
  const steps = Array.isArray(tutorial.steps) ? tutorial.steps : [];
  const timelineEntries = steps
    .map((step, index) => ({
      index,
      title: step.stepTitle,
      time: step.timecodes?.start || step.timecodes?.end || null,
    }))
    .filter((entry) => entry.time);

  return (
    <div className="grid gap-8 lg:grid-cols-[220px,1fr]">
      <aside className="space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">{tutorial.title}</h2>
          <p className="mt-2 text-sm text-gray-700">{tutorial.summary}</p>
          {tutorial.prerequisites?.length ? (
            <div className="mt-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Prerequisites</h3>
              <ul className="flex flex-wrap gap-2 text-xs text-gray-800">
                {tutorial.prerequisites.map((item, index) => (
                  <li key={`${item}-${index}`} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {timelineEntries.length ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">Timeline</h3>
            <ol className="mt-4 space-y-4 text-sm">
              {timelineEntries.map((entry) => (
                <li key={`${entry.index}-${entry.time}`} className="flex gap-3">
                  <div className="relative flex flex-col items-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-300 bg-indigo-100 text-xs font-semibold text-indigo-700">
                      {entry.index + 1}
                    </span>
                    <span className="mt-2 h-full w-px bg-gray-200" aria-hidden />
                  </div>
                  <div>
                    <div className="text-gray-800">{entry.time}</div>
                    <div className="text-xs text-gray-600">{entry.title}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </aside>

      <div className="space-y-6">
        {steps.map((step: TutorialStep, index: number) => (
          <article key={`step-${index}`} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{step.stepTitle}</h3>
                <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{step.description}</p>
              </div>
              {(step.timecodes?.start || step.timecodes?.end) && (
                <div className="flex flex-col items-end gap-1 text-xs text-gray-600">
                  {step.timecodes?.start ? (
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">
                      Start {step.timecodes.start}
                    </span>
                  ) : null}
                  {step.timecodes?.end ? (
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">
                      End {step.timecodes.end}
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            {Array.isArray(step.screenshots) && step.screenshots.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {step.screenshots.map((id) => {
                  const shot = shotMap.get(id);
                  if (!shot) return null;
                  return (
                    <div key={id} className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                      <Image
                        src={shot.dataUrl}
                        alt={shot.label || id}
                        width={640}
                        height={360}
                        className="h-full w-full object-cover"
                      />
                      <div className="flex flex-col gap-1 px-3 py-2 text-xs text-gray-700">
                        <div className="flex items-center justify-between text-gray-800">
                          <span className="font-medium">{shot.label || id}</span>
                          <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5">
                            {shot.timecode}
                          </span>
                        </div>
                        {shot.note ? <p className="text-[11px] text-gray-600">{shot.note}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function initials(name: string | undefined) {
  if (!name) return "?";
  const pieces = name.trim().split(/\s+/);
  if (pieces.length === 1) return pieces[0][0]?.toUpperCase() ?? "?";
  return `${pieces[0][0] ?? ""}${pieces[pieces.length - 1][0] ?? ""}`.toUpperCase();
}
