# pi-extension-iwe-claude-native

Pi-extension providing Claude-native parity for the IWE (Intellectual Work Environment) running on Pi (`@earendil-works/pi-coding-agent`).

> **Status:** Ф2-Ф4 done (23.05.2026). Command aliases + `Skill` / `Task` / `TodoWrite` tools active. Ф5 complete (GitHub remote + DS-strategy sync). Regression fixes: central `/skill:*` expansion guard (31.05.2026); `Task` default fast verifier model + timeout diagnostics (02.06.2026).

## What it does

Pilots used to Claude Code expect `/day-open`, `/verify`, `/archgate` etc. without prefix. In Pi the native command form is `/skill:day-open`. This extension registers 10 IWE skill aliases as direct Pi commands, and provides `Skill`, `Task`, `TodoWrite` as model-callable tools.

**Aliases registered (10):**

`day-open`, `day-close`, `week-close`, `month-close`, `run-protocol`, `verify`, `archgate`, `ke`, `wp-new`, `think`.

(Other IWE skills remain accessible via `/skill:<name>` — less frequent in daily flow.)

**Custom tools (Ф3-Ф4):**

| Tool | What it does |
|------|-------------|
| `Skill(name, args?)` | Invokes an IWE skill as a follow-up user message |
| `Task(prompt, cwd?, model?, thinking?, timeoutSec?)` | Runs a headless Pi subagent (`pi --print --no-session`) for isolated work; defaults to `openai-codex/gpt-5.4-mini`, `minimal`, `55s` |
| `TodoWrite(todos[])` | Updates task list widget above editor + persists via appendEntry |

Tool names fall back to `iwe_skill` / `iwe_task` / `iwe_todo_write` if Pi ships native tools with the same names (collision detection via `getAllTools()` at startup).

**Task default:** `Task` uses `openai-codex/gpt-5.4-mini` + `minimal` by default, with a 55-second internal timeout. This keeps formal checklist verification from hanging on the global heavy default (`gpt-5.5` + `xhigh`). Callers can override `model`, `thinking`, and `timeoutSec`.

**Skill expansion guard:** Pi-native `/skill:<name>` commands are normally expanded before the model sees them. Extension-injected messages sent via `pi.sendUserMessage()` intentionally skip that expansion, so this extension centrally normalizes any `/skill:*` input by resolving the registered skill command dynamically (`pi.getCommands()`), reading its `SKILL.md`, and replacing the prompt with the expanded `<skill ...>` block. This covers current and future skills without maintaining a manual skill list.

## What it does NOT do

- Does not modify `.claude/` or FMT (separation principle: adapter lives in this repo only).
- Does not bridge hooks — that's `DS-pi-claude-hooks-bridge` (separate WP-38).
- ~~MCP config conversion~~ — WP-48 confirmed: Pi reads `.mcp.json` natively via `pi-mcp-adapter`. No converter needed.
- Does not provide `WebFetch`/`ScheduleWakeup`/`ExitPlanMode` — out of Pi-scope (external cron, Pi-skills, or not covered).

## Install (development, local)

```bash
# Clone next to your IWE workspace
git clone <repo-url> ~/IWE/DS-pi-claude-native-extension
cd ~/IWE/DS-pi-claude-native-extension

# Symlink into Pi extensions dir
mkdir -p ~/.pi/agent/extensions
ln -sfn ~/IWE/DS-pi-claude-native-extension ~/.pi/agent/extensions/iwe-claude-native

# Confirm in ~/.pi/agent/settings.json that "packages" includes the extension path
# (or use Pi's extension discovery mechanism — depends on Pi version)
```

Verify L1 baseline is in place first (`~/.pi/agent/settings.json`):

```json
{
  "defaultProvider": "openai-codex",
  "defaultModel": "gpt-5.5",
  "skills": [
    "/home/<user>/IWE/.claude/skills",
    "/home/<user>/.claude/skills"
  ],
  "enableSkillCommands": true
}
```

## Rollback

```bash
rm ~/.pi/agent/extensions/iwe-claude-native
```

After unlinking, `/day-open` reverts to "command not found" (or whatever Pi default behavior). `/skill:day-open` continues to work via Pi-native skill discovery.

## Smoke tests

After install, in `~/IWE/DS-strategy`:

```bash
pi
# In TUI:
/day-open
# Expected: skill executes (creates DayPlan, session log)

# Regression smoke: raw skill command must expand once, not loop through Skill tool
/skill:verify test
# Expected: model receives verify SKILL.md instructions; no repeated "Queued: /skill:verify test"

# Task smoke: headless subagent uses fast verifier default
# Ask the model to call: Task({prompt: "Reply exactly CHILD_OK and do not use tools"})
# Expected: CHILD_OK; details.model = openai-codex/gpt-5.4-mini; no opaque [pi subagent exit 1]
```

If smoke fails — check `pi --version` (requires ~0.74+) and `~/.pi/agent/settings.json.skills` is populated.

## Architecture (3 layers)

| Layer | What | Repo |
|-------|------|------|
| L1 — Configuration | `~/.pi/agent/settings.json` + `AGENTS.md → CLAUDE.md` symlinks | (no repo — config only) |
| L2 — Extension | Command aliases + custom tools | **this repo** |
| L3 — Hooks bridge | `.claude/settings.json` → Pi events | `DS-pi-claude-hooks-bridge` |

See `~/IWE/DS-strategy/inbox/research-pi-iwe-modules-data.md` for full Pi-IWE compatibility matrix.

## MCP in Pi (WP-48, completed)

Pi accesses IWE knowledge MCP (`iwe-knowledge`) out of the box — no manual config needed.

**How it works:**

1. `pi-mcp-adapter` (already in `settings.json → packages[]`) reads `~/IWE/.mcp.json` at startup
2. Discovers `iwe-knowledge` server (`https://mcp.aisystant.com/mcp`)
3. OAuth tokens stored at `~/.pi/agent/mcp-oauth/iwe-knowledge/tokens.json`
4. Tools available in Pi: `search`, `knowledge_concept_expand`, `knowledge_concept_search_by_name`, etc. (34 total)

**First-time OAuth setup (one-time):**

If tokens are missing or expired, Pi will prompt for OAuth. Alternatively, refresh manually:

```bash
# Refresh via MCP token endpoint (if refresh token is valid)
curl -s -X POST https://mcp.aisystant.com/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=$(jq -r '.tokens.refreshToken' ~/.pi/agent/mcp-oauth/iwe-knowledge/tokens.json)&client_id=gateway-mcp"
```

**Verified (2026-05-23):**

- Token refresh works via `https://mcp.aisystant.com/token`
- Search «WP Gate» returns relevant results
- `settings.json` has no conflict between WP-47 blocks and MCP config
- 34 tools cached in `mcp-cache.json`

## Upstream tracking

- Pi API surface (`pi.registerCommand`, `pi.registerTool`, `pi.sendUserMessage`) — confirmed in `@earendil-works/pi-coding-agent@~0.74`.
- If the API breaks (e.g. `registerCommand` renamed) — smoke #1 will fail; check Pi changelog and adapt.
- Regression smoke #8: if Pi adds native `Skill` / `Task` / `TodoWrite` tools, this extension MUST fall back to `iwe_skill` etc. to avoid name collision.

## License

MIT.
