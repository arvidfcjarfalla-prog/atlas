# Security notes for anti-ai-ui

## 1. `~/.claude` plaintext

Project memory, transcripts, and session state are stored as plaintext under `~/.claude/`. Anyone with filesystem access to the user's machine can read them.

**Mitigations:**

- Set `cleanupPeriodDays: 7` (or shorter) in user-level `~/.claude/settings.json` to auto-prune transcripts.
- Never paste secrets, API keys, or production credentials into prompts.
- For repos with PII, set `permissions.deny` for sensitive paths in `.claude/settings.json`.

## 2. MCP trust model

MCP servers run as subprocesses with the same privileges as Claude Code. Anti-ai-ui uses two MCP servers:

- `shadcn` — official npx package, low risk.
- `registry-directory` — built from source (https://github.com/Microck/registry-directory-mcp). Audit before use in a sensitive environment.

To restrict accidental MCP attachments, set `allowManagedMcpServersOnly: true` in user-level settings. This blocks community/local MCPs unless explicitly approved.

## 3. Hook scripts

The skill's scripts live in `.claude/skills/anti-ai-ui/scripts/` and are invoked by the Stop-hook. They:

- Read from `${CLAUDE_SKILL_DIR}/tells.json` via `jq`.
- Read project files via `git diff`.
- Never write outside `tmp/` or `.claude/`.
- Never make network calls.

Audit the scripts before extending them.

## 4. PII considerations per repo

- **atlas** — contains user prompt traces and possibly map data. Verify what is in `.claude/learned-rules.md` and `output/` before sharing the repo.
- **liftcalc** — no PII at time of writing. Bootstrap fresh `.claude/` is safe.

## 5. What the design-critic does **not** read

The design-critic agent has `memory: project` — it persists notes between sessions in `~/.claude/projects/<project-hash>/`. Do not put secrets into agent feedback loops.
