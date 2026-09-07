import type { ArchboardContext } from "@/runtime/codex-instructions";
import type { EpochTransaction } from "@/runtime/codex-epoch";
import type { SessionThread, SessionTurn } from "@/runtime/codex-session";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import {
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicCallerAuthority,
	type DynamicContextAuthority,
	type DynamicImmutableEffect,
	type DynamicRelation,
	type DynamicTargetAuthority,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import type {
	DynamicOperationSettlement,
	PreparedDynamicMutation,
} from "@/runtime/codex-dynamic-tools/lib/effects";
import {
	MUTATION_KINDS,
	dynamicReason,
	operationWire,
	refusalMessage,
	remoteOutcome,
	settle,
	type MutationExecution,
} from "@/runtime/codex-dynamic-tools/lib/mutation-staging";
import {
	executeInitialTurn,
	targetThreadSource,
	forkParams,
	initialOperationId,
	initialOperationWire,
	notDeliveredInitial,
	readFreshContext,
	threadStartParams,
	turnParams,
} from "@/runtime/codex-dynamic-tools/lib/mutation-context";
import {
	forkedThread,
	initialTurnReport,
	refusal,
	stageMutation,
	threadStateAfterInitialTurn,
	undeliveredThread,
} from "@/runtime/codex-dynamic-tools/lib/mutation-results";

/**
 * Create a new thread on behalf of a child, and start its first turn.
 *
 * The thread and its first turn are staged and settled separately, so a thread that exists but
 * whose first turn did not run is reported as exactly that. A local record that could not be
 * made durable stops the first turn from being attempted at all, because nothing would then
 * account for it.
 * @param prepared The prepared mutation.
 * @param request The server request.
 * @param caller The caller's authority.
 * @param contextAuthority The pane-link authority the effect runs under.
 * @param options The dynamic tools options.
 * @param operationSettlement How the call's operation identities are settled.
 * @returns What the mutation did.
 */
async function executeCreate(
	prepared: PreparedDynamicMutation,
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
	contextAuthority: DynamicContextAuthority,
	options: CodexDynamicToolsOptions,
	operationSettlement: DynamicOperationSettlement,
): Promise<MutationExecution> {
	const operationId = prepared.operations.mutationOperationId;
	const operationWireId = operationWire(options, operationId);
	let context: ArchboardContext;
	try {
		context = await readFreshContext({
			options,
			caller,
			authority: contextAuthority,
			operationId: initialOperationId(prepared),
			kind: "create_thread_initial_turn",
		});
	} catch (error) {
		return refusal(error, "Fresh Archboard context was unavailable.");
	}
	let transaction: EpochTransaction;
	try {
		transaction = await stageMutation(
			options,
			request,
			caller,
			operationId,
			MUTATION_KINDS.create_thread,
		);
	} catch (error) {
		return refusal(error, "The create operation could not be staged.");
	}
	let thread: SessionThread;
	try {
		thread = (await options.session.threadStart(threadStartParams(options.checkoutRoot))).thread;
	} catch (error) {
		return undeliveredThread(error, "The thread start was not delivered.", operationWireId, {
			options,
			operationSettlement,
			operationId,
			transaction,
		});
	}
	const outerSettlement = settle(
		options,
		operationSettlement,
		operationId,
		transaction,
		"delivered",
		{
			threadId: thread.id,
			threadSource: targetThreadSource(thread),
		},
	);
	if (!outerSettlement.durable) {
		const initialId = initialOperationWire(prepared);
		return {
			kind: "ok",
			operationId: operationWireId,
			value: {
				threadId: String(thread.id),
				state: "executable",
				initialTurn: notDeliveredInitial(
					initialId,
					"The thread was created, but its local durable settlement failed before the initial turn.",
				),
			},
		};
	}
	const initial = await executeInitialTurn({
		prepared,
		request,
		caller,
		context,
		targetThread: thread,
		prompt: createPromptOf(prepared),
		kind: "create_thread_initial_turn",
		options,
		operationSettlement,
	});
	const initialId = initialOperationWire(prepared);
	return {
		kind: "ok",
		operationId: operationWireId,
		value: {
			threadId: String(thread.id),
			state: threadStateAfterInitialTurn(initial.delivery),
			initialTurn: initialTurnReport(initial, initialId),
		},
	};
}

/**
 * The prompt a create's first turn says, refusing an effect that is no longer a create.
 * @param prepared The prepared mutation.
 * @returns The prompt.
 */
function createPromptOf(prepared: PreparedDynamicMutation): string {
	if (prepared.effect.tool !== "create_thread") {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The create effect tool changed before execution.",
		);
	}
	return prepared.effect.arguments.prompt;
}

/**
 * The prompt a fork's first turn says, when the fork was asked to start one.
 * @param prepared The prepared mutation.
 * @returns The prompt.
 */
function forkPromptOf(prepared: PreparedDynamicMutation): string {
	if (prepared.effect.tool !== "fork_thread" || prepared.effect.arguments.prompt === null) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"A fork with an initial-turn operation requires a prompt.",
		);
	}
	return prepared.effect.arguments.prompt;
}

/**
 * The Archboard context a fork's first turn runs in, or the refusal to report when it could not
 * be read.
 * @param prepared The prepared mutation.
 * @param caller The caller's authority.
 * @param contextAuthority The pane-link authority the effect runs under.
 * @param options The dynamic tools options.
 * @returns The context, or the refusal.
 */
async function readForkContext(
	prepared: PreparedDynamicMutation,
	caller: DynamicCallerAuthority,
	contextAuthority: DynamicContextAuthority,
	options: CodexDynamicToolsOptions,
): Promise<
	{ kind: "ready"; context: ArchboardContext } | (MutationExecution & { kind: "refused" })
> {
	try {
		return {
			kind: "ready",
			context: await readFreshContext({
				options,
				caller,
				authority: contextAuthority,
				operationId: initialOperationId(prepared),
				kind: "fork_thread_initial_turn",
			}),
		};
	} catch (error) {
		return {
			kind: "refused",
			reason: dynamicReason(error),
			message: refusalMessage(error, "Fresh Archboard context was unavailable."),
		};
	}
}

/** What a fork's first turn will say, and the context it will say it in. */
interface ForkInitialTurn {
	readonly prompt: string;
	readonly context: ArchboardContext;
}

/** Everything making the forked thread needs. */
interface ForkThreadInput {
	readonly prepared: PreparedDynamicMutation;
	readonly request: DynamicServerRequest;
	readonly caller: DynamicCallerAuthority;
	readonly target: DynamicTargetAuthority;
	readonly relation: DynamicRelation;
	readonly options: CodexDynamicToolsOptions;
	readonly operationSettlement: DynamicOperationSettlement;
	readonly operationWireId: string;
}

/** The forked thread, or the execution to report instead of one. */
type ForkThreadResult =
	| { readonly kind: "forked"; readonly thread: SessionThread; readonly durable: boolean }
	| { readonly kind: "failed"; readonly execution: MutationExecution };

/**
 * Stage the fork, carry it out, and record what it did, so the caller is left either with the
 * thread it made or with the execution to report in its place.
 * @param input Everything making the thread needs.
 * @returns The thread, or what to report instead.
 */
async function forkThread(input: ForkThreadInput): Promise<ForkThreadResult> {
	const operationId = input.prepared.operations.mutationOperationId;
	let transaction: EpochTransaction;
	try {
		transaction = await stageMutation(
			input.options,
			input.request,
			input.caller,
			operationId,
			MUTATION_KINDS.fork_thread,
		);
	} catch (error) {
		return { kind: "failed", execution: refusal(error, "The fork operation could not be staged.") };
	}
	let thread: SessionThread;
	try {
		thread = (
			await input.options.session.threadFork(
				forkParams(
					input.caller,
					input.target,
					input.relation,
					input.prepared.boundary,
					input.options.checkoutRoot,
				),
			)
		).thread;
	} catch (error) {
		return {
			kind: "failed",
			execution: undeliveredThread(
				error,
				"The thread fork was not delivered.",
				input.operationWireId,
				{
					options: input.options,
					operationSettlement: input.operationSettlement,
					operationId,
					transaction,
				},
			),
		};
	}
	const settled = settle(
		input.options,
		input.operationSettlement,
		operationId,
		transaction,
		"delivered",
		{ threadId: thread.id, threadSource: targetThreadSource(thread) },
	);
	return { kind: "forked", thread, durable: settled.durable };
}

/**
 * Fork one thread on behalf of a child, and start its first turn when the fork asked for one.
 *
 * A fork that asked for no first turn reports that it asked for none rather than that one
 * failed; a fork whose local record could not be made durable stops before its first turn,
 * because nothing would then account for it.
 * @param prepared The prepared mutation.
 * @param request The server request.
 * @param caller The caller's authority.
 * @param contextAuthority The pane-link authority the effect runs under.
 * @param target The thread being forked.
 * @param relation How the caller stands to that thread.
 * @param options The dynamic tools options.
 * @param operationSettlement How the call's operation identities are settled.
 * @returns What the mutation did.
 */
async function executeFork(
	prepared: PreparedDynamicMutation,
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
	contextAuthority: DynamicContextAuthority,
	target: DynamicTargetAuthority,
	relation: DynamicRelation,
	options: CodexDynamicToolsOptions,
	operationSettlement: DynamicOperationSettlement,
): Promise<MutationExecution> {
	const operationWireId = operationWire(options, prepared.operations.mutationOperationId);
	let first: ForkInitialTurn | null = null;
	if (prepared.effect.initialTurnOperationId !== null) {
		const read = await readForkContext(prepared, caller, contextAuthority, options);
		if (read.kind === "refused") {
			return read;
		}
		first = { prompt: forkPromptOf(prepared), context: read.context };
	}
	const made = await forkThread({
		prepared,
		request,
		caller,
		target,
		relation,
		options,
		operationSettlement,
		operationWireId,
	});
	if (made.kind !== "forked") {
		return made.execution;
	}
	if (first === null) {
		return forkedThread(made.thread, operationWireId, {
			delivery: "not_requested",
			turnId: null,
			operationId: null,
			reason: null,
		});
	}
	if (!made.durable) {
		return forkedThread(
			made.thread,
			operationWireId,
			notDeliveredInitial(
				initialOperationWire(prepared),
				"The thread was forked, but its local durable settlement failed before the initial turn.",
			),
		);
	}
	const initial = await executeInitialTurn({
		prepared,
		request,
		caller,
		context: first.context,
		targetThread: made.thread,
		prompt: first.prompt,
		kind: "fork_thread_initial_turn",
		options,
		operationSettlement,
	});
	return forkedThread(
		made.thread,
		operationWireId,
		initialTurnReport(initial, initialOperationWire(prepared)),
		threadStateAfterInitialTurn(initial.delivery),
	);
}

/**
 * The prompt a send says, refusing an effect that is no longer a send.
 * @param prepared The prepared mutation.
 * @returns The prompt.
 */
function sendPromptOf(prepared: PreparedDynamicMutation): string {
	if (prepared.effect.tool !== "send_message_to_thread") {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The send effect tool changed before execution.",
		);
	}
	return prepared.effect.arguments.prompt;
}

/**
 * Send one message to a thread on behalf of a child, as a new turn on that thread.
 * @param prepared The prepared mutation.
 * @param request The server request.
 * @param caller The caller's authority.
 * @param contextAuthority The pane-link authority the effect runs under.
 * @param target The thread being written to.
 * @param options The dynamic tools options.
 * @param operationSettlement How the call's operation identities are settled.
 * @returns What the mutation did.
 */
async function executeSend(
	prepared: PreparedDynamicMutation,
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
	contextAuthority: DynamicContextAuthority,
	target: DynamicTargetAuthority,
	options: CodexDynamicToolsOptions,
	operationSettlement: DynamicOperationSettlement,
): Promise<MutationExecution> {
	const operationId = prepared.operations.mutationOperationId;
	const operationWireId = operationWire(options, operationId);
	let context: ArchboardContext;
	try {
		context = await readFreshContext({
			options,
			caller,
			authority: contextAuthority,
			operationId,
			kind: "send_message_to_thread",
			targetThreadId: target.threadId,
		});
	} catch (error) {
		return refusal(error, "Fresh Archboard context was unavailable.");
	}
	let transaction: EpochTransaction;
	try {
		transaction = await stageMutation(
			options,
			request,
			caller,
			operationId,
			MUTATION_KINDS.send_message_to_thread,
		);
	} catch (error) {
		return refusal(error, "The send operation could not be staged.");
	}
	let turn: SessionTurn;
	try {
		turn = (
			await options.session.turnStart(
				turnParams(target.threadId, operationWireId, sendPromptOf(prepared), context),
			)
		).turn;
	} catch (error) {
		const outcome = remoteOutcome(error);
		if (outcome === "outcome_unknown") {
			settle(options, operationSettlement, operationId, transaction, "outcome_unknown", {
				threadId: target.threadId,
			});
			return { kind: "outcome_unknown", operationId: operationWireId };
		}
		settle(options, operationSettlement, operationId, transaction, "not_delivered");
		return {
			kind: "refused",
			reason: "not_ready",
			message: refusalMessage(error, "The message was not delivered."),
		};
	}
	settle(options, operationSettlement, operationId, transaction, "delivered", {
		threadId: target.threadId,
		turnId: turn.id,
		threadSource: typeof target.source === "string" ? target.source : null,
	});
	return {
		kind: "ok",
		operationId: operationWireId,
		value: { threadId: target.wireThreadId, delivery: "delivered" },
	};
}

/**
 * The thread an effect names, when it names one.
 * @param effect The effect.
 * @returns The thread, or null for a create.
 */
function effectTargetThreadId(effect: DynamicImmutableEffect): string | null {
	if (effect.tool === "create_thread") {
		return null;
	}
	return effect.arguments.threadId;
}

export { type MutationExecution, executeCreate, executeFork, executeSend, effectTargetThreadId };
