import type { TurnId } from "@archboard/codex-app-server/identity";
import { createTextUserInput } from "#runtime/host/turn-input/rules/text-input.ts";
import { createWorkbenchAdditionalContext } from "#runtime/host/turn-input/rules/bodies.ts";
import {
	CodexWorkhorseOperationsError,
	type SteerWorkhorseRequest,
	type SteerWorkhorseResult,
} from "#runtime/workhorses/workhorse-operations/protocol/contract.ts";
import { readActiveTurn } from "#runtime/workhorses/workhorse-operations/operations/inspect.ts";
import {
	selectOperationIdentity,
	threadIdWire,
	validateBoundedInput,
	type OperationState,
	type WorkhorseRuntime,
} from "#runtime/workhorses/workhorse-operations/rules/internal.ts";
import {
	messageOf,
	operationError,
	sessionMutationOutcome,
} from "#runtime/workhorses/workhorse-operations/rules/operation-errors.ts";

type SteerParams = Parameters<WorkhorseRuntime["options"]["session"]["turnSteer"]>[0];
type SteerClassification = Awaited<ReturnType<WorkhorseRuntime["classify"]>>;

/**
 * The workhorse turn a steer targets: the one Codex lists as running on the workhorse thread. A
 * thread summary carries no turns, and the coordinator's own turn is never the target.
 * @param runtime - The operations runtime.
 * @param classification - The fresh classification.
 * @returns The running workhorse turn.
 */
async function runningWorkhorseTurn(
	runtime: WorkhorseRuntime,
	classification: SteerClassification,
): Promise<TurnId> {
	if (classification.workhorse.link.status !== "active") {
		throw operationError("busy", "Steer requires a running workhorse turn.");
	}
	let turnId: TurnId | null;
	try {
		turnId = await readActiveTurn(runtime, classification.binding.workhorse.threadId);
	} catch (error) {
		throw operationError("transport_failure", "The workhorse turns could not be read.", {
			cause: error,
		});
	}
	if (turnId === null) {
		throw operationError("busy", "Steer requires a running workhorse turn.");
	}
	return turnId;
}

/**
 * Refuse to steer unless the workhorse still runs exactly the turn the steer targets.
 * @param runtime - The operations runtime.
 * @param classification - The fresh classification.
 * @param target - The turn the steer targets.
 */
async function assertTargetTurn(
	runtime: WorkhorseRuntime,
	classification: SteerClassification,
	target: TurnId,
): Promise<void> {
	if ((await runningWorkhorseTurn(runtime, classification)) !== target) {
		throw operationError("busy", "The workhorse turn changed before the steer was delivered.");
	}
}

/**
 * Re-check authority after staging and before delivery; a change settles the operation as not
 * delivered and surfaces the reason.
 * @param runtime - The operations runtime.
 * @param request - The steer request.
 * @param state - The staged operation state.
 * @param target - The workhorse turn the steer targets.
 * @param message - The message for the refusal.
 */
async function revalidateSteer(
	runtime: WorkhorseRuntime,
	request: SteerWorkhorseRequest,
	state: OperationState,
	target: TurnId,
	message: string,
): Promise<void> {
	try {
		await assertTargetTurn(
			runtime,
			await runtime.classify(state.binding, request.call, "steer_workhorse"),
			target,
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
 * @param target - The workhorse turn the steer targets.
 * @returns The turn/steer parameters.
 */
function buildSteerParams(
	runtime: WorkhorseRuntime,
	request: SteerWorkhorseRequest,
	state: OperationState,
	target: TurnId,
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
			additionalContext: createWorkbenchAdditionalContext(context, runtime.options.contextCodec),
			expectedTurnId: target,
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
 * @param target - The steered workhorse turn.
 */
function publishSteerStarted(
	runtime: WorkhorseRuntime,
	state: OperationState,
	target: TurnId,
): void {
	if (state.terminalEmitted) {
		return;
	}
	runtime.activeTurns.set(threadIdWire(runtime.options, state.workhorseThreadId), target);
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
	const target = params.expectedTurnId;
	try {
		const response = await runtime.options.session.turnSteer(params);
		if (response.turnId !== target) {
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
			return Object.freeze({ turnId: target, delivery: outcome });
		}
		publishSteerStarted(runtime, state, target);
		return Object.freeze({ turnId: target, delivery: "delivered" });
	} catch (error) {
		const delivery = settleSteerFailure(runtime, state, error);
		return Object.freeze({ turnId: target, delivery });
	}
}

/**
 * Create the steer operation: inject input into the turn the workhorse runs now, as Codex lists
 * it, and let turn/steer refuse that turn if it ended meanwhile.
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
			const target = await runningWorkhorseTurn(runtime, validated);
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
			state.turnId = target;
			await revalidateSteer(
				runtime,
				request,
				state,
				target,
				"Steer authority changed after staging.",
			);
			const params = buildSteerParams(runtime, request, state, target);
			await revalidateSteer(
				runtime,
				request,
				state,
				target,
				"Steer authority changed before delivery.",
			);
			return deliverSteer(runtime, request, state, params);
		});
	};
}
