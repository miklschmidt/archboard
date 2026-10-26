// The one named seam where the conversation becomes assistant-ui messages.
// Each turn is one message. Agent prose is a text part, so it renders as
// markdown; everything else is a data part named for what it is, rendered by
// the workbench's own components from exactly what the server published: the
// person's prompts, the plan's progress, the work the agent did (reasoning,
// commands, file changes, tool calls and searches, gathered into one run
// between two things said), plan notes, approvals, and how the turn ended.
// Whose turn it is travels as message metadata, and a workhorse turn the voice
// coordinator delegated carries where it came from on its first prompt.
// Nothing else in the workbench spells a vendor message field.

import type { MessageStatus, ThreadMessageLike } from "@assistant-ui/react";

import type { ConversationTurn } from "@archboard/codex-realtime-voice/controllers";
import type { ConversationItem } from "#ui/state/surfaces/voice-parts.ts";

/** The plan Codex published for a turn. */
type ConversationPlan = NonNullable<ConversationTurn["plan"]>;

type MessagePart = Exclude<ThreadMessageLike["content"], string>[number];

/** Items that are work rather than words: gathered into activity runs. */
type ActivityItem = Extract<
	ConversationItem,
	{ readonly media: "reasoning" | "command" | "fileChange" | "tool" | "search" | "compaction" }
>;

/** A run of work between two things said. */
interface ActivityRun {
	readonly items: readonly ActivityItem[];
	/** The turn has ended, so nothing in the run will change. */
	readonly ended: boolean;
	/** The run is the running turn's latest and its last step is still going: that row is live. */
	readonly live: boolean;
}

/** How a turn ended, as the data part at its foot carries it. */
interface TurnEnd {
	readonly outcome: ConversationTurn["outcome"];
	readonly startedAtMs: number | null;
	readonly durationMs: number | null;
	readonly error: ConversationTurn["error"];
}

/** A prompt, and the voice coordinator turn that delegated its turn when it is that turn's first. */
type PromptPart = Extract<ConversationItem, { readonly media: "prompt" }> & {
	readonly delegatedBy: ConversationTurn["delegatedBy"];
};

/** The data parts the conversation renders, by name, with what each carries. */
interface ConversationDataParts {
	readonly prompt: PromptPart;
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
 * @param delegatedBy Where the turn came from, for the prompt that carries it.
 * @returns The part.
 */
function wordsPart(
	item: Exclude<ConversationItem, ActivityItem>,
	delegatedBy: ConversationTurn["delegatedBy"],
): MessagePart {
	switch (item.media) {
		case "text":
			return { type: "text", text: item.text };
		case "prompt":
			return dataPart("prompt", { ...item, delegatedBy });
		case "plan":
			return dataPart("plan", item);
		default:
			return dataPart("approval", item);
	}
}

/**
 * Whether a step is still going: it says so, or it has no status to say it
 * with (a thought, a search) and nothing came after it.
 * @param item The step.
 * @returns True while it runs.
 */
function stillGoing(item: ActivityItem | undefined): boolean {
	if (item === undefined) return false;
	return !("status" in item) || item.status === "inProgress";
}

/**
 * A turn's items as parts: words one by one, work gathered into runs.
 * @param turn The turn.
 * @returns The parts.
 */
function itemParts(turn: ConversationTurn): MessagePart[] {
	const parts: MessagePart[] = [];
	let run: ActivityItem[] = [];
	// Only the turn's first prompt says where the turn came from.
	let delegatedBy = turn.delegatedBy;
	const ended = turn.outcome !== "running";
	/**
	 * Close the current run of work, if there is one.
	 * @param latest Whether it is the running turn's latest, whose last step may be live.
	 */
	const flush = (latest: boolean): void => {
		if (run.length > 0)
			parts.push(
				dataPart("activity", { items: run, ended, live: latest && stillGoing(run.at(-1)) }),
			);
		run = [];
	};
	for (const item of turn.items) {
		if (isActivity(item)) run.push(item);
		else {
			flush(false);
			parts.push(wordsPart(item, delegatedBy));
			if (item.media === "prompt") delegatedBy = null;
		}
	}
	flush(!ended);
	return parts;
}

/**
 * The parts with the plan's progress right after the first prompt, or first
 * of all when the turn shows no prompt.
 * @param parts The turn's parts.
 * @param plan The plan, or null.
 * @returns The parts with the plan placed.
 */
function withPlan(parts: MessagePart[], plan: ConversationTurn["plan"]): MessagePart[] {
	if (plan === null || plan.steps.length === 0) return parts;
	const prompt = parts.findIndex((part) => part.type === "data" && part.name === "prompt");
	return parts.toSpliced(prompt + 1, 0, dataPart("plan-progress", plan));
}

/**
 * The parts of a turn: its items with the plan's progress, and how the turn
 * ended at its foot.
 * @param turn The turn.
 * @returns The parts.
 */
function turnParts(turn: ConversationTurn): MessagePart[] {
	const parts = withPlan(itemParts(turn), turn.plan);
	const end: TurnEnd = {
		outcome: turn.outcome,
		startedAtMs: turn.startedAtMs,
		durationMs: turn.durationMs,
		error: turn.error,
	};
	return [...parts, dataPart("turn-end", end)];
}

/**
 * One turn as a vendor message-like value. Whose turn it is travels as
 * metadata, with the turn's id as its owner's thread knows it.
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
		metadata: { custom: { owner: turn.owner, turnId: turn.turnId } },
	};
}

export {
	toThreadMessageLike,
	type ActivityItem,
	type ActivityRun,
	type ConversationDataParts,
	type TurnEnd,
};
