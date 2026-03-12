"use client";

import { createContext, useContext } from "react";
import type { MapContextValue } from "./types";

export const MapContext = createContext<MapContextValue>({
  map: null,
  isReady: false,
});

/** Access the shared MapLibre instance. */
export function useMap(): MapContextValue {
  return useContext(MapContext);
}
