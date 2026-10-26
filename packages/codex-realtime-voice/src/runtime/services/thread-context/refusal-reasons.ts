import { CodexEpochError } from "#runtime/store/epoch/contract.ts";
import { ADDITIONAL_CONTEXT_POLICY } from "#runtime/rules/instructions/context-policy.ts";
import {
	CodexThreadLinkError,
	type ThreadLinkReasonCode,
} from "#runtime/rules/thread-link/contract.ts";
import type { ThreadLinkSnapshot } from "#runtime/rules/thread-link/contract.ts";
import type { ChildEpoch, ChildId, ThreadId } from "@archboard/codex-app-server/identity";
import type {
	CodexThreadContextDeliveryOptions,
	CodexThreadContextTarget,
	CodexThreadContextDeliveryReason,
	CodexThreadContextExecution,
	WorkhorseContextEvent,
} from "#runtime/services/thread-context/contract.ts";
import type { DeliveryTarget } from "#runtime/services/thread-context/delivery-state.ts";

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
 * @param link - A current link.
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
 * @param link - The link, freshly read or classified.
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
 * The reason the link a change was announced under refuses delivery.
 * @param event - The announced change.
 * @returns The refusal reason, or null when the link was executable.
 */
function eventLinkReason(event: WorkhorseContextEvent): Reason | null {
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
 * Whether this change is one this session's own work made.
 *
 * The rule a reader asked for: a session hears every change except the
 * ones it makes itself. What is compared is the writing thread against the
 * threads this session IS — the workhorse and the coordinator paired with it —
 * and never a surface. A view of the page cannot be compared: closing one or
 * looking at something else would go quiet, and two threads working on one
 * thing would suppress each other.
 *
 * A thread that goes on being the same thread is the same session, so a write
 * landing after the turn that made it is still its own; a new conversation or a
 * new session is a new thread and so a new author.
 *
 * A change nobody attributed is delivered. A command line states no session,
 * and delivering its change is redundancy the session is told how to read,
 * where dropping it would be the silence this exists to prevent. The value is
 * stated by the host and nothing here can check it, and the harm runs one way:
 * a session that lies about its identity buys silence for itself, never noise
 * for anybody else.
 * @param event - The announced change.
 * @param sessionAuthors - The threads this session is; absent when it has none to compare.
 * @returns The refusal reason, or null when the change is somebody else's.
 */
function ownSessionReason(
	event: WorkhorseContextEvent,
	sessionAuthors: CodexThreadContextDeliveryOptions["sessionAuthors"],
): Reason | null {
	const by = event.author;
	return by !== null && (sessionAuthors?.() ?? []).includes(by) ? "own_change" : null;
}

/**
 * Refuses a change whose feed or sequence cannot identify it.
 * @param event - The announced change.
 * @returns `invalid_event` for an empty feed or a sequence that is no whole number from 0.
 */
function eventFormReason(event: WorkhorseContextEvent): Reason | null {
	return event.feedId.length === 0 || !Number.isSafeInteger(event.sequence) || event.sequence < 0
		? "invalid_event"
		: null;
}

/** The identity evidence an event must carry before it can be matched to a target. */
interface ProvenEvent {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly sequence: number;
}

/**
 * Extracts the child generation, workhorse thread and sequence a change proves.
 * @param event - The announced change.
 * @returns The proven identities, or null when any of them is missing.
 */
function provenEvent(event: WorkhorseContextEvent): ProvenEvent | null {
	if (event.child.id === null || event.child.epoch === null || event.workhorse.threadId === null) {
		return null;
	}
	return {
		childId: event.child.id,
		epoch: event.child.epoch,
		threadId: event.workhorse.threadId,
		sequence: event.sequence,
	};
}

/**
 * Checks that the event's proven generation and thread are the delivery target
 * and that its sequence passes what this port already reserved for its feed.
 * @param proven - The identities the event proves.
 * @param target - The exact delivery target.
 * @param lastSequence - The highest sequence of its feed reserved before this change.
 * @returns The refusal reason, or null when the change targets this delivery.
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
 * The complete change-side revalidation, in the order the contract lists them,
 * so the first failing check names the reason: its identity, whose it is,
 * whether the host withheld it, the link it was announced under, and its target.
 * @param event - The announced change.
 * @param options - The delivery options naming the session and target.
 * @param lastSequence - The highest sequence of its feed reserved before this change.
 * @returns The refusal reason, or null when the change may proceed.
 */
function eventReason(
	event: WorkhorseContextEvent,
	options: CodexThreadContextDeliveryOptions,
	lastSequence: number,
): Reason | null {
	return (
		eventFormReason(event) ??
		ownSessionReason(event, options.sessionAuthors) ??
		withheldReason(event) ??
		eventLinkReason(event) ??
		targetReason(event, options.target, lastSequence)
	);
}

/**
 * Refuses a change whose words the host withheld from this workhorse.
 * @param event - The announced change.
 * @returns `withheld`, or null when the host told it words.
 */
function withheldReason(event: WorkhorseContextEvent): Reason | null {
	return event.withheld === null ? null : "withheld";
}

/**
 * What the change proves about its target, or why it proves nothing.
 * @param event - The announced change.
 * @param target - The exact delivery target.
 * @param lastSequence - The highest sequence of its feed reserved before this change.
 * @returns The refusal reason, or null when the target is proven.
 */
function targetReason(
	event: WorkhorseContextEvent,
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
