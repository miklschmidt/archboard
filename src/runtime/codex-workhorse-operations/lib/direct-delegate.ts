import { createAdditionalContext, createTextUserInput } from "@/runtime/codex-instructions";
import type { ArchboardContext } from "@/runtime/codex-instructions";
import type { SessionTurn } from "@/runtime/codex-session";
import {
	CodexWorkhorseOperationsError,
	type DelegateToWorkhorseRequest,
	type DelegateToWorkhorseResult,
	type WorkhorseOperationErrorCode,
} from "@/runtime/codex-workhorse-operations/lib/contract";
import {
	threadIdWire,
	type OperationState,
	type SettledDelivery,
	type WorkhorseRuntime,
} from "@/runtime/codex-workhorse-operations/lib/internal";
import {
	messageOf,
	operationError,
	sessionMutationOutcome,
} from "@/runtime/codex-workhorse-operations/lib/operation-errors";

type TurnStartParams = Parameters<WorkhorseRuntime["options"]["session"]["turnStart"]>[0];
type TurnStartResponse = Awaited<ReturnType<WorkhorseRuntime["options"]["session"]["turnStart"]>>;

/**
 * Pick the error code for a delegate that did not deliver.
 * @param outcome - The settled outcome.
 * @returns `outcome_unknown` when nothing can be said, otherwise a transport failure.
 */
function mutationErrorCode(outcome: SettledDelivery): "transport_failure" | "outcome_unknown" {
	return outcome === "outcome_unknown" ? "outcome_unknown" : "transport_failure";
}

/**
 * Settle the operation as not delivered and build the refusal, keeping the original error
 * code when the refusal came from this module.
 * @param runtime - The operations runtime.
 * @param state - The staged operation state.
 * @param error - The thrown value.
 * @param message - The message for the refusal.
 * @returns The error to throw.
 */
function refuseBeforeDelivery(
	runtime: WorkhorseRuntime,
	state: OperationState,
	error: unknown,
	message: string,
): CodexWorkhorseOperationsError {
	const outcome = runtime.settleDurable(state, "not_delivered", messageOf(error));
	runtime.terminal(state, "failed", [], messageOf(error));
	const code: WorkhorseOperationErrorCode =
		error instanceof CodexWorkhorseOperationsError ? error.code : "stale_link";
	return operationError(code, message, {
		operation: "delegate_to_workhorse",
		outcome,
		operationId: state.operationId,
		cause: error,
	});
}

/**
 * Settle the operation as not delivered because its body could not be built canonically.
 * @param runtime - The operations runtime.
 * @param state - The staged operation state.
 * @param error - The thrown value.
 * @param detail - The settlement detail.
 * @param message - The message for the refusal.
 * @returns The error to throw.
 */
function refuseInvalidBody(
	runtime: WorkhorseRuntime,
	state: OperationState,
	error: unknown,
	detail: string,
	message: string,
): CodexWorkhorseOperationsError {
	runtime.settleDurable(state, "not_delivered", detail);
	runtime.terminal(state, "failed", [], messageOf(error));
	return operationError("invalid_input", message, {
		operation: "delegate_to_workhorse",
		outcome: "not_delivered",
		operationId: state.operationId,
		cause: error,
	});
}

/**
 * Re-check that the workhorse is still idle and executable for a direct turn.
 * @param runtime - The operations runtime.
 * @param state - The staged operation state.
 * @param request - The delegate request.
 * @param message - The message for the refusal when authority changed.
 */
async function assertIdleForDelegate(
	runtime: WorkhorseRuntime,
	state: OperationState,
	request: DelegateToWorkhorseRequest,
	message: string,
): Promise<void> {
	try {
		const validated = await runtime.classify(state.binding, request.call, "delegate_to_workhorse");
		if (validated.workhorse.link.status !== "idle") {
			throw operationError("busy", "The workhorse is no longer idle for direct delegation.");
		}
	} catch (error) {
		throw refuseBeforeDelivery(runtime, state, error, message);
	}
}

/**
 * Read fresh canonical context and require it to name exactly this operation.
 * @param runtime - The operations runtime.
 * @param state - The staged operation state.
 * @returns The context for the turn body.
 */
function delegateContext(runtime: WorkhorseRuntime, state: OperationState): ArchboardContext {
	try {
		const context = runtime.options.contextFor({
			operationId: state.operationId,
			kind: "delegate_to_workhorse",
			rpc: "turn/start",
		});
		if (
			context.operation.id !== state.operationIdWire ||
			context.operation.kind !== "delegate_to_workhorse" ||
			context.operation.rpc !== "turn/start" ||
			context.operation.outcome !== null
		) {
			throw new TypeError("delegate context does not carry the current operation identity");
		}
		return context;
	} catch (error) {
		throw refuseInvalidBody(
			runtime,
			state,
			error,
			"The delegate context was invalid.",
			"The delegate context was not canonical.",
		);
	}
}

/**
 * Build the turn/start body from the prompt and canonical context.
 * @param runtime - The operations runtime.
 * @param state - The staged operation state.
 * @param prompt - The delegate prompt.
 * @param context - The canonical context.
 * @returns The turn/start parameters.
 */
function delegateParams(
	runtime: WorkhorseRuntime,
	state: OperationState,
	prompt: string,
	context: ArchboardContext,
): TurnStartParams {
	try {
		return {
			threadId: state.workhorseThreadId,
			clientUserMessageId: state.operationIdWire,
			input: [createTextUserInput(prompt)],
			turnTrigger: "archboard",
			additionalContext: createAdditionalContext(context),
		} satisfies TurnStartParams;
	} catch (error) {
		throw refuseInvalidBody(
			runtime,
			state,
			error,
			"The delegate input was invalid.",
			"The delegate turn body was not canonical.",
		);
	}
}

/**
 * Issue turn/start; a thrown session error settles with the outcome the session proved.
 * @param runtime - The operations runtime.
 * @param state - The staged operation state.
 * @param params - The turn/start parameters.
 * @returns The session response.
 */
async function deliverTurnStart(
	runtime: WorkhorseRuntime,
	state: OperationState,
	params: TurnStartParams,
): Promise<TurnStartResponse> {
	try {
		return await runtime.options.session.turnStart(params);
	} catch (error) {
		const outcome = runtime.settleDurable(state, sessionMutationOutcome(error), messageOf(error));
		if (outcome === "outcome_unknown") {
			runtime.emit(state, "outcome_unknown", outcome, [], messageOf(error));
		} else {
			runtime.terminal(state, "failed", [], messageOf(error));
		}
		throw operationError(mutationErrorCode(outcome), "The delegate turn was not delivered.", {
			operation: "delegate_to_workhorse",
			outcome,
			operationId: state.operationId,
			cause: error,
		});
	}
}

/**
 * Adopt the returned turn identity and re-check the link; a response that cannot be tied to
 * the current link leaves the outcome unknown, because the turn may well be running.
 * @param runtime - The operations runtime.
 * @param state - The staged operation state.
 * @param request - The delegate request.
 * @param turn - The returned turn.
 */
async function correlateTurnStart(
	runtime: WorkhorseRuntime,
	state: OperationState,
	request: DelegateToWorkhorseRequest,
	turn: SessionTurn,
): Promise<void> {
	try {
		const turnId = runtime.options.identity.decoder.parseTurnId(turn.id);
		if (turn.id !== turnId) {
			throw new TypeError("turn identity is not canonical");
		}
		if (state.turnId !== null && state.turnId !== turnId) {
			throw new TypeError("turn/start returned a different turn identity than observed");
		}
		state.turnId = turnId;
		runtime.assertCurrentBinding(state.binding);
		await runtime.classify(state.binding, request.call, "delegate_to_workhorse");
	} catch (error) {
		const outcome = runtime.settleDurable(
			state,
			"outcome_unknown",
			"The delegate response could not be correlated to the current link.",
		);
		if (outcome === "outcome_unknown") {
			runtime.emit(state, "outcome_unknown", outcome, [], messageOf(error));
		}
		throw operationError(
			"outcome_unknown",
			"The delegate response cannot be correlated; inspect before retrying.",
			{ operation: "delegate_to_workhorse", outcome, operationId: state.operationId, cause: error },
		);
	}
}

/**
 * Commit the delivered turn durably; a failed commit leaves the outcome unknown.
 * @param runtime - The operations runtime.
 * @param state - The correlated operation state.
 */
function commitTurnStart(runtime: WorkhorseRuntime, state: OperationState): void {
	const outcome = runtime.settleDurable(state, "delivered", null);
	if (outcome === "delivered") {
		return;
	}
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
		{ operation: "delegate_to_workhorse", outcome, operationId: state.operationId },
	);
}

/**
 * Publish `started`, and the terminal event when the turn already ended in the response.
 * @param runtime - The operations runtime.
 * @param state - The delivered operation state.
 * @param turn - The returned turn.
 */
function publishTurnStart(
	runtime: WorkhorseRuntime,
	state: OperationState,
	turn: SessionTurn,
): void {
	if (state.terminalEmitted || state.turnId === null) {
		return;
	}
	runtime.activeTurns.set(threadIdWire(runtime.options, state.workhorseThreadId), state.turnId);
	if (!state.startedEmitted) {
		state.startedEmitted = true;
		runtime.emit(state, "started", "delivered", []);
	}
	if (turn.status === "completed") {
		runtime.terminal(state, "completed", [], null);
	} else if (turn.status === "failed" || turn.status === "interrupted") {
		runtime.terminal(
			state,
			"failed",
			[],
			"The delegate turn ended before further workhorse events.",
		);
	}
}

/**
 * Delegate directly through turn/start to an idle workhorse: revalidate, build the body,
 * revalidate again, deliver, correlate, commit and publish.
 * @param runtime - The operations runtime.
 * @param state - The staged operation state.
 * @param request - The delegate request.
 * @param prompt - The prompt including any transcript context.
 * @returns The started turn.
 */
async function invokeTurnStart(
	runtime: WorkhorseRuntime,
	state: OperationState,
	request: DelegateToWorkhorseRequest,
	prompt: string,
): Promise<DelegateToWorkhorseResult> {
	await assertIdleForDelegate(
		runtime,
		state,
		request,
		"The direct delegate lost authority before context construction.",
	);
	const params = delegateParams(runtime, state, prompt, delegateContext(runtime, state));
	await assertIdleForDelegate(
		runtime,
		state,
		request,
		"The delegate link changed before delivery.",
	);
	const response = await deliverTurnStart(runtime, state, params);
	await correlateTurnStart(runtime, state, request, response.turn);
	commitTurnStart(runtime, state);
	publishTurnStart(runtime, state, response.turn);
	return Object.freeze({
		mode: "started",
		clientUserMessageId: state.operationIdWire,
		queuedSubmissionId: null,
		turnId: state.turnId,
	});
}

export { invokeTurnStart, mutationErrorCode };
