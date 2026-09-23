// The words and numbers a row of work is summed up in: what it was, how long
// it took, what it changed. Pure, so the agent bar can say the same thing
// about the live row as the conversation does.

import type { ActivityItem } from "@/ui/workbench-runtime";

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

/**
 * The headline of a reasoning summary: its first line, without markdown emphasis.
 * @param text The summary.
 * @returns The headline.
 */
function reasoningHeadline(text: string): string {
	const first = text.split("\n").find((line) => line.trim() !== "") ?? "";
	return first.replaceAll("**", "").replaceAll("__", "").trim();
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
 * One row's words: what the work was.
 * @param item The item.
 * @returns The label.
 */
function activityLabel(item: ActivityItem): string {
	switch (item.media) {
		case "reasoning":
			return reasoningHeadline(item.text) || "Thought";
		case "command":
			return item.command;
		case "fileChange":
			return filesLabel(item);
		case "tool":
			return item.server === null ? item.name : `${item.server} · ${item.name}`;
		case "search":
			return item.query === null ? "Searched the web" : `Searched “${item.query}”`;
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
 * A run of work summed up in one line: how many steps, commands and files.
 * @param items The run.
 * @returns The words.
 */
function runSummary(items: readonly ActivityItem[]): string {
	const commands = items.filter((item) => item.media === "command").length;
	const files = new Set(
		items.flatMap((item) => (item.media === "fileChange" ? item.changes.map((change) => change.path) : [])),
	).size;
	const facts = [
		`${items.length} ${items.length === 1 ? "step" : "steps"}`,
		commands > 0 ? `${commands} ${commands === 1 ? "command" : "commands"}` : null,
		files > 0 ? `${files} ${files === 1 ? "file" : "files"} changed` : null,
	];
	return facts.filter((fact) => fact !== null).join(" · ");
}

export { activityLabel, lineTotals, reasoningHeadline, runSummary, shortDuration };
