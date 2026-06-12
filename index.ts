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
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ============================================================
// Ф2 — Command aliases (dynamic, WP-81)
// ============================================================

/**
 * Every discovered Pi skill command (source === "skill") gets a direct alias
 * (/day-open → /skill:day-open). Enumerated at session_start via pi.getCommands(),
 * so new skills are covered without maintaining a manual list. Aliases that would
 * collide with an existing command name are skipped.
 */
function makeSkillForwarder(pi: ExtensionAPI, alias: string) {
	return async (args: string) => {
		const trimmed = args?.trim();
		const cmd = trimmed ? `/skill:${alias} ${trimmed}` : `/skill:${alias}`;
		await pi.sendUserMessage(cmd);
	};
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function escapeXmlAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function expandSkillCommand(pi: ExtensionAPI, text: string): string | null {
	const match = text.trimStart().match(/^\/skill:([a-z0-9-]+)(?:\s+([\s\S]*))?$/);
	if (!match) return null;

	const [, skillName, rawArgs] = match;
	const commandName = `skill:${skillName}`;
	const command = pi
		.getCommands()
		.find((cmd) => cmd.source === "skill" && (cmd.name === commandName || cmd.name === skillName));
	if (!command) return null;

	const skillPath = command.sourceInfo.path;
	const skillDir = command.sourceInfo.baseDir ?? dirname(skillPath);

	try {
		const body = stripFrontmatter(readFileSync(skillPath, "utf-8")).trim();
		const skillBlock = `<skill name="${escapeXmlAttr(skillName)}" location="${escapeXmlAttr(skillPath)}">\nReferences are relative to ${skillDir}.\n\n${body}\n</skill>`;
		const args = rawArgs?.trim();
		return args ? `${skillBlock}\n\n${args}` : skillBlock;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return `[IWE skill expansion error: failed to read ${skillPath}: ${message}]`;
	}
}

// ============================================================
// Ф3-Ф4 — Tool parameter schemas (TypeBox)
// ============================================================

const SkillParams = Type.Object({
	name: Type.String({
		description: "IWE skill name (e.g. day-open, day-close, verify, ke, archgate, wp-new, think, run-protocol, week-close, month-close — any skill discovered from the configured skill directories)",
	}),
	args: Type.Optional(Type.String({ description: "Optional arguments passed after the skill name" })),
});

const AskUserQuestionParams = Type.Object({
	question: Type.String({ description: "The complete question to ask the user, ending with a question mark" }),
	options: Type.Array(
		Type.Object({
			label: Type.String({ description: "Concise display text for this choice (1-5 words)" }),
			description: Type.Optional(Type.String({ description: "What this option means or implies" })),
		}),
		{ description: "2-4 distinct, mutually exclusive choices. An 'Other' free-text option is added automatically." },
	),
});

const DEFAULT_TASK_MODEL = "openai-codex/gpt-5.4-mini";
const DEFAULT_TASK_THINKING = "minimal";
const DEFAULT_TASK_TIMEOUT_SEC = 55;

const TaskParams = Type.Object({
	prompt: Type.String({ description: "Prompt for the headless Pi subagent (pi --print)" }),
	cwd: Type.Optional(Type.String({ description: "Working directory (defaults to current session cwd)" })),
	model: Type.Optional(Type.String({ description: `Model for headless Pi (default: ${DEFAULT_TASK_MODEL})` })),
	thinking: Type.Optional(Type.String({ description: `Thinking level (default: ${DEFAULT_TASK_THINKING})` })),
	timeoutSec: Type.Optional(Type.Number({ description: `Timeout in seconds (default: ${DEFAULT_TASK_TIMEOUT_SEC})` })),
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
	options: { model?: string; thinking?: string; timeoutSec?: number } = {},
): Promise<{
	content: Array<{ type: "text"; text: string }>;
	details: { exitCode: number; model: string; thinking: string; timeoutSec: number; timedOut: boolean; aborted: boolean };
}> {
	return new Promise((resolve) => {
		const model = options.model?.trim() || DEFAULT_TASK_MODEL;
		const thinking = options.thinking?.trim() || DEFAULT_TASK_THINKING;
		const timeoutSec = Number.isFinite(options.timeoutSec) && (options.timeoutSec ?? 0) > 0
			? Math.floor(options.timeoutSec as number)
			: DEFAULT_TASK_TIMEOUT_SEC;
		const args = ["--print", "--no-session", "--model", model, "--thinking", thinking, prompt];
		const child = spawn("pi", args, {
			cwd,
			env: { ...process.env },
			// Without closing stdin, nested `pi --print` waits for interactive input
			// forever when launched through Node's default pipe stdin.
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let settled = false;
		let timedOut = false;
		let aborted = false;
		let timeout: NodeJS.Timeout | undefined;
		let killTimer: NodeJS.Timeout | undefined;

		const onAbort = () => {
			aborted = true;
			killChild();
		};

		const cleanup = () => {
			if (timeout) clearTimeout(timeout);
			if (killTimer) clearTimeout(killTimer);
			if (signal) signal.removeEventListener("abort", onAbort);
		};

		const finalize = (exitCode: number, prefix?: string) => {
			if (settled) return;
			settled = true;
			cleanup();

			const out = stdout.trim();
			const err = stderr.trim();
			let text: string;
			if (prefix) {
				text = `${prefix}${err ? "\nSTDERR:\n" + err : ""}${out ? "\nSTDOUT:\n" + out : ""}`;
			} else if (exitCode !== 0) {
				text = `[pi subagent exit ${exitCode}]${err ? "\n" + err : ""}${out ? "\n" + out : ""}`;
			} else {
				text = out || `[pi subagent exit 0, no output]`;
			}

			resolve({
				content: [{ type: "text", text }],
				details: { exitCode, model, thinking, timeoutSec, timedOut, aborted },
			});
		};

		function killChild() {
			child.kill("SIGTERM");
			killTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
		}

		child.stdout.on("data", (d: Buffer) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d: Buffer) => {
			stderr += d.toString();
		});

		if (signal) {
			signal.addEventListener("abort", onAbort, { once: true });
		}

		timeout = setTimeout(() => {
			timedOut = true;
			killChild();
		}, timeoutSec * 1000);

		child.on("error", (err) => {
			finalize(1, `[pi exec error: ${err.message}]`);
		});

		child.on("close", (code) => {
			const exitCode = code ?? 1;
			if (timedOut) {
				finalize(exitCode, `[pi subagent timeout after ${timeoutSec}s; model=${model}; thinking=${thinking}]`);
				return;
			}
			if (aborted) {
				finalize(exitCode, `[pi subagent aborted by parent; model=${model}; thinking=${thinking}]`);
				return;
			}
			finalize(exitCode);
		});
	});
}

// ============================================================
// Extension entry point
// ============================================================

export default function iweClaudeNative(pi: ExtensionAPI): void {
	// Pi expands /skill:* only for native prompts. Extension-injected messages via
	// sendUserMessage intentionally skip prompt/template expansion, so normalize
	// /skill:* centrally before it reaches the model (prevents Skill tool loops).
	pi.on("input", async (event) => {
		if (!event.text.trimStart().startsWith("/skill:")) {
			return { action: "continue" };
		}

		const expanded = expandSkillCommand(pi, event.text);
		if (!expanded) {
			return { action: "continue" };
		}

		return {
			action: "transform",
			text: expanded,
			images: event.images,
		};
	});

	// Action methods (getAllTools, registerTool, registerCommand) cannot be called
	// during extension loading in Pi ≥0.76 — the runtime is not yet initialized.
	// All registration is deferred to session_start (fires on startup + reload).
	pi.on("session_start", (event, _ctx) => {
		if (event.reason !== "startup" && event.reason !== "reload") return;

	// --- Ф2: command aliases (dynamic enumeration, WP-81) ---
	const commands = pi.getCommands();
	const takenCommandNames = new Set(commands.map((c) => c.name));
	for (const cmd of commands) {
		if (cmd.source !== "skill") continue;
		const alias = cmd.name.replace(/^skill:/, "");
		if (alias === cmd.name || takenCommandNames.has(alias)) continue;
		pi.registerCommand(alias, {
			description: `IWE Claude-native alias for /skill:${alias}`,
			handler: makeSkillForwarder(pi, alias),
		});
		takenCommandNames.add(alias);
	}

	// --- Ф3-Ф4: collision detection (safe here: runtime is initialized) ---
	const existingNames = new Set(pi.getAllTools().map((t) => t.name));
	const skillName = existingNames.has("Skill") ? "iwe_skill" : "Skill";
	const taskName = existingNames.has("Task") ? "iwe_task" : "Task";
	const todoWriteName = existingNames.has("TodoWrite") ? "iwe_todo_write" : "TodoWrite";
	const askUserName = existingNames.has("AskUserQuestion") ? "iwe_ask_user_question" : "AskUserQuestion";

	// --- Ф3: Skill tool ---
	pi.registerTool({
		name: skillName,
		label: "IWE Skill",
		description:
			"Invoke an IWE skill by name (day-open, day-close, verify, ke, archgate, wp-new, think, " +
			"run-protocol, week-close, month-close). Sends the skill as a follow-up user message.",
		promptSnippet: `${skillName}(name, args?) — invoke IWE skill`,
		promptGuidelines: [
			`Use ${skillName} for natural-language requests that require an IWE skill.`,
			`Do not call ${skillName} when the current user message already starts with /skill:.`,
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
			`Use ${taskName} only for quick isolated checks that fit the ${DEFAULT_TASK_TIMEOUT_SEC}s timeout.`,
			"For heavy, parallel, scheduled, or long-running subagent work prefer the Agent tool (pi-subagents) when available — it supports custom agent types (verifier, auditor, Explore), background runs, and steering.",
			`Default model: ${DEFAULT_TASK_MODEL}; default thinking: ${DEFAULT_TASK_THINKING}; default timeout: ${DEFAULT_TASK_TIMEOUT_SEC}s.`,
			"For formal checklist verification, keep prompts explicit and prefer shell-readable checks.",
			"The subagent runs with all extensions loaded (hooks bridge active).",
		],
		parameters: TaskParams,
		execute: async (_id, params, signal, _onUpdate, ctx) => {
			return runPiHeadless(params.prompt, params.cwd ?? ctx.cwd, signal ?? undefined, {
				model: params.model,
				thinking: params.thinking,
				timeoutSec: params.timeoutSec,
			});
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

	// --- WP-81: AskUserQuestion tool (ctx.ui dialogs) ---
	pi.registerTool({
		name: askUserName,
		label: "IWE AskUserQuestion",
		description:
			"Ask the user to choose between 2-4 concrete options when a decision is genuinely theirs to make " +
			"(choice-question). Shows a select dialog; the user can always pick 'Другое' and type a custom answer.",
		promptSnippet: `${askUserName}(question, options[]) — structured user choice`,
		promptGuidelines: [
			`Use ${askUserName} only for real alternatives (X or Y), never for yes/no confirmation of a ready decision.`,
			"Options must be distinct and mutually exclusive; put the recommended option first with '(рекомендую)'.",
			"Requires interactive TUI; in headless mode the tool reports unavailability — proceed with the recommended option instead.",
		],
		parameters: AskUserQuestionParams,
		execute: async (_id, params, _signal, _onUpdate, ctx) => {
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "[no interactive UI — cannot ask the user; proceed with the recommended option and state the assumption]" }],
					details: { answered: false },
				};
			}
			const OTHER = "Другое (свой вариант)";
			const labels = params.options.map((o) =>
				o.description ? `${o.label} — ${o.description}` : o.label,
			);
			const choice = await ctx.ui.select(params.question, [...labels, OTHER]);
			if (choice === undefined) {
				return {
					content: [{ type: "text", text: "[user dismissed the question without answering]" }],
					details: { answered: false },
				};
			}
			if (choice === OTHER) {
				const custom = await ctx.ui.input(params.question, "свой вариант ответа");
				return {
					content: [{ type: "text", text: custom?.trim() ? `User answered: ${custom.trim()}` : "[user dismissed the custom-answer input]" }],
					details: { answered: Boolean(custom?.trim()), custom: true },
				};
			}
			const picked = params.options[labels.indexOf(choice)];
			return {
				content: [{ type: "text", text: `User selected: ${picked?.label ?? choice}` }],
				details: { answered: true, custom: false },
			};
		},
	});
	}); // end session_start
}
