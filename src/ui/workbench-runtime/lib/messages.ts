// The one named seam where Archboard's turn projections become assistant-ui
// messages. The projection is Archboard's model; the message is the vendor's.
// Nothing else in the runtime spells a vendor message field.

import {
	fromThreadMessageLike,
	type MessageStatus,
	type ThreadMessage,
	type ThreadMessageLike,
} from "@assistant-ui/react";

import type {
	WorkbenchTurnOutcome,
	WorkbenchTurnPart,
	WorkbenchTurnProjection,
} from "@/ui/workbench-timeline";

type MessagePart = Exclude<ThreadMessageLike["content"], string>[number];

const EPOCH = new Date(0);

/**
 * The vendor status of a turn outcome.
 * @param outcome The outcome.
 * @param failure The failure words, when failed.
 * @returns The status.
 */
function messageStatus(outcome: WorkbenchTurnOutcome, failure: string | null): MessageStatus {
	switch (outcome) {
		case "running":
			return { type: "running" };
		case "completed":
			return { type: "complete", reason: "stop" };
		case "interrupted":
			return { type: "incomplete", reason: "cancelled" };
		default:
			return { type: "incomplete", reason: "error", error: { message: failure ?? "failed" } };
	}
}

/**
 * The vendor part of one Archboard part.
 * @param part The part.
 * @returns The vendor part.
 */
function messagePart(part: WorkbenchTurnPart): MessagePart {
	if (part.kind !== "tool") {
		return part.kind === "text"
			? { type: "text", text: part.text }
			: { type: "reasoning", text: part.text };
	}
	return {
		type: "tool-call",
		toolCallId: part.callId,
		toolName: part.name,
		args: {},
		argsText: part.detail,
		result: part.status,
		isError: part.failed,
	};
}

/**
 * One turn projection as a vendor message-like value.
 * @param turn The projection.
 * @returns The message.
 */
function toThreadMessageLike(turn: WorkbenchTurnProjection): ThreadMessageLike {
	return {
		id: turn.id,
		role: "assistant",
		createdAt: EPOCH,
		content: turn.parts.map(messagePart),
		status: messageStatus(turn.outcome, turn.failure),
		metadata: { custom: { archboard: turn.metadata } },
	};
}

/**
 * One turn projection as a complete vendor message, for read-only providers.
 * @param turn The projection.
 * @returns The message.
 */
function toThreadMessage(turn: WorkbenchTurnProjection): ThreadMessage {
	return fromThreadMessageLike(
		toThreadMessageLike(turn),
		turn.id,
		messageStatus(turn.outcome, turn.failure),
	);
}

export { toThreadMessage, toThreadMessageLike };
