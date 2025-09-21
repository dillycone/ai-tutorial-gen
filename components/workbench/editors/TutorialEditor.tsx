"use client";

import { useMemo } from "react";
import type { TutorialResult, TutorialStep } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

type TutorialEditorProps = {
  value: TutorialResult | Record<string, unknown> | null;
  onChange: (updater: (draft: Record<string, unknown>) => void) => void;
};

const createEmptyStep = (index: number): TutorialStep => ({
  stepTitle: `Step ${index + 1}`,
  description: "",
  timecodes: null,
  screenshots: null,
});

const normalizeTutorial = (value: TutorialEditorProps["value"]): TutorialResult => {
  if (!value || typeof value !== "object") {
    return {
      title: "",
      summary: "",
      prerequisites: [],
      steps: [createEmptyStep(0)],
    };
  }

  const draft = value as Partial<TutorialResult> & Record<string, unknown>;
  const steps = Array.isArray(draft.steps) && draft.steps.length > 0 ? draft.steps : [createEmptyStep(0)];

  const normalizedSteps = steps.map((step, index): TutorialStep => {
    if (!step || typeof step !== "object") {
      return createEmptyStep(index);
    }
    const candidate = step as TutorialStep & Record<string, unknown>;
    const timecodesSource = candidate.timecodes && typeof candidate.timecodes === "object" ? candidate.timecodes : null;
    const start = timecodesSource && typeof timecodesSource.start === "string" ? timecodesSource.start : undefined;
    const end = timecodesSource && typeof timecodesSource.end === "string" ? timecodesSource.end : undefined;

    const screenshots = Array.isArray(candidate.screenshots)
      ? candidate.screenshots.filter((item): item is string => typeof item === "string")
      : null;

    return {
      stepTitle: typeof candidate.stepTitle === "string" ? candidate.stepTitle : `Step ${index + 1}`,
      description: typeof candidate.description === "string" ? candidate.description : "",
      timecodes: start || end ? { start, end } : null,
      screenshots: screenshots && screenshots.length > 0 ? screenshots : null,
    };
  });

  const prerequisites = Array.isArray(draft.prerequisites)
    ? draft.prerequisites.filter((item): item is string => typeof item === "string")
    : [];

  return {
    title: typeof draft.title === "string" ? draft.title : "",
    summary: typeof draft.summary === "string" ? draft.summary : "",
    prerequisites,
    steps: normalizedSteps,
  };
};

export default function TutorialEditor({ value, onChange }: TutorialEditorProps) {
  const tutorial = useMemo(() => normalizeTutorial(value), [value]);

  const handleTitleChange = (next: string) => {
    onChange((draft) => {
      (draft as TutorialResult).title = next;
    });
  };

  const handleSummaryChange = (next: string) => {
    onChange((draft) => {
      (draft as TutorialResult).summary = next;
    });
  };

  const handlePrerequisiteChange = (index: number, next: string) => {
    onChange((draft) => {
      const tutorialDraft = draft as TutorialResult;
      if (!Array.isArray(tutorialDraft.prerequisites)) {
        tutorialDraft.prerequisites = [];
      }
      tutorialDraft.prerequisites[index] = next;
    });
  };

  const handleAddPrerequisite = () => {
    onChange((draft) => {
      const tutorialDraft = draft as TutorialResult;
      if (!Array.isArray(tutorialDraft.prerequisites)) {
        tutorialDraft.prerequisites = [];
      }
      tutorialDraft.prerequisites.push("");
    });
  };

  const handleRemovePrerequisite = (index: number) => {
    onChange((draft) => {
      const tutorialDraft = draft as TutorialResult;
      if (!Array.isArray(tutorialDraft.prerequisites)) return;
      tutorialDraft.prerequisites.splice(index, 1);
    });
  };

  const handleStepFieldChange = (index: number, field: "stepTitle" | "description", next: string) => {
    onChange((draft) => {
      const tutorialDraft = draft as TutorialResult;
      if (!Array.isArray(tutorialDraft.steps)) {
        tutorialDraft.steps = [];
      }
      if (!tutorialDraft.steps[index]) {
        tutorialDraft.steps[index] = createEmptyStep(index);
      }
      tutorialDraft.steps[index][field] = next;
    });
  };

  const handleTimecodeChange = (index: number, key: "start" | "end", next: string) => {
    onChange((draft) => {
      const tutorialDraft = draft as TutorialResult;
      if (!Array.isArray(tutorialDraft.steps)) {
        tutorialDraft.steps = [];
      }
      if (!tutorialDraft.steps[index]) {
        tutorialDraft.steps[index] = createEmptyStep(index);
      }
      if (!tutorialDraft.steps[index].timecodes) {
        tutorialDraft.steps[index].timecodes = {};
      }
      const trimmed = next.trim();
      tutorialDraft.steps[index].timecodes![key] = trimmed || undefined;
      if (!tutorialDraft.steps[index].timecodes?.start && !tutorialDraft.steps[index].timecodes?.end) {
        tutorialDraft.steps[index].timecodes = null;
      }
    });
  };

  const handleScreenshotsChange = (index: number, next: string) => {
    onChange((draft) => {
      const tutorialDraft = draft as TutorialResult;
      if (!Array.isArray(tutorialDraft.steps)) {
        tutorialDraft.steps = [];
      }
      if (!tutorialDraft.steps[index]) {
        tutorialDraft.steps[index] = createEmptyStep(index);
      }
      const tokens = next
        .split(/[,\n]/)
        .map((token) => token.trim())
        .filter(Boolean);
      tutorialDraft.steps[index].screenshots = tokens.length > 0 ? tokens : null;
    });
  };

  const handleAddStep = () => {
    onChange((draft) => {
      const tutorialDraft = draft as TutorialResult;
      if (!Array.isArray(tutorialDraft.steps)) {
        tutorialDraft.steps = [];
      }
      const index = tutorialDraft.steps.length;
      tutorialDraft.steps.push(createEmptyStep(index));
    });
  };

  const handleRemoveStep = (index: number) => {
    onChange((draft) => {
      const tutorialDraft = draft as TutorialResult;
      if (!Array.isArray(tutorialDraft.steps)) return;
      tutorialDraft.steps.splice(index, 1);
      if (tutorialDraft.steps.length === 0) {
        tutorialDraft.steps.push(createEmptyStep(0));
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tutorial-title" className="text-sm font-medium text-gray-700">
              Title
            </Label>
            <Input
              id="tutorial-title"
              value={tutorial.title}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder="Give your tutorial a clear headline"
              className="bg-white"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tutorial-summary" className="text-sm font-medium text-gray-700">
              Summary
            </Label>
            <Textarea
              id="tutorial-summary"
              value={tutorial.summary}
              onChange={(event) => handleSummaryChange(event.target.value)}
              placeholder="Describe the goal and key takeaways"
              rows={4}
              className="bg-white"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-gray-700">Prerequisites</Label>
            <Button variant="outline" size="sm" onClick={handleAddPrerequisite}>
              <Plus className="h-4 w-4" /> Add prerequisite
            </Button>
          </div>
          {tutorial.prerequisites.length === 0 ? (
            <p className="text-xs text-gray-500">List any setup steps or knowledge learners should have in advance.</p>
          ) : null}
          <div className="space-y-3">
            {tutorial.prerequisites.map((item, index) => (
              <div key={`prereq-${index}`} className="flex items-center gap-3">
                <Input
                  value={item}
                  onChange={(event) => handlePrerequisiteChange(index, event.target.value)}
                  placeholder="Example: Install the project dependencies"
                  className="bg-white"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemovePrerequisite(index)}
                  aria-label="Remove prerequisite"
                >
                  <Trash2 className="h-4 w-4 text-gray-500" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Steps</h3>
          <Button variant="outline" size="sm" onClick={handleAddStep}>
            <Plus className="h-4 w-4" /> Add step
          </Button>
        </div>
        <div className="space-y-4">
          {tutorial.steps.map((step, index) => (
            <Card key={`step-${index}`} className="border-gray-200">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="w-full space-y-2">
                  <Label htmlFor={`step-title-${index}`} className="text-sm font-medium text-gray-700">
                    Step {index + 1} title
                  </Label>
                  <Input
                    id={`step-title-${index}`}
                    value={step.stepTitle}
                    onChange={(event) => handleStepFieldChange(index, "stepTitle", event.target.value)}
                    placeholder="Describe what happens in this step"
                    className="bg-white"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveStep(index)}
                  aria-label={`Remove step ${index + 1}`}
                  className="mt-6"
                >
                  <Trash2 className="h-4 w-4 text-gray-500" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`step-description-${index}`} className="text-sm font-medium text-gray-700">
                    Description
                  </Label>
                  <Textarea
                    id={`step-description-${index}`}
                    value={step.description}
                    onChange={(event) => handleStepFieldChange(index, "description", event.target.value)}
                    placeholder="Explain the action learners should take"
                    rows={4}
                    className="bg-white"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`step-start-${index}`} className="text-sm font-medium text-gray-700">
                      Start timecode
                    </Label>
                    <Input
                      id={`step-start-${index}`}
                      value={step.timecodes?.start ?? ""}
                      onChange={(event) => handleTimecodeChange(index, "start", event.target.value)}
                      placeholder="e.g., 00:01:23"
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`step-end-${index}`} className="text-sm font-medium text-gray-700">
                      End timecode
                    </Label>
                    <Input
                      id={`step-end-${index}`}
                      value={step.timecodes?.end ?? ""}
                      onChange={(event) => handleTimecodeChange(index, "end", event.target.value)}
                      placeholder="e.g., 00:02:10"
                      className="bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`step-screenshots-${index}`} className="text-sm font-medium text-gray-700">
                    Screenshot IDs
                  </Label>
                  <Textarea
                    id={`step-screenshots-${index}`}
                    value={step.screenshots?.join(", ") ?? ""}
                    onChange={(event) => handleScreenshotsChange(index, event.target.value)}
                    placeholder="Comma-separated screenshot IDs to show for this step"
                    rows={2}
                    className="bg-white"
                  />
                  <p className="text-xs text-gray-500">Use the IDs from your captured screenshots; separate multiple IDs with commas.</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
