# DS-pi-claude-native-extension — Инструкции для Claude Code

> **Тип репозитория:** `DS/instrument` (personal). Pi-расширение, не governance.
> **Pack source-of-truth:** `PACK-digital-platform` (DP.SC.001 IWE-on-Pi service clause, DP.ROLE.002 Pi-Runtime Adapter).

## Назначение

L2-расширение Pi-runtime для IWE: даёт Claude-native UX в Pi-TUI без модификации `.claude/` или FMT.

**Что покрывает (Ф2, с WP-81 — динамически):** command aliases (`/day-open` → `/skill:day-open`) для ВСЕХ обнаруженных навыков — перечисление через `pi.getCommands()` на session_start, коллизии имён пропускаются.

**Что покрывает (WP-80):** каталог агентов pi-subagents (`agents/*.md` — verifier R23, auditor VR.R.002), симлинк в `~/.pi/agent/agents`; расписания включены (`subagents.json`).

**Что покрывает (Ф3-Ф5, carry W22):** custom tools `Skill` / `Task` / `TodoWrite` через `pi.registerTool({...})` + `pi.sendUserMessage` / `pi -p` headless / `pi.appendEntry` + `ctx.ui.setWidget`.

## Связи (FPF-цепочка)

- **L1 baseline:** `~/.pi/agent/settings.json` (skills + enableSkillCommands + AGENTS symlinks). Без L1 этот extension не имеет смысла — skills должны быть загружены.
- **L3 bridge:** `DS-pi-claude-hooks-bridge` (hooks bridge через `pi.on(...)` события). Этот extension ортогонален — не пересекается по scope.
- **Upstream Pi API:** `@earendil-works/pi-coding-agent@~0.74` (peerDependency, `ExtensionAPI` types).
- **WP-context:** `DS-strategy/inbox/WP-47-iwe-claude-native-extension.md`.

## Структура

| Файл | Что |
|------|-----|
| `index.ts` | Основной extension — `export default function (pi: ExtensionAPI)` с 10 `registerCommand` (Ф2) и (Ф3+) `registerTool` × 3 |
| `package.json` | Pi манифест; `pi.extensions: ./index.ts`; peerDependency `@earendil-works/pi-coding-agent` (optional) |
| `README.md` | Описание для пользователя (что покрывает, откат, upstream tracking) |
| `WORKPLAN.md` | Текущие РП по этому репо (WP-47) |
| `.gitignore` | node_modules, dist, logs |

**Build step:** нет. Pi runtime грузит `.ts` напрямую (паттерн `DS-pi-claude-hooks-bridge`). При добавлении внешних deps в Ф3 — может понадобиться `tsconfig.json` + bundling.

## Правила

1. **Не дублировать bridge scope.** Этот extension = command aliases + tools. Hooks = bridge. Если кажется, что что-то на стыке — открыть отдельный РП и обсудить.
2. **Не модифицировать `.claude/` или FMT.** Адаптер живёт здесь. Если IWE требует изменений — это bug IWE или promotion в шаблон.
3. ~~IWE_SKILLS список~~ — устарело (WP-81): алиасы перечисляются динамически из `pi.getCommands()`, ручного списка нет. Новый skill получает алиас автоматически после перезапуска Pi.
4. **Regression smoke #8:** если Pi-нативный `Skill` / `Task` / `TodoWrite` появится upstream — extension должен падать с понятной ошибкой. Fallback к `iwe_skill` / `iwe_task` / `iwe_todo_write`.
5. **Pull-on-Touch** при первом обращении к репо за сессию.

## Smoke-tests (closed-loop, по WP-47)

| # | Тест | Метод | Ожидание |
|---|------|-------|----------|
| 1 | `pi` → `/day-open` (TUI) | ручной запуск | срабатывает как `/skill:day-open` — создаётся DayPlan |
| 2 | LLM вызывает `Skill('verify')` (Ф3) | transcript | tool call → sendUserMessage |
| 3 | `pi` → `Bash(...)` tool_call | hooks log | `wp-gate-reminder.sh` срабатывает (через bridge) |
| 4 | `pi -p "разбор inbox"` (Ф3 subagent) | exit code + output | hooks bridge активен в child |
| 5 | TodoWrite update (Ф4) | TUI визуально | виджет 3 todo |
| 6 | Compaction trigger | hook log | `PreCompact` через bridge |
| 7 | `/run-protocol close` | DS-strategy commit | closing protocol запускается, push выполняется |
| 8 | Tool name collision regression | `pi.getAllTools()` в Ф2 загрузке | Pi-нативный `Skill`/`Task`/`TodoWrite` появится → extension падает с понятной ошибкой; fallback `iwe_skill` |

**Ф2 scope сегодня:** smoke #1, #3, #7 (через Pi already в WP-50 verified для skills; здесь — alias resolution).

## Файлы из IWE-стека, на которые опирается extension

- `~/IWE/.claude/skills/` (path в `~/.pi/agent/settings.json → "skills"`)
- `~/.claude/skills/` (user-level skills)
- `~/IWE/{IWE-root,DS-strategy}/AGENTS.md → CLAUDE.md` symlinks (L1)
