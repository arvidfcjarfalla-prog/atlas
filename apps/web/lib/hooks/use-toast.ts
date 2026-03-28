"use client";

import { useState, useCallback, useRef } from "react";

export type ToastVariant = "info" | "success" | "error";

export interface Toast {
  message: string;
  variant: ToastVariant;
}

export function useToast(duration = 3000) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      setToast({ message, variant });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setToast(null), duration);
    },
    [duration],
  );

  return { toast, show } as const;
}
