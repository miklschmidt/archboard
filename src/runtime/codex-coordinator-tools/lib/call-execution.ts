import {
	CoordinatorToolValidationError,
	validateCoordinatorToolRequest,
	type ValidatedCoordinatorToolCall,
	type ValidatedVoiceCall,
	type ValidatedWorkhorseCall,
} from "@/runtime/codex-coordinator-tools/lib/validation";
import type {
	CodexCoordinatorToolsOptions,
	CoordinatorToolDispatchResult,
	DynamicToolResponse,
} from "@/runtime/codex-coordinator-tools/lib/contract";
import type { CallState } from "@/runtime/codex-coordinator-tools/lib/replay-ledger";
import {
	outcomeUnknownResponse,
	refusedResponse,
} from "@/runtime/codex-coordinator-tools/lib/response";
import {
	captureSpokenOperationIdentity,
	invokeWorkhorse,
	isMutation,
	issueOperationIdentity,
	responseForWorkhorseError,
	spokenResponse,
	workhorseResponse,
	type IssuedOperationIdentity,
	type WorkhorseOutcome,
} from "@/runtime/codex-coordinator-tools/lib/tool-execution";

/** What the executor needs from the dispatcher beyond its options. */
interface ExecutionContext {
	readonly options: CodexCoordinatorToolsOptions;
	/** Whether the dispatcher has been disposed since the call arrived. */
	readonly disposed: () => boolean;
}

/**
 * A diagnostic from any thrown value.
 * @param error - Whatever was thrown.
 * @returns Its message, or a placeholder.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error && error.message.length > 0 ? error.message : "unknown error";
}

/**
 * Pair a response with whether an operation was attempted on its behalf.
 * @param response - The response to deliver.
 * @param attempted - Whether any effect may have started.
 * @returns The frozen dispatch result.
 */
function complete(
	response: DynamicToolResponse,
	attempted: boolean,
): CoordinatorToolDispatchResult {
	return Object.freeze({ response, attempted });
}

/**
 * The result for a call that can no longer execute because it was cancelled, its child left, or
 * the dispatcher is gone.
 * @param attempted - Whether any effect may have started before that.
 * @returns The frozen dispatch result.
 */
function unavailable(attempted: boolean): CoordinatorToolDispatchResult {
	return complete(
		refusedResponse(
			"invalid_call",
			"The coordinator tool call is no longer executing; submit a new call.",
			true,
		),
		attempted,
	);
}

/**
 * Whether a call must not start or continue: cancelled, its child disconnected, or the dispatcher
 * disposed. A function rather than an inline test so a check after an await is re-evaluated.
 * @param context - The execution context.
 * @param state - The wire call.
 * @returns True when the call must stop.
 */
function isAbandoned(context: ExecutionContext, state: CallState): boolean {
	return state.cancelled !== null || state.childDisconnected || context.disposed();
}

/**
 * The result for a spoken approval that was cancelled while the gate was resolving it.
 * @param result - What the gate returned.
 * @param spokenOperation - The gate's classifier operation identity, if it had one.
 * @returns The frozen dispatch result.
 */
function cancelledSpokenResult(
	result: Awaited<ReturnType<CodexCoordinatorToolsOptions["spokenApproval"]["resolve"]>>,
	spokenOperation: IssuedOperationIdentity | null,
): CoordinatorToolDispatchResult {
	if (result.tag === "refused") {
		return complete(spokenResponse(result, spokenOperation), true);
	}
	if (spokenOperation === null) {
		return complete(
			refusedResponse(
				"system_error",
				"The cancelled spoken approval has no current classifier operation identity.",
				true,
			),
			true,
		);
	}
	return complete(outcomeUnknownResponse(spokenOperation.wire), true);
}

/**
 * Resolve a spoken approval through the gate and report how it settled.
 * @param context - The execution context.
 * @param state - The wire call.
 * @param validated - The validated voice call.
 * @returns The frozen dispatch result.
 */
async function executeSpoken(
	context: ExecutionContext,
	state: CallState,
	validated: ValidatedVoiceCall,
): Promise<CoordinatorToolDispatchResult> {
	const spokenOperation = captureSpokenOperationIdentity(context.options);
	const result = await context.options.spokenApproval.resolve(state.request);
	if (state.childDisconnected) {
		return complete(spokenResponse(result, spokenOperation), true);
	}
	if (state.cancelled !== null) {
		return cancelledSpokenResult(result, spokenOperation);
	}
	if (result.tag === "ok" && validated.input.verdict !== result.value.verdict) {
		return complete(
			refusedResponse("invalid_call", "The spoken gate returned a different verdict.", true),
			true,
		);
	}
	return complete(spokenResponse(result, spokenOperation), true);
}

/**
 * The result for a workhorse call whose effect ran but which was cancelled before delivery.
 * @param validated - The validated workhorse call.
 * @param operation - The issued operation identity.
 * @returns An unknown outcome for a mutation, a refusal for a read.
 */
function cancelledWorkhorseResult(
	validated: ValidatedWorkhorseCall,
	operation: IssuedOperationIdentity,
): CoordinatorToolDispatchResult {
	if (isMutation(validated)) {
		return complete(outcomeUnknownResponse(operation.wire), true);
	}
	return complete(
		refusedResponse(
			"invalid_call",
			"The coordinator tool call was cancelled before its read result could be delivered.",
			true,
		),
		true,
	);
}

/**
 * Re-validate the request after the effect so a result is delivered only to the call that is
 * still current, then build the success response.
 * @param context - The execution context.
 * @param state - The wire call.
 * @param validated - The validated workhorse call.
 * @param operation - The issued operation identity.
 * @param outcome - The tagged result.
 * @returns The frozen dispatch result.
 */
function deliverWorkhorseResult(
	context: ExecutionContext,
	state: CallState,
	validated: ValidatedWorkhorseCall,
	operation: IssuedOperationIdentity,
	outcome: WorkhorseOutcome,
): CoordinatorToolDispatchResult {
	try {
		validateCoordinatorToolRequest(context.options, state.request);
	} catch (error) {
		if (isMutation(validated)) {
			return complete(outcomeUnknownResponse(operation.wire), true);
		}
		const reason =
			error instanceof CoordinatorToolValidationError ? error.reason : "unknown_provenance";
		return complete(refusedResponse(reason, errorMessage(error)), true);
	}
	return complete(workhorseResponse(context.options, outcome, operation), true);
}

/**
 * Run a workhorse tool under its issued operation and report the result or failure.
 * @param context - The execution context.
 * @param state - The wire call.
 * @param validated - The validated workhorse call.
 * @param operation - The issued operation identity.
 * @returns The frozen dispatch result.
 */
async function executeWorkhorse(
	context: ExecutionContext,
	state: CallState,
	validated: ValidatedWorkhorseCall,
	operation: IssuedOperationIdentity,
): Promise<CoordinatorToolDispatchResult> {
	try {
		const outcome = await invokeWorkhorse(context.options.operations, validated, operation);
		if (state.cancelled !== null) {
			return cancelledWorkhorseResult(validated, operation);
		}
		return deliverWorkhorseResult(context, state, validated, operation, outcome);
	} catch (error) {
		return complete(responseForWorkhorseError(context.options, validated, error, operation), true);
	}
}

/**
 * Issue the operation identity a workhorse call runs under, or the refusal when the host cannot.
 * @param context - The execution context.
 * @returns The identity, or the refusal to deliver instead.
 */
function issuedWorkhorseOperation(
	context: ExecutionContext,
):
	| { readonly ok: true; readonly operation: IssuedOperationIdentity }
	| { readonly ok: false; readonly result: CoordinatorToolDispatchResult } {
	try {
		return { ok: true, operation: issueOperationIdentity(context.options) };
	} catch (error) {
		return {
			ok: false,
			result: complete(
				refusedResponse(
					"system_error",
					`The host could not issue a current operation identity: ${errorMessage(error)}`,
				),
				false,
			),
		};
	}
}

/**
 * Execute one validated call exactly once: issue its operation, yield so a cancellation that
 * raced validation is honoured, then run the tool and shape its result.
 * @param context - The execution context.
 * @param state - The wire call.
 * @param validated - The validated call.
 * @returns The frozen dispatch result.
 */
async function executeCall(
	context: ExecutionContext,
	state: CallState,
	validated: ValidatedCoordinatorToolCall,
): Promise<CoordinatorToolDispatchResult> {
	if (isAbandoned(context, state)) {
		return unavailable(false);
	}
	const issued =
		validated.namespace === "archboard_workhorse" ? issuedWorkhorseOperation(context) : null;
	if (issued !== null && !issued.ok) {
		return issued.result;
	}
	const operation = issued === null ? null : issued.operation;

	await Promise.resolve();
	if (isAbandoned(context, state)) {
		return unavailable(false);
	}

	state.operationAttempted = true;
	if (validated.namespace === "archboard_voice") {
		return executeSpoken(context, state, validated);
	}
	if (operation === null) {
		return complete(
			refusedResponse("system_error", "The workhorse call has no issued operation identity."),
			true,
		);
	}
	return executeWorkhorse(context, state, validated, operation);
}

export { type ExecutionContext, complete, errorMessage, executeCall, unavailable };
