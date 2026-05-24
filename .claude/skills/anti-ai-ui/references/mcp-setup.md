# MCP setup

The anti-ai-ui flow uses two MCP servers. **Includes:** shadcn (frontend-engineer) + registry-directory (ux-architect). **Excludes:** 21st.dev Magic MCP.

## 1. shadcn MCP

Verified via `npx shadcn@latest mcp init --client claude`. Generates this exact `.mcp.json`:

```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

### 7 tools (from source `packages/shadcn/src/mcp/index.ts`)

1. `get_project_registries` — registry names from `components.json`.
2. `list_items_in_registries` — pagination (`registries[]`, `limit?`, `offset?`).
3. `search_items_in_registries` — fuzzy search (`registries[]`, `query`, `limit?`, `offset?`).
4. `view_items_in_registries` — full detail (`items[]`).
5. `get_item_examples_from_registries` — usage examples (`registries[]`, `query`).
6. `get_add_command_for_items` — CLI command to paste (`items[]`).
7. `get_audit_checklist` — built-in verification checklist.

Tool 7 is directly relevant to the design-critic — it returns a standardised checklist after component creation. The frontend-design-engineer should call it after every `npx shadcn add`.

## 2. registry-directory MCP

```json
{
  "mcpServers": {
    "registry-directory": {
      "command": "node",
      "args": ["/path/to/registry-directory-mcp/dist/index.js"]
    }
  }
}
```

Requires building from source:

```bash
git clone https://github.com/Microck/registry-directory-mcp
cd registry-directory-mcp
npm install
npm run build
```

### 6 tools

- `search_registries`
- `search_components`
- `get_registry_index`
- `get_categories`
- `recommend_best_components`
- `get_component_details`

### Risk in web-only / remote container

The source build is fragile in remote containers. **Fallback:** hard-code registry URLs in `references/registries.md` (not present in this skill yet — create when needed) instead of running the MCP server.

## 3. What the agent frontmatter looks like

In `.claude/agents/frontend-design-engineer.md`:

```yaml
mcpServers:
  - shadcn
```

In `.claude/agents/ux-architect.md`:

```yaml
mcpServers:
  - registry-directory
```

The MCP entries themselves live in the project's `.mcp.json` at the repo root.
