// The one named seam where the conversation becomes assistant-ui messages.
// Each turn is one message. Agent prose is a text part, so it renders as
// markdown; everything else is a data part named for what it is, rendered by
// the workbench's own components from exactly what the host published: the
// person's prompts, the plan's progress, the work the agent did (reasoning,
// commands, file changes, tool calls and searches, gathered into one run
// between two things said), plan notes, approvals, and how the turn ended.
// Nothing else in the workbench spells a vendor message field.

import type { MessageStatus, ThreadMessageLike } from "@assistant-ui/react";

import type { ConversationItem, ConversationPlan, ConversationTurn } from "@/ui/workbench-timeline";

type MessagePart = Exclude<ThreadMessageLike["content"], string>[number];

/** Items that are work rather than words: gathered into activity runs. */
type ActivityItem = Extract<
	ConversationItem,
	{ readonly media: "reasoning" | "command" | "fileChange" | "tool" | "search" | "compaction" }
>;

/** A run of work between two things said. */
interface ActivityRun {
	readonly items: readonly ActivityItem[];
	/** The turn is still running, so the run may grow and its last row is live. */
	readonly running: boolean;
}

/** How a turn ended, as the data part at its foot carries it. */
interface TurnEnd {
	readonly outcome: ConversationTurn["outcome"];
	readonly startedAtMs: number | null;
	readonly durationMs: number | null;
	readonly error: ConversationTurn["error"];
}

/** The data parts the conversation renders, by name, with what each carries. */
interface ConversationDataParts {
	readonly prompt: Extract<ConversationItem, { readonly media: "prompt" }>;
	readonly plan: Extract<ConversationItem, { readonly media: "plan" }>;
	readonly approval: Extract<ConversationItem, { readonly media: "approval" }>;
	readonly activity: ActivityRun;
	readonly "plan-progress": ConversationPlan;
	readonly "turn-end": TurnEnd;
}

const ACTIVITY_MEDIA: ReadonlySet<ConversationItem["media"]> = new Set([
	"reasoning",
	"command",
	"fileChange",
	"tool",
	"search",
	"compaction",
]);

const EPOCH = new Date(0);

/**
 * The vendor status of a turn.
 * @param turn The turn.
 * @returns The status.
 */
function messageStatus(turn: ConversationTurn): MessageStatus {
	switch (turn.outcome) {
		case "running":
			return { type: "running" };
		case "completed":
			return { type: "complete", reason: "stop" };
		case "interrupted":
			return { type: "incomplete", reason: "cancelled" };
		default:
			return { type: "incomplete", reason: "error", error: turn.error?.message ?? "failed" };
	}
}

/**
 * One data part.
 * @param name What it is.
 * @param data What it carries.
 * @returns The part.
 */
function dataPart<Name extends keyof ConversationDataParts>(
	name: Name,
	data: ConversationDataParts[Name],
): MessagePart {
	return { type: "data", name, data };
}

/**
 * Whether an item is work rather than words.
 * @param item The item.
 * @returns True for reasoning, commands, file changes, tool calls, searches and compactions.
 */
function isActivity(item: ConversationItem): item is ActivityItem {
	return ACTIVITY_MEDIA.has(item.media);
}

/**
 * The part a non-activity item becomes.
 * @param item The item.
 * @returns The part.
 */
function wordsPart(item: Exclude<ConversationItem, ActivityItem>): MessagePart {
	switch (item.media) {
		case "text":
			return { type: "text", text: item.text };
		case "prompt":
			return dataPart("prompt", item);
		case "plan":
			return dataPart("plan", item);
		default:
			return dataPart("approval", item);
	}
}

/**
 * A turn's items as parts: words one by one, work gathered into runs.
 * @param turn The turn.
 * @returns The parts.
 */
function itemParts(turn: ConversationTurn): MessagePart[] {
	const parts: MessagePart[] = [];
	let run: ActivityItem[] = [];
	/** Close the current run of work, if there is one. */
	const flush = (): void => {
		if (run.length > 0) parts.push(dataPart("activity", { items: run, running: false }));
		run = [];
	};
	for (const item of turn.items) {
		if (isActivity(item)) run.push(item);
		else {
			flush();
			parts.push(wordsPart(item));
		}
	}
	if (run.length > 0) {
		parts.push(dataPart("activity", { items: run, running: turn.outcome === "running" }));
	}
	return parts;
}

/**
 * The parts of a turn: its items, the plan's progress after the first prompt,
 * and how the turn ended at its foot.
 * @param turn The turn.
 * @returns The parts.
 */
function turnParts(turn: ConversationTurn): MessagePart[] {
	const parts = itemParts(turn);
	if (turn.plan !== null && turn.plan.steps.length > 0) {
		const firstPrompt = turn.items.findIndex((item) => item.media === "prompt");
		parts.splice(firstPrompt < 0 ? 0 : 1, 0, dataPart("plan-progress", turn.plan));
	}
	const end: TurnEnd = {
		outcome: turn.outcome,
		startedAtMs: turn.startedAtMs,
		durationMs: turn.durationMs,
		error: turn.error,
	};
	return [...parts, dataPart("turn-end", end)];
}

/**
 * One turn as a vendor message-like value.
 * @param turn The turn.
 * @returns The message.
 */
function toThreadMessageLike(turn: ConversationTurn): ThreadMessageLike {
	return {
		id: turn.id,
		role: "assistant",
		createdAt: EPOCH,
		content: turnParts(turn),
		status: messageStatus(turn),
	};
}

export {
	toThreadMessageLike,
	type ActivityItem,
	type ActivityRun,
	type ConversationDataParts,
	type TurnEnd,
};
