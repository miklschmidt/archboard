import {
	createSelfThreadForkParams,
	createThreadForkParams,
	createTurnStartParams,
	canonicalContext,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
} from "@/runtime/codex-instructions";
import type { ArchboardContext } from "@/runtime/codex-instructions";
import type { EpochTransaction } from "@/runtime/codex-epoch";
import type { SessionParams, SessionThread, SessionTurn } from "@/runtime/codex-session";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import { ARCHBOARD_APP_DYNAMIC_TOOLS } from "@/runtime/codex-thread-tools";
import type { OperationId, ThreadId, TurnId } from "@/shared/codex-workbench-identity";
import {
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicCallerAuthority,
	type DynamicContextAuthority,
	type DynamicRelation,
	type DynamicTargetAuthority,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import type {
	DynamicOperationSettlement,
	PreparedDynamicMutation,
} from "@/runtime/codex-dynamic-tools/lib/effects";
import {
	assertBeforeEffect,
	freezeDeep,
	operationWire,
	refusalMessage,
	remoteOutcome,
	settle,
	stage,
	truncateUtf8,
} from "@/runtime/codex-dynamic-tools/lib/mutation-staging";

/** The longest reason an initial-turn value carries. */
const REASON_MAX_UTF8_BYTES = 512;

/** Which kinds of operation read fresh context, and what they are staged under. */
type ContextKind =
	| "create_thread_initial_turn"
	| "fork_thread_initial_turn"
	| "send_message_to_thread";

/**
 * What a mutation reports about the turn it also started: which turn it is when it ran, and why
 * it did not when it did not.
 * @param delivery What the turn did.
 * @param operationId The identity the turn ran under, as it goes on the wire.
 * @param turn The turn, when it ran.
 * @param errorMessage Why it did not run, when it did not.
 * @returns The frozen value.
 */
function initialTurnValue(
	delivery: "delivered" | "not_delivered" | "outcome_unknown",
	operationId: string,
	turn: SessionTurn | null,
	errorMessage: string | null,
): Readonly<Record<string, unknown>> {
	if (delivery === "delivered") {
		return freezeDeep({
			delivery,
			turnId: turn === null ? null : String(turn.id),
			operationId,
			reason: null,
		});
	}
	return freezeDeep({
		delivery,
		turnId: null,
		operationId,
		reason: errorMessage === null ? null : truncateUtf8(errorMessage, REASON_MAX_UTF8_BYTES),
	});
}

/**
 * The initial-turn value for a turn that did not run.
 * @param operationId The identity the turn would have run under.
 * @param message Why it did not run.
 * @returns The frozen value.
 */
function notDeliveredInitial(
	operationId: string,
	message: string,
): Readonly<Record<string, unknown>> {
	return initialTurnValue("not_delivered", operationId, null, message);
}

/**
 * The initial-turn value for a turn whose outcome nobody can establish, which is what tells a
 * caller to go and look before it mutates anything else.
 * @param operationId The identity the turn ran under.
 * @returns The frozen value.
 */
function unknownInitial(operationId: string): Readonly<Record<string, unknown>> {
	return initialTurnValue(
		"outcome_unknown",
		operationId,
		null,
		"The request may have taken effect. Inspect authoritative state before another mutation.",
	);
}

/**
 * The source a thread reports itself under, when it reports one.
 * @param thread The thread.
 * @returns The source, or null.
 */
function targetThreadSource(thread: SessionThread): string | null {
	return typeof thread.source === "string" ? thread.source : null;
}

/**
 * The parameters one turn is started with, carrying the operation identity as the message id so
 * the remote's own record names the identity the boundary accounted for.
 * @param targetThreadId The thread the turn belongs to.
 * @param operationId The identity the turn runs under, as it goes on the wire.
 * @param prompt What the turn says.
 * @param context The fresh Archboard context the turn runs in.
 * @returns The parameters.
 */
function turnParams(
	targetThreadId: ThreadId,
	operationId: string,
	prompt: string,
	context: ArchboardContext,
): SessionParams<"turn/start"> {
	const built = createTurnStartParams({
		threadId: targetThreadId,
		clientUserMessageId: operationId,
		prompt,
		context,
	});
	return {
		...built,
		threadId: targetThreadId,
	};
}

/**
 * The parameters one fork is carried out with. A self fork is built from the executing turn,
 * because a thread cannot be forked past the turn that is still being written.
 * @param caller The caller's authority.
 * @param target The target's authority.
 * @param relation How the caller stands to the target.
 * @param boundary Where the fork stops.
 * @param checkoutRoot The workspace the forked thread runs in.
 * @returns The parameters.
 */
function forkParams(
	caller: DynamicCallerAuthority,
	target: DynamicTargetAuthority,
	relation: DynamicRelation,
	boundary: TurnId | null,
	checkoutRoot: string,
): SessionParams<"thread/fork"> {
	if (relation === "self") {
		if (boundary !== caller.turnId) {
			throw new CodexDynamicToolsError(
				"invalid_call",
				"A self-fork must use the executing turn boundary.",
			);
		}
		const built = createSelfThreadForkParams({
			threadId: target.threadId,
			cwd: checkoutRoot,
			executingTurnId: caller.turnId,
		});
		const threadId: ThreadId = target.threadId;
		const beforeTurnId: TurnId = caller.turnId;
		return {
			threadId,
			beforeTurnId,
			cwd: built.cwd,
			runtimeWorkspaceRoots: built.runtimeWorkspaceRoots,
			developerInstructions: built.developerInstructions,
			ephemeral: built.ephemeral,
			threadSource: built.threadSource,
			excludeTurns: built.excludeTurns,
		} satisfies SessionParams<"thread/fork">;
	}
	const built = createThreadForkParams({
		threadId: target.threadId,
		cwd: checkoutRoot,
		...(boundary === null ? {} : { beforeTurnId: boundary }),
	});
	const threadId: ThreadId = target.threadId;
	if (boundary === null) {
		return {
			threadId,
			cwd: built.cwd,
			runtimeWorkspaceRoots: built.runtimeWorkspaceRoots,
			developerInstructions: built.developerInstructions,
			ephemeral: built.ephemeral,
			threadSource: built.threadSource,
			excludeTurns: built.excludeTurns,
		} satisfies SessionParams<"thread/fork">;
	}
	return {
		threadId,
		beforeTurnId: boundary,
		cwd: built.cwd,
		runtimeWorkspaceRoots: built.runtimeWorkspaceRoots,
		developerInstructions: built.developerInstructions,
		ephemeral: built.ephemeral,
		threadSource: built.threadSource,
		excludeTurns: built.excludeTurns,
	} satisfies SessionParams<"thread/fork">;
}

/**
 * The parameters one thread is started with: archboard's own workspace, developer instructions
 * and dynamic tools, so a thread a child creates is one the boundary can go on talking to.
 * @param checkoutRoot The workspace the thread runs in.
 * @returns The parameters.
 */
function threadStartParams(checkoutRoot: string): SessionParams<"thread/start"> {
	return {
		cwd: checkoutRoot,
		runtimeWorkspaceRoots: [checkoutRoot],
		serviceName: "archboard",
		developerInstructions: WORKHORSE_DEVELOPER_INSTRUCTIONS,
		ephemeral: false,
		historyMode: "paginated",
		sessionStartSource: "startup",
		threadSource: "archboard",
		dynamicTools: [...ARCHBOARD_APP_DYNAMIC_TOOLS],
		experimentalRawEvents: false,
	};
}

/**
 * The identity a mutation's initial turn runs under, refusing a mutation that needs one and
 * does not have it.
 * @param prepared The prepared mutation.
 * @returns The identity.
 */
function initialOperationId(prepared: PreparedDynamicMutation): OperationId {
	if (prepared.operations.initialTurnOperationId === null) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The initial-turn operation identity is missing.",
		);
	}
	return prepared.operations.initialTurnOperationId;
}

/** Whose context to read, for which operation, and under what kind. */
interface FreshContextInput {
	readonly options: CodexDynamicToolsOptions;
	readonly caller: DynamicCallerAuthority;
	readonly authority: DynamicContextAuthority;
	readonly operationId: OperationId;
	readonly kind: ContextKind;
	readonly targetThreadId?: ThreadId;
}

/**
 * Read the Archboard context one operation runs in, freshly, and refuse anything about it that
 * does not name the caller and the operation it was read for.
 * @param input Whose context to read, for which operation, and under what kind.
 * @returns The canonical context.
 */
async function readFreshContext(input: FreshContextInput): Promise<ArchboardContext> {
	try {
		const fresh = await input.options.context.readOneFreshArchboardContext({
			caller: input.caller,
			authority: input.authority,
			operationId: input.operationId,
			kind: input.kind,
			rpc: "turn/start",
			...(input.targetThreadId === undefined ? {} : { targetThreadId: input.targetThreadId }),
		});
		return validateFreshContext({
			context: fresh,
			caller: input.caller,
			authority: input.authority,
			operationId: input.operationId,
			kind: input.kind,
			options: input.options,
		});
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		throw new CodexDynamicToolsError(
			"unknown_provenance",
			"Fresh Archboard context was unavailable.",
			error,
		);
	}
}

/**
 * The initial-turn identity as the approved effect names it on the wire.
 * @param prepared The prepared mutation.
 * @returns The serialized identity.
 */
function initialOperationWire(prepared: PreparedDynamicMutation): string {
	const operationId = prepared.effect.initialTurnOperationId;
	if (operationId === null) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The initial-turn operation identity is missing.",
		);
	}
	return operationId;
}

/** The context to check, whose it should be, and what operation it was read for. */
interface ValidateContextInput {
	readonly context: ArchboardContext;
	readonly caller: DynamicCallerAuthority;
	readonly authority: DynamicContextAuthority;
	readonly operationId: OperationId;
	readonly kind: ContextKind;
	readonly options: CodexDynamicToolsOptions;
}

/**
 * Refuse fresh context that does not name the executing caller and the operation it was read
 * for. The context is what a mutation runs in, so context for another caller or another
 * operation would run the mutation somewhere nobody asked about.
 * @param input The context, whose it should be, and what operation it was read for.
 * @returns The canonical context.
 */
function validateFreshContext(input: ValidateContextInput): ArchboardContext {
	let canonical: ArchboardContext;
	try {
		canonical = canonicalContext(input.context);
	} catch (error) {
		throw new CodexDynamicToolsError(
			"unknown_provenance",
			"The context authority returned invalid Archboard context.",
			error,
		);
	}
	const operationWireId = operationWire(input.options, input.operationId);
	const named =
		namesCaller(canonical, input.authority, input.caller) &&
		namesOperation(canonical, operationWireId, input.kind);
	if (!named) {
		throw new CodexDynamicToolsError(
			"unknown_provenance",
			"Fresh context does not match the executing caller and operation.",
		);
	}
	return canonical;
}

/**
 * Whether fresh context names the executing caller: the pane it was issued for, the child and
 * epoch it belongs to, and the thread and turn that are running right now.
 * @param canonical The canonical context.
 * @param authority The pane-link authority it was read under.
 * @param caller The caller's authority.
 * @returns Whether it names the caller.
 */
function namesCaller(
	canonical: ArchboardContext,
	authority: DynamicContextAuthority,
	caller: DynamicCallerAuthority,
): boolean {
	if (canonical.paneId !== authority.paneId || !authorityNamesCaller(authority, caller)) {
		return false;
	}
	return (
		canonical.child.id === caller.childId &&
		canonical.child.epoch === caller.epoch &&
		canonical.workhorse.threadId === caller.wireThreadId &&
		canonical.workhorse.turnId === caller.wireTurnId
	);
}

/**
 * Whether the pane-link authority the context was read under names the executing caller.
 * @param authority The pane-link authority.
 * @param caller The caller's authority.
 * @returns Whether it names the caller.
 */
function authorityNamesCaller(
	authority: DynamicContextAuthority,
	caller: DynamicCallerAuthority,
): boolean {
	if (authority.childId !== caller.childId || authority.epoch !== caller.epoch) {
		return false;
	}
	return authority.threadId === caller.threadId && authority.turnId === caller.turnId;
}

/**
 * Whether fresh context names the operation it was read for, and a thread link the operation
 * could actually be carried out over.
 * @param canonical The canonical context.
 * @param operationWireId The identity the operation runs under, as it goes on the wire.
 * @param kind What kind of operation it is.
 * @returns Whether it names the operation.
 */
function namesOperation(
	canonical: ArchboardContext,
	operationWireId: string,
	kind: ContextKind,
): boolean {
	if (canonical.threadLink.state !== "executable" || canonical.threadLink.reason !== null) {
		return false;
	}
	return (
		canonical.operation.id === operationWireId &&
		canonical.operation.kind === kind &&
		canonical.operation.rpc === "turn/start" &&
		canonical.operation.outcome === null
	);
}

/** What an initial turn did, and what to say about it when it did not run. */
interface InitialTurnResult {
	readonly delivery: "delivered" | "not_delivered" | "outcome_unknown";
	readonly turn: SessionTurn | null;
	readonly message: string | null;
}

/** The mutation, the thread it made, and what its first turn should say. */
interface InitialTurnInput {
	readonly prepared: PreparedDynamicMutation;
	readonly request: DynamicServerRequest;
	readonly caller: DynamicCallerAuthority;
	readonly context: ArchboardContext;
	readonly targetThread: SessionThread;
	readonly prompt: string;
	readonly kind: "create_thread_initial_turn" | "fork_thread_initial_turn";
	readonly options: CodexDynamicToolsOptions;
	readonly operationSettlement: DynamicOperationSettlement;
}

/**
 * Start the turn a create or a fork also asks for.
 *
 * The turn is staged and settled in its own right, so a thread that was created but whose first
 * turn did not run is reported as exactly that rather than as a failure of the whole mutation.
 * @param input The mutation, the thread it made, and what the turn should say.
 * @returns What the turn did.
 */
async function executeInitialTurn(input: InitialTurnInput): Promise<InitialTurnResult> {
	const operationId = initialOperationId(input.prepared);
	const operationWireId = operationWire(input.options, operationId);
	let transaction: EpochTransaction;
	try {
		await assertBeforeEffect(input.options, input.request, input.caller);
		transaction = stage({
			options: input.options,
			caller: input.caller,
			operationId,
			kind: input.kind,
			rpc: "turn/start",
		});
	} catch (error) {
		return {
			delivery: "not_delivered",
			turn: null,
			message: refusalMessage(error, "The initial turn could not be staged."),
		};
	}
	let result: { readonly turn: SessionTurn };
	try {
		result = await input.options.session.turnStart(
			turnParams(input.targetThread.id, operationWireId, input.prompt, input.context),
		);
	} catch (error) {
		const outcome = remoteOutcome(error);
		if (outcome === "outcome_unknown") {
			settle(
				input.options,
				input.operationSettlement,
				operationId,
				transaction,
				"outcome_unknown",
				{
					threadId: input.targetThread.id,
					threadSource: targetThreadSource(input.targetThread),
				},
			);
			return {
				delivery: "outcome_unknown",
				turn: null,
				message:
					"The request may have taken effect. Inspect authoritative state before another mutation.",
			};
		}
		settle(input.options, input.operationSettlement, operationId, transaction, "not_delivered");
		return {
			delivery: "not_delivered",
			turn: null,
			message: refusalMessage(error, "The initial turn was not delivered."),
		};
	}
	settle(input.options, input.operationSettlement, operationId, transaction, "delivered", {
		threadId: input.targetThread.id,
		turnId: result.turn.id,
		threadSource: targetThreadSource(input.targetThread),
	});
	return { delivery: "delivered", turn: result.turn, message: null };
}

export {
	type InitialTurnResult,
	targetThreadSource,
	executeInitialTurn,
	forkParams,
	initialOperationId,
	initialOperationWire,
	initialTurnValue,
	notDeliveredInitial,
	readFreshContext,
	threadStartParams,
	turnParams,
	unknownInitial,
};
