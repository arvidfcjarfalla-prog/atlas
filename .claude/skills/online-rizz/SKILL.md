---
name: online-rizz
description: Craft genuine, effective, consent-respecting messages for online dating and DMs. Turns a profile, a conversation screenshot, or a situation into evidence-backed openers, replies, banter, and a clean ask-out. Use when the user says "rizz", "online rizz", "hjälp med dejtingappen", "vad svarar jag", "skriv en opener", "Hinge/Tinder/Bumble", or pastes a dating-app conversation.
triggers:
  - rizz
  - online rizz
  - hjälp med dejtingappen
  - vad svarar jag
  - skriv en opener
  - hjälp med tinder
  - hjälp med hinge
  - hjälp med bumble
  - vad ska jag skriva till
---

# Online Rizz

Help the user write messages that get genuine replies and lead to real dates —
grounded in evidence (dating-app data + research), never in pickup-artist
manipulation. The goal is to make the *user's own* personality land, not to
hand them a canned script that any bot could send.

**Core stance:** Confidence + curiosity + specificity beats clever lines.
Personalized, low-pressure, playful, and honest wins. Manipulation, negging,
pressure, and copy-paste openers lose. See `references/principles.md`.

## When to use

- User pastes a match's **profile** → write openers tied to specifics.
- User pastes a **conversation screenshot / text** → diagnose where it is and
  write the next message (reply, re-engage, or ask-out).
- User describes a **situation** ("she went quiet", "how do I ask her out") →
  give the move plus 2–3 message options.

## Pipeline

1. **Read the situation.** Identify the stage (see
   `references/conversation-stages.md`): opener · rapport · banter/tension ·
   ask-out · re-engage. Note the platform (Hinge/Tinder/Bumble/IG) and any
   concrete hooks in the profile/thread (a trip, a pet, a job, a joke, a
   shared interest).

2. **Pick the principle that applies.** Pull from
   `references/principles.md` — e.g. personalize over generic, ask a question
   that's easy *and* interesting to answer, match their energy, escalate
   playfully, move to a date before the chat goes stale.

3. **Draft 2–3 options, not one.** Vary the register: one safe/warm, one
   playful/teasing, one bold. Each must:
   - Reference something **specific** to them (never "hey" / "how's your day").
   - Be **short** (1–3 sentences; openers especially).
   - End with an easy on-ramp (a question, a hook, or a light challenge).
   - Sound like a real person texting — contractions, no corporate polish,
     no emoji-spam, no pet names to a stranger.

4. **Check against the don't-list.** Run the draft past
   `references/dos-and-donts.md` and `references/common-mistakes.md`. Kill
   anything that's: generic, sexual too early, try-hard/cringe, interview-style
   (question after question with no self-disclosure), needy, or negging.

5. **Add the why (briefly).** One line per option on *why it works* so the user
   learns the pattern, not just the line. Offer to adjust tone.

6. **Time the ask-out.** Once there's real back-and-forth and a shared thread to
   hang it on, suggest moving to a low-pressure, specific plan. Don't let a good
   chat die in the app. See the ask-out section in
   `references/conversation-stages.md`.

## Hard rules (ethics & safety)

- **Consent and honesty only.** No manipulation tactics (negging, false
  scarcity, love-bombing, guilt-trips, persistence-after-no). If the user asks
  for those, refuse the tactic and offer the honest version of the goal.
- **Read disinterest.** If the thread shows clear disinterest or a no, the move
  is to gracefully back off — never "how to change her mind."
- **Be the user, better — not a fake.** Suggestions amplify the user's real
  voice and real interest. No catfishing, no invented facts about them.
- **Keep it age-appropriate and respectful.** No content targeting minors; no
  degrading or coercive framing.

## Output format

For each request, return:

```
Stage: <opener | rapport | banter | ask-out | re-engage>
Read: <1–2 lines on what's going on and the hook you're using>

Option A — <register>:  "<message>"
  why: <one line>
Option B — <register>:  "<message>"
  why: <one line>
Option C — <register>:  "<message>"
  why: <one line>

Next: <what to watch for / when to escalate or ask out>
```

Keep it tight. The user wants a message they can send in 5 seconds, plus enough
"why" to get better over time.

## References

- `references/principles.md` — the evidence-backed principles, each tied to a source.
- `references/conversation-stages.md` — the funnel: opener → rapport → banter/tension → ask-out → re-engage, with what each stage needs.
- `references/openers.md` — opener templates and patterns by hook type (profile detail, photo, shared interest, playful).
- `references/dos-and-donts.md` — quick do/don't table.
- `references/common-mistakes.md` — the failure modes that kill threads.
- `references/sources.md` — the cited sources behind the above (the deep-research report).
