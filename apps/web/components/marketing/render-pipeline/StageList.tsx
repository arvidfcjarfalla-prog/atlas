"use client";

import type { Stage, StageId } from "./stages";

type Props = {
  stages: Stage[];
  activeStage: StageId;
  onJump: (id: StageId) => void;
};

export function StageList({ stages, activeStage, onJump }: Props) {
  return (
    <nav className="arp-step-list" aria-label="Pipeline stages">
      {stages.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`arp-step-item${activeStage === s.id ? " arp-active" : ""}`}
          onClick={() => onJump(s.id)}
          aria-current={activeStage === s.id ? "step" : undefined}
        >
          <span className="arp-step-bullet" aria-hidden="true" />
          <span className="arp-step-num">{s.num}</span>
          <span className="arp-step-label">{s.label}</span>
        </button>
      ))}
    </nav>
  );
}
