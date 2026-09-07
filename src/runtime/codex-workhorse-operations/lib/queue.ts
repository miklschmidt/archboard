import type {
	QueueBeforeEffect,
	QueueEffectContext,
	QueueListResult,
	QueueStartResult,
	WorkhorseQueueResult,
} from "@/runtime/codex-workhorse-queue";
import type {
	OperationId,
	QueuedSubmissionId,
	ThreadId,
	TurnId,
} from "@/shared/codex-workbench-identity";
import type {
	InspectWorkhorseRequest,
	InspectWorkhorseResult,
	ManageWorkhorseQueueRequest,
	ManageWorkhorseQueueResult,
	WorkhorseOperationBinding,
	WorkhorseOperationClassification,
} from "@/runtime/codex-workhorse-operations/lib/contract";
import {
	activeTurnFromClassification,
	freeze,
	queueIds,
	selectOperationIdentity,
	threadIdWire,
	type OperationState,
	type SettledDelivery,
	type WorkhorseRuntime,
} from "@/runtime/codex-workhorse-operations/lib/internal";
import {
	assertCreatedWorkhorse,
	isCreatedWorkhorse,
} from "@/runtime/codex-workhorse-operations/lib/link-provenance";
import {
	messageOf,
	operationError,
	queueMutationOutcome,
} from "@/runtime/codex-workhorse-operations/lib/operation-errors";

type MutableQueueRequest = Exclude<ManageWorkhorseQueueRequest, { readonly operation: "list" }>;
type MutationResult = Exclude<WorkhorseQueueResult<OperationId>, QueueListResult>;
type StartResult = QueueStartResult<OperationId>;

/**
 * Pick the error code for a mutation that did not deliver.
 * @param outcome - The settled outcome.
 * @returns `outcome_unknown` when nothing can be said, otherwise a transport failure.
 */
function mutationErrorCode(outcome: SettledDelivery): "transport_failure" | "outcome_unknown" {
	return outcome === "outcome_unknown" ? "outcome_unknown" : "transport_failure";
}

/**
 * Record the workhorse's active turn from a fresh classification for later notifications.
 * @param runtime - The operations runtime.
 * @param threadId - The workhorse thread.
 * @param classification - The fresh workhorse classification.
 * @returns The active turn identity, or null when none is in progress.
 */
function activeTurnId(
	runtime: WorkhorseRuntime,
	threadId: ThreadId,
	classification: WorkhorseOperationClassification,
): TurnId | null {
	const current = activeTurnFromClassification(classification);
	const key = threadIdWire(runtime.options, threadId);
	if (current === null) {
		runtime.activeTurns.delete(key);
		return null;
	}
	runtime.activeTurns.set(key, current);
	return current;
}

/**
 * Create the inspect operation: a read of link status, active turn and queue that never
 * mutates anything.
 * @param runtime - The operations runtime.
 * @returns The inspect operation.
 */
function createInspect(
	runtime: WorkhorseRuntime,
): (request: InspectWorkhorseRequest) => Promise<InspectWorkhorseResult> {
	return (request) =>
		runtime.enqueue(async () => {
			const binding = runtime.currentBinding();
			const initial = await runtime.classify(binding, request.call, "inspect_workhorse");
			const result = isCreatedWorkhorse(initial.workhorse)
				? await runtime.options.queue.list()
				: { operation: "list" as const, queue: [] };
			const final = await runtime.classify(binding, request.call, "inspect_workhorse");
			const currentTurnId = activeTurnId(runtime, binding.workhorse.threadId, final.workhorse);
			return freeze({
				threadId: binding.workhorse.threadId,
				status: final.workhorse.link.status,
				activeTurnId: currentTurnId,
				queuedSubmissionIds: queueIds(result.queue),
			});
		});
}

/**
 * Read the client identity of the exact submission a queue start is about to start; the
 * baseline the queue module validated must be the one the caller asked for.
 * @param context - The queue module's pre-effect context.
 * @param submissionId - The submission the caller asked to start.
 * @param operationId - The operation identity for the refusal.
 * @returns The target's client identity.
 */
function startBaselineClientId(
	context: QueueEffectContext,
	submissionId: QueuedSubmissionId,
	operationId: OperationId,
): string | null {
	if (
		context.operation !== "start" ||
		context.target === null ||
		context.target.id !== submissionId
	) {
		throw operationError(
			"outcome_unknown",
			"Queue start did not preserve its exact baseline target.",
			{ operation: "manage_workhorse_queue", operationId },
		);
	}
	return context.target.clientUserMessageId;
}

/**
 * Build the pre-effect check the queue module runs right before its remote call: adopt the
 * start baseline and revalidate the created workhorse.
 * @param runtime - The operations runtime.
 * @param request - The mutation request.
 * @param state - The staged operation state.
 * @returns The pre-effect callback.
 */
function createBeforeEffect(
	runtime: WorkhorseRuntime,
	request: MutableQueueRequest,
	state: OperationState,
): QueueBeforeEffect {
	return async (context) => {
		if (request.operation === "start") {
			state.clientUserMessageId = startBaselineClientId(
				context,
				request.submissionId,
				state.operationId,
			);
		}
		const current = await runtime.classify(state.binding, request.call, "manage_workhorse_queue");
		assertCreatedWorkhorse(current.workhorse);
	};
}

/**
 * Issue the queue mutation the request names.
 * @param runtime - The operations runtime.
 * @param request - The mutation request.
 * @param operationId - The operation identity.
 * @param beforeEffect - The pre-effect check.
 * @returns The queue module's result.
 */
function invokeQueueMutation(
	runtime: WorkhorseRuntime,
	request: MutableQueueRequest,
	operationId: OperationId,
	beforeEffect: QueueBeforeEffect,
): Promise<MutationResult> {
	const queue = runtime.options.queue;
	switch (request.operation) {
		case "add":
			return queue.add({ operationId, prompt: request.prompt, beforeEffect });
		case "update":
			return queue.update({
				operationId,
				submissionId: request.submissionId,
				prompt: request.prompt,
				beforeEffect,
			});
		case "delete":
			return queue.delete({ operationId, submissionId: request.submissionId, beforeEffect });
		case "reorder":
			return queue.reorder({
				operationId,
				orderedSubmissionIds: request.orderedSubmissionIds,
				beforeEffect,
			});
		case "start":
			return queue.start({ operationId, submissionId: request.submissionId, beforeEffect });
	}
}

/**
 * Adopt the queued submission an add produced when exactly one entry carries our identity.
 * @param state - The operation state.
 * @param result - The queue result.
 */
function adoptQueuedIdentity(state: OperationState, result: MutationResult): void {
	const matches = result.queue.filter(
		(submission) => submission.clientUserMessageId === state.operationIdWire,
	);
	if (matches.length === 1) {
		state.queuedSubmissionId = matches[0]!.id;
	}
}

/**
 * Adopt what a queue start returned: the turn it started, and whether the client identity
 * still matches the baseline captured before the effect.
 * @param state - The operation state.
 * @param result - The start result.
 */
function adoptStartResult(state: OperationState, result: StartResult): void {
	if (result.turnId !== null) {
		state.turnId = result.turnId;
	}
	if (state.clientUserMessageId !== result.clientUserMessageId) {
		state.clientUserMessageId = null;
	}
}

/**
 * Decide the outcome a start proved: delivered only with an exact turn, unknown when the
 * identity was lost or the queue reports delivery without a turn.
 * @param state - The operation state after adopting the result.
 * @param result - The start result.
 * @returns The outcome to settle.
 */
function requestedStartOutcome(state: OperationState, result: StartResult): SettledDelivery {
	if (state.clientUserMessageId === null) {
		return "outcome_unknown";
	}
	if (result.turnId !== null) {
		return "delivered";
	}
	return result.outcome === "delivered" ? "outcome_unknown" : result.outcome;
}

/**
 * Decide the outcome an add proved: delivered only once the exact queued submission is known.
 * @param state - The operation state after adopting the result.
 * @param result - The add result.
 * @returns The outcome to settle.
 */
function requestedAddOutcome(state: OperationState, result: MutationResult): SettledDelivery {
	const hasExactQueueIdentity = state.queuedSubmissionId !== null;
	if (hasExactQueueIdentity && result.outcome !== "not_delivered") {
		return "delivered";
	}
	if (!hasExactQueueIdentity && result.outcome === "delivered") {
		return "outcome_unknown";
	}
	return result.outcome;
}

/**
 * Adopt the result into the state and decide the outcome to settle durably.
 * @param state - The operation state.
 * @param result - The queue result.
 * @returns The outcome to settle.
 */
function adoptMutationResult(state: OperationState, result: MutationResult): SettledDelivery {
	if (result.operation === "start") {
		adoptStartResult(state, result);
		return requestedStartOutcome(state, result);
	}
	if (result.operation === "add") {
		adoptQueuedIdentity(state, result);
		return requestedAddOutcome(state, result);
	}
	return result.outcome;
}

/**
 * Publish the events a delivered mutation owes: `queued` for an add, `started` through turn
 * correlation for a start, and `completed` for the rest.
 * @param runtime - The operations runtime.
 * @param state - The settled operation state.
 * @param result - The queue result.
 */
function publishDelivered(
	runtime: WorkhorseRuntime,
	state: OperationState,
	result: MutationResult,
): void {
	if (result.operation === "add") {
		if (!state.queuedEmitted) {
			state.queuedEmitted = true;
			runtime.emit(state, "queued", "delivered", result.queue);
		}
		return;
	}
	if (result.operation !== "start") {
		runtime.terminal(state, "completed", result.queue, null);
		return;
	}
	if (state.turnId === null) {
		throw operationError(
			"outcome_unknown",
			"Queue start returned no authoritative turn identity.",
			{
				operation: "manage_workhorse_queue",
				outcome: "delivered",
				operationId: state.operationId,
			},
		);
	}
	runtime.correlateTurn(state, state.turnId, result.queue);
}

/**
 * Publish the events the settled outcome owes.
 * @param runtime - The operations runtime.
 * @param state - The settled operation state.
 * @param result - The queue result.
 * @param outcome - The settled outcome.
 */
function publishOutcome(
	runtime: WorkhorseRuntime,
	state: OperationState,
	result: MutationResult,
	outcome: SettledDelivery,
): void {
	if (outcome === "delivered") {
		publishDelivered(runtime, state, result);
	} else if (outcome === "not_delivered") {
		runtime.terminal(state, "failed", result.queue, "The queue operation was not delivered.");
	} else {
		runtime.emit(
			state,
			"outcome_unknown",
			outcome,
			result.queue,
			"The queue response was not attributable; inspect before retrying.",
		);
	}
}

/**
 * Settle and publish a mutation that threw, then surface it as an operations error.
 * @param runtime - The operations runtime.
 * @param state - The staged operation state.
 * @param error - The thrown value.
 * @param effectStarted - Whether the remote effect had been issued.
 * @returns Never; the error is always thrown.
 */
function failQueueMutation(
	runtime: WorkhorseRuntime,
	state: OperationState,
	error: unknown,
	effectStarted: boolean,
): never {
	const requested = effectStarted ? queueMutationOutcome(error, true) : "not_delivered";
	const outcome = runtime.settleDurable(state, requested, messageOf(error));
	if (outcome === "outcome_unknown") {
		runtime.emit(state, "outcome_unknown", outcome, [], messageOf(error));
	} else {
		runtime.terminal(state, "failed", [], messageOf(error));
	}
	throw operationError(mutationErrorCode(outcome), "The queue operation was not delivered.", {
		operation: "manage_workhorse_queue",
		outcome,
		operationId: state.operationId,
		cause: error,
	});
}

/**
 * Run one queue mutation end to end: stage, revalidate, issue, adopt, settle and publish.
 * @param runtime - The operations runtime.
 * @param request - The mutation request.
 * @param binding - The captured binding.
 * @param validated - The initial classification.
 * @param operationId - The operation identity.
 * @param operationIdWire - Its wire serialization.
 * @returns The queue after the mutation.
 */
async function mutateQueue(
	runtime: WorkhorseRuntime,
	request: MutableQueueRequest,
	binding: WorkhorseOperationBinding,
	validated: { readonly workhorse: WorkhorseOperationClassification },
	operationId: OperationId,
	operationIdWire: string,
): Promise<ManageWorkhorseQueueResult> {
	assertCreatedWorkhorse(validated.workhorse);
	const state = runtime.stage({
		operationId,
		operationIdWire,
		operation: "manage_workhorse_queue",
		queueOperation: request.operation,
		call: request.call,
		binding,
		workhorse: validated.workhorse,
		clientUserMessageId: request.operation === "add" ? operationIdWire : null,
	});
	if ("submissionId" in request) {
		state.queuedSubmissionId = request.submissionId;
	}
	let result: MutationResult;
	let effectStarted = false;
	try {
		const staged = await runtime.classify(binding, request.call, "manage_workhorse_queue");
		assertCreatedWorkhorse(staged.workhorse);
		const beforeEffect = createBeforeEffect(runtime, request, state);
		effectStarted = true;
		result = await invokeQueueMutation(runtime, request, operationId, beforeEffect);
		runtime.assertCurrentBinding(binding);
		await runtime.classify(binding, request.call, "manage_workhorse_queue");
	} catch (error) {
		failQueueMutation(runtime, state, error, effectStarted);
	}
	const outcome = runtime.settleDurable(state, adoptMutationResult(state, result), null);
	publishOutcome(runtime, state, result, outcome);
	if (outcome !== "delivered") {
		throw operationError(mutationErrorCode(outcome), "The queue operation was not delivered.", {
			operation: "manage_workhorse_queue",
			outcome,
			operationId,
		});
	}
	return freeze({ operation: request.operation, queuedSubmissionIds: queueIds(result.queue) });
}

/**
 * Create the manage-queue operation: list is a read; every other operation is a staged,
 * durably settled mutation of the created workhorse's queue.
 * @param runtime - The operations runtime.
 * @returns The manage-queue operation.
 */
function createManageQueue(
	runtime: WorkhorseRuntime,
): (request: ManageWorkhorseQueueRequest) => Promise<ManageWorkhorseQueueResult> {
	return (request) => {
		runtime.assertCall(request.call, "manage_workhorse_queue");
		if (request.operation === "list") {
			return runtime.enqueue(async () => {
				const binding = runtime.currentBinding();
				const validated = await runtime.classify(binding, request.call, "manage_workhorse_queue");
				assertCreatedWorkhorse(validated.workhorse);
				const result = await runtime.options.queue.list();
				runtime.assertCurrentBinding(binding);
				await runtime.classify(binding, request.call, "manage_workhorse_queue");
				runtime.reconcileUnknownQueue(result.queue);
				return freeze({ operation: "list", queuedSubmissionIds: queueIds(result.queue) });
			});
		}

		let operationIdentity;
		try {
			operationIdentity = selectOperationIdentity(
				runtime,
				"manage_workhorse_queue",
				request.operationId,
			);
		} catch (error) {
			return Promise.reject(error);
		}
		const { operationId, operationIdWire } = operationIdentity;
		return runtime.enqueue(async () => {
			const binding = runtime.currentBinding();
			const validated = await runtime.classify(binding, request.call, "manage_workhorse_queue");
			return mutateQueue(runtime, request, binding, validated, operationId, operationIdWire);
		});
	};
}

export { createInspect, createManageQueue };
