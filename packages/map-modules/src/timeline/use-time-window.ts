"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

export type TimeWindowValue = "1h" | "6h" | "24h" | "all";

export const TIME_WINDOW_MS: Record<TimeWindowValue, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  all: 72 * 60 * 60 * 1000,
};

interface TimeWindowContextValue {
  timeWindow: TimeWindowValue;
  setTimeWindow: (w: TimeWindowValue) => void;
  windowMs: number;
}

const TimeWindowContext = createContext<TimeWindowContextValue>({
  timeWindow: "24h",
  setTimeWindow: () => {},
  windowMs: TIME_WINDOW_MS["24h"],
});

export function useTimeWindow(): TimeWindowContextValue {
  return useContext(TimeWindowContext);
}

export function TimeWindowProvider({
  initial = "24h",
  children,
}: {
  initial?: TimeWindowValue;
  children: React.ReactNode;
}) {
  const [timeWindow, setTimeWindowState] = useState<TimeWindowValue>(initial);

  const setTimeWindow = useCallback((w: TimeWindowValue) => {
    setTimeWindowState(w);
  }, []);

  const value = useMemo(
    () => ({
      timeWindow,
      setTimeWindow,
      windowMs: TIME_WINDOW_MS[timeWindow],
    }),
    [timeWindow, setTimeWindow],
  );

  return React.createElement(TimeWindowContext.Provider, { value }, children);
}
