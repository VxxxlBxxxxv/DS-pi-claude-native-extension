# WORKPLAN — DS-pi-claude-native-extension

> Hub-and-spoke entry для агрегации в DS-strategy WeekPlan.

## Активные РП

| # | Название | Статус | Фаза | Артефакт |
|---|----------|--------|------|----------|
| WP-47 | Pi-адаптер iwe-claude-native — Skill/Task/TodoWrite + 10 aliases | 🔄 in_progress | Ф2 scaffold (22.05 Пт), Ф3-Ф5 carry W22 | этот репо + symlink `~/.pi/agent/extensions/iwe-claude-native` |

## Фазы WP-47

| Фаза | h | Статус | Артефакт |
|------|---|--------|----------|
| Ф0 IntegrationGate (DP.SC.001 + DP.ROLE.002) | 0.5 | ✅ done 21.05 | PACK-digital-platform |
| Ф1 Config baseline (~/.pi/agent/settings.json + AGENTS symlinks) | 0.5 | ✅ done 21.05 | settings.json + symlinks |
| Ф2 Extension scaffold + 10 aliases | 1.5 | 🔄 in_progress 22.05 | этот репо `index.ts` + symlink |
| Ф3 Skill + Task tools | 1.0 | ⏳ carry W22 | tools раздел index.ts |
| Ф4 TodoWrite tool | 0.5 | ⏳ carry W22 | tools раздел index.ts |
| Ф5 README + commit + Strategy.md R6 entry | 0.5 | ⏳ carry W22 | README + DS-strategy commit |

## Связанные репо

- `DS-strategy` — governance, WP-47 context: `inbox/WP-47-iwe-claude-native-extension.md`
- `DS-pi-claude-hooks-bridge` — sibling adapter (hooks), ортогональный по scope
- `PACK-digital-platform` — Pack source-of-truth (DP.SC.001, DP.ROLE.002)

## Upstream

- Pi API: [`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi-coding-agent) (~0.74)
- Reference extension pattern: `DS-pi-claude-hooks-bridge`
