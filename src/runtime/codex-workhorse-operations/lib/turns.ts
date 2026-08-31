import { createAdditionalContext, createTextUserInput } from "../../codex-instructions/index.js";
import type { SessionTurn } from "../../codex-session/index.js";
import {
	CodexWorkhorseOperationsError,
	type DelegateToWorkhorseRequest,
	type DelegateToWorkhorseResult,
} from "./contract.js";
import {
	assertCreatedWorkhorse,
	messageOf,
	operationError,
	queueMutationOutcome,
	selectOperationIdentity,
	sessionMutationOutcome,
	threadIdWire,
	validateBoundedInput,
	type OperationState,
	type WorkhorseRuntime,
} from "./internal.js";

function mutationErrorCode(
	outcome: Exclude<OperationState["outcome"], "pending">,
): "transport_failure" | "outcome_unknown" {
	return outcome === "outcome_unknown" ? "outcome_unknown" : "transport_failure";
}

async function invokeTurnStart(
	runtime: WorkhorseRuntime,
	state: OperationState,
	request: DelegateToWorkhorseRequest,
	prompt: string,
): Promise<DelegateToWorkhorseResult> {
	try {
		const validated = await runtime.classify(state.binding, request.call, "delegate_to_workhorse");
		if (validated.workhorse.link.status !== "idle")
			throw operationError("busy", "The workhorse is no longer idle for direct delegation.");
	} catch (error) {
		const outcome = runtime.settleDurable(state, "not_delivered", messageOf(error));
		runtime.terminal(state, "failed", [], messageOf(error));
		throw operationError(
			error instanceof CodexWorkhorseOperationsError ? error.code : "stale_link",
			"The direct delegate lost authority before context construction.",
			{
				operation: "delegate_to_workhorse",
				outcome,
				operationId: state.operationId,
				cause: error,
			},
		);
	}
	let context;
	try {
		context = runtime.options.contextFor({
			operationId: state.operationId,
			kind: "delegate_to_workhorse",
			rpc: "turn/start",
		});
		if (
			context.operation.id !== state.operationIdWire ||
			context.operation.kind !== "delegate_to_workhorse" ||
			context.operation.rpc !== "turn/start" ||
			context.operation.outcome !== null
		)
			throw new TypeError("delegate context does not carry the current operation identity");
	} catch (error) {
		runtime.settleDurable(state, "not_delivered", "The delegate context was invalid.");
		runtime.terminal(state, "failed", [], messageOf(error));
		throw operationError("invalid_input", "The delegate context was not canonical.", {
			operation: "delegate_to_workhorse",
			outcome: "not_delivered",
			operationId: state.operationId,
			cause: error,
		});
	}

	let params;
	try {
		params = {
			threadId: state.workhorseThreadId,
			clientUserMessageId: state.operationIdWire,
			input: [createTextUserInput(prompt)],
			turnTrigger: "archboard",
			additionalContext: createAdditionalContext(context),
		} satisfies Parameters<WorkhorseRuntime["options"]["session"]["turnStart"]>[0];
	} catch (error) {
		runtime.settleDurable(state, "not_delivered", "The delegate input was invalid.");
		runtime.terminal(state, "failed", [], messageOf(error));
		throw operationError("invalid_input", "The delegate turn body was not canonical.", {
			operation: "delegate_to_workhorse",
			outcome: "not_delivered",
			operationId: state.operationId,
			cause: error,
		});
	}

	try {
		const validated = await runtime.classify(state.binding, request.call, "delegate_to_workhorse");
		if (validated.workhorse.link.status !== "idle")
			throw operationError("busy", "The workhorse is no longer idle for direct delegation.");
	} catch (error) {
		const outcome = runtime.settleDurable(state, "not_delivered", messageOf(error));
		runtime.terminal(state, "failed", [], messageOf(error));
		const code =
			error instanceof CodexWorkhorseOperationsError ? error.code : ("stale_link" as const);
		throw operationError(code, "The delegate link changed before delivery.", {
			operation: "delegate_to_workhorse",
			outcome,
			operationId: state.operationId,
			cause: error,
		});
	}

	let response: Awaited<ReturnType<WorkhorseRuntime["options"]["session"]["turnStart"]>>;
	try {
		response = await runtime.options.session.turnStart(params);
	} catch (error) {
		const requested = sessionMutationOutcome(error);
		const outcome = runtime.settleDurable(state, requested, messageOf(error));
		if (outcome === "outcome_unknown")
			runtime.emit(state, "outcome_unknown", outcome, [], messageOf(error));
		else runtime.terminal(state, "failed", [], messageOf(error));
		throw operationError(mutationErrorCode(outcome), "The delegate turn was not delivered.", {
			operation: "delegate_to_workhorse",
			outcome,
			operationId: state.operationId,
			cause: error,
		});
	}

	let turn: SessionTurn;
	try {
		turn = response.turn;
		const turnId = runtime.options.identity.decoder.parseTurnId(turn.id);
		if (turn.id !== turnId) throw new TypeError("turn identity is not canonical");
		if (state.turnId !== null && state.turnId !== turnId)
			throw new TypeError("turn/start returned a different turn identity than observed");
		state.turnId = turnId;
		runtime.assertCurrentBinding(state.binding);
		await runtime.classify(state.binding, request.call, "delegate_to_workhorse");
	} catch (error) {
		const outcome = runtime.settleDurable(
			state,
			"outcome_unknown",
			"The delegate response could not be correlated to the current link.",
		);
		if (outcome === "outcome_unknown")
			runtime.emit(state, "outcome_unknown", outcome, [], messageOf(error));
		throw operationError(
			"outcome_unknown",
			"The delegate response cannot be correlated; inspect before retrying.",
			{
				operation: "delegate_to_workhorse",
				outcome,
				operationId: state.operationId,
				cause: error,
			},
		);
	}

	const outcome = runtime.settleDurable(state, "delivered", null);
	if (outcome !== "delivered") {
		runtime.emit(
			state,
			"outcome_unknown",
			outcome,
			[],
			"The delegate response could not be durably committed.",
		);
		throw operationError(
			"outcome_unknown",
			"The delegate response cannot be durably correlated; inspect before retrying.",
			{
				operation: "delegate_to_workhorse",
				outcome,
				operationId: state.operationId,
			},
		);
	}
	if (!state.terminalEmitted) {
		runtime.activeTurns.set(threadIdWire(runtime.options, state.workhorseThreadId), state.turnId);
		if (!state.startedEmitted) {
			state.startedEmitted = true;
			runtime.emit(state, "started", "delivered", []);
		}
		if (turn.status === "completed") runtime.terminal(state, "completed", [], null);
		else if (turn.status === "failed" || turn.status === "interrupted")
			runtime.terminal(
				state,
				"failed",
				[],
				"The delegate turn ended before further workhorse events.",
			);
	}
	return Object.freeze({
		mode: "started",
		clientUserMessageId: state.operationIdWire,
		queuedSubmissionId: null,
		turnId: state.turnId,
	});
}

export function createDelegate(
	runtime: WorkhorseRuntime,
): (request: DelegateToWorkhorseRequest) => Promise<DelegateToWorkhorseResult> {
	return (request) => {
		validateBoundedInput(request.input, "delegate input");
		validateBoundedInput(request.transcriptDelta, "transcript delta", true);
		runtime.assertCall(request.call, "delegate_to_workhorse");
		let operationIdentity;
		try {
			operationIdentity = selectOperationIdentity(
				runtime,
				"delegate_to_workhorse",
				request.operationId,
			);
		} catch (error) {
			return Promise.reject(error);
		}
		const { operationId, operationIdWire } = operationIdentity;
		return runtime.enqueue(async () => {
			const binding = runtime.currentBinding();
			const validated = await runtime.classify(binding, request.call, "delegate_to_workhorse");
			const prompt =
				request.transcriptDelta.length === 0
					? request.input
					: `${request.input}\n\nRealtime transcript context:\n${request.transcriptDelta}`;
			try {
				createTextUserInput(prompt);
			} catch (error) {
				throw operationError("invalid_input", "The delegate input could not be encoded.", {
					cause: error,
				});
			}
			if (validated.workhorse.link.status === "active") {
				assertCreatedWorkhorse(validated.workhorse);
				const state = runtime.stage({
					operationId,
					operationIdWire,
					operation: "delegate_to_workhorse",
					queueOperation: "add",
					rpc: "thread/queue/add",
					call: request.call,
					binding,
					workhorse: validated.workhorse,
					clientUserMessageId: operationIdWire,
				});
				let result;
				let effectStarted = false;
				try {
					const staged = await runtime.classify(binding, request.call, "delegate_to_workhorse");
					assertCreatedWorkhorse(staged.workhorse);
					if (staged.workhorse.link.status !== "active")
						throw operationError("busy", "The workhorse is no longer active for queueing.");
					effectStarted = true;
					result = await runtime.options.queue.add({
						operationId,
						prompt,
						beforeEffect: async () => {
							const current = await runtime.classify(
								binding,
								request.call,
								"delegate_to_workhorse",
							);
							assertCreatedWorkhorse(current.workhorse);
							if (current.workhorse.link.status !== "active")
								throw operationError("busy", "The workhorse is no longer active for queueing.");
						},
					});
					runtime.assertCurrentBinding(binding);
					await runtime.classify(binding, request.call, "delegate_to_workhorse");
				} catch (error) {
					const requested = queueMutationOutcome(error, effectStarted);
					const outcome = runtime.settleDurable(state, requested, messageOf(error));
					if (outcome === "outcome_unknown")
						runtime.emit(state, "outcome_unknown", outcome, [], messageOf(error));
					else runtime.terminal(state, "failed", [], messageOf(error));
					throw operationError(
						mutationErrorCode(outcome),
						"The queued delegate outcome was not delivered.",
						{
							operation: "delegate_to_workhorse",
							outcome,
							operationId,
							cause: error,
						},
					);
				}
				const matches = result.queue.filter(
					(submission) => submission.clientUserMessageId === operationIdWire,
				);
				if (matches.length === 1) state.queuedSubmissionId = matches[0]!.id;
				const hasExactQueueIdentity = state.queuedSubmissionId !== null;
				const requestedOutcome =
					(result.outcome === "delivered" || result.outcome === "outcome_unknown") &&
					hasExactQueueIdentity
						? "delivered"
						: result.outcome === "delivered" && !hasExactQueueIdentity
							? "outcome_unknown"
							: result.outcome;
				const outcome = runtime.settleDurable(state, requestedOutcome, null);
				if (outcome === "delivered" && state.queuedSubmissionId !== null) {
					if (!state.queuedEmitted) {
						state.queuedEmitted = true;
						runtime.emit(state, "queued", outcome, result.queue);
					}
				} else if (outcome === "outcome_unknown")
					runtime.emit(
						state,
						"outcome_unknown",
						outcome,
						result.queue,
						"The queue response was not attributable; inspect the exact client identity.",
					);
				else runtime.terminal(state, "failed", result.queue, "The delegate was not queued.");
				if (outcome !== "delivered" || state.queuedSubmissionId === null)
					throw operationError(
						mutationErrorCode(outcome),
						"The delegate queue outcome was not delivered.",
						{
							operation: "delegate_to_workhorse",
							outcome,
							operationId,
						},
					);
				return Object.freeze({
					mode: "queued",
					clientUserMessageId: operationIdWire,
					queuedSubmissionId: state.queuedSubmissionId,
					turnId: null,
				});
			}
			const state = runtime.stage({
				operationId,
				operationIdWire,
				operation: "delegate_to_workhorse",
				queueOperation: null,
				call: request.call,
				binding,
				workhorse: validated.workhorse,
				clientUserMessageId: operationIdWire,
			});
			return invokeTurnStart(runtime, state, request, prompt);
		});
	};
}
