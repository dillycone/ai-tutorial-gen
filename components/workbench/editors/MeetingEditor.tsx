"use client";

import { useMemo } from "react";
import type { MeetingSummaryResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

type MeetingEditorProps = {
  value: MeetingSummaryResult | Record<string, unknown> | null;
  onChange: (updater: (draft: Record<string, unknown>) => void) => void;
};

const normalizeMeeting = (value: MeetingEditorProps["value"]): MeetingSummaryResult => {
  if (!value || typeof value !== "object") {
    return {
      meetingTitle: "",
      meetingDate: "",
      durationMinutes: undefined,
      attendees: [],
      summary: "",
      keyTopics: [],
      decisions: [],
      actionItems: [],
      followUps: [],
    };
  }

  const draft = value as MeetingSummaryResult & Record<string, unknown>;
  return {
    meetingTitle: typeof draft.meetingTitle === "string" ? draft.meetingTitle : "",
    meetingDate: typeof draft.meetingDate === "string" ? draft.meetingDate : "",
    durationMinutes:
      typeof draft.durationMinutes === "number" && Number.isFinite(draft.durationMinutes)
        ? draft.durationMinutes
        : undefined,
    attendees: Array.isArray(draft.attendees) ? draft.attendees : [],
    summary: typeof draft.summary === "string" ? draft.summary : "",
    keyTopics: Array.isArray(draft.keyTopics) ? draft.keyTopics : [],
    decisions: Array.isArray(draft.decisions) ? draft.decisions : [],
    actionItems: Array.isArray(draft.actionItems) ? draft.actionItems : [],
    followUps: Array.isArray(draft.followUps) ? draft.followUps : [],
  };
};

export default function MeetingEditor({ value, onChange }: MeetingEditorProps) {
  const meeting = useMemo(() => normalizeMeeting(value), [value]);

  const handleFieldChange = (field: keyof MeetingSummaryResult, next: unknown) => {
    onChange((draft) => {
      (draft as MeetingSummaryResult)[field] = next as never;
    });
  };

  const handleFollowUpsChange = (index: number, next: string) => {
    onChange((draft) => {
      const meetingDraft = draft as MeetingSummaryResult;
      if (!Array.isArray(meetingDraft.followUps)) {
        meetingDraft.followUps = [];
      }
      meetingDraft.followUps[index] = next;
    });
  };

  const handleAddFollowUp = () => {
    onChange((draft) => {
      const meetingDraft = draft as MeetingSummaryResult;
      if (!Array.isArray(meetingDraft.followUps)) {
        meetingDraft.followUps = [];
      }
      meetingDraft.followUps.push("");
    });
  };

  const handleRemoveFollowUp = (index: number) => {
    onChange((draft) => {
      const meetingDraft = draft as MeetingSummaryResult;
      if (!Array.isArray(meetingDraft.followUps)) return;
      meetingDraft.followUps.splice(index, 1);
    });
  };

  const handleAttendeeListChange = (next: string) => {
    onChange((draft) => {
      const meetingDraft = draft as MeetingSummaryResult;
      const lines = next
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      meetingDraft.attendees = lines.map((name) => ({ name }));
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meeting-title" className="text-sm font-medium text-gray-700">
                Meeting title
              </Label>
              <Input
                id="meeting-title"
                value={meeting.meetingTitle ?? ""}
                onChange={(event) => handleFieldChange("meetingTitle", event.target.value)}
                placeholder="Weekly sync"
                className="bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-date" className="text-sm font-medium text-gray-700">
                Meeting date
              </Label>
              <Input
                id="meeting-date"
                value={meeting.meetingDate ?? ""}
                onChange={(event) => handleFieldChange("meetingDate", event.target.value)}
                placeholder="2025-09-20"
                className="bg-white"
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr,200px]">
            <div className="space-y-2">
              <Label htmlFor="meeting-summary" className="text-sm font-medium text-gray-700">
                Summary
              </Label>
              <Textarea
                id="meeting-summary"
                value={meeting.summary ?? ""}
                onChange={(event) => handleFieldChange("summary", event.target.value)}
                placeholder="Briefly summarize what was discussed and decided"
                rows={4}
                className="bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-duration" className="text-sm font-medium text-gray-700">
                Duration (minutes)
              </Label>
              <Input
                id="meeting-duration"
                type="number"
                min={0}
                value={meeting.durationMinutes ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  handleFieldChange("durationMinutes", value ? Number(value) : undefined);
                }}
                placeholder="45"
                className="bg-white"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="meeting-attendees" className="text-sm font-medium text-gray-700">
              Attendees
            </Label>
            <Textarea
              id="meeting-attendees"
              value={(meeting.attendees ?? []).map((attendee) => attendee.name).join("\n")}
              onChange={(event) => handleAttendeeListChange(event.target.value)}
              placeholder="One attendee per line"
              rows={4}
              className="bg-white"
            />
            <p className="text-xs text-gray-500">Add one attendee per line. Roles and departments can be refined in the JSON tab.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">Follow ups</Label>
          <p className="text-xs text-gray-500">Track next steps or reminders. Add one item per field.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-3">
            {meeting.followUps?.map((item, index) => (
              <div key={`follow-${index}`} className="flex items-center gap-3">
                <Input
                  value={item}
                  onChange={(event) => handleFollowUpsChange(index, event.target.value)}
                  placeholder="Prepare slides for next week"
                  className="bg-white"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveFollowUp(index)}
                  aria-label="Remove follow up"
                >
                  <Trash2 className="h-4 w-4 text-gray-500" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleAddFollowUp}>
            <Plus className="h-4 w-4" /> Add follow up
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 py-6">
          <Label className="text-sm font-medium text-gray-700">Advanced sections</Label>
          <p className="text-xs text-gray-500">
            Topics, decisions, and action items are available in the JSON tab. Use it to edit detailed agenda items or
            owner assignments.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
