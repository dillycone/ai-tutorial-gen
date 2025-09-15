// components/HowToViewer.tsx
"use client";

import Image from "next/image";
import { Shot } from "@/lib/types";
type TutorialStep = {
  index: number;
  title: string;
  description: string;
  startTimecode?: string;
  endTimecode?: string;
  screenshotIds?: string[];
};
type Tutorial = {
  title: string;
  summary: string;
  prerequisites?: string[];
  steps: TutorialStep[];
};

type MeetingAttendee = {
  name: string;
  role?: string;
  department?: string;
};

type MeetingTopic = {
  order: number;
  title: string;
  details: string;
  startTimecode?: string;
  endTimecode?: string;
  speaker?: string;
};

type MeetingDecision = {
  description: string;
  owners?: string[];
  status?: string;
  timecode?: string;
};

type MeetingActionItem = {
  task: string;
  owner: string;
  dueDate?: string;
  timecode?: string;
};

type MeetingSummary = {
  meetingTitle: string;
  meetingDate: string;
  durationMinutes?: number;
  attendees?: MeetingAttendee[];
  summary: string;
  keyTopics: MeetingTopic[];
  decisions?: MeetingDecision[];
  actionItems?: MeetingActionItem[];
  followUps?: string[];
};

export default function HowToViewer({
  jsonText,
  localShots,
  schemaType,
}: {
  jsonText: string; // schema JSON
  localShots: Shot[];
  schemaType: "tutorial" | "meetingSummary";
}) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return <div className="text-sm text-red-600">Could not parse JSON result.</div>;
  }

  if (schemaType === "meetingSummary") {
    return <MeetingSummaryView summary={parsed as MeetingSummary} />;
  }

  return <TutorialView tutorial={parsed as Tutorial} localShots={localShots} />;
}

function MeetingSummaryView({ summary }: { summary: MeetingSummary }) {
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

function TutorialView({ tutorial, localShots }: { tutorial: Tutorial; localShots: Shot[] }) {
  const shotMap = new Map(localShots.map((shot) => [shot.id, shot]));
  const steps = Array.isArray(tutorial.steps) ? tutorial.steps : [];
  const timelineEntries = steps
    .map((step, index) => ({
      index,
      title: step.title,
      time: step.startTimecode || step.endTimecode || null,
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
        {steps.map((step) => (
          <article key={step.index} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{step.description}</p>
              </div>
              {(step.startTimecode || step.endTimecode) && (
                <div className="flex flex-col items-end gap-1 text-xs text-gray-600">
                  {step.startTimecode ? (
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">
                      Start {step.startTimecode}
                    </span>
                  ) : null}
                  {step.endTimecode ? (
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">
                      End {step.endTimecode}
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            {Array.isArray(step.screenshotIds) && step.screenshotIds.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {step.screenshotIds.map((id) => {
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
                        {shot.note ? (
                          <p className="text-[11px] text-gray-600">{shot.note}</p>
                        ) : null}
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