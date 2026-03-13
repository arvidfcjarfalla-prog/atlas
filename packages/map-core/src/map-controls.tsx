"use client";

import { useMap } from "./use-map";
import { Button } from "@atlas/ui";
import { Plus, Minus, Locate } from "lucide-react";

const controlBtn =
  "h-8 w-8 bg-card border-border shadow-sm hover:bg-accent transition-colors duration-fast group";

export function MapControls() {
  const { map } = useMap();

  return (
    <div className="absolute bottom-6 right-4 z-controls flex flex-col gap-0.5">
      <Button
        variant="outline"
        size="icon"
        className={controlBtn}
        onClick={() => map?.zoomIn()}
        aria-label="Zoom in"
      >
        <Plus className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors duration-fast" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className={controlBtn}
        onClick={() => map?.zoomOut()}
        aria-label="Zoom out"
      >
        <Minus className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors duration-fast" />
      </Button>
      <div className="h-1.5" />
      <Button
        variant="outline"
        size="icon"
        className={controlBtn}
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
        <Locate className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors duration-fast" />
      </Button>
    </div>
  );
}
