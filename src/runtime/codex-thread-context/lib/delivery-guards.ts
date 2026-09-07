import type { EpochExecutionRequest } from "@/runtime/codex-epoch";
import type {
	ThreadLinkBindingSnapshot,
	ThreadLinkClassification,
} from "@/runtime/codex-thread-link";
import type {
	CodexThreadContextDeliveryOptions,
	CodexThreadContextDeliveryReason,
} from "@/runtime/codex-thread-context/lib/contract";
import type {
	DeliveryState,
	DeliveryTarget,
} from "@/runtime/codex-thread-context/lib/delivery-state";
import { eventIdentityReason } from "@/runtime/codex-thread-context/lib/event-identity";
import { sameBinding, sameLink } from "@/runtime/codex-thread-context/lib/link-equality";
import {
	epochErrorReason,
	eventReason,
	executionReason,
	readExecution,
	targetLinkReason,
} from "@/runtime/codex-thread-context/lib/refusal-reasons";

type Reason = CodexThreadContextDeliveryReason;

/**
 * The durable-authority request for a delivery target.
 * @param target - The exact delivery target.
 * @returns The request the epoch store checks with `assertCurrent`.
 */
function requestFor(target: DeliveryTarget): EpochExecutionRequest {
	return {
		childId: target.childId,
		epoch: target.epoch,
		operationId: target.operationId,
		threadId: target.threadId,
	};
}

/**
 * Re-reads the pane binding and checks it is still the binding captured at the
 * start of the delivery.
 * @param options - The delivery options carrying the thread-link reader.
 * @param state - The delivery state holding the initial binding.
 * @returns The current binding, or `link_changed` when it cannot be read or differs.
 */
function currentBinding(
	options: CodexThreadContextDeliveryOptions,
	state: DeliveryState,
): ThreadLinkBindingSnapshot | "link_changed" {
	let binding: ThreadLinkBindingSnapshot;
	try {
		binding = options.threadLink.read(options.paneId);
	} catch {
		return "link_changed";
	}
	return sameBinding(binding, state.initialBinding) ? binding : "link_changed";
}

/**
 * Checks the live pane binding against the captured one and the classification.
 * @param options - The delivery options.
 * @param state - The delivery state holding the initial binding.
 * @param classification - The classification read just before the final gate.
 * @returns The refusal reason, or null when the binding is unchanged and executable.
 */
function finalBindingReason(
	options: CodexThreadContextDeliveryOptions,
	state: DeliveryState,
	classification: ThreadLinkClassification,
): Reason | null {
	const binding = currentBinding(options, state);
	if (binding === "link_changed") {
		return binding;
	}
	if (!sameLink(binding.link, classification.link)) {
		return "link_changed";
	}
	return targetLinkReason(binding.link, options.target);
}

/**
 * Asserts the durable epoch authority for the target one more time.
 * @param options - The delivery options carrying the epoch store.
 * @returns The refusal reason, or null when the target is current.
 */
function epochAuthorityReason(options: CodexThreadContextDeliveryOptions): Reason | null {
	try {
		options.epoch.assertCurrent(requestFor(options.target));
	} catch (error) {
		return epochErrorReason(error);
	}
	return null;
}

/**
 * Checks the target still carries an operation id and durable authority.
 * @param options - The delivery options.
 * @returns The refusal reason, or null when the authority holds.
 */
function finalAuthorityReason(options: CodexThreadContextDeliveryOptions): Reason | null {
	if (typeof options.target.operationId !== "string" || options.target.operationId.length === 0) {
		return "unknown_provenance";
	}
	return epochAuthorityReason(options);
}

/**
 * The last freshness gate: the event must still be inside its window and no
 * later event may have been reserved on this feed.
 * @param state - The delivery state.
 * @param options - The delivery options carrying the clock and feed.
 * @param highestReservedSequence - Reads the highest sequence reserved so far.
 * @returns `stale_event`, `stale_cursor`, or null when the event is still current.
 */
function finalFreshnessReason(
	state: DeliveryState,
	options: CodexThreadContextDeliveryOptions,
	highestReservedSequence: () => number,
): Reason | null {
	const now = options.now();
	if (!Number.isFinite(now) || now >= state.event.freshness.freshUntilMs) {
		return "stale_event";
	}
	if (state.id.feedId === options.feedId && state.id.sequence < highestReservedSequence()) {
		return "stale_cursor";
	}
	return null;
}

/**
 * Re-validates the event itself: its identity and every event-side rule.
 * @param state - The delivery state.
 * @param options - The delivery options.
 * @returns The refusal reason, or null when the event still qualifies.
 */
function finalEventReason(
	state: DeliveryState,
	options: CodexThreadContextDeliveryOptions,
): Reason | null {
	const identityFailure = eventIdentityReason(state.event, state.id);
	if (identityFailure !== null) {
		return identityFailure;
	}
	return eventReason(state.event, options, -1);
}

/**
 * The synchronous guard run immediately before the one `thread/inject_items`
 * call, after the last asynchronous authority read: event, child, binding,
 * durable authority and freshness are all checked again without awaiting.
 * @param state - The delivery state.
 * @param options - The delivery options.
 * @param classification - The classification just read.
 * @param highestReservedSequence - Reads the highest sequence reserved so far.
 * @returns The refusal reason, or null when the injection may proceed.
 */
function finalReason(
	state: DeliveryState,
	options: CodexThreadContextDeliveryOptions,
	classification: ThreadLinkClassification,
	highestReservedSequence: () => number,
): Reason | null {
	const eventFailure = finalEventReason(state, options);
	if (eventFailure !== null) {
		return eventFailure;
	}
	const executionFailure = executionReason(
		readExecution(options),
		options.identity,
		options.target,
	);
	if (executionFailure !== null) {
		return executionFailure;
	}
	const bindingFailure = finalBindingReason(options, state, classification);
	if (bindingFailure !== null) {
		return bindingFailure;
	}
	const authorityFailure = finalAuthorityReason(options);
	if (authorityFailure !== null) {
		return authorityFailure;
	}
	return finalFreshnessReason(state, options, highestReservedSequence);
}

/**
 * Event-side check after the attempt; any event failure now means the event
 * went stale while the response was outstanding.
 * @param state - The delivery state.
 * @param options - The delivery options.
 * @returns The refusal reason, or null when the event is unchanged.
 */
function afterAttemptEventReason(
	state: DeliveryState,
	options: CodexThreadContextDeliveryOptions,
): Reason | null {
	try {
		const identityFailure = eventIdentityReason(state.event, state.id);
		if (identityFailure !== null) {
			return identityFailure;
		}
		return eventReason(state.event, options, -1) === null ? null : "stale_event";
	} catch {
		return "stale_event";
	}
}

/**
 * After the injection returned, decides whether the authority the attempt
 * relied on is still intact; if not the outcome is unknown with this reason.
 * @param state - The delivery state.
 * @param options - The delivery options.
 * @returns The reason the outcome is unknown, or null when authority held.
 */
function afterAttemptReason(
	state: DeliveryState,
	options: CodexThreadContextDeliveryOptions,
): Reason | null {
	const eventFailure = afterAttemptEventReason(state, options);
	if (eventFailure !== null) {
		return eventFailure;
	}
	const executionFailure = executionReason(
		readExecution(options),
		options.identity,
		options.target,
	);
	if (executionFailure !== null) {
		return executionFailure;
	}
	const binding = currentBinding(options, state);
	if (binding === "link_changed") {
		return binding;
	}
	return epochAuthorityReason(options);
}

export { afterAttemptReason, finalReason };
