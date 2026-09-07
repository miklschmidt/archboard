import { isDeepStrictEqual } from "node:util";
import type { ThreadLinkEpochProof } from "@/runtime/codex-thread-link";
import { sameRealtimeGeneration } from "@/runtime/codex-coordinator-callbacks/lib/realtime";
import type {
	CoordinatorCallback,
	CoordinatorCallbackCorrelation,
	CoordinatorCallbackDeliveryReason,
	CoordinatorCallbackLinkCorrelation,
	CoordinatorCallbackOptions,
} from "@/runtime/codex-coordinator-callbacks/lib/contract";

/**
 * Structural equality, used to compare captured link and proof documents against live ones.
 * @param left - One value.
 * @param right - The other value.
 * @returns Whether the two are deeply equal.
 */
function sameJson(left: unknown, right: unknown): boolean {
	return isDeepStrictEqual(left, right);
}

/**
 * Whether the host's current link is the same binding, at the same revision, on the same link and target as the one captured with the callback.
 * @param left - The host's current link, or null when there is none.
 * @param right - The link captured with the callback.
 * @returns True when the two describe the same binding.
 */
function sameLink(
	left: CoordinatorCallbackLinkCorrelation | null,
	right: CoordinatorCallbackLinkCorrelation,
): boolean {
	return (
		left !== null &&
		left.binding.paneId === right.binding.paneId &&
		left.binding.revision === right.binding.revision &&
		sameJson(left.binding.link, right.binding.link) &&
		sameJson(left.target, right.target)
	);
}

/**
 * The operation record inside a thread-link proof, which is either an execution proof wrapping a record or the record itself.
 * @param value - The proof, or null or undefined when there is none.
 * @returns The record, or null.
 */
function proofRecord(value: ThreadLinkEpochProof | null | undefined): unknown {
	if (value === null || value === undefined) {
		return null;
	}
	return "record" in value ? value.record : value;
}

/** A fresh classification of a callback's link target. */
type LiveClassification = Awaited<ReturnType<CoordinatorCallbackOptions["threadLink"]["classify"]>>;

/**
 * Whether the live link is the same executable link the callback captured, on the same thread,
 * child and epoch.
 * @param correlation - The callback's correlation.
 * @param live - The fresh classification.
 * @returns True when the live link still matches the capture.
 */
function liveLinkMatchesCallback(
	correlation: CoordinatorCallbackCorrelation,
	live: LiveClassification,
): boolean {
	return (
		live.link.state === "executable" &&
		sameJson(live.link, correlation.workhorseLink.binding.link) &&
		live.link.threadId === correlation.workhorseThreadId &&
		live.link.childId === correlation.childId &&
		live.link.epoch === correlation.epoch
	);
}

/**
 * Whether the live durable epoch is the one the callback was correlated against.
 * @param correlation - The callback's correlation.
 * @param live - The fresh classification.
 * @returns True when the live epoch names the callback's child and epoch.
 */
function liveEpochMatchesCallback(
	correlation: CoordinatorCallbackCorrelation,
	live: LiveClassification,
): boolean {
	const epoch = live.currentEpoch;
	return (
		epoch !== null && epoch.childId === correlation.childId && epoch.epoch === correlation.epoch
	);
}

/**
 * Whether the live epoch proof is the same operation record the callback captured, and, when the
 * capture carried an execution proof, still at the same manifest revision.
 * @param captured - The link correlation captured with the callback.
 * @param live - The fresh classification.
 * @returns True when the proof still matches the capture.
 */
function liveProofMatchesCallback(
	captured: CoordinatorCallbackLinkCorrelation,
	live: LiveClassification,
): boolean {
	if (live.proof === null) {
		return false;
	}
	const provenance = captured.target.provenance;
	if (!sameJson(live.proof.record, proofRecord(provenance))) {
		return false;
	}
	if (provenance === null || provenance === undefined || !("record" in provenance)) {
		return true;
	}
	return live.proof.manifestRevision === provenance.manifestRevision;
}

/**
 * Whether a fresh classification still authorizes this callback. `canAcceptDirectInput` and
 * `loaded` are not re-checked here: an executable link already carries both.
 * @param callback - The normalized callback.
 * @param live - The fresh classification of the callback's link target.
 * @returns True when the link, epoch and proof all still match the capture.
 */
function classificationAccepted(callback: CoordinatorCallback, live: LiveClassification): boolean {
	const correlation = callback.correlation;
	return (
		liveLinkMatchesCallback(correlation, live) &&
		liveEpochMatchesCallback(correlation, live) &&
		liveProofMatchesCallback(correlation.workhorseLink, live)
	);
}

/**
 * Why the child or coordinator no longer authorizes delivery, checked before anything about the
 * workhorse link: the child exited, turned over, or the coordinator thread is no longer the one
 * the callback belongs to.
 * @param correlation - The callback's correlation.
 * @param options - The host authorities.
 * @returns The refusal reason, or null when the child and coordinator still hold.
 */
function childAuthorityReason(
	correlation: CoordinatorCallbackCorrelation,
	options: CoordinatorCallbackOptions,
): CoordinatorCallbackDeliveryReason | null {
	const child = options.currentChild();
	if (child === null) {
		return "child_exit";
	}
	if (child.childId !== correlation.childId) {
		return "stale_child";
	}
	if (child.epoch !== correlation.epoch) {
		return "prior_epoch";
	}
	return coordinatorAuthorityReason(correlation, options);
}

/**
 * Why the coordinator no longer authorizes delivery: there is none, or it is not the same
 * coordinator thread on the same child and epoch the callback belongs to.
 * @param correlation - The callback's correlation.
 * @param options - The host authorities.
 * @returns The refusal reason, or null when the coordinator still holds.
 */
function coordinatorAuthorityReason(
	correlation: CoordinatorCallbackCorrelation,
	options: CoordinatorCallbackOptions,
): CoordinatorCallbackDeliveryReason | null {
	const coordinator = options.currentCoordinator();
	if (
		coordinator === null ||
		coordinator.childId !== correlation.childId ||
		coordinator.epoch !== correlation.epoch ||
		coordinator.threadId !== correlation.coordinatorThreadId
	) {
		return "stale_coordinator";
	}
	return null;
}

/**
 * Why the workhorse link no longer authorizes delivery: the host's current link has moved on, or
 * the captured link is not an executable link on the callback's own thread.
 * @param correlation - The callback's correlation.
 * @param options - The host authorities.
 * @returns The refusal reason, or null when the link still holds.
 */
function linkAuthorityReason(
	correlation: CoordinatorCallbackCorrelation,
	options: CoordinatorCallbackOptions,
): CoordinatorCallbackDeliveryReason | null {
	if (!sameLink(options.currentWorkhorseLink(), correlation.workhorseLink)) {
		return "stale_link";
	}
	const captured = correlation.workhorseLink.binding.link;
	if (
		correlation.workhorseThreadId === null ||
		captured.state !== "executable" ||
		captured.threadId !== correlation.workhorseThreadId
	) {
		return "stale_link";
	}
	return null;
}

/**
 * Why the voice session no longer authorizes delivery: the generation turned over, or a semantic
 * callback names a voice session other than the one the generation is speaking through.
 * @param callback - The normalized callback.
 * @param options - The host authorities.
 * @returns The refusal reason, or null when the voice generation still holds.
 */
function voiceAuthorityReason(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
): CoordinatorCallbackDeliveryReason | null {
	const correlation = callback.correlation;
	if (
		!sameRealtimeGeneration(options.currentRealtimeGeneration(), correlation.realtimeGeneration)
	) {
		return "stale_session";
	}
	if (
		correlation.realtimeGeneration !== null &&
		callback.kind === "semantic" &&
		correlation.realtimeSessionId !== correlation.realtimeGeneration.wireSessionId
	) {
		return "stale_session";
	}
	return null;
}

/**
 * Why the host no longer authorizes delivering this callback, checked in the order the authority
 * is layered: child, then coordinator, then workhorse link, then voice generation.
 * @param callback - The normalized callback.
 * @param options - The host authorities.
 * @returns The refusal reason, or null when every authority still holds.
 */
function finalAuthorityReason(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
): CoordinatorCallbackDeliveryReason | null {
	return (
		childAuthorityReason(callback.correlation, options) ??
		linkAuthorityReason(callback.correlation, options) ??
		voiceAuthorityReason(callback, options)
	);
}

/**
 * Why an attempt that has already happened can no longer be reported as delivered: the module was disposed, or an authority moved on while the attempt was in flight.
 * @param callback - The normalized callback.
 * @param options - The host authorities.
 * @param disposed - Whether the module was disposed during the attempt.
 * @returns The reason, or null when the attempt still counts.
 */
function afterAttemptReason(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
	disposed: boolean,
): CoordinatorCallbackDeliveryReason | null {
	if (disposed) {
		return "disposed";
	}
	return finalAuthorityReason(callback, options);
}

export {
	classificationAccepted,
	finalAuthorityReason,
	afterAttemptReason,
	type LiveClassification,
};
