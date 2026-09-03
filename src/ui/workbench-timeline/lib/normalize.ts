import type { CodexWorkbenchItem, WorkbenchTimelineProps } from "../contract.js";
import { boundedDetails, record, textField } from "./details.js";

export const CODEX_THREAD_ITEM_LABELS = {
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
} as const satisfies Record<CodexWorkbenchItem["type"], string>;

export interface TimelineItem {
	readonly identity: string;
	readonly itemId: string;
	readonly label: string;
	readonly type: string;
	readonly value: unknown;
	readonly malformed: boolean;
}

export interface TimelineTurn {
	readonly turnId: string;
	readonly status: string;
	readonly streaming: boolean;
	readonly items: readonly TimelineItem[];
	readonly error: unknown;
}

export interface NormalizedTimeline {
	readonly turns: ReadonlyMap<string, TimelineTurn>;
	readonly streaming: boolean;
	readonly priorEpoch: boolean;
}

function stableHash(value: unknown): string {
	const source = boundedDetails(value).text;
	let hash = 2_166_136_261;
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return (hash >>> 0).toString(36);
}

function normalizeItem(
	threadId: string,
	turnId: string,
	value: unknown,
	occurrences: Map<string, number>,
): TimelineItem {
	const item = record(value);
	const type = typeof item?.type === "string" ? item.type : "unknown";
	const rawId = typeof item?.id === "string" && item.id.length > 0 ? item.id : null;
	const itemId = rawId ?? `malformed-${stableHash(value)}`;
	const occurrence = occurrences.get(itemId) ?? 0;
	occurrences.set(itemId, occurrence + 1);
	const suffix = occurrence === 0 ? "" : `:duplicate-${occurrence}`;
	return {
		identity: `${threadId}:${turnId}:${itemId}${suffix}`,
		itemId,
		label:
			CODEX_THREAD_ITEM_LABELS[type as keyof typeof CODEX_THREAD_ITEM_LABELS] ?? "Unknown item",
		type,
		value,
		malformed: rawId === null || !(type in CODEX_THREAD_ITEM_LABELS),
	};
}

function approvalItems(
	threadId: string,
	turnId: string,
	props: WorkbenchTimelineProps,
	occurrences: Map<string, number>,
): TimelineItem[] {
	const runtimeTurn = props.runtimeTimeline?.turns.find((turn) => turn.turnId === turnId);
	if (!runtimeTurn) return [];
	return runtimeTurn.items.flatMap((item) => {
		if (item.media !== "approval") return [];
		const identity = `${threadId}:${turnId}:${item.itemId}`;
		const occurrence = occurrences.get(item.itemId) ?? 0;
		occurrences.set(item.itemId, occurrence + 1);
		return [
			{
				identity: occurrence === 0 ? identity : `${identity}:duplicate-${occurrence}`,
				itemId: item.itemId,
				label: "Approval",
				type: "approval",
				value: item,
				malformed: false,
			},
		];
	});
}

export function normalizeTimeline(props: WorkbenchTimelineProps): NormalizedTimeline {
	const turns = new Map<string, TimelineTurn>();
	for (const candidate of props.turns as readonly unknown[]) {
		const turn = record(candidate);
		if (turn === null) continue;
		const turnId = textField(turn, "id");
		if (turnId.length === 0 || turns.has(turnId)) continue;
		const occurrences = new Map<string, number>();
		const values = Array.isArray(turn.items) ? turn.items : [];
		const items = values.map((item) => normalizeItem(props.threadId, turnId, item, occurrences));
		items.push(...approvalItems(props.threadId, turnId, props, occurrences));
		const status = textField(turn, "status") || "unknown";
		turns.set(turnId, {
			turnId,
			status,
			streaming: status === "inProgress",
			items,
			error: turn.error,
		});
	}
	return {
		turns,
		streaming:
			[...turns.values()].some((turn) => turn.streaming) ||
			(props.runtimeTimeline?.turns.some((turn) => turn.status === "inProgress") ?? false),
		priorEpoch: props.history === "prior_epoch",
	};
}
