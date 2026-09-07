import type {
	ApprovalBinding,
	ApprovalOutcome,
	ApprovalResolveInput,
	ApprovalResponse,
	ApprovalTerminalDelivery,
	CodexApprovalBrokerOptions,
	TerminalApprovalState,
} from "@/runtime/codex-approvals/lib/contract";
import { CodexApprovalError as ApprovalError } from "@/runtime/codex-approvals/lib/contract";
import type { ApprovalRecord } from "@/runtime/codex-approvals/lib/approval-record";
import { isTerminal, sameBinding } from "@/runtime/codex-approvals/lib/approval-record";
import { completeBinding } from "@/runtime/codex-approvals/lib/request";
import {
	fallbackResponse,
	toServerResponse,
	validateApprovalResponse,
} from "@/runtime/codex-approvals/lib/response";

/** What this approval settles as, once the binding has been re-checked against the answer. */
export interface ProvenSettlement {
	readonly state: TerminalApprovalState;
	readonly reason: string;
	readonly response: ApprovalResponse;
}

/** The encoded server response, or what encoding it threw. */
export type EncodedResponse =
	| { readonly ok: true; readonly value: ReturnType<typeof toServerResponse> }
	| { readonly ok: false; readonly error: unknown };

/** The write of one response, and whether the transport was reached at all. */
export interface AttemptedWrite {
	readonly promise: Promise<void>;
	readonly attempted: boolean;
}

/**
 * Whether the binding a caller supplied with an answer is the one the approval was made under. A
 * caller that supplies none is trusted to be answering the approval it was shown.
 * @param record - The record.
 * @param input - The resolve input.
 * @returns True when the evidence matches.
 */
export function bindingEvidenceMatches(
	record: ApprovalRecord,
	input: ApprovalResolveInput,
): boolean {
	if (input.binding === undefined) {
		return true;
	}
	try {
		return sameBinding(record.request.binding, completeBinding(record.request, input.binding));
	} catch {
		return false;
	}
}

/**
 * Claim the one terminal settlement this approval gets, and stop its expiry timer. A second claim
 * is refused rather than allowed to answer Codex twice.
 * @param record - The record being settled.
 * @param terminalDelivery - Whether this settlement carries an authored answer.
 * @throws {ApprovalError} When the approval has already entered terminal settlement.
 */
export function claimTerminal(
	record: ApprovalRecord,
	terminalDelivery: Exclude<ApprovalTerminalDelivery, null>,
): void {
	if (isTerminal(record.state) || record.terminalClaimed) {
		throw new ApprovalError(
			"invalid_state",
			"The approval has already entered terminal settlement without a reusable result.",
			record.request.requestId,
		);
	}
	record.terminalClaimed = true;
	record.terminalDelivery = terminalDelivery === "authored_response" ? "authored_response" : null;
	if (record.timer !== undefined) {
		clearTimeout(record.timer);
	}
	record.timer = undefined;
}

/**
 * What this approval actually settles as, checked against the binding as it stands now. An approval
 * whose target or effect has changed since the person was asked settles as stale with its family's
 * fallback instead: the answer they gave was to a different question.
 * @param record - The record being settled.
 * @param liveBinding - The binding the approval would have right now, or null when it has none.
 * @param requested - The state, reason and response the caller asked to settle with.
 * @returns The state, reason and response to settle with.
 */
export function provenSettlement(
	record: ApprovalRecord,
	liveBinding: ApprovalBinding | null,
	requested: ProvenSettlement,
): ProvenSettlement {
	if (liveBinding !== null && sameBinding(liveBinding, record.request.binding)) {
		return requested;
	}
	return {
		state: "stale",
		reason: "The approval target or effect is stale; visual fallback was sent.",
		response: fallbackResponse(record.request, "stale"),
	};
}

/**
 * Encode the settling answer as the response Codex is owed, validating it against the request once
 * more. A settled answer must still be one of the decisions Codex advertised; a fallback is not
 * held to that, because it is what the broker sends when nobody could answer.
 * @param record - The record being settled.
 * @param response - The answer to send.
 * @param finalState - The state it is settling as.
 * @returns The encoded response, or what encoding it threw.
 */
export function encodeServerResponse(
	record: ApprovalRecord,
	response: ApprovalResponse,
	finalState: TerminalApprovalState,
): EncodedResponse {
	try {
		const validated = validateApprovalResponse(record.request, response, {
			respectAvailableDecisions: finalState === "settled",
		});
		return { ok: true, value: toServerResponse(record.request, validated) };
	} catch (error) {
		return { ok: false, error };
	}
}

/**
 * Send one response to Codex, reporting whether the transport was reached at all, because a write
 * that never started did not deliver while one that started and then failed leaves the outcome
 * unknown.
 * @param transport - The transport to answer on.
 * @param record - The record being settled.
 * @param serverResponse - The encoded response.
 * @returns The write and whether it was attempted.
 */
export function attemptWrite(
	transport: CodexApprovalBrokerOptions["transport"],
	record: ApprovalRecord,
	serverResponse: ReturnType<typeof toServerResponse>,
): AttemptedWrite {
	try {
		return {
			promise: Promise.resolve(
				transport.respond(record.sourceRequest, "codex-approvals", serverResponse),
			),
			attempted: true,
		};
	} catch (error) {
		return { promise: Promise.reject(error), attempted: true };
	}
}

/**
 * Fold what the response write proved into the record's own state and reason, so a caller reading
 * the approval later sees an undelivered answer as undelivered rather than as an answer.
 * @param record - The settling record.
 * @param outcome - What the write proved about delivery.
 * @param fallbackReason - The settlement reason the record was given.
 */
export function applyOutcomeReason(
	record: ApprovalRecord,
	outcome: ApprovalOutcome,
	fallbackReason: string,
): void {
	if (outcome === "outcome_unknown") {
		record.state = "outcome_unknown";
		record.reason = `${fallbackReason} The response write outcome is unknown.`;
	} else if (outcome === "not_delivered") {
		record.reason = `${fallbackReason} The response was not delivered.`;
	}
}
