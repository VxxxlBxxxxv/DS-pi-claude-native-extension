/**
 * pi-extension-iwe-claude-native
 *
 * Ф2: 10 command aliases (/day-open → /skill:day-open).
 * Ф3: Skill + Task tools (registerTool).
 * Ф4: TodoWrite tool (appendEntry + setWidget).
 *
 * Pack source-of-truth: PACK-digital-platform (DP.SC.001, DP.ROLE.002).
 * Sibling bridge: DS-pi-claude-hooks-bridge (hooks via pi.on; orthogonal).
 *
 * @see ~/IWE/DS-strategy/inbox/WP-47-pi-claude-native-extension.md
 */
import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ============================================================
// Ф2 — Command aliases (10)
// ============================================================

/**
 * IWE skills exposed as direct Pi commands (no /skill: prefix).
 *
 * Selection rule: skills used in daily flow (Day Open/Close, verify, archgate,
 * ke, wp-new, run-protocol, week/month-close, think). Rare skills stay /skill:<name>.
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

function makeSkillForwarder(pi: ExtensionAPI, alias: SkillAlias) {
	return async (args: string) => {
		const trimmed = args?.trim();
		const cmd = trimmed ? `/skill:${alias} ${trimmed}` : `/skill:${alias}`;
		await pi.sendUserMessage(cmd);
	};
}

// ============================================================
// Ф3-Ф4 — Tool parameter schemas (TypeBox)
// ============================================================

const SkillParams = Type.Object({
	name: Type.String({
		description: "Skill name (day-open, day-close, verify, ke, archgate, wp-new, think, run-protocol, week-close, month-close)",
	}),
	args: Type.Optional(Type.String({ description: "Optional arguments passed after the skill name" })),
});

const TaskParams = Type.Object({
	prompt: Type.String({ description: "Prompt for the headless Pi subagent (pi --print)" }),
	cwd: Type.Optional(Type.String({ description: "Working directory (defaults to current session cwd)" })),
});

const TodoItem = Type.Object({
	content: Type.String({ description: "Task description (imperative form)" }),
	status: Type.Union([
		Type.Literal("pending"),
		Type.Literal("in_progress"),
		Type.Literal("completed"),
	]),
	activeForm: Type.Optional(Type.String({ description: "Present-continuous form shown during execution" })),
});

const TodoWriteParams = Type.Object({
	todos: Type.Array(TodoItem, { description: "Full task list (replaces previous list)" }),
});

// ============================================================
// Ф3 — Task helper: spawn pi --print as headless subagent
// ============================================================

const STATUS_EMOJI = {
	pending: "⬜",
	in_progress: "🔄",
	completed: "✅",
} as const;

function todoWidget(todos: Array<{ content: string; status: string; activeForm?: string }>): string[] {
	if (todos.length === 0) return ["(no tasks)"];
	return todos.map((t) => {
		const emoji = STATUS_EMOJI[t.status as keyof typeof STATUS_EMOJI] ?? "⬜";
		const label = t.status === "in_progress" && t.activeForm ? t.activeForm : t.content;
		return `${emoji} ${label}`;
	});
}

async function runPiHeadless(
	prompt: string,
	cwd: string,
	signal: AbortSignal | undefined,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: { exitCode: number } }> {
	return new Promise((resolve) => {
		const child = spawn("bash", ["-lc", 'pi --print --no-session "$IWE_TASK_PROMPT"'], {
			cwd,
			env: { ...process.env, IWE_TASK_PROMPT: prompt },
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (d: Buffer) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d: Buffer) => {
			stderr += d.toString();
		});

		if (signal) {
			const onAbort = () => child.kill("SIGTERM");
			signal.addEventListener("abort", onAbort, { once: true });
			child.on("close", () => signal.removeEventListener("abort", onAbort));
		}

		child.on("error", (err) => {
			resolve({
				content: [{ type: "text", text: `[pi exec error: ${err.message}]` }],
				details: { exitCode: 1 },
			});
		});

		child.on("close", (code) => {
			const exitCode = code ?? 1;
			const out = stdout.trim();
			const err = stderr.trim();

			let text: string;
			if (exitCode !== 0) {
				text = `[pi subagent exit ${exitCode}]${err ? "\n" + err : ""}${out ? "\n" + out : ""}`;
			} else {
				text = out || `[pi subagent exit 0, no output]`;
			}

			resolve({
				content: [{ type: "text", text }],
				details: { exitCode },
			});
		});
	});
}

// ============================================================
// Extension entry point
// ============================================================

export default function iweClaudeNative(pi: ExtensionAPI): void {
	// Action methods (getAllTools, registerTool, registerCommand) cannot be called
	// during extension loading in Pi ≥0.76 — the runtime is not yet initialized.
	// All registration is deferred to session_start (fires on startup + reload).
	pi.on("session_start", (event, _ctx) => {
		if (event.reason !== "startup" && event.reason !== "reload") return;

	// --- Ф2: command aliases ---
	for (const alias of IWE_SKILL_ALIASES) {
		pi.registerCommand(alias, {
			description: `IWE Claude-native alias for /skill:${alias}`,
			handler: makeSkillForwarder(pi, alias),
		});
	}

	// --- Ф3-Ф4: collision detection (safe here: runtime is initialized) ---
	const existingNames = new Set(pi.getAllTools().map((t) => t.name));
	const skillName = existingNames.has("Skill") ? "iwe_skill" : "Skill";
	const taskName = existingNames.has("Task") ? "iwe_task" : "Task";
	const todoWriteName = existingNames.has("TodoWrite") ? "iwe_todo_write" : "TodoWrite";

	// --- Ф3: Skill tool ---
	pi.registerTool({
		name: skillName,
		label: "IWE Skill",
		description:
			"Invoke an IWE skill by name (day-open, day-close, verify, ke, archgate, wp-new, think, " +
			"run-protocol, week-close, month-close). Sends the skill as a follow-up user message.",
		promptSnippet: `${skillName}(name, args?) — invoke IWE skill`,
		promptGuidelines: [
			`Use ${skillName} instead of typing /skill:name manually.`,
			"Set args for skill arguments (e.g. args='close day' for run-protocol).",
		],
		parameters: SkillParams,
		execute: async (_id, params, _signal, _onUpdate, _ctx) => {
			const cmd = params.args?.trim()
				? `/skill:${params.name} ${params.args.trim()}`
				: `/skill:${params.name}`;
			pi.sendUserMessage(cmd, { deliverAs: "followUp" });
			return {
				content: [{ type: "text", text: `Queued: ${cmd}` }],
				details: {},
			};
		},
	});

	// --- Ф3: Task tool ---
	pi.registerTool({
		name: taskName,
		label: "IWE Task (subagent)",
		description:
			"Run a prompt as a headless Pi subagent (pi --print --no-session). " +
			"Use for isolated analysis, note-review, or background tasks that should not affect the current session.",
		promptSnippet: `${taskName}(prompt, cwd?) — headless Pi subagent`,
		promptGuidelines: [
			`Use ${taskName} for work that requires a fresh context (context isolation).`,
			"The subagent runs with all extensions loaded (hooks bridge active).",
		],
		parameters: TaskParams,
		execute: async (_id, params, signal, _onUpdate, ctx) => {
			return runPiHeadless(params.prompt, params.cwd ?? ctx.cwd, signal ?? undefined);
		},
	});

	// --- Ф4: TodoWrite tool ---
	pi.registerTool({
		name: todoWriteName,
		label: "IWE TodoWrite",
		description:
			"Update the session task list. Renders a status widget above the editor and " +
			"persists the list via appendEntry. Replaces the previous task list entirely.",
		promptSnippet: `${todoWriteName}(todos[]) — update task list`,
		promptGuidelines: [
			`Use ${todoWriteName} at the start of multi-step work and after completing each task.`,
			"Exactly one task should have status 'in_progress' at a time.",
			"Always provide the full list (pending + in_progress + completed), not just the changed item.",
		],
		parameters: TodoWriteParams,
		execute: async (_id, params, _signal, _onUpdate, ctx) => {
			const lines = todoWidget(params.todos);
			if (ctx.hasUI) {
				ctx.ui.setWidget("iwe-todo-list", lines, { placement: "aboveEditor" });
			}
			pi.appendEntry("iwe-todo-list", params.todos);

			const done = params.todos.filter((t) => t.status === "completed").length;
			const active = params.todos.filter((t) => t.status === "in_progress").length;
			const pending = params.todos.filter((t) => t.status === "pending").length;
			const summary = `${params.todos.length} tasks: ${done} done, ${active} in progress, ${pending} pending`;

			return {
				content: [{ type: "text", text: summary }],
				details: { total: params.todos.length, done, active, pending },
			};
		},
	});
	}); // end session_start
}
