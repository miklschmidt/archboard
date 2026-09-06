import { createAdditionalContext, createTextUserInput } from "@/runtime/codex-instructions";
import { CodexSessionMutationError } from "@/runtime/codex-session";
import {
	CodexWorkhorseOperationsError,
	type SteerWorkhorseRequest,
	type SteerWorkhorseResult,
} from "@/runtime/codex-workhorse-operations/lib/contract";
import {
	activeTurnFromClassification,
	messageOf,
	operationError,
	selectOperationIdentity,
	threadIdWire,
	validateBoundedInput,
	type WorkhorseRuntime,
} from "@/runtime/codex-workhorse-operations/lib/internal";

/**
 *
 */
function assertExpectedTurn(
	request: SteerWorkhorseRequest,
	classification: Awaited<ReturnType<WorkhorseRuntime["classify"]>>,
): void {
	if (
		classification.workhorse.link.status !== "active" ||
		activeTurnFromClassification(classification.workhorse) !== request.expectedTurnId
	) {
		throw operationError("busy", "Steer requires the exact currently active workhorse turn.");
	}
}

/**
 *
 */
async function revalidateSteer(
	runtime: WorkhorseRuntime,
	request: SteerWorkhorseRequest,
	state: Parameters<WorkhorseRuntime["settleDurable"]>[0],
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
 *
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
			let params;
			try {
				const context = runtime.options.contextFor({
					operationId,
					kind: "steer_workhorse",
					rpc: "turn/steer",
				});
				if (
					context.operation.id !== operationIdWire ||
					context.operation.kind !== "steer_workhorse" ||
					context.operation.rpc !== "turn/steer" ||
					context.operation.outcome !== null
				) {
					throw new TypeError("steer context does not carry the current operation identity");
				}
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
			await revalidateSteer(runtime, request, state, "Steer authority changed before delivery.");
			try {
				const response = await runtime.options.session.turnSteer(params);
				if (response.turnId !== request.expectedTurnId) {
					throw new TypeError("turn/steer returned a different turn identity");
				}
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
				if (outcome === "outcome_unknown") {
					runtime.emit(state, "outcome_unknown", outcome, [], messageOf(error));
				} else {
					runtime.terminal(state, "failed", [], messageOf(error));
				}
				return Object.freeze({ turnId: request.expectedTurnId, delivery: outcome });
			}
		});
	};
}
