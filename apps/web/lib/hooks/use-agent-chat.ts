"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { MapManifest } from "@atlas/data-models";
import type { DatasetProfile } from "../ai/types";

// ─── Types ──────────────────────────────────────────────────

export interface ToolCallInfo {
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "done" | "error";
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
}

interface UseAgentChatOptions {
  manifest: MapManifest;
  dataProfile?: DatasetProfile | null;
  onManifestUpdate: (manifest: MapManifest, dataUrl?: string) => void;
  /** Seed messages restored from persistence. Skips the default greeting if provided. */
  initialMessages?: AgentMessage[];
}

interface UseAgentChatResult {
  messages: AgentMessage[];
  sendMessage: (text: string) => void;
  isStreaming: boolean;
  abortStream: () => void;
}

// ─── SSE event parsing ──────────────────────────────────────

interface SSEEvent {
  event: string;
  data: string;
}

function parseSSEChunk(chunk: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = chunk.split("\n\n").filter(Boolean);
  for (const block of blocks) {
    let event = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (event && data) events.push({ event, data });
  }
  return events;
}

// ─── Tool display names ─────────────────────────────────────

const TOOL_LABELS: Record<string, { pending: string; done: string }> = {
  search_data: { pending: "Söker data…", done: "Data hittad" },
  search_poi: { pending: "Söker platser…", done: "Platser hittade" },
  search_web: { pending: "Söker på webben…", done: "Data hittad" },
  fetch_url: { pending: "Hämtar URL…", done: "URL hämtad" },
  parse_dataset: { pending: "Analyserar data…", done: "Data analyserad" },
  update_manifest: { pending: "Uppdaterar karta…", done: "Karta uppdaterad" },
};

// ─── Hook ───────────────────────────────────────────────────

const DEFAULT_GREETING: AgentMessage = {
  role: "assistant",
  content: "Kartan är redo! Beskriv vad du vill ändra — färger, zoom, data, lager, etc.",
};

export function useAgentChat({
  manifest,
  dataProfile,
  onManifestUpdate,
  initialMessages,
}: UseAgentChatOptions): UseAgentChatResult {
  const [messages, setMessages] = useState<AgentMessage[]>(
    initialMessages && initialMessages.length > 0 ? initialMessages : [DEFAULT_GREETING],
  );
  const initializedRef = useRef(
    !!(initialMessages && initialMessages.length > 0),
  );

  // Sync initialMessages when restored after mount (e.g. async fetch)
  useEffect(() => {
    if (!initializedRef.current && initialMessages && initialMessages.length > 0) {
      initializedRef.current = true;
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;

  const abortStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const msg = text.trim();
      if (!msg || isStreaming) return;

      const userMsg: AgentMessage = { role: "user", content: msg };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // Build chat history from existing messages + current user message
      const chatHistory = [...messages, userMsg]
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manifest: manifestRef.current,
            message: msg,
            chatHistory,
            dataProfile: dataProfile ?? undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let assistantContent = "";
        let currentToolCalls: ToolCallInfo[] = [];
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse complete SSE events from buffer
          const lastDoubleNewline = buffer.lastIndexOf("\n\n");
          if (lastDoubleNewline === -1) continue;

          const complete = buffer.slice(0, lastDoubleNewline + 2);
          buffer = buffer.slice(lastDoubleNewline + 2);
          const events = parseSSEChunk(complete);

          for (const sse of events) {
            try {
              const data = JSON.parse(sse.data);

              switch (sse.event) {
                case "text-delta":
                  assistantContent += data.text;
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant" && last === prev[prev.length - 1]) {
                      const updated = [...prev];
                      updated[updated.length - 1] = {
                        ...last,
                        content: assistantContent,
                        toolCalls: currentToolCalls.length > 0 ? [...currentToolCalls] : undefined,
                      };
                      return updated;
                    }
                    return [
                      ...prev,
                      {
                        role: "assistant",
                        content: assistantContent,
                        toolCalls: currentToolCalls.length > 0 ? [...currentToolCalls] : undefined,
                      },
                    ];
                  });
                  break;

                case "tool-call": {
                  const tc: ToolCallInfo = {
                    toolName: data.toolName,
                    args: data.args,
                    status: "pending",
                  };
                  currentToolCalls = [...currentToolCalls, tc];

                  // Ensure assistant message exists for tool calls even before text
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                      const updated = [...prev];
                      updated[updated.length - 1] = {
                        ...last,
                        content: assistantContent,
                        toolCalls: [...currentToolCalls],
                      };
                      return updated;
                    }
                    return [
                      ...prev,
                      {
                        role: "assistant",
                        content: assistantContent,
                        toolCalls: [...currentToolCalls],
                      },
                    ];
                  });
                  break;
                }

                case "tool-result": {
                  currentToolCalls = currentToolCalls.map((tc) =>
                    tc.toolName === data.toolName && tc.status === "pending"
                      ? { ...tc, result: data.result, status: "done" as const }
                      : tc,
                  );
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === "assistant") {
                      updated[updated.length - 1] = {
                        ...last,
                        toolCalls: [...currentToolCalls],
                      };
                    }
                    return updated;
                  });
                  break;
                }

                case "manifest-update":
                  if (data.manifest) {
                    onManifestUpdate(data.manifest, data.dataUrl);
                  }
                  break;

                case "error":
                  assistantContent += `\n\nFel: ${data.message}`;
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === "assistant") {
                      updated[updated.length - 1] = { ...last, content: assistantContent };
                    }
                    return updated;
                  });
                  break;

                case "done":
                  break;
              }
            } catch {
              // Ignore malformed SSE data
            }
          }
        }

        // Ensure final message is present
        if (assistantContent || currentToolCalls.length > 0) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...last,
                content: assistantContent || "Klart.",
                toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
              };
              return updated;
            }
            return [
              ...prev,
              {
                role: "assistant",
                content: assistantContent || "Klart.",
                toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
              },
            ];
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User aborted — keep partial content
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Något gick fel. Försök igen." },
          ]);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, messages, dataProfile, onManifestUpdate],
  );

  return { messages, sendMessage, isStreaming, abortStream };
}

export { TOOL_LABELS };
