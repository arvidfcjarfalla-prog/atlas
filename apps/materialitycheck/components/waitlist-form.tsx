"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("submitting");
    // No backend yet — defer to first cohort outreach. Keep client-side only.
    window.setTimeout(() => setStatus("done"), 600);
  }

  if (status === "done") {
    return (
      <div className="font-serif">
        <p className="text-xl md:text-2xl text-ink leading-snug">
          Tack <span className="italic text-clay">—</span> vi hör av oss när nästa kohort öppnar.
        </p>
        <p className="mt-3 marginalia not-italic">
          Bekräftelse landar i <span className="font-mono">{email}</span>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-x-5 gap-y-5">
        <div className="sm:col-span-3">
          <label className="label block mb-2">E-post</label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="namn@bolaget.se"
            autoComplete="email"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label block mb-2">Roll</label>
          <Input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="t.ex. miljöansvarig"
          />
        </div>
      </div>
      <Button
        type="submit"
        size="lg"
        disabled={status === "submitting"}
        className="w-full sm:w-auto"
      >
        {status === "submitting" ? "Skickar…" : "Anmäl intresse"}
        <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
      </Button>
    </form>
  );
}
