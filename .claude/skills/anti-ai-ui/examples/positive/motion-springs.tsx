// Spring configs for Framer Motion / Motion (React).
// Use springs for physical objects: drawers being dragged, toasts entering,
// cursor-tracked elements, cards reorder. Use cubic-beziers (easing-tokens.css)
// for chrome: fades, opacity, scale-on-press. Bounce > 0.3 reads as AI overdoing it.

// Stack-agnostic example. Swap the import to match your animation library:
//   import { motion } from "motion/react";   // Motion (the rebrand, v13+)
//   import { motion } from "framer-motion";  // Framer Motion (v10–v12)
// The spring config values below are identical across both.
import { motion } from "motion/react";
import type { ReactNode } from "react";

// Emil Kowalski — mouse-follow / cursor-tracked elements. Tight, no bounce.
export const emilFollow = { stiffness: 300, damping: 30, mass: 1 } as const;

// Sonner toast default — slightly softer, hint of bounce.
export const sonnerToast = { stiffness: 140, damping: 18, mass: 1 } as const;

// Apple-modern declarative spring. bounce in 0.1–0.3 is the taste-tier range.
export const appleSpring = { type: "spring", duration: 0.5, bounce: 0.2 } as const;

// Reorder / drag — slightly stiffer so dragged items feel anchored to the cursor.
export const dragReorder = { stiffness: 500, damping: 40, mass: 1 } as const;

// Vaul drawer — cubic-bezier, NOT spring. Sheets feel wrong with springs.
export const vaulDrawerEasing = [0.32, 0.72, 0, 1] as const;

export function FollowCursor({ x, y }: { x: number; y: number }) {
  return (
    <motion.div
      animate={{ x, y }}
      transition={{ type: "spring", ...emilFollow }}
      style={{ position: "fixed", pointerEvents: "none" }}
    />
  );
}

export function ToastEnter({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ type: "spring", ...sonnerToast }}
    >
      {children}
    </motion.div>
  );
}

// DO NOT EMIT:
// - `{ type: "spring" }` with no overrides — default bounce is too high.
// - `{ stiffness: 800+ }` — jittery, blocks the main thread on slow devices.
// - `{ bounce: 0.5+ }` — cartoonish, AI-tier.
// - Springs on fade/opacity — use cubic-bezier (--ease-ui) instead.
// - `transition={{ duration: 0.5 }}` with no easing — the Motion tutorial default,
//   the single most-recognised AI motion tell.
