import type { EpochTransaction } from "@/runtime/codex-epoch";
import type { SessionThread } from "@/runtime/codex-session";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import type {
	CodexDynamicToolsOptions,
	DynamicCallerAuthority,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import type { DynamicOperationSettlement } from "@/runtime/codex-dynamic-tools/lib/effects";
import {
	MUTATION_KINDS,
	assertBeforeEffect,
	dynamicReason,
	refusalMessage,
	remoteOutcome,
	settle,
	stage,
	type MutationExecution,
} from "@/runtime/codex-dynamic-tools/lib/mutation-staging";
import {
	initialTurnValue,
	notDeliveredInitial,
	unknownInitial,
	type InitialTurnResult,
} from "@/runtime/codex-dynamic-tools/lib/mutation-context";

/** What settling one undelivered mutation needs. */
interface SettlementScope {
	readonly options: CodexDynamicToolsOptions;
	readonly operationSettlement: DynamicOperationSettlement;
	readonly operationId: Parameters<typeof settle>[2];
	readonly transaction: EpochTransaction;
}

/**
 * What a mutation reports when the thread it asked for was not made: an unknown outcome the
 * caller must go and look at, or a plain refusal it can act on.
 * @param error What the session threw.
 * @param message What to say when the mutation simply did not reach the remote.
 * @param operationWireId The identity the mutation ran under, as it goes on the wire.
 * @param scope What to settle the identity against.
 * @returns The execution.
 */
function undeliveredThread(
	error: unknown,
	message: string,
	operationWireId: string,
	scope: SettlementScope,
): MutationExecution {
	const outcome = remoteOutcome(error);
	if (outcome === "outcome_unknown") {
		settle(
			scope.options,
			scope.operationSettlement,
			scope.operationId,
			scope.transaction,
			"outcome_unknown",
		);
		return { kind: "outcome_unknown", operationId: operationWireId };
	}
	settle(
		scope.options,
		scope.operationSettlement,
		scope.operationId,
		scope.transaction,
		"not_delivered",
	);
	return { kind: "refused", reason: "not_ready", message };
}

/** Which mutation is being staged, and which RPC carries it out. */
type MutationKind = (typeof MUTATION_KINDS)[keyof typeof MUTATION_KINDS];

/**
 * What a new thread reports about the first turn it was also asked to start.
 * @param initial What the turn did.
 * @param initialId The identity the turn ran under, as it goes on the wire.
 * @returns The initial-turn value.
 */
function initialTurnReport(
	initial: InitialTurnResult,
	initialId: string,
): Readonly<Record<string, unknown>> {
	if (initial.delivery === "outcome_unknown") {
		return unknownInitial(initialId);
	}
	if (initial.delivery === "delivered") {
		return initialTurnValue("delivered", initialId, initial.turn, null);
	}
	return notDeliveredInitial(initialId, initial.message ?? "The initial turn was not delivered.");
}

/**
 * The thread state a new thread is reported in: one whose first turn's outcome nobody can
 * establish may only be inspected, because acting on it could double a turn that did run.
 * @param delivery What the first turn did.
 * @returns The state.
 */
function threadStateAfterInitialTurn(delivery: string): "inspect_only" | "executable" {
	return delivery === "outcome_unknown" ? "inspect_only" : "executable";
}

/**
 * The refusal a mutation reports when something it needed was unavailable.
 * @param error What was thrown.
 * @param fallback What to say when the failure says nothing.
 * @returns The refusal.
 */
function refusal(error: unknown, fallback: string): MutationExecution {
	return {
		kind: "refused",
		reason: dynamicReason(error),
		message: refusalMessage(error, fallback),
	};
}

/**
 * Stage one mutation in the local ledger, having first checked the call is still executing.
 * @param options The dynamic tools options.
 * @param request The server request.
 * @param caller The caller's authority.
 * @param operationId The identity the mutation runs under.
 * @param kinds Which mutation it is, and which RPC carries it out.
 * @returns The staged transaction.
 */
async function stageMutation(
	options: CodexDynamicToolsOptions,
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
	operationId: Parameters<typeof stage>[0]["operationId"],
	kinds: MutationKind,
): Promise<EpochTransaction> {
	await assertBeforeEffect(options, request, caller);
	return stage({ options, caller, operationId, kind: kinds.kind, rpc: kinds.rpc });
}

/**
 * What a fork reports: the thread it made, the state that thread may be used in, and what
 * became of the first turn it was or was not asked to start.
 * @param thread The forked thread.
 * @param operationWireId The identity the fork ran under, as it goes on the wire.
 * @param initialTurn What became of the first turn.
 * @param state The state the thread may be used in.
 * @returns The execution.
 */
function forkedThread(
	thread: SessionThread,
	operationWireId: string,
	initialTurn: unknown,
	state: "inspect_only" | "executable" = "executable",
): MutationExecution {
	return {
		kind: "ok",
		operationId: operationWireId,
		value: { threadId: String(thread.id), state, initialTurn },
	};
}

export {
	type MutationKind,
	type SettlementScope,
	forkedThread,
	initialTurnReport,
	refusal,
	stageMutation,
	threadStateAfterInitialTurn,
	undeliveredThread,
};
