"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface PromptInputProps {
  size: "large" | "compact";
  placeholder?: string;
}

export function PromptInput({
  size,
  placeholder = "GDP per capita in Europe...",
}: PromptInputProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  const clearTypewriter = useCallback(() => {
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
  }, []);

  const submit = useCallback(
    (text?: string) => {
      const trimmed = (text ?? value).trim();
      if (!trimmed) return;
      router.push(`/app/map/new?prompt=${encodeURIComponent(trimmed)}`);
    },
    [value, router],
  );

  const typeText = useCallback(
    (text: string) => {
      clearTypewriter();
      let i = 0;
      setValue("");
      typewriterRef.current = setInterval(() => {
        i++;
        setValue(text.slice(0, i));
        if (i >= text.length) {
          clearTypewriter();
          setTimeout(() => submit(text), 500);
        }
      }, 36);
    },
    [clearTypewriter, submit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        clearTypewriter();
        submit();
      }
    },
    [clearTypewriter, submit],
  );

  const isLarge = size === "large";
  const hasInput = value.trim().length > 0;

  return (
    <div className={isLarge ? "w-full max-w-[560px]" : "w-full max-w-[480px] mx-auto"}>
      <div
        className="relative flex items-center transition-[border-color,box-shadow] duration-200"
        style={{
          height: isLarge ? 60 : 52,
          background: "rgba(10,13,20,0.60)",
          border: focused
            ? "1px solid rgba(255,255,255,0.18)"
            : "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16,
          backdropFilter: "blur(16px)",
          boxShadow: focused ? "0 0 0 3px hsla(197,62%,45%,0.25)" : "none",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            clearTypewriter();
            setValue(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          aria-label="Describe a map"
          className="flex-1 h-full bg-transparent outline-none font-geist text-[16px] font-normal"
          style={{
            color: "rgba(248,249,251,0.90)",
            paddingLeft: 22,
            paddingRight: 56,
          }}
        />
        <button
          type="button"
          onClick={() => {
            clearTypewriter();
            submit();
          }}
          aria-label="Generate map"
          className="absolute right-[10px] flex items-center justify-center rounded-xl transition-[background,transform] duration-150"
          style={{
            width: 38,
            height: 38,
            background: "hsl(197,62%,38%)",
            cursor: hasInput ? "pointer" : "default",
            opacity: hasInput ? 1 : 0.4,
          }}
          onMouseEnter={(e) => {
            if (hasInput)
              e.currentTarget.style.background = "hsl(197,62%,44%)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "hsl(197,62%,38%)";
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>

      {/* Expose typeText for chip clicks */}
      <PromptInputChipsSlot typeText={typeText} size={size} />
    </div>
  );
}

const CHIPS = [
  "Unemployment in Europe",
  "Hotels in Paris",
  "CO₂ emissions",
  "Live flights",
];

function PromptInputChipsSlot({
  typeText,
  size,
}: {
  typeText: (t: string) => void;
  size: "large" | "compact";
}) {
  if (size !== "large") return null;

  return (
    <div className="flex flex-wrap justify-center gap-2 mt-4">
      {CHIPS.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => typeText(chip)}
          className="font-geist-mono text-[11px] font-normal tracking-[0.02em] transition-all duration-150 cursor-pointer"
          style={{
            color: "rgba(248,249,251,0.25)",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding: "7px 14px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "rgba(248,249,251,0.50)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
            e.currentTarget.style.background = "rgba(255,255,255,0.03)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(248,249,251,0.25)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
