import { createTextUserInput } from "@/runtime/codex-instructions";
import type { ThreadLinkClassification } from "@/runtime/codex-thread-link";
import type { QueueAddResult } from "@/runtime/codex-workhorse-queue";
import type { OperationId } from "@/shared/codex-workbench-identity";
import type {
	DelegateToWorkhorseRequest,
	DelegateToWorkhorseResult,
	WorkhorseCoordinatorCall,
	WorkhorseOperationBinding,
} from "@/runtime/codex-workhorse-operations/lib/contract";
import {
	invokeTurnStart,
	mutationErrorCode,
} from "@/runtime/codex-workhorse-operations/lib/direct-delegate";
import {
	selectOperationIdentity,
	validateBoundedInput,
	type OperationState,
	type SettledDelivery,
	type WorkhorseRuntime,
} from "@/runtime/codex-workhorse-operations/lib/internal";
import { assertCreatedWorkhorse } from "@/runtime/codex-workhorse-operations/lib/link-provenance";
import {
	messageOf,
	operationError,
	queueMutationOutcome,
} from "@/runtime/codex-workhorse-operations/lib/operation-errors";

/** The host-issued identity one delegate runs under, in both typed and wire form. */
interface DelegateIdentity {
	readonly operationId: OperationId;
	readonly operationIdWire: string;
}

/**
 * The prompt the workhorse receives: the delegate input, followed by any realtime transcript the
 * coordinator captured since its last delegate.
 * @param request - The delegate request.
 * @returns The prompt text.
 */
function delegatePrompt(request: DelegateToWorkhorseRequest): string {
	return request.transcriptDelta.length === 0
		? request.input
		: `${request.input}\n\nRealtime transcript context:\n${request.transcriptDelta}`;
}

/**
 * Refuse a prompt that cannot be encoded as a Codex text input before any state is staged.
 * @param prompt - The delegate prompt.
 */
function assertEncodablePrompt(prompt: string): void {
	try {
		createTextUserInput(prompt);
	} catch (error) {
		throw operationError("invalid_input", "The delegate input could not be encoded.", {
			cause: error,
		});
	}
}

/**
 * Re-classify the link and require an Archboard-created workhorse that is still active, the
 * only state in which a delegate may be queued behind the running turn.
 * @param runtime - The operations runtime.
 * @param binding - The captured binding.
 * @param call - The coordinator call.
 */
async function assertActiveForQueue(
	runtime: WorkhorseRuntime,
	binding: WorkhorseOperationBinding,
	call: WorkhorseCoordinatorCall,
): Promise<void> {
	const current = await runtime.classify(binding, call, "delegate_to_workhorse");
	assertCreatedWorkhorse(current.workhorse);
	if (current.workhorse.link.status !== "active") {
		throw operationError("busy", "The workhorse is no longer active for queueing.");
	}
}

/**
 * Settle and publish a queued delegate that threw, then surface it as an operations error.
 * @param runtime - The operations runtime.
 * @param state - The staged operation state.
 * @param error - The thrown value.
 * @param effectStarted - Whether the queue effect had been issued.
 */
function failQueuedDelegate(
	runtime: WorkhorseRuntime,
	state: OperationState,
	error: unknown,
	effectStarted: boolean,
): never {
	const requested = queueMutationOutcome(error, effectStarted);
	const outcome = runtime.settleDurable(state, requested, messageOf(error));
	if (outcome === "outcome_unknown") {
		runtime.emit(state, "outcome_unknown", outcome, [], messageOf(error));
	} else {
		runtime.terminal(state, "failed", [], messageOf(error));
	}
	throw operationError(
		mutationErrorCode(outcome),
		"The queued delegate outcome was not delivered.",
		{
			operation: "delegate_to_workhorse",
			outcome,
			operationId: state.operationId,
			cause: error,
		},
	);
}

/**
 * Issue the queue add under the staged operation: re-check the link, add with a pre-effect check
 * that re-checks it again, then re-check once more after the response.
 * @param runtime - The operations runtime.
 * @param state - The staged operation state.
 * @param binding - The captured binding.
 * @param call - The coordinator call.
 * @param prompt - The delegate prompt.
 * @returns The queue result.
 */
async function addQueuedDelegate(
	runtime: WorkhorseRuntime,
	state: OperationState,
	binding: WorkhorseOperationBinding,
	call: WorkhorseCoordinatorCall,
	prompt: string,
): Promise<QueueAddResult<OperationId>> {
	let effectStarted = false;
	try {
		await assertActiveForQueue(runtime, binding, call);
		effectStarted = true;
		const result = await runtime.options.queue.add({
			operationId: state.operationId,
			prompt,
			/**
			 * The queue module's last check before the remote effect starts.
			 * @returns The pending re-classification, which rejects when the link changed.
			 */
			beforeEffect: () => assertActiveForQueue(runtime, binding, call),
		});
		runtime.assertCurrentBinding(binding);
		await runtime.classify(binding, call, "delegate_to_workhorse");
		return result;
	} catch (error) {
		return failQueuedDelegate(runtime, state, error, effectStarted);
	}
}

/**
 * What the queue response proved: delivered only when the queue names exactly our submission,
 * unknown when it claims delivery without naming it, otherwise whatever the queue said.
 * @param resultOutcome - The outcome the queue module reported.
 * @param hasExactQueueIdentity - Whether exactly one queue entry carried our client identity.
 * @returns The outcome to settle durably.
 */
function requestedQueueOutcome(
	resultOutcome: SettledDelivery,
	hasExactQueueIdentity: boolean,
): SettledDelivery {
	if (hasExactQueueIdentity && resultOutcome !== "not_delivered") {
		return "delivered";
	}
	return resultOutcome === "delivered" ? "outcome_unknown" : resultOutcome;
}

/**
 * Publish how a queued delegate settled: queued once, unknown, or failed.
 * @param runtime - The operations runtime.
 * @param state - The operation state.
 * @param outcome - The durably settled outcome.
 * @param queue - The queue the response carried.
 */
function publishQueuedDelegate(
	runtime: WorkhorseRuntime,
	state: OperationState,
	outcome: SettledDelivery,
	queue: QueueAddResult<OperationId>["queue"],
): void {
	if (outcome === "delivered" && state.queuedSubmissionId !== null) {
		if (!state.queuedEmitted) {
			state.queuedEmitted = true;
			runtime.emit(state, "queued", outcome, queue);
		}
		return;
	}
	if (outcome === "outcome_unknown") {
		runtime.emit(
			state,
			"outcome_unknown",
			outcome,
			queue,
			"The queue response was not attributable; inspect the exact client identity.",
		);
		return;
	}
	runtime.terminal(state, "failed", queue, "The delegate was not queued.");
}

/**
 * Delegate to an active workhorse by queueing behind its running turn.
 * @param runtime - The operations runtime.
 * @param request - The delegate request.
 * @param binding - The captured binding.
 * @param workhorse - The initial workhorse classification.
 * @param identity - The operation identity.
 * @param prompt - The delegate prompt.
 * @returns The queued submission.
 */
async function queueDelegate(
	runtime: WorkhorseRuntime,
	request: DelegateToWorkhorseRequest,
	binding: WorkhorseOperationBinding,
	workhorse: ThreadLinkClassification,
	identity: DelegateIdentity,
	prompt: string,
): Promise<DelegateToWorkhorseResult> {
	assertCreatedWorkhorse(workhorse);
	const state = runtime.stage({
		...identity,
		operation: "delegate_to_workhorse",
		queueOperation: "add",
		rpc: "thread/queue/add",
		call: request.call,
		binding,
		workhorse,
		clientUserMessageId: identity.operationIdWire,
	});
	const result = await addQueuedDelegate(runtime, state, binding, request.call, prompt);
	const matches = result.queue.filter(
		(submission) => submission.clientUserMessageId === identity.operationIdWire,
	);
	if (matches.length === 1) {
		state.queuedSubmissionId = matches[0]!.id;
	}
	const outcome = runtime.settleDurable(
		state,
		requestedQueueOutcome(result.outcome, state.queuedSubmissionId !== null),
		null,
	);
	publishQueuedDelegate(runtime, state, outcome, result.queue);
	if (outcome !== "delivered" || state.queuedSubmissionId === null) {
		throw operationError(
			mutationErrorCode(outcome),
			"The delegate queue outcome was not delivered.",
			{
				operation: "delegate_to_workhorse",
				outcome,
				operationId: identity.operationId,
			},
		);
	}
	return Object.freeze({
		mode: "queued",
		clientUserMessageId: identity.operationIdWire,
		queuedSubmissionId: state.queuedSubmissionId,
		turnId: null,
	});
}

/**
 * Run one delegate under the serialised operation queue: classify the link, then queue behind
 * an active turn or start a turn directly on an idle workhorse.
 * @param runtime - The operations runtime.
 * @param request - The delegate request.
 * @param identity - The operation identity.
 * @returns The started turn or queued submission.
 */
async function runDelegate(
	runtime: WorkhorseRuntime,
	request: DelegateToWorkhorseRequest,
	identity: DelegateIdentity,
): Promise<DelegateToWorkhorseResult> {
	const binding = runtime.currentBinding();
	const validated = await runtime.classify(binding, request.call, "delegate_to_workhorse");
	const prompt = delegatePrompt(request);
	assertEncodablePrompt(prompt);
	if (validated.workhorse.link.status === "active") {
		return queueDelegate(runtime, request, binding, validated.workhorse, identity, prompt);
	}
	const state = runtime.stage({
		...identity,
		operation: "delegate_to_workhorse",
		queueOperation: null,
		call: request.call,
		binding,
		workhorse: validated.workhorse,
		clientUserMessageId: identity.operationIdWire,
	});
	return invokeTurnStart(runtime, state, request, prompt);
}

/**
 * Build the delegate port: bounded input and call checks run synchronously, the operation
 * identity is selected before the work is enqueued, and the delegate itself runs serialised
 * behind every earlier operation.
 * @param runtime - The operations runtime.
 * @returns The delegate function of the operations port.
 */
export function createDelegate(
	runtime: WorkhorseRuntime,
): (request: DelegateToWorkhorseRequest) => Promise<DelegateToWorkhorseResult> {
	return (request) => {
		validateBoundedInput(request.input, "delegate input");
		validateBoundedInput(request.transcriptDelta, "transcript delta", true);
		runtime.assertCall(request.call, "delegate_to_workhorse");
		let identity: DelegateIdentity;
		try {
			identity = selectOperationIdentity(runtime, "delegate_to_workhorse", request.operationId);
		} catch (error) {
			return Promise.reject(error);
		}
		return runtime.enqueue(() => runDelegate(runtime, request, identity));
	};
}
