import type {
	ApprovalBinding,
	ApprovalDecision,
	ApprovalOutcome,
	ApprovalRequest,
	ApprovalResponse,
	ApprovalSettlement,
	ApprovalSnapshot,
	ApprovalState,
	ApprovalTerminalDelivery,
	SpokenApprovalEffectPresentation,
	TerminalApprovalState,
} from "@/runtime/codex-approvals/lib/contract";
import { CodexApprovalError as ApprovalError } from "@/runtime/codex-approvals/lib/contract";
import {
	failedSettlement,
	toSpokenEffectPresentation,
} from "@/runtime/codex-approvals/lib/response";
import type { ChildEpoch, ChildId } from "@/shared/codex-workbench-identity";
import type { TransportServerRequest } from "@/runtime/codex-transport/server-requests";

/** What the broker holds for one approval: the request it was made from, and where it has got to. */
export interface ApprovalRecord {
	readonly request: ApprovalRequest;
	readonly sourceRequest: TransportServerRequest;
	readonly spokenEffectPresentation: SpokenApprovalEffectPresentation | null;
	state: ApprovalState;
	outcome: ApprovalOutcome | null;
	reason: string | null;
	decision: ApprovalDecision | null;
	timer: ReturnType<typeof setTimeout> | undefined;
	settlementPromise?: Promise<ApprovalSettlement>;
	settlementResolve: ((settlement: ApprovalSettlement) => void) | undefined;
	terminalClaimed: boolean;
	terminalDelivery: ApprovalTerminalDelivery;
}

/** The child and epoch an exit names. */
export interface ChildExit {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
}

/**
 * Whether an approval has reached a state it can never leave.
 * @param state - The approval's state.
 * @returns True for every state but staged and pending.
 */
export function isTerminal(state: ApprovalState): state is TerminalApprovalState {
	return state !== "staged" && state !== "pending";
}

/**
 * Whether two bindings name the same child, epoch, link, target and effect. A binding is what an
 * answer is proven against, so every field must match.
 * @param left - One binding.
 * @param right - The other binding.
 * @returns True when they are the same binding.
 */
export function sameBinding(left: ApprovalBinding, right: ApprovalBinding): boolean {
	return (
		left.child === right.child &&
		left.epoch === right.epoch &&
		left.link === right.link &&
		left.target === right.target &&
		left.effect === right.effect
	);
}

/**
 * Any thrown value as an Error, so a diagnostic always has a message.
 * @param error - Whatever was thrown.
 * @returns The error.
 */
export function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

/**
 * Whether an approval belongs to one exited child epoch.
 * @param record - The record.
 * @param exit - The exited child and its epoch.
 * @returns True when the approval was made under that exact child epoch.
 */
export function belongsToChild(record: ApprovalRecord, exit: ChildExit): boolean {
	return record.request.child === exit.child && record.request.epoch === exit.epoch;
}

/**
 * What a plain verdict means: an explicit decline declines, an explicit cancel cancels, and the
 * remaining verdict approves.
 * @param decision - The decision the response carried.
 * @returns The decision as the broker records it.
 */
function verdictDecision(decision: unknown): ApprovalDecision {
	if (decision === "decline") {
		return "declined";
	}
	return decision === "cancel" ? "cancelled" : "approved";
}

/**
 * What a patch or command decision means: a denial object declines, a timeout or an abort cancels,
 * and anything else approves.
 * @param decision - The decision the response carried.
 * @returns The decision as the broker records it.
 */
function patchDecision(decision: unknown): ApprovalDecision {
	if (typeof decision === "object" && decision !== null && "denied" in decision) {
		return "declined";
	}
	return decision === "timed_out" || decision === "abort" ? "cancelled" : "approved";
}

/**
 * What an elicitation action means.
 * @param action - The action the response carried.
 * @returns The decision as the broker records it.
 */
function elicitationDecision(action: string): ApprovalDecision {
	if (action === "accept") {
		return "approved";
	}
	return action === "decline" ? "declined" : "cancelled";
}

/**
 * What one answered approval decided. Every family reduces to approved, declined or cancelled; the
 * families that carry content rather than a verdict always approve, because there is nothing in
 * them to decline with.
 * @param response - The validated response.
 * @returns The decision as the broker records it.
 */
export function approvalDecision(response: ApprovalResponse): ApprovalDecision {
	if (response.approvalKind === "command_execution" || response.approvalKind === "file_change") {
		return verdictDecision(response.decision);
	}
	if (response.approvalKind === "elicitation") {
		return elicitationDecision(response.action);
	}
	if (response.approvalKind === "apply_patch" || response.approvalKind === "exec_command") {
		return patchDecision(response.decision);
	}
	return "approved";
}

/**
 * The line a person would be read before answering this approval aloud, when it has one. A command
 * with no safe one-line summary stays visual-only rather than being refused outright.
 * @param request - The normalized request.
 * @returns The presentation, or null when the approval can only be answered on screen.
 */
export function spokenPresentationFor(
	request: ApprovalRequest,
): SpokenApprovalEffectPresentation | null {
	if (request.family !== "command_execution") {
		return null;
	}
	try {
		return toSpokenEffectPresentation(request);
	} catch {
		return null;
	}
}

/**
 * The terminal state a settling record is in. A record only reaches this point after its state has
 * been set to a terminal one, so a non-terminal state here would be a bug in the settlement
 * sequence rather than something a caller can cause.
 * @param record - The settling record.
 * @returns The terminal state.
 * @throws {ApprovalError} When the record is somehow not terminal.
 */
export function terminalStateOf(record: ApprovalRecord): TerminalApprovalState {
	if (!isTerminal(record.state)) {
		throw new ApprovalError(
			"invalid_state",
			"The approval settled without reaching a terminal state.",
			record.request.requestId,
		);
	}
	return record.state;
}

/**
 * The immutable snapshot of one approval: its identities, its binding, and where it has got to.
 * This is everything the workbench and its panes are told about an approval.
 * @param record - The broker's record.
 * @returns The frozen snapshot.
 */
export function snapshotOf(record: ApprovalRecord): ApprovalSnapshot {
	return Object.freeze({
		kind: "approval" as const,
		family: record.request.family,
		method: record.request.method,
		requestId: record.request.requestId,
		child: record.request.child,
		epoch: record.request.epoch,
		threadId: record.request.threadId,
		turnId: record.request.turnId,
		itemId: record.request.itemId,
		approvalId: record.request.approvalId,
		identity: record.request.identity,
		binding: record.request.binding,
		expiresAtMs: record.request.expiresAtMs,
		state: record.state,
		outcome: record.outcome,
		decision: record.decision,
		reason: record.reason,
	});
}

/**
 * The record for one newly staged approval, before it is published as pending.
 * @param sourceRequest - The transport request it came from.
 * @param request - The normalized, bound request.
 * @returns The record.
 */
export function stagedRecord(
	sourceRequest: TransportServerRequest,
	request: ApprovalRequest,
): ApprovalRecord {
	return {
		request,
		sourceRequest,
		spokenEffectPresentation: spokenPresentationFor(request),
		state: "staged",
		outcome: null,
		reason: null,
		decision: null,
		timer: undefined,
		settlementResolve: undefined,
		terminalClaimed: false,
		terminalDelivery: null,
	};
}

/**
 * What one settled approval reports to whoever asked for it. A delivered settlement reports the
 * state it reached; anything else reports the failure, so a caller can never read an undelivered
 * answer as an answer.
 * @param record - The settled record.
 * @param outcome - What the response write proved about delivery.
 * @param fallbackReason - The settlement reason to use when the record kept none.
 * @param error - What the write threw, when it threw.
 * @returns The frozen settlement.
 */
export function settlementResult(
	record: ApprovalRecord,
	outcome: ApprovalOutcome,
	fallbackReason: string,
	error?: unknown,
): ApprovalSettlement {
	const state = terminalStateOf(record);
	if (outcome === "delivered") {
		return Object.freeze({
			requestId: record.request.requestId,
			family: record.request.family,
			state,
			outcome,
			reason: record.reason ?? fallbackReason,
		});
	}
	const reason = error instanceof Error ? error.message : fallbackReason;
	return failedSettlement(record.request, state, outcome, record.reason ?? reason);
}
