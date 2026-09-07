import { createAdditionalContext, createTextUserInput } from "@/runtime/codex-instructions";
import {
	CodexWorkhorseOperationsError,
	type SteerWorkhorseRequest,
	type SteerWorkhorseResult,
} from "@/runtime/codex-workhorse-operations/lib/contract";
import {
	activeTurnFromClassification,
	selectOperationIdentity,
	threadIdWire,
	validateBoundedInput,
	type OperationState,
	type WorkhorseRuntime,
} from "@/runtime/codex-workhorse-operations/lib/internal";
import {
	messageOf,
	operationError,
	sessionMutationOutcome,
} from "@/runtime/codex-workhorse-operations/lib/operation-errors";

type SteerParams = Parameters<WorkhorseRuntime["options"]["session"]["turnSteer"]>[0];
type SteerClassification = Awaited<ReturnType<WorkhorseRuntime["classify"]>>;

/**
 * Refuse to steer unless the workhorse is active on exactly the turn the caller captured.
 * @param request - The steer request.
 * @param classification - The fresh classification.
 */
function assertExpectedTurn(
	request: SteerWorkhorseRequest,
	classification: SteerClassification,
): void {
	if (
		classification.workhorse.link.status !== "active" ||
		activeTurnFromClassification(classification.workhorse) !== request.expectedTurnId
	) {
		throw operationError("busy", "Steer requires the exact currently active workhorse turn.");
	}
}

/**
 * Re-check authority after staging and before delivery; a change settles the operation as not
 * delivered and surfaces the reason.
 * @param runtime - The operations runtime.
 * @param request - The steer request.
 * @param state - The staged operation state.
 * @param message - The message for the refusal.
 */
async function revalidateSteer(
	runtime: WorkhorseRuntime,
	request: SteerWorkhorseRequest,
	state: OperationState,
	message: string,
): Promise<void> {
	try {
		assertExpectedTurn(
			request,
			await runtime.classify(state.binding, request.call, "steer_workhorse"),
		);
	} catch (error) {
		const outcome = runtime.settleDurable(state, "not_delivered", messageOf(error));
		runtime.terminal(state, "failed", [], messageOf(error));
		throw operationError(
			error instanceof CodexWorkhorseOperationsError ? error.code : "stale_link",
			message,
			{
				operation: "steer_workhorse",
				outcome,
				operationId: state.operationId,
				cause: error,
			},
		);
	}
}

/**
 * Build the turn/steer body from fresh canonical context; a context that does not carry this
 * operation's identity settles the operation as not delivered.
 * @param runtime - The operations runtime.
 * @param request - The steer request.
 * @param state - The staged operation state.
 * @returns The turn/steer parameters.
 */
function buildSteerParams(
	runtime: WorkhorseRuntime,
	request: SteerWorkhorseRequest,
	state: OperationState,
): SteerParams {
	try {
		const context = runtime.options.contextFor({
			operationId: state.operationId,
			kind: "steer_workhorse",
			rpc: "turn/steer",
		});
		if (
			context.operation.id !== state.operationIdWire ||
			context.operation.kind !== "steer_workhorse" ||
			context.operation.rpc !== "turn/steer" ||
			context.operation.outcome !== null
		) {
			throw new TypeError("steer context does not carry the current operation identity");
		}
		return {
			threadId: state.binding.workhorse.threadId,
			clientUserMessageId: state.operationIdWire,
			input: [createTextUserInput(request.input)],
			additionalContext: createAdditionalContext(context),
			expectedTurnId: request.expectedTurnId,
		} satisfies SteerParams;
	} catch (error) {
		runtime.settleDurable(state, "not_delivered", "The steer body was invalid.");
		runtime.terminal(state, "failed", [], messageOf(error));
		throw operationError("invalid_input", "The steer turn body was not canonical.", {
			operation: "steer_workhorse",
			outcome: "not_delivered",
			operationId: state.operationId,
			cause: error,
		});
	}
}

/**
 * Record the steered turn as active and emit `started` once.
 * @param runtime - The operations runtime.
 * @param state - The delivered operation state.
 * @param request - The steer request.
 */
function publishSteerStarted(
	runtime: WorkhorseRuntime,
	state: OperationState,
	request: SteerWorkhorseRequest,
): void {
	if (state.terminalEmitted) {
		return;
	}
	runtime.activeTurns.set(
		threadIdWire(runtime.options, state.workhorseThreadId),
		request.expectedTurnId,
	);
	if (!state.startedEmitted) {
		state.startedEmitted = true;
		runtime.emit(state, "started", "delivered", []);
	}
}

/**
 * Settle a steer whose delivery threw, with the outcome the session proved.
 * @param runtime - The operations runtime.
 * @param state - The staged operation state.
 * @param error - The thrown value.
 * @returns The settled outcome.
 */
function settleSteerFailure(
	runtime: WorkhorseRuntime,
	state: OperationState,
	error: unknown,
): SteerWorkhorseResult["delivery"] {
	const outcome = runtime.settleDurable(state, sessionMutationOutcome(error), messageOf(error));
	if (outcome === "outcome_unknown") {
		runtime.emit(state, "outcome_unknown", outcome, [], messageOf(error));
	} else {
		runtime.terminal(state, "failed", [], messageOf(error));
	}
	return outcome;
}

/**
 * Issue turn/steer and settle what it proved. Delivery is reported in the result rather than
 * thrown, because the steer may well have reached the workhorse even when settlement is unknown.
 * @param runtime - The operations runtime.
 * @param request - The steer request.
 * @param state - The staged operation state.
 * @param params - The turn/steer parameters.
 * @returns The steered turn with its delivery.
 */
async function deliverSteer(
	runtime: WorkhorseRuntime,
	request: SteerWorkhorseRequest,
	state: OperationState,
	params: SteerParams,
): Promise<SteerWorkhorseResult> {
	try {
		const response = await runtime.options.session.turnSteer(params);
		if (response.turnId !== request.expectedTurnId) {
			throw new TypeError("turn/steer returned a different turn identity");
		}
		await runtime.classify(state.binding, request.call, "steer_workhorse");
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
		publishSteerStarted(runtime, state, request);
		return Object.freeze({ turnId: request.expectedTurnId, delivery: "delivered" });
	} catch (error) {
		const delivery = settleSteerFailure(runtime, state, error);
		return Object.freeze({ turnId: request.expectedTurnId, delivery });
	}
}

/**
 * Create the steer operation: inject input into the exact active workhorse turn.
 * @param runtime - The operations runtime.
 * @returns The steer operation.
 */
export function createSteer(
	runtime: WorkhorseRuntime,
): (request: SteerWorkhorseRequest) => Promise<SteerWorkhorseResult> {
	return (request) => {
		validateBoundedInput(request.input, "steer input");
		runtime.assertCall(request.call, "steer_workhorse");
		let operationIdentity;
		try {
			operationIdentity = selectOperationIdentity(runtime, "steer_workhorse", request.operationId);
		} catch (error) {
			return Promise.reject(error);
		}
		const { operationId, operationIdWire } = operationIdentity;
		return runtime.enqueue(async () => {
			const binding = runtime.currentBinding();
			const validated = await runtime.classify(binding, request.call, "steer_workhorse");
			assertExpectedTurn(request, validated);
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
			await revalidateSteer(runtime, request, state, "Steer authority changed after staging.");
			const params = buildSteerParams(runtime, request, state);
			await revalidateSteer(runtime, request, state, "Steer authority changed before delivery.");
			return deliverSteer(runtime, request, state, params);
		});
	};
}
