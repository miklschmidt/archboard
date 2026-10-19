// The evidence a timeline item carries beside its text: what a person said,
// the files a patch touched and by how much, what a tool was given and why it
// failed, and the plan a turn is working to. Each is bounded to its wire limit.
// A tool's arguments have the values of secret-named keys redacted; command
// output is carried as the operator's own terminal would show it, because the
// browser on the loopback-bound server shares the operator's trust boundary.

import type { SessionThreadItem, SessionTurn } from "@archboard/codex-app-server/session";
import type { CodexServerNotificationParamsByMethod } from "@archboard/codex-app-server/contract";
import { BROWSER_TIMELINE_LIMITS as LIMITS } from "#shared/schemas/browser/vocabulary.ts";
import {
	type CodexTimelineFileChangeEntry,
	type CodexTimelinePlanInput,
	type CodexTimelineTurnProjectionInput,
} from "#server/protocol/projection/projection-contract.ts";
import { redactSecrets } from "#server/rules/snapshot/secret-keys.ts";
import {
	boundedText,
	optionalBoundedText,
	TIMELINE_PART_LIMIT,
} from "#server/rules/timeline/text.ts";

type SessionItem<Type extends SessionThreadItem["type"]> = Extract<
	SessionThreadItem,
	{ readonly type: Type }
>;
type FileUpdateChange = SessionItem<"fileChange">["changes"][number];
type UserInput = SessionItem<"userMessage">["content"][number];

/** The marks a line inside a unified diff hunk starts with. */
const HUNK_LINE_MARKS: ReadonlySet<string> = new Set([" ", "+", "-", "\\"]);

/** How a prompt names each input that is not text. */
const NON_TEXT_INPUT_LABELS = {
	image: "[image]",
	localImage: "[image]",
	audio: "[audio]",
	localAudio: "[audio]",
	skill: "[skill]",
	mention: "[mention]",
} as const satisfies Record<Exclude<UserInput["type"], "text">, string>;

/**
 * How many lines a whole file's content has.
 * @param content The content.
 * @returns The line count.
 */
function contentLineCount(content: string): number {
	if (content.length === 0) {
		return 0;
	}
	const newlines = content.split("\n").length - 1;
	return content.endsWith("\n") ? newlines : newlines + 1;
}

/**
 * Whether a diff line is inside a hunk: a hunk header opens one, and it runs
 * until a line no hunk line could be.
 * @param line The line.
 * @param inHunk Whether the line before it was inside a hunk.
 * @returns True when the line is inside a hunk.
 */
function insideHunk(line: string, inHunk: boolean): boolean {
	if (line.startsWith("@@")) {
		return true;
	}
	return inHunk && (line.length === 0 || HUNK_LINE_MARKS.has(line.charAt(0)));
}

/**
 * The lines one unified diff adds and removes, read inside its hunks only so
 * the `---` and `+++` file headers are never counted.
 * @param diff The unified diff.
 * @returns The added and removed line counts.
 */
function unifiedDiffLineCounts(diff: string): { readonly added: number; readonly removed: number } {
	const marks: string[] = [];
	let inHunk = false;
	for (const line of diff.split("\n")) {
		inHunk = insideHunk(line, inHunk);
		if (inHunk) {
			marks.push(line.charAt(0));
		}
	}
	return {
		added: marks.filter((mark) => mark === "+").length,
		removed: marks.filter((mark) => mark === "-").length,
	};
}

/**
 * One changed file, its diff reduced to line counts. Codex carries a whole
 * file's content as the diff of an added or deleted file.
 * @param change The change.
 * @returns The bounded entry.
 */
function fileChangeEntry(change: FileUpdateChange): CodexTimelineFileChangeEntry {
	const path = boundedText(change.path, LIMITS.path, "unnamed file").value;
	switch (change.kind.type) {
		case "add":
			return {
				path,
				kind: "add",
				movePath: null,
				added: contentLineCount(change.diff),
				removed: 0,
			};
		case "delete":
			return {
				path,
				kind: "delete",
				movePath: null,
				added: 0,
				removed: contentLineCount(change.diff),
			};
		default:
			return {
				path,
				kind: change.kind.type,
				movePath: optionalBoundedText(change.kind.move_path, LIMITS.path),
				...unifiedDiffLineCounts(change.diff),
			};
	}
}

/**
 * Everything the person said in one message, each input in order: text as
 * written, anything else as a bracketed word. The parts read are bounded.
 * @param item The message.
 * @returns The bounded text, and whether anything was cut.
 */
function promptText(item: SessionItem<"userMessage">): {
	readonly value: string;
	readonly truncated: boolean;
} {
	const parts = item.content
		.slice(0, TIMELINE_PART_LIMIT)
		.map((part) => (part.type === "text" ? part.text : NON_TEXT_INPUT_LABELS[part.type]));
	const bounded = boundedText(parts.join("\n"), LIMITS.text, "[empty]");
	return {
		value: bounded.value,
		truncated: bounded.truncated || item.content.length > TIMELINE_PART_LIMIT,
	};
}

/**
 * What a tool call was given, as bounded compact JSON with every secret-named
 * key's value redacted.
 * @param item The tool call.
 * @returns The arguments, or null when it was given none.
 */
function toolCallArguments(item: SessionItem<"mcpToolCall" | "dynamicToolCall">): string | null {
	// JSON.stringify answers undefined for a value JSON cannot carry, which its
	// lib typing hides; reading it through unknown keeps that case visible.
	const encoded: unknown = JSON.stringify(redactSecrets(item.arguments));
	return typeof encoded === "string" ? optionalBoundedText(encoded, LIMITS.toolArguments) : null;
}

/**
 * Why a tool call failed: the MCP server's own message, or a fixed one when a
 * dynamic tool reported failure without saying why.
 * @param item The tool call.
 * @returns The bounded message, or null when it did not fail.
 */
function toolCallError(item: SessionItem<"mcpToolCall" | "dynamicToolCall">): string | null {
	if (item.type === "mcpToolCall") {
		return item.error === null
			? null
			: boundedText(item.error.message, LIMITS.errorMessage, "The tool call failed.").value;
	}
	return item.success === false ? "The tool call reported a failure." : null;
}

/**
 * Why a turn failed or was stopped, bounded. Codex reports an error for a failed turn, and for a
 * turn that the auto-review circuit breaker stops in its strict mode (Codex 0.160.0,
 * `guardian/review_request.rs`).
 * @param turn The turn.
 * @returns The bounded error, or null.
 */
function turnError(turn: SessionTurn): CodexTimelineTurnProjectionInput["error"] {
	if (turn.error === null) {
		return null;
	}
	return {
		message: boundedText(turn.error.message, LIMITS.errorMessage, "The turn failed.").value,
		details: optionalBoundedText(turn.error.additionalDetails, LIMITS.errorDetails),
	};
}

/**
 * The latest plan Codex published for a turn, bounded in steps and text.
 * @param update The plan notification's parameters.
 * @returns The bounded plan.
 */
function boundedPlan(
	update: Pick<CodexServerNotificationParamsByMethod["turn/plan/updated"], "explanation" | "plan">,
): CodexTimelinePlanInput {
	return {
		explanation: optionalBoundedText(update.explanation, LIMITS.planExplanation),
		plan: update.plan.slice(0, LIMITS.planSteps).map((entry) => ({
			step: boundedText(entry.step, LIMITS.planStep, "Step").value,
			status: entry.status,
		})),
	};
}

export { boundedPlan, fileChangeEntry, promptText, toolCallArguments, toolCallError, turnError };
