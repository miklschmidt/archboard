import type { CodexWorkbenchItem, WorkbenchTimelineProps } from "../contract.js";
import { record, textField } from "./details.js";
import { stableBoundedKey } from "./stable-key.js";

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

type RuntimeApproval = Extract<
	NonNullable<WorkbenchTimelineProps["runtimeTimeline"]>["turns"][number]["items"][number],
	{ readonly media: "approval" }
>;
type RuntimeItem = NonNullable<
	WorkbenchTimelineProps["runtimeTimeline"]
>["turns"][number]["items"][number];

function itemIdentity(
	threadId: string,
	turnId: string,
	itemId: string,
	occurrence: number,
): string {
	return JSON.stringify([threadId, turnId, itemId, occurrence]);
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
	const itemId = rawId ?? `malformed-${stableBoundedKey(value)}`;
	const occurrence = occurrences.get(itemId) ?? 0;
	occurrences.set(itemId, occurrence + 1);
	return {
		identity: itemIdentity(threadId, turnId, itemId, occurrence),
		itemId,
		label:
			CODEX_THREAD_ITEM_LABELS[type as keyof typeof CODEX_THREAD_ITEM_LABELS] ?? "Unknown item",
		type,
		value,
		malformed: rawId === null || !(type in CODEX_THREAD_ITEM_LABELS),
	};
}

function normalizeApproval(
	threadId: string,
	turnId: string,
	item: RuntimeApproval,
	occurrences: Map<string, number>,
): TimelineItem {
	const occurrence = occurrences.get(item.itemId) ?? 0;
	occurrences.set(item.itemId, occurrence + 1);
	return {
		identity: itemIdentity(threadId, turnId, item.itemId, occurrence),
		itemId: item.itemId,
		label: "Approval",
		type: "approval",
		value: item,
		malformed: false,
	};
}

function runtimeItemPresentation(item: RuntimeItem): {
	readonly label: string;
	readonly type: string;
	readonly value: unknown;
} {
	const itemId = item.itemId;
	switch (item.media) {
		case "text":
			return {
				label: "Assistant message",
				type: "agentMessage",
				value: { ...item, type: "agentMessage", id: itemId },
			};
		case "reasoning":
			return {
				label: "Reasoning",
				type: "reasoning",
				value: {
					...item,
					type: "reasoning",
					id: itemId,
					summary: [item.text],
					content: [],
				},
			};
		case "plan":
			return {
				label: "Plan",
				type: "plan",
				value: { ...item, type: "plan", id: itemId },
			};
		case "command":
			return {
				label: "Command",
				type: "commandExecution",
				value: { ...item, type: "commandExecution", id: itemId },
			};
		case "fileChange":
			return {
				label: "File change",
				type: "fileChange",
				value: { ...item, type: "fileChange", id: itemId },
			};
		case "tool":
			return {
				label: "Tool call",
				type: "dynamicToolCall",
				value: {
					...item,
					type: "dynamicToolCall",
					id: itemId,
					tool: item.name,
				},
			};
		case "approval":
			return {
				label: "Approval",
				type: "approval",
				value: { ...item, type: "approval", id: itemId },
			};
		default:
			return {
				label: "Unknown item",
				type: "unknown",
				value: { ...record(item), type: "unknown", id: itemId },
			};
	}
}

function normalizeRuntimeItem(
	threadId: string,
	turnId: string,
	item: RuntimeItem,
	occurrences: Map<string, number>,
): TimelineItem {
	const occurrence = occurrences.get(item.itemId) ?? 0;
	occurrences.set(item.itemId, occurrence + 1);
	const presentation = runtimeItemPresentation(item);
	return {
		identity: itemIdentity(threadId, turnId, item.itemId, occurrence),
		itemId: item.itemId,
		...presentation,
		malformed: false,
	};
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
		const runtimeApprovals =
			props.runtimeTimeline?.turns
				.find((runtimeTurn) => runtimeTurn.turnId === turnId)
				?.items.filter((item): item is RuntimeApproval => item.media === "approval") ?? [];
		const matchedApprovals = new Set<number>();
		const items: TimelineItem[] = [];
		for (const value of values) {
			const item = normalizeItem(props.threadId, turnId, value, occurrences);
			items.push(item);
			if (textField(value, "id").length === 0) continue;
			for (const [approvalIndex, approval] of runtimeApprovals.entries()) {
				if (matchedApprovals.has(approvalIndex) || approval.itemId !== item.itemId) continue;
				matchedApprovals.add(approvalIndex);
				items.push(normalizeApproval(props.threadId, turnId, approval, occurrences));
			}
		}
		for (const [approvalIndex, approval] of runtimeApprovals.entries()) {
			if (matchedApprovals.has(approvalIndex)) continue;
			items.push(normalizeApproval(props.threadId, turnId, approval, occurrences));
		}
		const status = textField(turn, "status") || "unknown";
		turns.set(turnId, {
			turnId,
			status,
			streaming: status === "inProgress",
			items,
			error: turn.error,
		});
	}
	for (const runtimeTurn of props.runtimeTimeline?.turns ?? []) {
		if (turns.has(runtimeTurn.turnId)) continue;
		const occurrences = new Map<string, number>();
		turns.set(runtimeTurn.turnId, {
			turnId: runtimeTurn.turnId,
			status: runtimeTurn.status,
			streaming: runtimeTurn.status === "inProgress",
			items: runtimeTurn.items.map((item) =>
				normalizeRuntimeItem(props.threadId, runtimeTurn.turnId, item, occurrences),
			),
			error: null,
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
