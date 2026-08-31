import { createAdditionalContext, createTextUserInput } from "../../codex-instructions/index.js";
import { CodexSessionMutationError, type SessionTurn } from "../../codex-session/index.js";
import {
	CodexWorkhorseOperationsError,
	type DelegateToWorkhorseRequest,
	type DelegateToWorkhorseResult,
	type SteerWorkhorseRequest,
	type SteerWorkhorseResult,
} from "./contract.js";
import {
	assertCreatedWorkhorse,
	messageOf,
	operationError,
	queueMutationOutcome,
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
		runtime.assertCurrentBinding(state.binding);
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
		let operationId;
		try {
			operationId = runtime.options.operation.issuer.mintOperationId();
			runtime.options.operation.validator.assertCurrentOperationId(operationId);
		} catch (error) {
			return Promise.reject(
				operationError("invalid_input", "A current delegate operation identity was unavailable.", {
					cause: error,
				}),
			);
		}
		const operationIdWire = runtime.options.operation.decoder.serializeOperationId(operationId);
		return runtime.enqueue(async () => {
			const binding = runtime.currentBinding();
			const validated = await runtime.classify(binding, request.call, "delegate_to_workhorse");
			assertCreatedWorkhorse(validated.workhorse);
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
					runtime.assertCurrentBinding(binding);
					effectStarted = true;
					result = await runtime.options.queue.add({ operationId, prompt });
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
					runtime.clear(state);
					runtime.emit(state, "queued", outcome, result.queue);
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

export function createSteer(
	runtime: WorkhorseRuntime,
): (request: SteerWorkhorseRequest) => Promise<SteerWorkhorseResult> {
	return (request) => {
		validateBoundedInput(request.input, "steer input");
		runtime.assertCall(request.call, "steer_workhorse");
		let operationId;
		try {
			operationId = runtime.options.operation.issuer.mintOperationId();
			runtime.options.operation.validator.assertCurrentOperationId(operationId);
		} catch (error) {
			return Promise.reject(
				operationError("invalid_input", "A current steer operation identity was unavailable.", {
					cause: error,
				}),
			);
		}
		const operationIdWire = runtime.options.operation.decoder.serializeOperationId(operationId);
		return runtime.enqueue(async () => {
			const binding = runtime.currentBinding();
			const validated = await runtime.classify(binding, request.call, "steer_workhorse");
			assertCreatedWorkhorse(validated.workhorse);
			const activeTurnId =
				validated.workhorse.thread === null
					? null
					: validated.workhorse.thread.turns.filter((turn) => turn.status === "inProgress")
								.length === 1
						? (validated.workhorse.thread.turns.find((turn) => turn.status === "inProgress")?.id ??
							null)
						: null;
			const knownTurnId =
				activeTurnId ??
				runtime.activeTurns.get(threadIdWire(runtime.options, binding.workhorse.threadId)) ??
				null;
			if (validated.workhorse.link.status !== "active" || knownTurnId !== request.expectedTurnId)
				throw operationError("busy", "Steer requires the exact currently active workhorse turn.");
			const state = runtime.stage({
				operationId,
				operationIdWire,
				operation: "steer_workhorse",
				queueOperation: null,
				call: request.call,
				binding,
				workhorse: validated.workhorse,
				clientUserMessageId: operationIdWire,
			});
			state.turnId = request.expectedTurnId;
			let context;
			let params;
			try {
				context = runtime.options.contextFor({
					operationId,
					kind: "steer_workhorse",
					rpc: "turn/steer",
				});
				if (
					context.operation.id !== operationIdWire ||
					context.operation.kind !== "steer_workhorse" ||
					context.operation.rpc !== "turn/steer" ||
					context.operation.outcome !== null
				)
					throw new TypeError("steer context does not carry the current operation identity");
				params = {
					threadId: binding.workhorse.threadId,
					clientUserMessageId: operationIdWire,
					input: [createTextUserInput(request.input)],
					additionalContext: createAdditionalContext(context),
					expectedTurnId: request.expectedTurnId,
				} satisfies Parameters<WorkhorseRuntime["options"]["session"]["turnSteer"]>[0];
			} catch (error) {
				runtime.settleDurable(state, "not_delivered", "The steer body was invalid.");
				runtime.terminal(state, "failed", [], messageOf(error));
				throw operationError("invalid_input", "The steer turn body was not canonical.", {
					operation: "steer_workhorse",
					outcome: "not_delivered",
					operationId,
					cause: error,
				});
			}
			try {
				runtime.assertCurrentBinding(state.binding);
			} catch (error) {
				const outcome = runtime.settleDurable(state, "not_delivered", messageOf(error));
				runtime.terminal(state, "failed", [], messageOf(error));
				const code =
					error instanceof CodexWorkhorseOperationsError ? error.code : ("stale_link" as const);
				throw operationError(code, "The steer link changed before delivery.", {
					operation: "steer_workhorse",
					outcome,
					operationId,
					cause: error,
				});
			}
			try {
				const response = await runtime.options.session.turnSteer(params);
				if (response.turnId !== request.expectedTurnId)
					throw new TypeError("turn/steer returned a different turn identity");
				runtime.assertCurrentBinding(binding);
				await runtime.classify(binding, request.call, "steer_workhorse");
				const outcome = runtime.settleDurable(state, "delivered", null);
				if (outcome !== "delivered") {
					runtime.emit(
						state,
						"outcome_unknown",
						outcome,
						[],
						"The steer response could not be durably committed.",
					);
					return Object.freeze({ turnId: request.expectedTurnId, delivery: outcome });
				}
				if (!state.terminalEmitted) {
					runtime.activeTurns.set(
						threadIdWire(runtime.options, state.workhorseThreadId),
						request.expectedTurnId,
					);
					if (!state.startedEmitted) {
						state.startedEmitted = true;
						runtime.emit(state, "started", "delivered", []);
					}
				}
				return Object.freeze({ turnId: request.expectedTurnId, delivery: "delivered" });
			} catch (error) {
				const requested =
					error instanceof CodexSessionMutationError ? error.outcome : "outcome_unknown";
				const outcome = runtime.settleDurable(state, requested, messageOf(error));
				if (outcome === "outcome_unknown")
					runtime.emit(state, "outcome_unknown", outcome, [], messageOf(error));
				else runtime.terminal(state, "failed", [], messageOf(error));
				return Object.freeze({ turnId: request.expectedTurnId, delivery: outcome });
			}
		});
	};
}
