import {
	assertCreatedWorkhorse,
	activeTurnFromClassification,
	freeze,
	isCreatedWorkhorse,
	messageOf,
	operationError,
	queueIds,
	queueMutationOutcome,
	threadIdWire,
	type WorkhorseRuntime,
} from "./internal.js";
import type {
	InspectWorkhorseRequest,
	InspectWorkhorseResult,
	ManageWorkhorseQueueRequest,
	ManageWorkhorseQueueResult,
	WorkhorseOperationBinding,
} from "./contract.js";
import type {
	OperationId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type { WorkhorseOperationClassification } from "./contract.js";

type MutableQueueRequest = Exclude<ManageWorkhorseQueueRequest, { readonly operation: "list" }>;

function mutationErrorCode(
	outcome: Exclude<ReturnType<WorkhorseRuntime["settleDurable"]>, "pending">,
): "transport_failure" | "outcome_unknown" {
	return outcome === "outcome_unknown" ? "outcome_unknown" : "transport_failure";
}

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

export function createInspect(
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

async function mutateQueue(
	runtime: WorkhorseRuntime,
	request: MutableQueueRequest,
	binding: WorkhorseOperationBinding,
	validated: { readonly workhorse: WorkhorseOperationClassification },
	operationId: OperationId,
	operationIdWire: string,
): Promise<ManageWorkhorseQueueResult> {
	if (binding === null)
		throw operationError("not_ready", "The workhorse link is no longer available.");
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
	if ("submissionId" in request) state.queuedSubmissionId = request.submissionId;
	let result;
	let effectStarted = false;
	try {
		const staged = await runtime.classify(binding, request.call, "manage_workhorse_queue");
		assertCreatedWorkhorse(staged.workhorse);
		const beforeEffect = async (): Promise<void> => {
			const current = await runtime.classify(binding, request.call, "manage_workhorse_queue");
			assertCreatedWorkhorse(current.workhorse);
		};
		effectStarted = true;
		switch (request.operation) {
			case "add":
				result = await runtime.options.queue.add({
					operationId,
					prompt: request.prompt,
					beforeEffect,
				});
				break;
			case "update":
				result = await runtime.options.queue.update({
					operationId,
					submissionId: request.submissionId,
					prompt: request.prompt,
					beforeEffect,
				});
				break;
			case "delete":
				result = await runtime.options.queue.delete({
					operationId,
					submissionId: request.submissionId,
					beforeEffect,
				});
				break;
			case "reorder":
				result = await runtime.options.queue.reorder({
					operationId,
					orderedSubmissionIds: request.orderedSubmissionIds,
					beforeEffect,
				});
				break;
			case "start":
				result = await runtime.options.queue.start({
					operationId,
					submissionId: request.submissionId,
					beforeEffect,
				});
				break;
		}
		runtime.assertCurrentBinding(binding);
		await runtime.classify(binding, request.call, "manage_workhorse_queue");
	} catch (error) {
		const requested = effectStarted ? queueMutationOutcome(error, true) : "not_delivered";
		const outcome = runtime.settleDurable(state, requested, messageOf(error));
		if (outcome === "outcome_unknown")
			runtime.emit(state, "outcome_unknown", outcome, [], messageOf(error));
		else runtime.terminal(state, "failed", [], messageOf(error));
		throw operationError(mutationErrorCode(outcome), "The queue operation was not delivered.", {
			operation: "manage_workhorse_queue",
			outcome,
			operationId,
			cause: error,
		});
	}

	if (request.operation === "add") {
		const matches = result.queue.filter(
			(submission) => submission.clientUserMessageId === operationIdWire,
		);
		if (matches.length === 1) state.queuedSubmissionId = matches[0]!.id;
	}
	if (request.operation === "start" && "turnId" in result && result.turnId !== null)
		state.turnId = result.turnId;
	const hasExactQueueIdentity = state.queuedSubmissionId !== null;
	const requestedOutcome =
		request.operation === "start" && "turnId" in result && result.turnId !== null
			? "delivered"
			: request.operation === "start" && result.outcome === "delivered"
				? "outcome_unknown"
				: request.operation === "add" &&
					  (result.outcome === "delivered" || result.outcome === "outcome_unknown") &&
					  hasExactQueueIdentity
					? "delivered"
					: request.operation === "add" && result.outcome === "delivered" && !hasExactQueueIdentity
						? "outcome_unknown"
						: result.outcome;
	const outcome = runtime.settleDurable(state, requestedOutcome, null);
	const ids = queueIds(result.queue);
	if (outcome === "delivered") {
		if (request.operation === "add") {
			if (!state.queuedEmitted) {
				state.queuedEmitted = true;
				runtime.emit(state, "queued", outcome, result.queue);
			}
		} else if (request.operation === "start") {
			if (state.turnId === null)
				throw operationError(
					"outcome_unknown",
					"Queue start returned no authoritative turn identity.",
					{ operation: "manage_workhorse_queue", outcome, operationId },
				);
			runtime.correlateTurn(state, state.turnId, result.queue);
		} else runtime.terminal(state, "completed", result.queue, null);
	} else if (outcome === "not_delivered")
		runtime.terminal(state, "failed", result.queue, "The queue operation was not delivered.");
	else
		runtime.emit(
			state,
			"outcome_unknown",
			outcome,
			result.queue,
			"The queue response was not attributable; inspect before retrying.",
		);
	if (outcome !== "delivered")
		throw operationError(mutationErrorCode(outcome), "The queue operation was not delivered.", {
			operation: "manage_workhorse_queue",
			outcome,
			operationId,
		});
	return freeze({ operation: request.operation, queuedSubmissionIds: ids });
}

export function createManageQueue(
	runtime: WorkhorseRuntime,
): (request: ManageWorkhorseQueueRequest) => Promise<ManageWorkhorseQueueResult> {
	return (request) => {
		runtime.assertCall(request.call, "manage_workhorse_queue");
		if (request.operation === "list")
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

		let operationId: OperationId;
		try {
			operationId = runtime.options.operation.issuer.mintOperationId();
			runtime.options.operation.validator.assertCurrentOperationId(operationId);
		} catch (error) {
			return Promise.reject(
				operationError("invalid_input", "A current queue operation identity was unavailable.", {
					cause: error,
				}),
			);
		}
		const operationIdWire = runtime.options.operation.decoder.serializeOperationId(operationId);
		return runtime.enqueue(async () => {
			const binding = runtime.currentBinding();
			const validated = await runtime.classify(binding, request.call, "manage_workhorse_queue");
			return mutateQueue(runtime, request, binding, validated, operationId, operationIdWire);
		});
	};
}
