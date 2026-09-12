import { CodexEpochError } from "@/runtime/codex-epoch";
import { ADDITIONAL_CONTEXT_POLICY } from "@/runtime/codex-instructions";
import type { SemanticCursor, SettledSemanticChangeEvent } from "@/runtime/codex-semantic-context";
import { CodexThreadLinkError, type ThreadLinkReasonCode } from "@/runtime/codex-thread-link";
import type { ThreadLinkSnapshot } from "@/runtime/codex-thread-link";
import type { ChildEpoch, ChildId, ThreadId } from "@/shared/codex-workbench-identity";
import type {
	CodexThreadContextDeliveryOptions,
	CodexThreadContextTarget,
	CodexThreadContextDeliveryReason,
	CodexThreadContextExecution,
} from "@/runtime/codex-thread-context/lib/contract";
import type { DeliveryTarget } from "@/runtime/codex-thread-context/lib/delivery-state";

type Reason = CodexThreadContextDeliveryReason;

/** The reason vocabulary the thread-link classifier is allowed to emit. */
const THREAD_LINK_REASON_CODES: ReadonlySet<string> = new Set(
	ADDITIONAL_CONTEXT_POLICY.threadLink.reasonPrecedence.map(({ reason }) => reason),
);

/**
 * Whether a free-form reason string is one the thread-link policy defines.
 * @param value - The reason carried by an event's thread link.
 * @returns True when it is a policy reason code.
 */
function isThreadLinkReasonCode(value: string | null): value is ThreadLinkReasonCode {
	return value !== null && THREAD_LINK_REASON_CODES.has(value);
}

/**
 * Compares a child generation against the delivery target's generation.
 * @param childId - The child being checked.
 * @param epoch - The epoch being checked.
 * @param target - The exact target the delivery was bound to.
 * @returns `stale_child` or `prior_epoch` when the generation differs, otherwise null.
 */
function generationReason(
	childId: ChildId,
	epoch: ChildEpoch,
	target: DeliveryTarget,
): Reason | null {
	if (childId !== target.childId) {
		return "stale_child";
	}
	if (epoch !== target.epoch) {
		return "prior_epoch";
	}
	return null;
}

/**
 * Translates a failed epoch assertion into a delivery reason.
 * @param error - Whatever the epoch authority threw.
 * @returns The matching generation reason, or `thread_revalidation_failed` for anything else.
 */
function epochErrorReason(error: unknown): Reason {
	if (!(error instanceof CodexEpochError)) {
		return "thread_revalidation_failed";
	}
	switch (error.code) {
		case "stale_child":
			return "stale_child";
		case "prior_epoch":
			return "prior_epoch";
		case "unknown_provenance":
			return "unknown_provenance";
		default:
			return "thread_revalidation_failed";
	}
}

/**
 * Translates a failed classification into a delivery reason.
 * @param error - Whatever the thread-link classifier threw.
 * @returns `unknown_provenance` when no current epoch exists, otherwise `thread_revalidation_failed`.
 */
function classificationErrorReason(error: unknown): Reason {
	return error instanceof CodexThreadLinkError && error.code === "current_epoch_unavailable"
		? "unknown_provenance"
		: "thread_revalidation_failed";
}

/**
 * The reason a non-executable link snapshot refuses delivery.
 * @param link - A pane's current link.
 * @returns `unbound` for an empty link, otherwise the link's own reason.
 */
function linkReason(link: ThreadLinkSnapshot): Reason {
	return link.state === "unbound" ? "unbound" : (link.reason ?? "unknown_provenance");
}

/**
 * Reads the current child capability without letting a throwing adapter
 * escape the delivery; a failed read counts as no execution.
 * @param options - The delivery options carrying the capability reader.
 * @returns The current execution, or null when unavailable.
 */
function readExecution(
	options: CodexThreadContextDeliveryOptions,
): CodexThreadContextExecution | null {
	try {
		return options.currentExecution();
	} catch {
		return null;
	}
}

/**
 * Checks that the live child capability is the one the delivery was bound to
 * and is still the identity authority's current epoch.
 * @param execution - The child capability read just now.
 * @param identity - The identity authority that knows the current epoch.
 * @param target - The exact delivery target.
 * @returns The refusal reason, or null when the capability is current.
 */
function executionReason(
	execution: CodexThreadContextExecution | null,
	identity: CodexThreadContextDeliveryOptions["identity"],
	target: DeliveryTarget,
): Reason | null {
	if (execution === null) {
		return "child_exit";
	}
	const currentGeneration = generationReason(execution.childId, execution.epoch, target);
	if (currentGeneration !== null) {
		return currentGeneration;
	}
	if (!identity.validator.isCurrentEpoch(execution.childId, execution.epoch)) {
		return (
			generationReason(execution.childId, execution.epoch, {
				threadId: target.threadId,
				childId: identity.validator.childId,
				epoch: identity.validator.epoch,
				operationId: target.operationId,
			}) ?? "unknown_provenance"
		);
	}
	return null;
}

/**
 * Checks that a link snapshot still names the exact delivery target.
 * @param link - The pane's link, freshly read or classified.
 * @param target - The exact delivery target.
 * @returns The refusal reason, or null when the link is executable for the target.
 */
function targetLinkReason(link: ThreadLinkSnapshot, target: DeliveryTarget): Reason | null {
	if (link.state !== "executable") {
		return linkReason(link);
	}
	if (link.threadId !== target.threadId) {
		return "link_changed";
	}
	if (link.childId !== target.childId) {
		return "stale_child";
	}
	if (link.epoch !== target.epoch) {
		return "prior_epoch";
	}
	return null;
}

/**
 * The reason an event's own thread-link snapshot refuses delivery.
 * @param event - The settled semantic change.
 * @returns The refusal reason, or null when the event's link is executable.
 */
function eventLinkReason(event: SettledSemanticChangeEvent): Reason | null {
	if (event.threadLink.state === "executable") {
		return null;
	}
	if (event.threadLink.state === "unbound") {
		return "unbound";
	}
	return isThreadLinkReasonCode(event.threadLink.reason)
		? event.threadLink.reason
		: "unknown_provenance";
}

/**
 * Applies the significance policy: a cosmetic change carries no design intent
 * and is nobody's news.
 *
 * Who wrote it is deliberately not judged here. Every origin is deliverable —
 * after ADR 0023 a person does not write a board at all, so refusing `agent`
 * would refuse everything — and whether a change is this thread's own is
 * decided by the writer identity it carries, not by the vocabulary.
 * @param event - The settled semantic change.
 * @returns The refusal reason, or null when the change qualifies.
 */
function eventShapeReason(event: SettledSemanticChangeEvent): Reason | null {
	if (event.source !== "settled_change") {
		return "invalid_event";
	}
	if (event.origin !== "human" && event.origin !== "mixed" && event.origin !== "agent") {
		return "invalid_event";
	}
	if (event.change.significance === "cosmetic") {
		return "cosmetic";
	}
	return null;
}

/**
 * Whether this change is one this session's own work made.
 *
 * The rule a reader asked for: a session hears every board update except the
 * ones it makes itself. What is compared is the writing thread against the
 * threads this session IS — the workhorse and the coordinator paired with it —
 * and never a surface. A pane rode here once, and a pane is what a person has
 * open: it was read to decide who should not be told, so closing one or looking
 * at another board went quiet, and two threads on one claimed board suppressed
 * each other.
 *
 * A thread that goes on being the same thread is the same session, so a write
 * landing after the turn that made it is still its own; a relink or a new
 * session is a new thread and so a new author. Neither the identity the board
 * was held under nor the board itself is compared: a claim is one value shared
 * by a whole campaign, and what a pane displays has nothing to do with what a
 * session needs to know.
 *
 * A change nobody attributed is delivered. An external command line states no
 * session, and delivering its change is redundancy the session is told how to
 * read, where dropping it would be the silence this exists to prevent. The
 * value is stated by the writer and nothing here can check it — the same trust
 * boundary `--doing` sits on — and the harm runs one way: a session that lies
 * about its identity buys silence for itself, never noise for anybody else.
 * @param event - The settled semantic change.
 * @param sessionAuthors - The threads this session is; empty when it has none to compare.
 * @returns The refusal reason, or null when the change is somebody else's.
 */
function ownSessionReason(
	event: SettledSemanticChangeEvent,
	sessionAuthors: readonly string[],
): Reason | null {
	const by = event.change.by;
	return by !== null && sessionAuthors.includes(by) ? "own_change" : null;
}

/**
 * Validates the event cursor against this delivery port's feed.
 * @param cursor - The event's cursor.
 * @param eventFeedId - The feed the event says it belongs to.
 * @param expectedFeedId - The feed this delivery port is fixed to.
 * @returns `invalid_event` for a malformed sequence, `stale_cursor` for another feed, else null.
 */
function cursorReason(
	cursor: SemanticCursor,
	eventFeedId: string,
	expectedFeedId: string,
): Reason | null {
	if (!Number.isInteger(cursor.sequence) || cursor.sequence < 0) {
		return "invalid_event";
	}
	if (eventFeedId !== expectedFeedId || cursor.feedId !== expectedFeedId) {
		return "stale_cursor";
	}
	return null;
}

/**
 * Checks that the embedded change record agrees with the event envelope.
 * @param event - The settled semantic change.
 * @param cursor - The event's cursor.
 * @returns `invalid_event` on any disagreement, otherwise null.
 */
function changeRecordReason(
	event: SettledSemanticChangeEvent,
	cursor: SemanticCursor,
): Reason | null {
	if (
		event.change.feedId !== event.feedId ||
		event.change.cursor.feedId !== cursor.feedId ||
		event.change.cursor.sequence !== cursor.sequence ||
		event.change.origin !== event.origin
	) {
		return "invalid_event";
	}
	return null;
}

/**
 * Structural validation of the event: policy shape, cursor and change record.
 * @param event - The settled semantic change.
 * @param feedId - The feed this delivery port is fixed to.
 * @returns The refusal reason, or null when the event is well formed.
 */
function eventFormReason(event: SettledSemanticChangeEvent, feedId: string): Reason | null {
	const shape = eventShapeReason(event);
	if (shape !== null) {
		return shape;
	}
	if (event.cursor === null) {
		return "invalid_event";
	}
	const cursor = cursorReason(event.cursor, event.feedId, feedId);
	if (cursor !== null) {
		return cursor;
	}
	return changeRecordReason(event, event.cursor);
}

/**
 * Checks that the event describes this pane, is still fresh, and carries an
 * executable thread link.
 * @param event - The settled semantic change.
 * @param paneId - The pane this delivery port serves.
 * @returns The refusal reason, or null when the event's context is usable.
 */
function eventContextReason(event: SettledSemanticChangeEvent, paneId: string): Reason | null {
	if (event.pane.paneId !== paneId) {
		return "invalid_event";
	}
	if (event.staleness.state !== "current" || event.freshness.state !== "fresh") {
		return "stale_event";
	}
	return eventLinkReason(event);
}

/** The identity evidence an event must carry before it can be matched to a target. */
interface ProvenEvent {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly sequence: number;
}

/**
 * Extracts the child generation, workhorse thread and cursor an event proves.
 * @param event - The settled semantic change.
 * @returns The proven identities, or null when any of them is missing.
 */
function provenEvent(event: SettledSemanticChangeEvent): ProvenEvent | null {
	if (event.child.id === null || event.child.epoch === null) {
		return null;
	}
	if (event.workhorse.threadId === null || event.cursor === null) {
		return null;
	}
	return {
		childId: event.child.id,
		epoch: event.child.epoch,
		threadId: event.workhorse.threadId,
		sequence: event.cursor.sequence,
	};
}

/**
 * Checks that the event's proven generation and thread are the delivery target
 * and that its sequence advances past what this port already reserved.
 * @param proven - The identities the event proves.
 * @param target - The exact delivery target.
 * @param lastSequence - The highest sequence reserved before this event.
 * @returns The refusal reason, or null when the event targets this delivery.
 */
function eventTargetReason(
	proven: ProvenEvent,
	target: DeliveryTarget,
	lastSequence: number,
): Reason | null {
	const generation = generationReason(proven.childId, proven.epoch, target);
	if (generation !== null) {
		return generation;
	}
	if (proven.threadId !== target.threadId) {
		return "link_changed";
	}
	if (proven.sequence <= lastSequence) {
		return "stale_cursor";
	}
	return null;
}

/**
 * The complete event-side revalidation: form, context and target, in the
 * order the contract lists them, so the first failing check names the reason.
 * @param event - The settled semantic change.
 * @param options - The delivery options naming feed, pane and target.
 * @param lastSequence - The highest sequence reserved before this event.
 * @returns The refusal reason, or null when the event may proceed.
 */
function eventReason(
	event: SettledSemanticChangeEvent,
	options: CodexThreadContextDeliveryOptions,
	lastSequence: number,
): Reason | null {
	const admissible =
		eventFormReason(event, options.feedId) ??
		ownSessionReason(event, options.sessionAuthors?.() ?? []) ??
		eventContextReason(event, options.paneId);
	return admissible ?? targetReason(event, options.target, lastSequence);
}

/**
 * What the event proves about its target, or why it proves nothing.
 * @param event - The settled semantic change.
 * @param target - The exact delivery target.
 * @param lastSequence - The highest sequence reserved before this event.
 * @returns The refusal reason, or null when the target is proven.
 */
function targetReason(
	event: SettledSemanticChangeEvent,
	target: CodexThreadContextTarget,
	lastSequence: number,
): Reason | null {
	const proven = provenEvent(event);
	return proven === null ? "unknown_provenance" : eventTargetReason(proven, target, lastSequence);
}

export {
	classificationErrorReason,
	epochErrorReason,
	eventReason,
	executionReason,
	generationReason,
	readExecution,
	targetLinkReason,
};
