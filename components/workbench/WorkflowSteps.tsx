// components/workbench/WorkflowSteps.tsx
"use client";

import React, { memo } from "react";
import { WorkbenchStep } from "@/hooks/useVideoWorkbench";
import { classNames } from "@/lib/ui";

type WorkflowStepsProps = {
  steps: WorkbenchStep[];
};

function WorkflowStepsComponent({ steps }: WorkflowStepsProps) {
  return (
    <nav className="animate-fade-in-down flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-inner shadow-gray-200/30 transition-all duration-300 hover:translate-y-[-1px] hover:shadow-lg sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm font-medium uppercase tracking-wider text-gray-600">Workflow overview</div>
      <div className="flex flex-wrap gap-3">
        {steps.map((step) => (
          <div
            key={step.id}
            className={classNames(
              "flex items-center gap-3 rounded-full border px-4 py-2 text-sm transition-all duration-300 hover:scale-105",
              step.status === "complete" && "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-lg shadow-emerald-500/20 animate-pulse-scale",
              step.status === "current" && "border-sky-300 bg-sky-50 text-sky-700 shadow-lg shadow-sky-500/20 animate-glow",
              step.status === "upcoming" && "border-gray-300 bg-transparent text-gray-500 hover:border-gray-400 hover:bg-gray-50",
            )}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs font-semibold">
              {step.id}
            </span>
            <div>
              <div className="font-semibold leading-tight">{step.title}</div>
              <div className="text-xs text-gray-500">{step.description}</div>
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

function areEqual(prev: WorkflowStepsProps, next: WorkflowStepsProps) {
  if (prev.steps === next.steps) return true;
  if (prev.steps.length !== next.steps.length) return false;
  for (let i = 0; i < prev.steps.length; i++) {
    const a = prev.steps[i];
    const b = next.steps[i];
    if (
      a.id !== b.id ||
      a.title !== b.title ||
      a.description !== b.description ||
      a.status !== b.status
    ) {
      return false;
    }
  }
  return true;
}

export default memo(WorkflowStepsComponent, areEqual);
