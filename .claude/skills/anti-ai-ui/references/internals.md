# Claude Code internals — what the anti-ai-ui skill depends on

CLI version 2.1.150 reality, empirically verified. These are non-obvious facts that drive the file structure.

## 1. `paths:` vs `globs:`

- `paths:` MUST be a YAML list: `paths: [src/**/*.tsx, src/**/*.css]`. Comma-separated string silently breaks discovery (Issue #49835).
- `globs:` does **not** exist in CLI 2.1.150. References to it in older docs are an artifact.
- Atlas's pre-existing rules use `globs:` — they are out of scope for this skill, don't modify them. The six new `anti-ai-ui-*.md` rules use `paths:`.

## 2. Skill frontmatter fields

| Field | Use |
|---|---|
| `name` | filename → directory |
| `description` + `when_to_use` | combined under 1,536 chars; trigger phrase first in description |
| `disable-model-invocation: true` | `/critique-ui`, `/anti-ai-review` — manual-only |
| `user-invocable: false` | hook-only skills |
| `allowed-tools` | space-sep or YAML-list |
| `paths` | path-scoping (YAML-list only) |
| `context: fork` | run in isolated subagent context |
| `agent: <name>` | choose the subagent for context-fork |
| `hooks` | skill-scoped hooks |
| `model` / `effort` | per-skill override |
| `arguments` + `$0` / `$1` / `$ARGUMENTS` | named / positional args |
| `argument-hint` | autocomplete hint |

## 3. Subagent frontmatter fields

| Field | Use |
|---|---|
| `name`, `description` | required |
| `tools` (comma-sep) | allowlist |
| `disallowedTools` (comma-sep) | denylist (applied before `tools`) |
| `model` | `sonnet` / `opus` / `haiku` / full ID / `inherit` |
| `permissionMode` | `default` / `acceptEdits` / `auto` / `dontAsk` / `bypassPermissions` / `plan` |
| `maxTurns` | hang-prevention |
| `skills` (preload) | injects skill content into subagent start context |
| `mcpServers` | YAML-list of strings or inline `.mcp.json` shape |
| `hooks` | subagent-scoped hooks (PreToolUse / PostToolUse / Stop) |
| `memory` | `user` / `project` / `local` — persistent memory |
| `isolation: worktree` | runs in temp git worktree |
| `effort` | low / medium / high / xhigh / max |
| `color` | UI color in transcript |

Subagents **cannot** spawn other subagents. Orchestration runs in main thread or via `context: fork` skills with named `agent:`.

Plugin-distributed subagents ignore `hooks`, `mcpServers`, `permissionMode`. Not relevant here — anti-ai-ui is not distributed as a plugin.

## 4. Agent-hook spec

```json
{
  "type": "agent",
  "prompt": "Verify that <criteria>. $ARGUMENTS",
  "timeout": 120,
  "model": "haiku"
}
```

- Spawns an ephemeral subagent with default tools (Read, Grep, Glob, Bash).
- Max 50 turns.
- `$ARGUMENTS` is replaced with hook-event JSON.
- Returns `{ "ok": true }` (allow) or `{ "ok": false, "reason": "..." }` (block).
- The prompt is inline — it does **not** reference `.claude/agents/<name>.md`. The personality must live in the prompt string.

Docs: *"Agent hooks are experimental. Behavior and configuration may change in future releases. For production workflows, prefer command hooks."*

Anti-ai-ui uses `type: "command"` calling `.claude/hooks/design-critic.sh` for the Stop-hook gate. The agent-hook variant is documented in `design-critic-prompt.md` as a fallback.

## 5. Hook decision-control and exit codes

| Event | Decision pattern | Key fields |
|---|---|---|
| Stop, SubagentStop | top-level `decision` | `decision: "block"`, `reason` |
| PreToolUse | `hookSpecificOutput` | `permissionDecision` (allow / deny / ask / defer) |
| UserPromptSubmit, PostToolUse, PreCompact | top-level `decision` | `decision: "block"`, `reason` |
| SessionStart, SubagentStart | context only | `hookSpecificOutput.additionalContext` |

Exit codes:

| Code | Behavior |
|---|---|
| 0 | Success. Stdout parsed as JSON output. |
| 2 | Blocking. Stdout ignored. Stderr fed back to Claude as error. Blocks event. |
| other | Non-blocking error. Transcript shows hook error notice. |

A Stop-hook returning exit 2 → "Prevents Claude from stopping, continues the conversation".

## 6. `stop_hook_active` recursion guard

Undocumented in current docs but used by atlas's own `stop-checkpoint.sh`:

```bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi
```

All Stop-hooks must do this first to avoid infinite loops. Anti-ai-ui's `design-critic.sh` follows this pattern.

## 7. Issue #23478 — path-based rules don't trigger on Write/Edit

Path-scoped rules trigger only on `Read`, not on `Write` / `Edit`. Confirmed bug, closed not-planned.

**Workaround:** PostToolUse hook with `matcher: Write|Edit` that forces a `Read`-equivalent after every write. Anti-ai-ui's `post-write-rules-loader.sh` does `head -200` on the just-written file as a side effect, which causes the rules pathway to trigger.

## 8. Other CLI 2.1.150 specifics

- `${CLAUDE_SKILL_DIR}` env var is available in bash blocks for path-independent script refs.
- `description` + `when_to_use` truncated at 1,536 chars combined — keep the trigger phrase first.
- Project `.claude/skills/` completely shadows global `~/.claude/skills/` (Issue #44207). This is why liftcalc must be bootstrapped with the complete skill set.
- Prettier with `proseWrap: always` wraps `description:` across multiple YAML lines and makes the skill silently invisible — the `.prettierignore` entry is mandatory.
- Skills **cannot** explicitly invoke other skills. Claude orchestrates. Never write "Use /other-skill" inside SKILL.md.
- Subagents cannot spawn subagents. Orchestration runs in main thread or via `context: fork` skills with named `agent:`.
- Skill-scoped hooks in frontmatter work outside plugins.
