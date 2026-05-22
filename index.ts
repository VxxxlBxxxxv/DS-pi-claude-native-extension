/**
 * pi-extension-iwe-claude-native
 *
 * Ф2: 10 command aliases (/day-open → /skill:day-open).
 * Ф3+: custom tools (Skill, Task, TodoWrite) — placeholders below, see CLAUDE.md.
 *
 * Pack source-of-truth: PACK-digital-platform (DP.SC.001, DP.ROLE.002).
 * Sibling adapter: DS-pi-claude-hooks-bridge (hooks via pi.on events; orthogonal).
 *
 * @see ~/IWE/DS-strategy/inbox/WP-47-iwe-claude-native-extension.md
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * IWE skills exposed as direct Pi commands (no /skill: prefix).
 *
 * Selection rule: skills used in daily flow (Day Open/Close, verify, archgate, ke,
 * wp-new, run-protocol, week/month-close, think). Rare skills (apply-captures,
 * audit-installation, iwe-update etc.) stay /skill:<name> — not aliased here to
 * keep the command surface small.
 *
 * Source-of-truth: ~/IWE/.claude/skills/ directory listing.
 */
const IWE_SKILL_ALIASES = [
	"day-open",
	"day-close",
	"week-close",
	"month-close",
	"run-protocol",
	"verify",
	"archgate",
	"ke",
	"wp-new",
	"think",
] as const;

type SkillAlias = (typeof IWE_SKILL_ALIASES)[number];

/**
 * Build a command handler that forwards `/alias args` to Pi's native
 * `/skill:alias args` via sendUserMessage. Pi's skill engine then resolves
 * the skill from one of the configured `skills` paths (~/IWE/.claude/skills
 * or ~/.claude/skills) and executes it.
 */
function makeSkillForwarder(pi: ExtensionAPI, alias: SkillAlias) {
	return async (args: string | undefined) => {
		const trimmed = args?.trim();
		const cmd = trimmed ? `/skill:${alias} ${trimmed}` : `/skill:${alias}`;
		await pi.sendUserMessage(cmd);
	};
}

/**
 * Regression check (smoke #8): if Pi runtime later ships native tools with
 * the names `Skill` / `Task` / `TodoWrite`, this extension must NOT register
 * conflicting tools. Detection is delegated to Ф3 — at Ф2 we only register
 * commands, no tools. This stub documents the intent.
 */
function detectNativeToolCollision(_pi: ExtensionAPI): {
	hasSkill: boolean;
	hasTask: boolean;
	hasTodoWrite: boolean;
} {
	// TODO Ф3: probe pi.getAllTools() (or equivalent) and return real flags.
	// At Ф2 there are no tool registrations, so collision is impossible.
	return { hasSkill: false, hasTask: false, hasTodoWrite: false };
}

export default function iweClaudeNative(pi: ExtensionAPI): void {
	// ============================================================
	// Ф2 — Command aliases (10)
	// ============================================================
	for (const alias of IWE_SKILL_ALIASES) {
		// Cast for forward-compat: registerCommand signature may evolve in Pi
		// (peerDependency is "*" by design). If the runtime rejects this shape,
		// smoke #1 will surface it as a load error rather than silent skip.
		(pi as unknown as {
			registerCommand: (
				name: string,
				spec: {
					description: string;
					handler: (args: string | undefined) => Promise<void>;
				},
			) => void;
		}).registerCommand(alias, {
			description: `IWE Claude-native alias for /skill:${alias}`,
			handler: makeSkillForwarder(pi, alias),
		});
	}

	// ============================================================
	// Ф3-Ф5 — Custom tools (Skill, Task, TodoWrite)
	// ============================================================
	// Placeholders kept here so the implementation lands in this same file
	// (per WP-47 plan). Carry W22.
	//
	// const collision = detectNativeToolCollision(pi);
	// const skillToolName = collision.hasSkill ? "iwe_skill" : "Skill";
	// pi.registerTool({ name: skillToolName, ... });   // Ф3 — sendUserMessage forwarder
	// pi.registerTool({ name: "Task", ... });          // Ф3 — `pi -p` headless subagent
	// pi.registerTool({ name: "TodoWrite", ... });     // Ф4 — appendEntry + ctx.ui.setWidget
	void detectNativeToolCollision; // silence unused-export warning until Ф3
}
