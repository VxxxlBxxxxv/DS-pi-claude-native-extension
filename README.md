# pi-extension-iwe-claude-native

Pi-extension providing Claude-native parity for the IWE (Intellectual Work Environment) running on Pi (`@earendil-works/pi-coding-agent`).

> **Status:** Ф2-Ф4 done (23.05.2026). Command aliases + `Skill` / `Task` / `TodoWrite` tools active. Ф5 complete (GitHub remote + DS-strategy sync).

## What it does

Pilots used to Claude Code expect `/day-open`, `/verify`, `/archgate` etc. without prefix. In Pi the native command form is `/skill:day-open`. This extension registers 10 IWE skill aliases as direct Pi commands, and provides `Skill`, `Task`, `TodoWrite` as model-callable tools.

**Aliases registered (10):**

`day-open`, `day-close`, `week-close`, `month-close`, `run-protocol`, `verify`, `archgate`, `ke`, `wp-new`, `think`.

(Other IWE skills remain accessible via `/skill:<name>` — less frequent in daily flow.)

**Custom tools (Ф3-Ф4):**

| Tool | What it does |
|------|-------------|
| `Skill(name, args?)` | Invokes an IWE skill as a follow-up user message |
| `Task(prompt, cwd?)` | Runs a headless Pi subagent (`pi --print --no-session`) for isolated work |
| `TodoWrite(todos[])` | Updates task list widget above editor + persists via appendEntry |

Tool names fall back to `iwe_skill` / `iwe_task` / `iwe_todo_write` if Pi ships native tools with the same names (collision detection via `getAllTools()` at startup).

## What it does NOT do

- Does not modify `.claude/` or FMT (separation principle: adapter lives in this repo only).
- Does not bridge hooks — that's `DS-pi-claude-hooks-bridge` (separate WP-38).
- Does not implement MCP — that's WP-48 (`pi-mcp-adapter` config conversion).
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
```

If smoke fails — check `pi --version` (requires ~0.74+) and `~/.pi/agent/settings.json.skills` is populated.

## Architecture (3 layers)

| Layer | What | Repo |
|-------|------|------|
| L1 — Configuration | `~/.pi/agent/settings.json` + `AGENTS.md → CLAUDE.md` symlinks | (no repo — config only) |
| L2 — Extension | Command aliases + custom tools | **this repo** |
| L3 — Hooks bridge | `.claude/settings.json` → Pi events | `DS-pi-claude-hooks-bridge` |

See `~/IWE/DS-strategy/inbox/research-pi-iwe-modules-data.md` for full Pi-IWE compatibility matrix.

## Upstream tracking

- Pi API surface (`pi.registerCommand`, `pi.registerTool`, `pi.sendUserMessage`) — confirmed in `@earendil-works/pi-coding-agent@~0.74`.
- If the API breaks (e.g. `registerCommand` renamed) — smoke #1 will fail; check Pi changelog and adapt.
- Regression smoke #8: if Pi adds native `Skill` / `Task` / `TodoWrite` tools, this extension MUST fall back to `iwe_skill` etc. to avoid name collision.

## License

MIT.
