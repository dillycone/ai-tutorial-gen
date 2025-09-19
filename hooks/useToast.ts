"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ToastType = "success" | "error" | "info";

export type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
  duration?: number;
};

export type UseToastOptions = {
  /**
   * Default time (ms) before a toast auto-dismisses.
   * Defaults to 4000ms.
   */
  defaultDuration?: number;
  /**
   * Max queued toasts waiting to be shown next.
   * New items beyond this size will drop the oldest queued entry.
   * Defaults to 3.
   */
  maxQueue?: number;
};

export type UseToastReturn = {
  /**
   * Currently visible toast (or null if none).
   */
  toast: ToastItem | null;
  /**
   * Show a toast. Optionally override duration per message.
   */
  showToast: (type: ToastType, message: string, opts?: { duration?: number }) => void;
  /**
   * Immediately dismiss the current toast and show the next queued toast (if any).
   */
  dismiss: () => void;
  /**
   * Clear any queued toasts (does not affect current toast).
   */
  clearQueue: () => void;
  /**
   * Number of queued toasts waiting.
   */
  queueLength: number;
};

export function useToast(options: UseToastOptions = {}): UseToastReturn {
  const defaultDuration = Number.isFinite(options.defaultDuration as number)
    ? (options.defaultDuration as number)
    : 4000;
  const maxQueue = Number.isFinite(options.maxQueue as number) ? (options.maxQueue as number) : 3;

  const [toast, setToast] = useState<ToastItem | null>(null);
  const queueRef = useRef<ToastItem[]>([]);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleAutoDismiss = useCallback(
    (duration?: number) => {
      const ms = Number.isFinite(duration as number) && (duration as number)! > 0 ? (duration as number) : defaultDuration;
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        // Dismiss current and show next in queue
        setToast(null);
        const next = queueRef.current.shift();
        if (next) {
          setToast(next);
        }
      }, ms);
    },
    [clearTimer, defaultDuration],
  );

  const showToast = useCallback(
    (type: ToastType, message: string, opts?: { duration?: number }) => {
      const item: ToastItem = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        type,
        message,
        duration: opts?.duration,
      };

      // If no current toast, show immediately
      if (!toast) {
        setToast(item);
        scheduleAutoDismiss(item.duration);
        return;
      }

      // Otherwise enqueue, respecting maxQueue by dropping the oldest
      const queue = queueRef.current.slice();
      queue.push(item);
      while (queue.length > maxQueue) {
        queue.shift();
      }
      queueRef.current = queue;
    },
    [maxQueue, scheduleAutoDismiss, toast],
  );

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
    const next = queueRef.current.shift();
    if (next) {
      setToast(next);
    }
  }, [clearTimer]);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
  }, []);

  // Re-arm timer on toast change
  useEffect(() => {
    if (!toast) {
      clearTimer();
      return;
    }
    scheduleAutoDismiss(toast.duration);
    return clearTimer;
  }, [toast, scheduleAutoDismiss, clearTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      queueRef.current = [];
    };
  }, [clearTimer]);

  return {
    toast,
    showToast,
    dismiss,
    clearQueue,
    queueLength: queueRef.current.length,
  };
}

export default useToast;