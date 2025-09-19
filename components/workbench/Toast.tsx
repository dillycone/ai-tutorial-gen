// components/workbench/Toast.tsx
"use client";

import React, { memo } from "react";
import { ToastState } from "@/hooks/useVideoWorkbench";
import { classNames } from "@/lib/ui";

type ToastProps = {
  toast: ToastState | null;
};

function WorkbenchToast({ toast }: ToastProps) {
  if (!toast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div
        className={classNames(
          "animate-slide-in-right rounded-xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur-md transition-all duration-300 hover:scale-105 hover:shadow-2xl",
          toast.type === "success" && "border-emerald-200 bg-emerald-50/95 text-emerald-800 shadow-emerald-200/70 ring-1 ring-emerald-200",
          toast.type === "error" && "border-red-200 bg-red-50/95 text-red-800 shadow-red-200/70 ring-1 ring-red-200",
          toast.type === "info" && "border-blue-200 bg-blue-50/95 text-blue-800 shadow-blue-200/70 ring-1 ring-blue-200",
        )}
      >
        {toast.message}
      </div>
    </div>
  );
}

function areEqual(prev: ToastProps, next: ToastProps) {
  if (prev.toast === next.toast) return true;
  if (!prev.toast || !next.toast) return false;
  return (
    prev.toast.id === next.toast.id &&
    prev.toast.type === next.toast.type &&
    prev.toast.message === next.toast.message
  );
}

export default memo(WorkbenchToast, areEqual);