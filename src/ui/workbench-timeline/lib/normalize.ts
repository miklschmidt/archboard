// Timeline normalisation: decoded app-server turns and the browser's runtime
// timeline become one ordered map of turns whose items carry stable identities
// (thread, turn, item, occurrence), with runtime approvals kept beside the
// items they belong to and terminal state resolved without changing identity.

import type {
	CodexWorkbenchItem,
	NormalizedTimeline,
	TimelineItem,
	TimelineTurn,
	WorkbenchTimelineInput,
	WorkbenchTimelineRuntime,
} from "@/ui/workbench-timeline/lib/contract";
import { record, textField } from "@/ui/workbench-timeline/lib/details";
import { stableBoundedKey } from "@/ui/workbench-timeline/lib/stable-key";

const CODEX_THREAD_ITEM_LABELS: Readonly<Record<CodexWorkbenchItem["type"], string>> = {
	userMessage: "User message",
	hookPrompt: "Hook prompt",
	agentMessage: "Assistant message",
	functionCallOutput: "Tool output",
	plan: "Plan",
	reasoning: "Reasoning",
	commandExecution: "Command",
	fileChange: "File change",
	mcpToolCall: "MCP tool",
	dynamicToolCall: "Tool call",
	collabAgentToolCall: "Agent collaboration",
	subAgentActivity: "Subagent activity",
	webSearch: "Web search",
	imageView: "Image view",
	sleep: "Wait",
	imageGeneration: "Image generation",
	enteredReviewMode: "Review started",
	exitedReviewMode: "Review finished",
	contextCompaction: "Context compacted",
};

type RuntimeTurn = WorkbenchTimelineRuntime["turns"][number];
type RuntimeItem = RuntimeTurn["items"][number];
type RuntimeApproval = Extract<RuntimeItem, { readonly media: "approval" }>;
type ThreadId = WorkbenchTimelineInput["threadId"];

/** How a runtime item is labelled and typed, and the value it shows. */
interface ItemPresentation {
	readonly label: string;
	readonly type: string;
	readonly value: unknown;
}

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["completed", "interrupted", "failed"]);

/**
 * Whether a type is a known thread item type.
 * @param type The type.
 * @returns True for a labelled type.
 */
function isKnownItemType(type: string): type is CodexWorkbenchItem["type"] {
	return Object.hasOwn(CODEX_THREAD_ITEM_LABELS, type);
}

/**
 * The identity of one item occurrence.
 * @param threadId The thread.
 * @param turnId The turn.
 * @param itemId The item.
 * @param occurrence How many earlier items in the turn share the id.
 * @returns The identity.
 */
function itemIdentity(
	threadId: ThreadId,
	turnId: string,
	itemId: string,
	occurrence: number,
): string {
	return JSON.stringify([threadId, turnId, itemId, occurrence]);
}

/**
 * Count one more occurrence of an item id.
 * @param occurrences The counts so far.
 * @param itemId The item.
 * @returns The occurrence index for this item.
 */
function nextOccurrence(occurrences: Map<string, number>, itemId: string): number {
	const occurrence = occurrences.get(itemId) ?? 0;
	occurrences.set(itemId, occurrence + 1);
	return occurrence;
}

/**
 * Normalise one decoded item.
 * @param threadId The thread.
 * @param turnId The turn.
 * @param value The decoded item, possibly malformed.
 * @param occurrences The id counts of the turn.
 * @returns The item.
 */
function normalizeItem(
	threadId: ThreadId,
	turnId: string,
	value: unknown,
	occurrences: Map<string, number>,
): TimelineItem {
	const item = record(value);
	const type = typeof item?.["type"] === "string" ? item["type"] : "unknown";
	const rawId = textField(value, "id");
	const itemId = rawId.length > 0 ? rawId : `malformed-${stableBoundedKey(value)}`;
	const known = isKnownItemType(type);
	return {
		identity: itemIdentity(threadId, turnId, itemId, nextOccurrence(occurrences, itemId)),
		itemId,
		label: known ? CODEX_THREAD_ITEM_LABELS[type] : "Unknown item",
		type,
		value,
		malformed: rawId.length === 0 || !known,
	};
}

/**
 * Normalise a runtime approval beside the item it belongs to.
 * @param threadId The thread.
 * @param turnId The turn.
 * @param item The approval.
 * @param occurrences The id counts of the turn.
 * @returns The item.
 */
function normalizeApproval(
	threadId: ThreadId,
	turnId: string,
	item: RuntimeApproval,
	occurrences: Map<string, number>,
): TimelineItem {
	return {
		identity: itemIdentity(threadId, turnId, item.itemId, nextOccurrence(occurrences, item.itemId)),
		itemId: item.itemId,
		label: "Approval",
		type: "approval",
		value: item,
		malformed: false,
	};
}

const RUNTIME_LABELS: Readonly<Record<RuntimeItem["media"], { label: string; type: string }>> = {
	text: { label: "Assistant message", type: "agentMessage" },
	reasoning: { label: "Reasoning", type: "reasoning" },
	plan: { label: "Plan", type: "plan" },
	command: { label: "Command", type: "commandExecution" },
	fileChange: { label: "File change", type: "fileChange" },
	tool: { label: "Tool call", type: "dynamicToolCall" },
	approval: { label: "Approval", type: "approval" },
};

/**
 * The decoded-shaped value a runtime item presents as.
 * @param item The runtime item.
 * @returns The value.
 */
function runtimeItemValue(item: RuntimeItem): Record<string, unknown> {
	const type = RUNTIME_LABELS[item.media].type;
	const base = { ...item, type, id: item.itemId };
	if (item.media === "reasoning") {
		return { ...base, summary: [item.text], content: [] };
	}
	return item.media === "tool" ? { ...base, tool: item.name } : base;
}

/**
 * How a runtime item presents.
 * @param item The runtime item.
 * @returns The label, type and value.
 */
function runtimeItemPresentation(item: RuntimeItem): ItemPresentation {
	const { label, type } = RUNTIME_LABELS[item.media];
	return { label, type, value: runtimeItemValue(item) };
}

/**
 * Normalise a runtime item of a turn the decoded thread does not carry yet.
 * @param threadId The thread.
 * @param turnId The turn.
 * @param item The runtime item.
 * @param occurrences The id counts of the turn.
 * @returns The item.
 */
function normalizeRuntimeItem(
	threadId: ThreadId,
	turnId: string,
	item: RuntimeItem,
	occurrences: Map<string, number>,
): TimelineItem {
	return {
		identity: itemIdentity(threadId, turnId, item.itemId, nextOccurrence(occurrences, item.itemId)),
		itemId: item.itemId,
		...runtimeItemPresentation(item),
		malformed: false,
	};
}

/**
 * The turn status once the runtime's view is folded in: a decoded terminal
 * status wins over a runtime still reporting progress.
 * @param decodedStatus The decoded status.
 * @param runtimeTurn The runtime turn, if any.
 * @returns The status.
 */
function resolvedTurnStatus(decodedStatus: string, runtimeTurn: RuntimeTurn | undefined): string {
	if (runtimeTurn === undefined) {
		return decodedStatus;
	}
	const decodedIsTerminal = TERMINAL_STATUSES.has(decodedStatus);
	return runtimeTurn.status === "inProgress" && decodedIsTerminal
		? decodedStatus
		: runtimeTurn.status;
}

/**
 * The decoded items of a turn with the runtime's approvals placed beside the
 * items they answer, and the rest appended.
 * @param input The normaliser input.
 * @param turnId The turn.
 * @param values The decoded items.
 * @param approvals The runtime approvals of the turn.
 * @returns The items.
 */
function interleaveApprovals(
	input: WorkbenchTimelineInput,
	turnId: string,
	values: readonly unknown[],
	approvals: readonly RuntimeApproval[],
): readonly TimelineItem[] {
	const occurrences = new Map<string, number>();
	const matched = new Set<number>();
	const items: TimelineItem[] = [];
	/**
	 * Append the unmatched approvals answering one item id.
	 * @param itemId The item id, or empty for the trailing pass.
	 */
	function appendApprovals(itemId: string | null): void {
		for (const [index, approval] of approvals.entries()) {
			if (!matched.has(index) && (itemId === null || approval.itemId === itemId)) {
				matched.add(index);
				items.push(normalizeApproval(input.threadId, turnId, approval, occurrences));
			}
		}
	}
	for (const value of values) {
		const item = normalizeItem(input.threadId, turnId, value, occurrences);
		items.push(item);
		if (textField(value, "id").length > 0) {
			appendApprovals(item.itemId);
		}
	}
	appendApprovals(null);
	return items;
}

/**
 * Normalise one decoded turn.
 * @param input The normaliser input.
 * @param turn The decoded turn record.
 * @param turnId Its id.
 * @returns The turn.
 */
function normalizeDecodedTurn(
	input: WorkbenchTimelineInput,
	turn: Record<string, unknown>,
	turnId: string,
): TimelineTurn {
	const values = Array.isArray(turn["items"]) ? turn["items"] : [];
	const runtimeTurn = input.runtimeTimeline?.turns.find((candidate) => candidate.turnId === turnId);
	const approvals =
		runtimeTurn?.items.filter((item): item is RuntimeApproval => item.media === "approval") ?? [];
	const status = resolvedTurnStatus(textField(turn, "status") || "unknown", runtimeTurn);
	return {
		turnId,
		status,
		streaming: status === "inProgress",
		items: interleaveApprovals(input, turnId, values, approvals),
		error: turn["error"],
	};
}

/**
 * Normalise a runtime turn the decoded thread does not carry yet.
 * @param input The normaliser input.
 * @param runtimeTurn The runtime turn.
 * @returns The turn.
 */
function normalizeRuntimeTurn(
	input: WorkbenchTimelineInput,
	runtimeTurn: RuntimeTurn,
): TimelineTurn {
	const occurrences = new Map<string, number>();
	return {
		turnId: runtimeTurn.turnId,
		status: runtimeTurn.status,
		streaming: runtimeTurn.status === "inProgress",
		items: runtimeTurn.items.map((item) =>
			normalizeRuntimeItem(input.threadId, runtimeTurn.turnId, item, occurrences),
		),
		error: null,
	};
}

/**
 * Add the runtime turns the decoded thread does not carry yet.
 * @param input The normaliser input.
 * @param turns The turns so far, by id.
 */
function appendRuntimeTurns(input: WorkbenchTimelineInput, turns: Map<string, TimelineTurn>): void {
	for (const runtimeTurn of input.runtimeTimeline?.turns ?? []) {
		if (!turns.has(runtimeTurn.turnId)) {
			turns.set(runtimeTurn.turnId, normalizeRuntimeTurn(input, runtimeTurn));
		}
	}
}

/**
 * Normalise the decoded turns and the runtime timeline into one ordered map.
 * @param input The decoded turns, the runtime timeline and the history kind.
 * @returns The normalised timeline.
 */
function normalizeTimeline(input: WorkbenchTimelineInput): NormalizedTimeline {
	const turns = new Map<string, TimelineTurn>();
	for (const candidate of input.turns) {
		const turn = record(candidate);
		const turnId = textField(turn, "id");
		if (turn !== null && turnId.length > 0 && !turns.has(turnId)) {
			turns.set(turnId, normalizeDecodedTurn(input, turn, turnId));
		}
	}
	appendRuntimeTurns(input, turns);
	return {
		turns,
		streaming: [...turns.values()].some((turn) => turn.streaming),
		priorEpoch: input.history === "prior_epoch",
	};
}

export { CODEX_THREAD_ITEM_LABELS, normalizeTimeline };
