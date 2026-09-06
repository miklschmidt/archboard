import {
	createSelfThreadForkParams,
	createThreadForkParams,
	createTurnStartParams,
	canonicalContext,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
} from "@/runtime/codex-instructions";
import type { ArchboardContext } from "@/runtime/codex-instructions";
import type { EpochTransaction } from "@/runtime/codex-epoch";
import {
	CodexSessionMutationError,
	type SessionParams,
	type SessionThread,
	type SessionTurn,
} from "@/runtime/codex-session";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import {
	ARCHBOARD_APP_DYNAMIC_TOOLS,
	ARCHBOARD_APP_MANIFEST_SHA256,
} from "@/runtime/codex-thread-tools";
import type { OperationId, ThreadId, TurnId } from "@/shared/codex-workbench-identity";
import {
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicCallerAuthority,
	type DynamicContextAuthority,
	type DynamicImmutableEffect,
	type DynamicRefusalReason,
	type DynamicRelation,
	type DynamicTargetAuthority,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import type {
	DynamicOperationSettlement,
	PreparedDynamicMutation,
} from "@/runtime/codex-dynamic-tools/lib/effects";

const MUTATION_KINDS = {
	create_thread: { kind: "create_thread", rpc: "thread/start" },
	fork_thread: { kind: "fork_thread", rpc: "thread/fork" },
	send_message_to_thread: { kind: "send_message_to_thread", rpc: "turn/start" },
} as const;

type MutationExecution =
	| { readonly kind: "ok"; readonly operationId: string; readonly value: unknown }
	| { readonly kind: "outcome_unknown"; readonly operationId: string }
	| { readonly kind: "refused"; readonly reason: DynamicRefusalReason; readonly message: string };

interface StageOptions {
	readonly options: CodexDynamicToolsOptions;
	readonly caller: DynamicCallerAuthority;
	readonly operationId: OperationId;
	readonly kind: string;
	readonly rpc: string;
}

function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value as Record<string, unknown>)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

function truncateUtf8(value: string, maximum: number): string {
	if (Buffer.byteLength(value, "utf8") <= maximum) {
		return value;
	}
	const ellipsis = "…";
	const budget = maximum - Buffer.byteLength(ellipsis, "utf8");
	let result = "";
	for (const character of value) {
		if (Buffer.byteLength(result + character, "utf8") > budget) {
			break;
		}
		result += character;
	}
	return `${result}${ellipsis}`;
}

function operationWire(options: CodexDynamicToolsOptions, operationId: OperationId): string {
	try {
		options.operationId.validateCurrentUnconsumedOperationId(operationId);
		const serialized = options.operationId.serializeForOwnedWireFields(operationId);
		if (typeof serialized !== "string" || serialized.length === 0) {
			throw new Error("the operation serializer returned an empty value");
		}
		return serialized;
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The host could not validate a canonical dynamic operation identity.",
			error,
		);
	}
}

function stage(options: StageOptions): EpochTransaction {
	try {
		const expected = options.options.epoch.snapshot().cas;
		return options.options.epoch.stageOperation({
			childId: options.caller.childId,
			epoch: options.caller.epoch,
			operationId: operationWire(options.options, options.operationId),
			kind: options.kind,
			rpc: options.rpc,
			workspaceRoot: options.options.checkoutRoot,
			instructionHash: WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
			manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
			expected,
		});
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		throw epochError(error, "The local dynamic operation could not be staged.");
	}
}

function epochError(error: unknown, message: string): CodexDynamicToolsError {
	const code =
		(error as { readonly code?: unknown })?.code === "stale_child"
			? "stale_child"
			: (error as { readonly code?: unknown })?.code === "prior_epoch"
				? "prior_epoch"
				: (error as { readonly code?: unknown })?.code === "unknown_provenance"
					? "unknown_provenance"
					: "system_error";
	return new CodexDynamicToolsError(code, message, error);
}

function remoteOutcome(error: unknown): "not_delivered" | "outcome_unknown" {
	if (error instanceof CodexSessionMutationError) {
		return error.outcome;
	}
	if (
		typeof error === "object" &&
		error !== null &&
		((error as { readonly outcome?: unknown }).outcome === "outcome_unknown" ||
			(error as { readonly outcome?: unknown }).outcome === "not_delivered")
	) {
		return (error as { readonly outcome: "not_delivered" | "outcome_unknown" }).outcome;
	}
	return "not_delivered";
}

interface DurableSettlementResult {
	readonly durable: boolean;
}

function settle(
	options: CodexDynamicToolsOptions,
	settlement: DynamicOperationSettlement,
	operationId: OperationId,
	transaction: EpochTransaction,
	outcome: "delivered" | "not_delivered" | "outcome_unknown",
	confirmation?: {
		readonly threadId?: ThreadId | null;
		readonly turnId?: TurnId | null;
		readonly threadSource?: string | null;
	},
): DurableSettlementResult {
	let durable = true;
	try {
		if (outcome === "delivered") {
			options.epoch.commitOperation(transaction, confirmation);
		} else if (outcome === "not_delivered") {
			options.epoch.rollbackOperation(transaction, "dynamic mutation was not delivered");
		} else {
			options.epoch.markOutcomeUnknown(
				transaction,
				"dynamic mutation settlement is unknown",
				confirmation,
			);
		}
	} catch {
		durable = false;
	}
	if (durable || outcome !== "not_delivered") {
		settlement.consume(operationId);
	} else {
		settlement.retire(operationId);
	}
	return { durable };
}

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
		reason: errorMessage === null ? null : truncateUtf8(errorMessage, 512),
	});
}

function notDeliveredInitial(
	operationId: string,
	message: string,
): Readonly<Record<string, unknown>> {
	return initialTurnValue("not_delivered", operationId, null, message);
}

function unknownInitial(operationId: string): Readonly<Record<string, unknown>> {
	return initialTurnValue(
		"outcome_unknown",
		operationId,
		null,
		"The request may have taken effect. Inspect authoritative state before another mutation.",
	);
}

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

function targetThreadSource(thread: SessionThread): string | null {
	return typeof thread.source === "string" ? thread.source : null;
}

function initialOperationId(prepared: PreparedDynamicMutation): OperationId {
	if (prepared.operations.initialTurnOperationId === null) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The initial-turn operation identity is missing.",
		);
	}
	return prepared.operations.initialTurnOperationId;
}

function dynamicReason(error: unknown): DynamicRefusalReason {
	if (error instanceof CodexDynamicToolsError) {
		if (
			error.code === "invalid_call" ||
			error.code === "not_ready" ||
			error.code === "not_loaded" ||
			error.code === "not_controllable" ||
			error.code === "system_error" ||
			error.code === "stale_child" ||
			error.code === "prior_epoch" ||
			error.code === "unknown_provenance" ||
			error.code === "approval_declined" ||
			error.code === "cycle" ||
			error.code === "busy" ||
			error.code === "expired" ||
			error.code === "unsupported"
		) {
			return error.code;
		}
	}
	return "system_error";
}

function refusalMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

async function assertBeforeEffect(
	options: CodexDynamicToolsOptions,
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
): Promise<void> {
	try {
		await options.lifecycle.assertCallExecuting({ request, caller, phase: "before_effect" });
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		const code = (error as { readonly code?: unknown })?.code;
		if (
			code === "stale_child" ||
			code === "prior_epoch" ||
			code === "unknown_provenance" ||
			code === "not_loaded" ||
			code === "not_controllable" ||
			code === "system_error"
		) {
			throw new CodexDynamicToolsError(code, "The dynamic call is no longer executable.", error);
		}
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The dynamic call is no longer executing before its effect.",
			error,
		);
	}
}

async function readFreshContext(input: {
	readonly options: CodexDynamicToolsOptions;
	readonly caller: DynamicCallerAuthority;
	readonly authority: DynamicContextAuthority;
	readonly operationId: OperationId;
	readonly kind:
		| "create_thread_initial_turn"
		| "fork_thread_initial_turn"
		| "send_message_to_thread";
	readonly targetThreadId?: ThreadId;
}): Promise<ArchboardContext> {
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

function validateFreshContext(input: {
	readonly context: ArchboardContext;
	readonly caller: DynamicCallerAuthority;
	readonly authority: DynamicContextAuthority;
	readonly operationId: OperationId;
	readonly kind:
		| "create_thread_initial_turn"
		| "fork_thread_initial_turn"
		| "send_message_to_thread";
	readonly options: CodexDynamicToolsOptions;
}): ArchboardContext {
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
	if (
		canonical.paneId !== input.authority.paneId ||
		input.authority.childId !== input.caller.childId ||
		input.authority.epoch !== input.caller.epoch ||
		input.authority.threadId !== input.caller.threadId ||
		input.authority.turnId !== input.caller.turnId ||
		canonical.child.id !== input.caller.childId ||
		canonical.child.epoch !== input.caller.epoch ||
		canonical.workhorse.threadId !== input.caller.wireThreadId ||
		canonical.workhorse.turnId !== input.caller.wireTurnId ||
		canonical.threadLink.state !== "executable" ||
		canonical.threadLink.reason !== null ||
		canonical.operation.id !== operationWireId ||
		canonical.operation.kind !== input.kind ||
		canonical.operation.rpc !== "turn/start" ||
		canonical.operation.outcome !== null
	) {
		throw new CodexDynamicToolsError(
			"unknown_provenance",
			"Fresh context does not match the executing caller and operation.",
		);
	}
	return canonical;
}

async function executeInitialTurn(input: {
	readonly prepared: PreparedDynamicMutation;
	readonly request: DynamicServerRequest;
	readonly caller: DynamicCallerAuthority;
	readonly context: ArchboardContext;
	readonly targetThread: SessionThread;
	readonly prompt: string;
	readonly kind: "create_thread_initial_turn" | "fork_thread_initial_turn";
	readonly options: CodexDynamicToolsOptions;
	readonly operationSettlement: DynamicOperationSettlement;
}): Promise<{
	readonly delivery: "delivered" | "not_delivered" | "outcome_unknown";
	readonly turn: SessionTurn | null;
	readonly message: string | null;
}> {
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
		return {
			kind: "refused",
			reason: dynamicReason(error),
			message: refusalMessage(error, "Fresh Archboard context was unavailable."),
		};
	}
	let transaction: EpochTransaction;
	try {
		await assertBeforeEffect(options, request, caller);
		transaction = stage({
			options,
			caller,
			operationId,
			kind: MUTATION_KINDS.create_thread.kind,
			rpc: MUTATION_KINDS.create_thread.rpc,
		});
	} catch (error) {
		return {
			kind: "refused",
			reason: dynamicReason(error),
			message: refusalMessage(error, "The create operation could not be staged."),
		};
	}
	let thread: SessionThread;
	try {
		thread = (await options.session.threadStart(threadStartParams(options.checkoutRoot))).thread;
	} catch (error) {
		const outcome = remoteOutcome(error);
		if (outcome === "outcome_unknown") {
			settle(options, operationSettlement, operationId, transaction, "outcome_unknown");
			return { kind: "outcome_unknown", operationId: operationWireId };
		}
		settle(options, operationSettlement, operationId, transaction, "not_delivered");
		return { kind: "refused", reason: "not_ready", message: "The thread start was not delivered." };
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
		prompt: (() => {
			if (prepared.effect.tool !== "create_thread") {
				throw new CodexDynamicToolsError(
					"invalid_call",
					"The create effect tool changed before execution.",
				);
			}
			return prepared.effect.arguments.prompt;
		})(),
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
			state: initial.delivery === "outcome_unknown" ? "inspect_only" : "executable",
			initialTurn:
				initial.delivery === "outcome_unknown"
					? unknownInitial(initialId)
					: initial.delivery === "delivered"
						? initialTurnValue("delivered", initialId, initial.turn, null)
						: notDeliveredInitial(
								initialId,
								initial.message ?? "The initial turn was not delivered.",
							),
		},
	};
}

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
	const operationId = prepared.operations.mutationOperationId;
	const operationWireId = operationWire(options, operationId);
	const boundary = prepared.boundary;
	let prompt: string | null = null;
	let context: ArchboardContext | null = null;
	if (prepared.effect.initialTurnOperationId !== null) {
		if (prepared.effect.tool !== "fork_thread" || prepared.effect.arguments.prompt === null) {
			throw new CodexDynamicToolsError(
				"invalid_call",
				"A fork with an initial-turn operation requires a prompt.",
			);
		}
		prompt = prepared.effect.arguments.prompt;
		try {
			context = await readFreshContext({
				options,
				caller,
				authority: contextAuthority,
				operationId: initialOperationId(prepared),
				kind: "fork_thread_initial_turn",
			});
		} catch (error) {
			return {
				kind: "refused",
				reason: dynamicReason(error),
				message: refusalMessage(error, "Fresh Archboard context was unavailable."),
			};
		}
	}
	let transaction: EpochTransaction;
	try {
		await assertBeforeEffect(options, request, caller);
		transaction = stage({
			options,
			caller,
			operationId,
			kind: MUTATION_KINDS.fork_thread.kind,
			rpc: MUTATION_KINDS.fork_thread.rpc,
		});
	} catch (error) {
		return {
			kind: "refused",
			reason: dynamicReason(error),
			message: refusalMessage(error, "The fork operation could not be staged."),
		};
	}
	let thread: SessionThread;
	try {
		thread = (
			await options.session.threadFork(
				forkParams(caller, target, relation, boundary, options.checkoutRoot),
			)
		).thread;
	} catch (error) {
		const outcome = remoteOutcome(error);
		if (outcome === "outcome_unknown") {
			settle(options, operationSettlement, operationId, transaction, "outcome_unknown");
			return { kind: "outcome_unknown", operationId: operationWireId };
		}
		settle(options, operationSettlement, operationId, transaction, "not_delivered");
		return { kind: "refused", reason: "not_ready", message: "The thread fork was not delivered." };
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
	if (prepared.effect.initialTurnOperationId === null) {
		return {
			kind: "ok",
			operationId: operationWireId,
			value: {
				threadId: String(thread.id),
				state: "executable",
				initialTurn: { delivery: "not_requested", turnId: null, operationId: null, reason: null },
			},
		};
	}
	if (!outerSettlement.durable) {
		return {
			kind: "ok",
			operationId: operationWireId,
			value: {
				threadId: String(thread.id),
				state: "executable",
				initialTurn: notDeliveredInitial(
					initialOperationWire(prepared),
					"The thread was forked, but its local durable settlement failed before the initial turn.",
				),
			},
		};
	}
	if (prompt === null || context === null) {
		throw new CodexDynamicToolsError("invalid_call", "The fork initial-turn context is missing.");
	}
	const initial = await executeInitialTurn({
		prepared,
		request,
		caller,
		context,
		targetThread: thread,
		prompt,
		kind: "fork_thread_initial_turn",
		options,
		operationSettlement,
	});
	const initialId = initialOperationWire(prepared);
	return {
		kind: "ok",
		operationId: operationWireId,
		value: {
			threadId: String(thread.id),
			state: initial.delivery === "outcome_unknown" ? "inspect_only" : "executable",
			initialTurn:
				initial.delivery === "outcome_unknown"
					? unknownInitial(initialId)
					: initial.delivery === "delivered"
						? initialTurnValue("delivered", initialId, initial.turn, null)
						: notDeliveredInitial(
								initialId,
								initial.message ?? "The initial turn was not delivered.",
							),
		},
	};
}

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
		return {
			kind: "refused",
			reason: dynamicReason(error),
			message: refusalMessage(error, "Fresh Archboard context was unavailable."),
		};
	}
	let transaction: EpochTransaction;
	try {
		await assertBeforeEffect(options, request, caller);
		transaction = stage({
			options,
			caller,
			operationId,
			kind: MUTATION_KINDS.send_message_to_thread.kind,
			rpc: MUTATION_KINDS.send_message_to_thread.rpc,
		});
	} catch (error) {
		return {
			kind: "refused",
			reason: dynamicReason(error),
			message: refusalMessage(error, "The send operation could not be staged."),
		};
	}
	let turn: SessionTurn;
	try {
		turn = (
			await options.session.turnStart(
				turnParams(
					target.threadId,
					operationWireId,
					prepared.effect.tool === "send_message_to_thread"
						? prepared.effect.arguments.prompt
						: (() => {
								throw new CodexDynamicToolsError(
									"invalid_call",
									"The send effect tool changed before execution.",
								);
							})(),
					context,
				),
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

function effectTargetThreadId(effect: DynamicImmutableEffect): string | null {
	if (effect.tool === "create_thread") {
		return null;
	}
	return effect.arguments.threadId;
}

export { type MutationExecution, executeCreate, executeFork, executeSend, effectTargetThreadId };
