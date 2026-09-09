// The projection of the host's authoritative timeline into Archboard-owned
// turn projections: one per turn, identified by thread and turn, with every
// item's Codex identity retained. Duplicate identities are a failure the
// caller shows, never something silently merged.

import type { BrowserTimeline } from "@/shared/codex-browser-model";
import type {
	WorkbenchCodexItemMetadata,
	WorkbenchTurnMetadata,
	WorkbenchTurnOutcome,
	WorkbenchTurnPart,
	WorkbenchTurnProjection,
} from "@/ui/workbench-timeline/types/contract";
import { isRecord } from "@/ui/workbench-timeline/lib/details";

type BrowserTurn = BrowserTimeline["turns"][number];
type BrowserItem = BrowserTurn["items"][number];

const SUPPORTED_MEDIA: ReadonlySet<string> = new Set([
	"text",
	"reasoning",
	"plan",
	"tool",
	"command",
	"fileChange",
	"approval",
]);

const FAILED_STATUSES: ReadonlySet<string> = new Set(["failed", "declined", "cancelled"]);

/**
 * The stable message id of one turn.
 * @param threadId The thread.
 * @param turnId The turn.
 * @returns The id.
 */
function workbenchRuntimeMessageId(threadId: string, turnId: string): string {
	return JSON.stringify(["message", threadId, turnId]);
}

/**
 * A published item as a record, or a refusal when it has no identity.
 * @param value The item as published.
 * @returns The record.
 */
function identifiedItem(value: unknown): Record<string, unknown> {
	if (!isRecord(value) || typeof value["itemId"] !== "string") {
		throw new Error("A Codex item has no authoritative identity.");
	}
	return value;
}

/**
 * The item id of an identified item.
 * @param item The identified item.
 * @returns The id.
 */
function identityOf(item: Record<string, unknown>): string {
	const itemId = item["itemId"];
	return typeof itemId === "string" ? itemId : "";
}

/**
 * The retained identity of one item. An item the shared model does not
 * describe still keeps its id and kind, marked unsupported, so nothing is lost.
 * @param value The item as published.
 * @returns The metadata.
 */
function itemMetadata(value: unknown): WorkbenchCodexItemMetadata {
	const item = identifiedItem(value);
	const media = item["media"];
	const itemId = identityOf(item);
	const kind = typeof media === "string" ? media : "unknown";
	// The browser model brands item ids; a string read back from a published
	// item is the same identity, re-read rather than re-minted.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const brandedId = itemId as WorkbenchCodexItemMetadata["itemId"];
	return {
		itemId: brandedId,
		kind,
		supported: SUPPORTED_MEDIA.has(kind),
		value: { ...item, itemId },
	};
}

/**
 * The identity a duplicate check keys on.
 * @param threadId The thread.
 * @param turnId The turn.
 * @param item The item metadata.
 * @returns The identity.
 */
function codexItemIdentity(
	threadId: string,
	turnId: string,
	item: WorkbenchCodexItemMetadata,
): string {
	return JSON.stringify([threadId, turnId, item.itemId, item.kind]);
}

/**
 * A tool-shaped part for one item.
 * @param item The item.
 * @param name The tool name.
 * @param detail The detail text.
 * @param status The status.
 * @returns The part.
 */
function toolPart(
	item: BrowserItem,
	name: string,
	detail: string,
	status: string,
): WorkbenchTurnPart {
	return {
		kind: "tool",
		callId: `${item.itemId}:${item.media}`,
		name,
		detail,
		status,
		failed: FAILED_STATUSES.has(status),
	};
}

/**
 * The part one published item becomes.
 * @param item The item.
 * @returns The part.
 */
function itemPart(item: BrowserItem): WorkbenchTurnPart {
	switch (item.media) {
		case "text":
		case "plan":
			return { kind: "text", text: item.text };
		case "reasoning":
			return { kind: "reasoning", text: item.text };
		default:
			return toolItemPart(item);
	}
}

/**
 * The tool-shaped part of a tool, command, file change or approval item.
 * @param item The item.
 * @returns The part.
 */
function toolItemPart(item: Extract<BrowserItem, { readonly status: string }>): WorkbenchTurnPart {
	switch (item.media) {
		case "tool":
			return toolPart(item, item.name, "", item.status);
		case "command":
			return toolPart(item, "command", item.command, item.status);
		case "fileChange":
			return toolPart(item, "fileChange", "", item.status);
		default:
			return toolPart(item, "approval", item.approvalId, item.status);
	}
}

/**
 * The parts of one turn: its items, or its summary when it has no items to show.
 * @param turn The turn.
 * @returns The parts.
 */
function turnParts(turn: BrowserTurn): readonly WorkbenchTurnPart[] {
	if (turn.items.length > 0) {
		return turn.items.map(itemPart);
	}
	return turn.status === "inProgress" ? [] : [{ kind: "text", text: turn.summary }];
}

/**
 * The outcome of a turn.
 * @param status The turn status.
 * @returns The outcome.
 */
function turnOutcome(status: BrowserTurn["status"]): WorkbenchTurnOutcome {
	return status === "inProgress" ? "running" : status;
}

/**
 * The retained metadata of one turn, refusing duplicate item identities.
 * @param timeline The timeline.
 * @param turn The turn.
 * @param seenItems Every item identity projected so far.
 * @returns The metadata.
 */
function turnMetadata(
	timeline: BrowserTimeline,
	turn: BrowserTurn,
	seenItems: Set<string>,
): WorkbenchTurnMetadata {
	const items = turn.items.map((item) => {
		const metadata = itemMetadata(item);
		const identity = codexItemIdentity(timeline.threadId, turn.turnId, metadata);
		if (seenItems.has(identity)) {
			throw new Error(`Duplicate Codex item identity: ${identity}`);
		}
		seenItems.add(identity);
		return metadata;
	});
	return {
		threadId: timeline.threadId,
		turnId: turn.turnId,
		summary: turn.summary,
		outputsIncluded: turn.outputsIncluded,
		outputsTruncated: turn.outputsTruncated,
		items,
	};
}

/**
 * Project every turn of a timeline.
 * @param timeline The authoritative timeline.
 * @returns One projection per turn, in order.
 */
function projectTimelineTurns(timeline: BrowserTimeline): readonly WorkbenchTurnProjection[] {
	const seenTurns = new Set<string>();
	const seenItems = new Set<string>();
	return timeline.turns.map((turn) => {
		if (seenTurns.has(turn.turnId)) {
			throw new Error(`Duplicate Codex turn identity: ${turn.turnId}`);
		}
		seenTurns.add(turn.turnId);
		return {
			id: workbenchRuntimeMessageId(timeline.threadId, turn.turnId),
			outcome: turnOutcome(turn.status),
			failure:
				turn.status === "failed"
					? "The Codex turn failed. Inspect the workbench details and retry."
					: null,
			parts: turnParts(turn),
			metadata: turnMetadata(timeline, turn, seenItems),
		};
	});
}

/**
 * A projection that stands in for a timeline that could not be mapped.
 * @param threadId The thread, or a placeholder.
 * @param reason Why the mapping failed.
 * @returns The projection.
 */
function failureProjection(threadId: string, reason: string): WorkbenchTurnProjection {
	const turnId = `runtime-failure:${threadId}`;
	// The failure names no real turn; its id is minted here so the message
	// keeps the same identity shape as an authoritative one.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const brandedThread = threadId as WorkbenchTurnMetadata["threadId"];
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const brandedTurn = turnId as WorkbenchTurnMetadata["turnId"];
	return {
		id: workbenchRuntimeMessageId(threadId, turnId),
		outcome: "failed",
		failure: reason,
		parts: [{ kind: "text", text: reason }],
		metadata: {
			threadId: brandedThread,
			turnId: brandedTurn,
			summary: reason,
			outputsIncluded: false,
			outputsTruncated: false,
			items: [],
		},
	};
}

export { failureProjection, projectTimelineTurns, workbenchRuntimeMessageId };
