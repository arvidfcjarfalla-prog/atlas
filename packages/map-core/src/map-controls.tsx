"use client";

import { useMap } from "./use-map";
import { Button } from "@atlas/ui";
import { Plus, Minus, Locate } from "lucide-react";

export function MapControls() {
  const { map } = useMap();

  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 bg-card/90 backdrop-blur-sm"
        onClick={() => map?.zoomIn()}
        aria-label="Zoom in"
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 bg-card/90 backdrop-blur-sm"
        onClick={() => map?.zoomOut()}
        aria-label="Zoom out"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 bg-card/90 backdrop-blur-sm"
        onClick={() => {
          navigator.geolocation?.getCurrentPosition((pos) => {
            map?.flyTo({
              center: [pos.coords.longitude, pos.coords.latitude],
              zoom: 8,
            });
          });
        }}
        aria-label="My location"
      >
        <Locate className="h-4 w-4" />
      </Button>
    </div>
  );
}
