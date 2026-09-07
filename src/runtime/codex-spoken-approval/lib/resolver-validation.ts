import { ARCHBOARD_VOICE_MANIFEST_SHA256 } from "@/runtime/codex-coordinator-tool-contract";
import type { ApprovalSnapshot } from "@/runtime/codex-approvals";
import type { ActiveSlot } from "@/runtime/codex-spoken-approval/lib/state";
import {
	failure,
	failureForIdentity,
	sameBinding,
	sameRealtime,
	type CallValidationFailure,
	type ValidationHost,
} from "@/runtime/codex-spoken-approval/lib/validation";
import type { DynamicServerRequest } from "@/runtime/codex-transport";

/**
 * Why a resolver call is not one this gate owns: it must come from the coordinator's own tool
 * dispatcher and carry identities this child issued.
 * @param host - The validation host, without its transcript.
 * @param request - The resolver call.
 * @returns The failure, or null.
 */
function resolverOwnershipFailure(
	host: Omit<ValidationHost, "transcript">,
	request: DynamicServerRequest,
): CallValidationFailure | null {
	if (request.owner !== "codex-coordinator-tools") {
		return failure(
			"ambiguous",
			"invalid_call",
			"Only coordinator-owned voice calls can resolve a spoken approval.",
		);
	}
	try {
		host.identity.decoder.parseJsonRpcRequestId(request.requestId);
		host.identity.decoder.parseWireRequestCorrelation(request.correlation);
		host.identity.decoder.parseLogicalToolCallCorrelation(request.logicalCall);
	} catch (error) {
		return failureForIdentity(error);
	}
	if (
		request.correlation.requestId !== request.requestId ||
		request.logicalCall.child !== request.child ||
		request.logicalCall.epoch !== request.epoch
	) {
		return failure(
			"stale_state",
			"unknown_provenance",
			"The voice call correlation is internally inconsistent.",
		);
	}
	return null;
}

/**
 * Why a resolver call does not belong to the armed gate's own child and epoch.
 * @param host - The validation host, without its transcript.
 * @param slot - The armed gate.
 * @param request - The resolver call.
 * @returns The failure, or null.
 */
function resolverEpochFailure(
	host: Omit<ValidationHost, "transcript">,
	slot: ActiveSlot,
	request: DynamicServerRequest,
): CallValidationFailure | null {
	if (request.child !== slot.child || request.correlation.child !== slot.child) {
		return failure(
			"stale_realtime_session",
			"stale_child",
			"The voice call belongs to another Codex child.",
		);
	}
	if (request.epoch !== slot.epoch || request.correlation.epoch !== slot.epoch) {
		return failure(
			"stale_state",
			"prior_epoch",
			"The voice call belongs to a prior Codex child epoch.",
		);
	}
	try {
		host.identity.validator.assertCurrentEpoch(request.child, request.epoch);
	} catch (error) {
		return failureForIdentity(error);
	}
	return null;
}

/**
 * Why a resolver call is not the reviewed voice tool call on the gate's own coordinator thread.
 * The namespace, tool and manifest hash are all checked on both the logical call and the params:
 * a call that agrees only on one of them is not the reviewed contract.
 * @param slot - The armed gate.
 * @param request - The resolver call.
 * @returns The failure, or null.
 */
function resolverContractFailure(
	slot: ActiveSlot,
	request: DynamicServerRequest,
): CallValidationFailure | null {
	const checks = [
		request.logicalCall.threadId === slot.coordinatorThreadId,
		request.params.threadId === slot.coordinatorThreadId,
		request.params.threadId === request.logicalCall.threadId,
		request.logicalCall.namespace === "archboard_voice",
		request.params.namespace === "archboard_voice",
		request.logicalCall.tool === "resolve_spoken_approval",
		request.params.tool === "resolve_spoken_approval",
		request.logicalCall.manifestHash === ARCHBOARD_VOICE_MANIFEST_SHA256,
		request.params.turnId === request.logicalCall.turnId,
		request.params.callId === request.logicalCall.callId,
	];
	return checks.every((matched) => matched)
		? null
		: failure(
				"ambiguous",
				"invalid_call",
				"The voice call does not match the reviewed resolver contract.",
			);
}

/**
 * Why the host no longer holds the conversation the gate was armed on: the coordinator changed,
 * the voice session changed, or the gate's own window has passed.
 * @param host - The validation host, without its transcript.
 * @param slot - The armed gate.
 * @returns The failure, or null.
 */
function resolverConversationFailure(
	host: Omit<ValidationHost, "transcript">,
	slot: ActiveSlot,
): CallValidationFailure | null {
	const coordinator = host.currentCoordinator();
	if (coordinator === null) {
		return failure(
			"stale_state",
			"not_ready",
			"The coordinator is no longer ready for spoken approval resolution.",
		);
	}
	if (coordinator.child !== slot.child) {
		return failure(
			"stale_realtime_session",
			"stale_child",
			"The coordinator child changed while the spoken approval was pending.",
		);
	}
	if (coordinator.epoch !== slot.epoch) {
		return failure(
			"stale_state",
			"prior_epoch",
			"The coordinator epoch changed while the spoken approval was pending.",
		);
	}
	if (coordinator.threadId !== slot.coordinatorThreadId) {
		return failure(
			"stale_state",
			"unknown_provenance",
			"The coordinator thread changed while the spoken approval was pending.",
		);
	}
	return resolverSessionFailure(host, slot);
}

/**
 * Why the voice session or the gate's own expiry no longer allows a spoken resolution.
 * @param host - The validation host, without its transcript.
 * @param slot - The armed gate.
 * @returns The failure, or null.
 */
function resolverSessionFailure(
	host: Omit<ValidationHost, "transcript">,
	slot: ActiveSlot,
): CallValidationFailure | null {
	const realtime = host.currentRealtime();
	if (realtime === null || !sameRealtime(realtime, slot.realtime)) {
		return failure(
			"stale_realtime_session",
			"unknown_provenance",
			"The realtime session changed while the spoken approval was pending.",
		);
	}
	const time = host.currentTime();
	if (time === null || time >= slot.expiresAtMs) {
		return failure(
			"timeout",
			"expired",
			"The spoken approval gate has expired; use the visual approval surface.",
		);
	}
	return null;
}

/**
 * Why the approval itself can no longer be resolved by voice: it is gone, expired, no longer
 * pending, or its target or effect has changed since the person was read it.
 * @param host - The validation host, without its transcript.
 * @param slot - The armed gate.
 * @returns The failure, or null.
 */
function resolverApprovalFailure(
	host: Omit<ValidationHost, "transcript">,
	slot: ActiveSlot,
): CallValidationFailure | null {
	const approval = host.approvalBroker.get(slot.requestId);
	if (approval === undefined) {
		return failure(
			"resolver_lost",
			"not_ready",
			"The pending approval is no longer known to the approval broker.",
		);
	}
	if (approval.state === "expired") {
		return failure(
			"timeout",
			"expired",
			"The visual approval expired before the spoken resolver ran.",
		);
	}
	if (approval.state !== "pending") {
		return failure("stale_state", "not_ready", "The approval is no longer pending.");
	}
	if (!sameArmedApproval(approval, slot)) {
		return failure(
			"changed_effect",
			"unknown_provenance",
			"The approval target or effect changed while the spoken gate was pending.",
		);
	}
	return resolverEligibilityFailure(host, slot);
}

/**
 * Whether the approval is still the exact one the gate was armed on, down to its binding and
 * expiry: a changed effect must be read aloud again rather than resolved from the old prompt.
 * @param approval - The current approval.
 * @param slot - The armed gate.
 * @returns True when nothing about the approval has changed.
 */
function sameArmedApproval(approval: ApprovalSnapshot, slot: ActiveSlot): boolean {
	const checks = [
		approval.approvalId === slot.approvalId,
		approval.family === slot.approvalFamily,
		approval.expiresAtMs === slot.approvalExpiresAtMs,
		sameBinding(approval.binding, slot.approvalBinding),
	];
	return checks.every((matched) => matched);
}

/**
 * Why the broker no longer considers the approval eligible for spoken resolution.
 * @param host - The validation host, without its transcript.
 * @param slot - The armed gate.
 * @returns The failure, or null.
 */
function resolverEligibilityFailure(
	host: Omit<ValidationHost, "transcript">,
	slot: ActiveSlot,
): CallValidationFailure | null {
	let eligibility;
	try {
		eligibility = host.approvalBroker.spokenEligibility(slot.requestId);
	} catch {
		return failure(
			"resolver_lost",
			"not_ready",
			"The approval broker could not revalidate the spoken approval.",
		);
	}
	if (eligibility.eligible) {
		return null;
	}
	return failure(
		eligibility.reason === "stale_ownership" ? "changed_effect" : "ambiguous",
		eligibility.reason === "stale_ownership" ? "unknown_provenance" : "unsupported",
		"The pending approval is no longer eligible for spoken resolution.",
	);
}

/**
 * Why a resolver call did not come from the classifier turn the gate started, when the caller
 * requires that: a resolution from any other turn is not the classifier's answer.
 * @param slot - The armed gate.
 * @param request - The resolver call.
 * @param requireTurn - Whether the caller requires the classifier turn.
 * @returns The failure, or null.
 */
function resolverTurnFailure(
	slot: ActiveSlot,
	request: DynamicServerRequest,
	requireTurn: boolean,
): CallValidationFailure | null {
	if (!requireTurn) {
		return null;
	}
	const expectedTurn = slot.classifierTurnId ?? slot.startedTurnId;
	if (expectedTurn !== null && request.logicalCall.turnId !== expectedTurn) {
		return failure(
			"ambiguous",
			"invalid_call",
			"The resolver call did not come from the classifier turn.",
		);
	}
	return null;
}

/**
 * Validate a call that claims to resolve the armed spoken approval. Everything is re-checked at
 * this point, because the person answered aloud some time after the gate was armed: the call's
 * ownership and identities, the child and epoch, the reviewed voice contract, the conversation it
 * belongs to, the approval itself, and the turn it came from.
 * @param host - The validation host, without its transcript.
 * @param slot - The armed gate.
 * @param request - The resolver call.
 * @param requireTurn - Whether the call must come from the classifier turn.
 * @returns The failure, or null when the call may resolve the approval.
 */
function validateResolverCall(
	host: Omit<ValidationHost, "transcript">,
	slot: ActiveSlot,
	request: DynamicServerRequest,
	requireTurn: boolean,
): CallValidationFailure | null {
	return (
		resolverOwnershipFailure(host, request) ??
		resolverEpochFailure(host, slot, request) ??
		resolverContractFailure(slot, request) ??
		resolverConversationFailure(host, slot) ??
		resolverApprovalFailure(host, slot) ??
		resolverTurnFailure(slot, request, requireTurn)
	);
}

export { validateResolverCall };
