import {
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicApprovalIdentity,
	type DynamicToolApprovalDecision,
	type DynamicToolApprovalRequest,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import { dynamicErrorForResponse } from "@/runtime/codex-dynamic-tools/lib/classification";
import { validateDecisionShape } from "@/runtime/codex-dynamic-tools/lib/effects";
import type { PreparedDynamicMutation } from "@/runtime/codex-dynamic-tools/lib/effects";
import { nowOf } from "@/runtime/codex-dynamic-tools/lib/dispatch-support";

/**
 * Whether two approval identities are the same one, compared as the canonical JSON the hash is
 * taken over rather than field by field.
 * @param left One identity.
 * @param right The other.
 * @returns Whether they are the same.
 */
function approvalIdentityExact(
	left: DynamicApprovalIdentity,
	right: DynamicApprovalIdentity,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * The decision an approval gets when nobody answered it: expired if its deadline has passed,
 * and otherwise disconnected. Either way the mutation does not run.
 * @param request The approval request.
 * @param nowMs The current time.
 * @returns The decision.
 */
function approvalDecisionFallback(
	request: DynamicToolApprovalRequest,
	nowMs: number,
): DynamicToolApprovalDecision {
	if (nowMs >= request.expiresAtMs) {
		return Object.freeze({
			outcome: "expired",
			identity: request.identity,
			effectHash: request.effectHash,
			decidedAtMs: nowMs,
			cause: "deadline_reached",
		});
	}
	return Object.freeze({
		outcome: "disconnected",
		identity: request.identity,
		effectHash: request.effectHash,
		decidedAtMs: nowMs,
		cause: "browser_disconnected",
	});
}

/**
 * Settle one approval exactly once, so no request is left open for a second answer.
 * @param options The dynamic tools options.
 * @param request The approval request.
 * @param decision The decision it was answered with.
 */
async function settleApproval(
	options: CodexDynamicToolsOptions,
	request: DynamicToolApprovalRequest,
	decision: DynamicToolApprovalDecision,
): Promise<void> {
	try {
		await options.approval.settleIdentityAndEffectHashOnce({ request, decision });
	} catch (error) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The visual approval could not be settled once.",
			error,
		);
	}
}

/**
 * Whether a decision is a person actually approving the effect.
 * @param decision The decision.
 * @returns Whether the effect was approved.
 */
function approvedDecision(decision: DynamicToolApprovalDecision): boolean {
	return decision.outcome === "approved" && decision.cause === "person_approved";
}

/**
 * Whether a decision leaves the effect still needing an approval, because nobody answered.
 * @param decision The decision.
 * @returns Whether an approval is still required.
 */
function approvalRequiredDecision(decision: DynamicToolApprovalDecision): boolean {
	return decision.outcome === "cancelled" || decision.outcome === "disconnected";
}

/**
 * Whether a decision says the child itself disconnected rather than the approval being answered.
 * @param decision The decision.
 * @returns Whether the child disconnected.
 */
function childDisconnectedDecision(decision: DynamicToolApprovalDecision): boolean {
	return decision.outcome === "disconnected" && decision.cause === "child_disconnected";
}

/**
 * What a caller is told when its effect was not approved: that a person declined it, or that
 * nobody answered in time.
 * @param decision The decision.
 * @returns The refusal reason and message.
 */
function approvalRefusal(decision: DynamicToolApprovalDecision): {
	readonly reason: "approval_declined" | "expired";
	readonly message: string;
} {
	return decision.outcome === "declined"
		? { reason: "approval_declined", message: "The person declined this dynamic effect." }
		: { reason: "expired", message: "The visual approval expired before the effect could run." };
}

/**
 * Put the request in front of a person, settling it as unanswered if it cannot even be shown.
 * @param prepared The prepared mutation.
 * @param options The dynamic tools options.
 */
async function presentRequest(
	prepared: PreparedDynamicMutation,
	options: CodexDynamicToolsOptions,
): Promise<void> {
	try {
		await options.approval.presentImmutableRequest(prepared.request);
	} catch (error) {
		const decision = approvalDecisionFallback(prepared.request, nowOf(options));
		await settleApproval(options, prepared.request, decision);
		throw new CodexDynamicToolsError(
			"system_error",
			"The visual approval request could not be presented.",
			error,
		);
	}
}

/**
 * An answer given after the deadline, rewritten as the expiry it actually is, so a late answer
 * cannot authorize an effect the request had already stopped asking about.
 * @param decision The decision as given.
 * @param request The approval request.
 * @returns The decision as it stands against the deadline.
 */
function deadlineAdjusted(
	decision: DynamicToolApprovalDecision,
	request: DynamicToolApprovalRequest,
): DynamicToolApprovalDecision {
	const answered = decision.outcome === "approved" || decision.outcome === "declined";
	if (!answered || decision.decidedAtMs < request.expiresAtMs) {
		return decision;
	}
	return Object.freeze({
		outcome: "expired",
		identity: request.identity,
		effectHash: request.effectHash,
		decidedAtMs: decision.decidedAtMs,
		cause: "deadline_reached",
	});
}

/**
 * The decision as the boundary will act on it, refusing an expiry the deadline does not support.
 * @param decision The decision as given.
 * @param request The approval request.
 * @returns The decision.
 */
function checkedDecision(
	decision: DynamicToolApprovalDecision,
	request: DynamicToolApprovalRequest,
): DynamicToolApprovalDecision {
	validateDecisionShape(decision, request);
	const adjusted = deadlineAdjusted(decision, request);
	if (adjusted.outcome === "expired" && adjusted.decidedAtMs < request.expiresAtMs) {
		throw new CodexDynamicToolsError("invalid_call", "The approval expired before its deadline.");
	}
	return adjusted;
}

/**
 * Ask a person about one mutation and settle exactly one answer.
 *
 * Whatever comes back is weighed against the request's own deadline before it is believed: an
 * approval that arrived too late becomes the expiry it is, and a decision the request cannot
 * account for settles the request as unanswered rather than leaving it open.
 * @param prepared The prepared mutation.
 * @param options The dynamic tools options.
 * @returns The settled decision.
 */
async function approveMutation(
	prepared: PreparedDynamicMutation,
	options: CodexDynamicToolsOptions,
): Promise<DynamicToolApprovalDecision> {
	await presentRequest(prepared, options);
	let decision: DynamicToolApprovalDecision;
	try {
		decision = await options.approval.awaitOneExactVisualDecision(prepared.request);
	} catch {
		decision = approvalDecisionFallback(prepared.request, nowOf(options));
	}
	let settled: DynamicToolApprovalDecision;
	try {
		settled = checkedDecision(decision, prepared.request);
	} catch (error) {
		const fallback = approvalDecisionFallback(prepared.request, nowOf(options));
		await settleApproval(options, prepared.request, fallback);
		throw dynamicErrorForResponse(error);
	}
	await settleApproval(options, prepared.request, settled);
	return settled;
}

export {
	approvalDecisionFallback,
	approvalIdentityExact,
	approvalRefusal,
	approvalRequiredDecision,
	approveMutation,
	approvedDecision,
	childDisconnectedDecision,
	settleApproval,
};
