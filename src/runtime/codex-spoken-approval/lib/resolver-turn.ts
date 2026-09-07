import { CodexApprovalError, type ApprovalSettlement } from "@/runtime/codex-approvals";
import { ResolveSpokenApprovalInputSchema } from "@/runtime/codex-coordinator-tool-contract";
import type { DynamicServerRequest } from "@/runtime/codex-transport";
import type { SpokenApprovalToolResult } from "@/runtime/codex-spoken-approval/lib/contract";
import type { ActiveSlot } from "@/runtime/codex-spoken-approval/lib/state";
import { clearTimer } from "@/runtime/codex-spoken-approval/lib/gate-state";
import type { ClassifierTurnHost } from "@/runtime/codex-spoken-approval/lib/classifier-turn";
import { refusal, safeMessage, success } from "@/runtime/codex-spoken-approval/lib/classifier-turn";
import { validateResolverCall } from "@/runtime/codex-spoken-approval/lib/resolver-validation";
import type { CallValidationFailure } from "@/runtime/codex-spoken-approval/lib/validation-primitives";

/**
 * The tool result for a resolver call that failed revalidation.
 * @param failure - The validation failure.
 * @returns The refusal.
 */
function validationRefusal(failure: CallValidationFailure): SpokenApprovalToolResult {
	return refusal(failure.refusal, failure.message);
}

/**
 * Why a resolver call cannot even be considered: it does not revalidate, or it arrived before the
 * person had said anything for the classifier to read.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @param request - The resolver call.
 * @returns The refusal to return, or null when the call may proceed.
 */
function resolverEntryRefusal(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	request: DynamicServerRequest,
): SpokenApprovalToolResult | null {
	const baseFailure = validateResolverCall(host, slot, request, false);
	if (baseFailure !== null) {
		host.enterFallback(slot, baseFailure.fallback);
		return validationRefusal(baseFailure);
	}
	if (slot.phase === "awaiting_user") {
		host.enterFallback(slot, "ambiguous");
		return refusal("not_ready", "The final user item has not produced a classifier turn yet.");
	}
	return null;
}

/**
 * Wait for the classifier turn's identity, but only when the resolver call has arrived before the
 * session has confirmed it.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @param request - The resolver call.
 * @returns The refusal to return, or null when the call may settle the approval.
 */
async function classifierIdentityRefusal(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	request: DynamicServerRequest,
): Promise<SpokenApprovalToolResult | null> {
	if (slot.phase !== "classifying" || slot.classifierTurnId !== null) {
		return null;
	}
	return awaitClassifierIdentity(host, slot, request);
}

/**
 * Wait for the classifier turn's identity when a resolver call arrives before the session has
 * confirmed it. Only one call may wait: a second one would make it ambiguous which answer settles
 * the approval.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @param request - The resolver call.
 * @returns The refusal to return, or null once the identity is known.
 */
async function awaitClassifierIdentity(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	request: DynamicServerRequest,
): Promise<SpokenApprovalToolResult | null> {
	if (slot.turnReady === null) {
		host.enterFallback(slot, "classifier_lost");
		return refusal("not_ready", "The classifier turn was lost before its identity was issued.");
	}
	if (slot.pendingResolverRequest !== null && slot.pendingResolverRequest !== request) {
		host.enterFallback(slot, "ambiguous");
		return refusal("invalid_call", "Only one resolver call may wait for classifier identity.");
	}
	slot.pendingResolverRequest = request;
	try {
		await slot.turnReady.promise;
		return null;
	} catch {
		return refusal("not_ready", "The classifier turn was lost before resolution.");
	} finally {
		if (slot.pendingResolverRequest === request) {
			slot.pendingResolverRequest = null;
		}
	}
}

/**
 * Mark the gate settled: the person's answer was delivered, so the expiry timer is dropped and
 * the final state published.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 */
function settleSpokenApproval(host: ClassifierTurnHost, slot: ActiveSlot): void {
	slot.phase = "settled";
	slot.reason = null;
	clearTimer(slot);
	host.publish(slot);
}

/**
 * Why a resolver call cannot settle this gate: it failed revalidation, a different call has
 * already claimed the slot, the same call is already settling, or the classifier is not at a
 * point where an answer means anything.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @param request - The resolver call.
 * @returns The refusal to return, or null when the call may settle the approval.
 */
function resolverRefusal(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	request: DynamicServerRequest,
): SpokenApprovalToolResult | null {
	const failure = validateResolverCall(host, slot, request, true);
	if (failure !== null) {
		host.enterFallback(slot, failure.fallback);
		return validationRefusal(failure);
	}
	if (slot.resolverCallId !== null) {
		if (slot.resolverCallId !== request.logicalCall.callId) {
			host.enterFallback(slot, "ambiguous");
			return refusal(
				"invalid_call",
				"A second resolver call cannot reuse the spoken approval slot.",
			);
		}
		return refusal("not_ready", "The resolver call is already being settled.");
	}
	if (slot.phase !== "awaiting_resolver" && slot.phase !== "classifying") {
		return refusal("not_ready", "The classifier turn is not awaiting a resolver call.");
	}
	return null;
}

/**
 * The refusal for a settlement the broker rejected, distinguishing an ownership or identity
 * mismatch from every other failure: the first means somebody else owns the approval now.
 * @param error - What the broker threw.
 * @returns The refusal to return.
 */
function settlementRefusal(error: unknown): SpokenApprovalToolResult {
	const reason =
		error instanceof CodexApprovalError &&
		(error.code === "stale_ownership" || error.code === "identity_mismatch")
			? "unknown_provenance"
			: "not_ready";
	return refusal(reason, `The spoken resolver was not accepted: ${safeMessage(error)}`);
}

/**
 * Settle the approval the person answered aloud and publish what happened. A settlement that did
 * not deliver, or that the broker settled against a changed approval, falls the gate back to the
 * visual surface while still reporting the verdict the person gave.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @param request - The resolver call.
 * @param verdict - What the person said.
 * @returns The tool result for the resolver call.
 */
async function handleResolver(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	request: DynamicServerRequest,
	verdict: "accept" | "decline",
): Promise<SpokenApprovalToolResult> {
	if (!host.isLive(slot)) {
		return refusal("not_ready", "No spoken approval is awaiting this resolver call.");
	}
	const refused = resolverRefusal(host, slot, request);
	if (refused !== null) {
		return refused;
	}
	slot.pendingResolverRequest = null;
	slot.resolverCallId = request.logicalCall.callId;
	slot.phase = "resolving";
	host.publish(slot);
	let settlement: ApprovalSettlement;
	try {
		settlement = await host.approvalBroker.resolve({
			requestId: slot.requestId,
			approvalId: slot.approvalId,
			binding: slot.approvalBinding,
			response: { approvalKind: "command_execution", decision: verdict },
		});
	} catch (error) {
		if (host.isLive(slot)) {
			host.enterFallback(slot, "resolver_lost");
		}
		return settlementRefusal(error);
	}
	return publishSettlement(host, slot, verdict, settlement);
}

/**
 * Publish how the approval settled. A settlement that did not deliver, or one the broker made
 * against an approval that had changed, still reports the verdict the person gave, but leaves the
 * gate in visual fallback so the person can see what happened.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @param verdict - What the person said.
 * @param settlement - How the broker settled it.
 * @returns The tool result for the resolver call.
 */
function publishSettlement(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	verdict: "accept" | "decline",
	settlement: ApprovalSettlement,
): SpokenApprovalToolResult {
	if (!host.isLive(slot)) {
		return refusal(
			"unknown_provenance",
			"The spoken approval state became stale during settlement.",
		);
	}
	slot.settlement = settlement;
	if (settlement.outcome === "delivered" && settlement.state === "settled") {
		settleSpokenApproval(host, slot);
		return success(verdict, settlement);
	}
	host.enterFallback(slot, settlement.state === "stale" ? "changed_effect" : "resolver_lost");
	return success(verdict, settlement);
}

/**
 * Resolve the armed spoken approval from a coordinator voice call. The call is revalidated, the
 * classifier turn's identity is waited for when the call arrives first, and the person's verdict
 * is then settled against the approval broker exactly once.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @param request - The resolver call.
 * @returns The tool result for the resolver call.
 */
async function resolveSpokenApproval(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	request: DynamicServerRequest,
): Promise<SpokenApprovalToolResult> {
	if (!host.isLive(slot)) {
		return refusal("not_ready", "There is no pending spoken approval to resolve.");
	}
	const parsed = ResolveSpokenApprovalInputSchema.safeParse(request.params.arguments);
	if (!parsed.success) {
		host.enterFallback(slot, "ambiguous");
		return refusal("invalid_call", "The resolver input must contain only accept or decline.");
	}
	const refused = resolverEntryRefusal(host, slot, request);
	if (refused !== null) {
		return refused;
	}
	const waited = await classifierIdentityRefusal(host, slot, request);
	if (waited !== null) {
		return waited;
	}
	return handleResolver(host, slot, request, parsed.data.verdict);
}

export { resolveSpokenApproval };
