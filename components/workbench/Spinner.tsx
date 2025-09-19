// components/workbench/Spinner.tsx
"use client";

import React, { memo } from "react";

type SpinnerProps = {
  label: string;
};

function Spinner({ label }: SpinnerProps) {
  return (
    <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600 shadow-sm" aria-hidden />
      {label}
    </span>
  );
}

export default memo(Spinner);