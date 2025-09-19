// components/workbench/PreviewModal.tsx
"use client";

import React, { memo } from "react";
import Image from "next/image";
import { Shot } from "@/lib/types";

type PreviewModalProps = {
  previewShot: Shot | null;
  onClose: () => void;
};

function PreviewModal({ previewShot, onClose }: PreviewModalProps) {
  if (!previewShot) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
      <div className="relative max-h-full max-w-4xl overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl ring-1 ring-gray-100">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Close
        </button>
        <Image
          src={previewShot.dataUrl}
          alt={previewShot.label || previewShot.id}
          width={1280}
          height={720}
          unoptimized
          className="max-h-[70vh] w-auto rounded-xl border border-gray-200 shadow-lg"
        />
        <div className="mt-3 text-sm text-gray-800">
          <div className="font-medium">{previewShot.label || previewShot.id}</div>
          <div className="text-xs text-gray-600">Captured @ {previewShot.timecode}</div>
          {previewShot.note ? <div className="mt-2 text-xs text-gray-700">{previewShot.note}</div> : null}
        </div>
      </div>
    </div>
  );
}

function areEqual(prev: PreviewModalProps, next: PreviewModalProps) {
  const a = prev.previewShot;
  const b = next.previewShot;
  if (a === b) {
    return prev.onClose === next.onClose;
  }
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.timecode === b.timecode &&
    a.timeSec === b.timeSec &&
    a.label === b.label &&
    a.note === b.note &&
    a.dataUrl === b.dataUrl &&
    prev.onClose === next.onClose
  );
}

export default memo(PreviewModal, areEqual);