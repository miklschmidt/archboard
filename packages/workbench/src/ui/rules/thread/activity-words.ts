// The words and numbers a row of work is summed up in: what it was, how long
// it took, what it changed. Pure, so the agent dock can say the same thing
// about the live row as the conversation does.

import { parse } from "shell-quote";

import type { ActivityItem } from "#ui/rules/runtime/messages.ts";

/**
 * A duration as a person reads it at a glance: "0.4s", "12s", "1:02".
 * @param milliseconds The duration, or null.
 * @returns The words, or null.
 */
function shortDuration(milliseconds: number | null): string | null {
	if (milliseconds === null) return null;
	if (milliseconds < 1000) return `${(milliseconds / 1000).toFixed(1)}s`;
	const seconds = Math.round(milliseconds / 1000);
	if (seconds < 60) return `${seconds}s`;
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A summary that opens with a bold heading, as Codex writes them. */
const HEADED = /^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*/su;

/**
 * A reasoning summary split into the headline its row shows and the body it
 * opens to: Codex opens each summary with a bold heading; one without is its
 * own first line, and the whole of it is the body.
 * @param text The summary.
 * @returns The headline and the body.
 */
function reasoningParts(text: string): { readonly headline: string; readonly body: string } {
	const headed = HEADED.exec(text);
	if (headed !== null)
		return { headline: headed[1]?.trim() ?? "", body: text.slice(headed[0].length).trim() };
	const first = text.split("\n").find((line) => line.trim() !== "") ?? "";
	return { headline: first.trim(), body: text.trim() };
}

/**
 * The files one change touched, as a person reads them.
 * @param item The file change.
 * @returns "Edited src/a.ts", or "Edited 3 files".
 */
function filesLabel(item: Extract<ActivityItem, { readonly media: "fileChange" }>): string {
	const [only] = item.changes;
	if (item.changes.length === 1 && only !== undefined) return `Edited ${only.path}`;
	return `Edited ${item.changes.length}${item.changesTruncated ? "+" : ""} files`;
}

/**
 * A reasoning row's words: its headline, or that the agent is thinking while
 * the summary has not arrived.
 * @param text The summary.
 * @returns The words.
 */
function reasoningLabel(text: string): string {
	const { headline } = reasoningParts(text);
	return headline === "" ? "Thinking" : headline;
}

/**
 * A tool call as a person reads it: the server, and the tool.
 * @param item The tool call.
 * @returns "server · tool", or the tool alone.
 */
function toolLabel(item: Extract<ActivityItem, { readonly media: "tool" }>): string {
	return item.server === null ? item.name : `${item.server} · ${item.name}`;
}

/**
 * A web search as a person reads it.
 * @param item The search.
 * @returns What was searched for.
 */
function searchLabel(item: Extract<ActivityItem, { readonly media: "search" }>): string {
	return item.query === null ? "Searched the web" : `Searched “${item.query}”`;
}

/** The shells whose script a row shows in place of the call that runs it. */
const SHELLS: ReadonlySet<string> = new Set(["bash", "sh", "zsh"]);

/** An option word of a shell that holds `c`, such as `-lc`: the next word is the script. */
const SCRIPT_OPTION = /^-[a-z]*c[a-z]*$/u;

/**
 * Whether a newline separates commands rather than lines inside a quoted script.
 * @param command The command.
 * @returns Whether the command contains an unquoted newline.
 */
function hasUnquotedNewline(command: string): boolean {
	// The parser treats newlines as whitespace. Operators expose unquoted newlines
	// while newlines inside the script's quotes remain part of the same word.
	return (
		command.includes("\n") &&
		parse(command.replaceAll("\n", ";")).some((word) => typeof word !== "string")
	);
}

/**
 * The three words of a command, read as a shell reads them.
 * @param command The command.
 * @returns The words, or null for a command of more or fewer words, or with an operator.
 */
function threeWords(command: string): readonly [string, string, string] | null {
	// A variable stays as it is written: the row shows the script, not its expansion.
	const words = parse(command, (name) => `$${name}`);
	const [shell, option, script] = words;
	return words.length === 3 &&
		typeof shell === "string" &&
		typeof option === "string" &&
		typeof script === "string"
		? [shell, option, script]
		: null;
}

/**
 * A command's words on its row: the script of one shell call with `-c`, the way
 * Codex runs each command of an agent (`/nix/store/…/bin/bash -lc '<script>'`),
 * and any other command as Codex sent it.
 * @param command The command as Codex sent it.
 * @returns The words.
 */
function commandLabel(command: string): string {
	try {
		if (hasUnquotedNewline(command)) return command;
		const words = threeWords(command);
		if (words === null) return command;
		const [shell, option, script] = words;
		const name = shell.slice(shell.lastIndexOf("/") + 1);
		return SHELLS.has(name) && SCRIPT_OPTION.test(option) ? script : command;
	} catch {
		// Commands outside the parser's grammar still have a readable row.
		return command;
	}
}

/**
 * One row's words: what the work was.
 * @param item The item.
 * @returns The label.
 */
function activityLabel(item: ActivityItem): string {
	switch (item.media) {
		case "reasoning":
			return reasoningLabel(item.text);
		case "command":
			return commandLabel(item.command);
		case "fileChange":
			return filesLabel(item);
		case "tool":
			return toolLabel(item);
		case "search":
			return searchLabel(item);
		default:
			return "Compacted the conversation";
	}
}

/**
 * The lines one change added and removed.
 * @param item The file change.
 * @returns The totals.
 */
function lineTotals(item: Extract<ActivityItem, { readonly media: "fileChange" }>): {
	readonly added: number;
	readonly removed: number;
} {
	return item.changes.reduce(
		(sum, change) => ({ added: sum.added + change.added, removed: sum.removed + change.removed }),
		{ added: 0, removed: 0 },
	);
}

/**
 * Whether a step failed or was declined.
 * @param item The step.
 * @returns True when it did not do what it set out to.
 */
function stepFailed(item: ActivityItem): boolean {
	return "status" in item && (item.status === "failed" || item.status === "declined");
}

/**
 * A count in words, or nothing for none.
 * @param count How many.
 * @param one What one is called.
 * @param many What several are called.
 * @returns "3 commands", or null.
 */
function counted(count: number, one: string, many: string): string | null {
	if (count === 0) return null;
	return `${count} ${count === 1 ? one : many}`;
}

/**
 * A run of work summed up in one line: how many steps, commands and files,
 * and how many steps failed.
 * @param items The run.
 * @returns The words.
 */
function runSummary(items: readonly ActivityItem[]): string {
	const commands = items.filter((item) => item.media === "command").length;
	const files = new Set(
		items.flatMap((item) =>
			item.media === "fileChange" ? item.changes.map((change) => change.path) : [],
		),
	).size;
	const facts = [
		counted(items.length, "step", "steps"),
		counted(commands, "command", "commands"),
		counted(files, "file changed", "files changed"),
		counted(items.filter(stepFailed).length, "failed", "failed"),
	];
	return facts.filter((fact) => fact !== null).join(" · ");
}

export { activityLabel, lineTotals, reasoningParts, runSummary, shortDuration, stepFailed };
