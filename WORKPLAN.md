# WORKPLAN — DS-pi-claude-native-extension

> Hub-and-spoke entry для агрегации в DS-strategy WeekPlan.

## Активные РП

> Нет активных РП. WP-47 и WP-48 закрыты в W21.

## Завершённые РП

| # | Название | Статус | Закрыто | Артефакт |
|---|----------|--------|---------|----------|
| ~~WP-47~~ | ~~Pi-адаптер iwe-claude-native — Skill/Task/TodoWrite + 10 aliases~~ | ✅ done | 23.05 (W21, Ф0-Ф5 all done, ~3.5h) | этот репо + symlink `~/.pi/agent/extensions/iwe-claude-native` |
| ~~WP-48~~ | ~~MCP iwe-knowledge: Pi-adapter~~ | ✅ done | 23.05 (0.3h, 8× экономия — Pi читает .mcp.json нативно) | OAuth tokens refresh + README секция |

## Фазы WP-47 (все завершены)

| Фаза | h | Статус | Артефакт |
|------|---|--------|----------|
| Ф0 IntegrationGate (DP.SC.001 + DP.ROLE.002) | 0.5 | ✅ done 21.05 | PACK-digital-platform |
| Ф1 Config baseline (~/.pi/agent/settings.json + AGENTS symlinks) | 0.5 | ✅ done 21.05 | settings.json + symlinks |
| Ф2 Extension scaffold + 10 aliases | 1.5 | ✅ done 22.05 | этот репо `index.ts` + symlink |
| Ф3 Skill + Task tools | 1.0 | ✅ done 23.05 | tools раздел index.ts (pi.registerTool) |
| Ф4 TodoWrite tool | 0.5 | ✅ done 23.05 | tools раздел index.ts |
| Ф5 README + commit + Strategy.md R6 entry | 0.5 | ✅ done 23.05 | README + DS-strategy R6 обновлён |

## Связанные репо

- `DS-strategy` — governance, WP-47 context: `inbox/WP-47-iwe-claude-native-extension.md`
- `DS-pi-claude-hooks-bridge` — sibling adapter (hooks), ортогональный по scope
- `PACK-digital-platform` — Pack source-of-truth (DP.SC.001, DP.ROLE.002)

## Upstream

- Pi API: [`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi-coding-agent) (~0.74)
- Reference extension pattern: `DS-pi-claude-hooks-bridge`
