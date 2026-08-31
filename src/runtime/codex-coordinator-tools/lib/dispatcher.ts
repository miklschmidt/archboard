import type {
	DynamicServerRequest,
	TransportServerRequest,
} from "../../codex-transport/server-requests.js";
import type {
	ChildEpoch,
	ChildId,
	JsonRpcRequestId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	COORDINATOR_TOOLS_OWNER,
	CodexCoordinatorToolsError,
	type CodexCoordinatorToolsOptions,
	type CoordinatorToolCancellation,
	type CoordinatorToolDispatchResult,
	type CoordinatorToolDispatcher,
	type CoordinatorToolsServerRequest,
	type DynamicToolResponse,
} from "./contract.js";
import { outcomeUnknownResponse, refusedResponse } from "./response.js";
import {
	captureSpokenOperationIdentity,
	invokeWorkhorse,
	isMutation,
	issueOperationIdentity,
	responseForWorkhorseError,
	spokenInput,
	spokenResponse,
	workhorseResponse,
	type IssuedOperationIdentity,
} from "./tool-execution.js";
import {
	CoordinatorToolValidationError,
	callKey,
	isCoordinatorToolRequest,
	logicalCallKey,
	validateCoordinatorToolRequest,
	type ValidatedCoordinatorToolCall,
} from "./validation.js";

interface CallState {
	readonly request: DynamicServerRequest;
	operationAttempted: boolean;
	responseAttempted: boolean;
	cancelled: CoordinatorToolCancellation | null;
	childDisconnected: boolean;
	promise: Promise<CoordinatorToolDispatchResult> | null;
}

function errorMessage(error: unknown): string {
	return error instanceof Error && error.message.length > 0 ? error.message : "unknown error";
}

function isBoundaryRefusal(reason: CoordinatorToolValidationError["reason"]): boolean {
	return (
		reason === "invalid_call" ||
		reason === "stale_child" ||
		reason === "prior_epoch" ||
		reason === "unknown_provenance"
	);
}

export function createCodexCoordinatorTools(
	options: CodexCoordinatorToolsOptions,
): CoordinatorToolDispatcher {
	let disposed = false;
	const wireCalls = new Map<string, CallState>();
	const logicalCalls = new Map<string, CallState>();

	const respondOnce = async (state: CallState, response: DynamicToolResponse): Promise<void> => {
		if (state.responseAttempted || state.childDisconnected) return;
		state.responseAttempted = true;
		try {
			await options.transport.respond(state.request, COORDINATOR_TOOLS_OWNER, { result: response });
		} catch {
			// The owned transport records whether a lost write was delivered. This module never retries it.
		}
	};

	const finish = async (
		state: CallState,
		response: DynamicToolResponse,
	): Promise<CoordinatorToolDispatchResult> => {
		await respondOnce(state, response);
		return Object.freeze({ response, attempted: state.operationAttempted });
	};

	const unavailable = (state: CallState): Promise<CoordinatorToolDispatchResult> =>
		finish(
			state,
			refusedResponse(
				"invalid_call",
				"The coordinator tool call is no longer executing; submit a new call.",
				true,
			),
		);

	const run = async (state: CallState): Promise<CoordinatorToolDispatchResult> => {
		let validated: ValidatedCoordinatorToolCall;
		try {
			validated = validateCoordinatorToolRequest(options, state.request);
		} catch (error) {
			const reason =
				error instanceof CoordinatorToolValidationError ? error.reason : "invalid_call";
			const message =
				error instanceof Error ? error.message : "The coordinator tool call is invalid.";
			return finish(state, refusedResponse(reason, message, isBoundaryRefusal(reason)));
		}

		const logicalKey = logicalCallKey(validated.call);
		const owner = logicalCalls.get(logicalKey);
		if (owner !== undefined && owner !== state) return owner.promise!;
		logicalCalls.set(logicalKey, state);
		if (state.cancelled !== null || state.childDisconnected || disposed) return unavailable(state);

		let operation: IssuedOperationIdentity | null = null;
		if (validated.namespace === "archboard_workhorse") {
			try {
				operation = issueOperationIdentity(options);
			} catch (error) {
				return finish(
					state,
					refusedResponse(
						"system_error",
						`The host could not issue a current operation identity: ${errorMessage(error)}`,
					),
				);
			}
		}

		await Promise.resolve();
		if (state.cancelled !== null || state.childDisconnected || disposed) return unavailable(state);

		state.operationAttempted = true;
		if (validated.namespace === "archboard_voice") {
			const input = spokenInput(validated);
			const spokenOperation = captureSpokenOperationIdentity(options);
			const result = await options.spokenApproval.resolve(state.request);
			if (state.childDisconnected)
				return Object.freeze({
					response: spokenResponse(result, spokenOperation),
					attempted: true,
				});
			if (state.cancelled !== null) {
				if (result.tag === "refused") return finish(state, spokenResponse(result, spokenOperation));
				if (spokenOperation === null)
					return finish(
						state,
						refusedResponse(
							"system_error",
							"The cancelled spoken approval has no current classifier operation identity.",
							true,
						),
					);
				return finish(state, outcomeUnknownResponse(spokenOperation.wire));
			}
			if (result.tag === "ok" && input.verdict !== result.value.verdict)
				return finish(
					state,
					refusedResponse("invalid_call", "The spoken gate returned a different verdict.", true),
				);
			return finish(state, spokenResponse(result, spokenOperation));
		}

		if (operation === null)
			return finish(
				state,
				refusedResponse("system_error", "The workhorse call has no issued operation identity."),
			);
		try {
			const result = await invokeWorkhorse(options.operations, validated, operation);
			if (state.cancelled !== null) {
				if (isMutation(validated)) return finish(state, outcomeUnknownResponse(operation.wire));
				return finish(
					state,
					refusedResponse(
						"invalid_call",
						"The coordinator tool call was cancelled before its read result could be delivered.",
						true,
					),
				);
			}
			try {
				validateCoordinatorToolRequest(options, state.request);
			} catch (error) {
				if (isMutation(validated)) return finish(state, outcomeUnknownResponse(operation.wire));
				const reason =
					error instanceof CoordinatorToolValidationError ? error.reason : "unknown_provenance";
				return finish(state, refusedResponse(reason, errorMessage(error)));
			}
			if (state.childDisconnected)
				return Object.freeze({
					response: workhorseResponse(options, validated, operation, result),
					attempted: true,
				});
			return finish(state, workhorseResponse(options, validated, operation, result));
		} catch (error) {
			const response = responseForWorkhorseError(options, validated, error, operation);
			if (state.childDisconnected) return Object.freeze({ response, attempted: true });
			return finish(state, response);
		}
	};

	const dispatch = (
		request: CoordinatorToolsServerRequest,
	): Promise<CoordinatorToolDispatchResult> => {
		if (disposed)
			return Promise.reject(
				new CodexCoordinatorToolsError(
					"disposed",
					"The coordinator dynamic-tool dispatcher has been disposed.",
				),
			);
		const key = callKey(request);
		const existing = wireCalls.get(key);
		if (existing !== undefined) {
			if (existing.request !== request)
				return Promise.reject(
					new CodexCoordinatorToolsError(
						"duplicate",
						"The dynamic request identity has already been dispatched; no second attempt is allowed.",
					),
				);
			return existing.promise!;
		}
		const state: CallState = {
			request,
			operationAttempted: false,
			responseAttempted: false,
			cancelled: null,
			childDisconnected: false,
			promise: null,
		};
		const promise = Promise.resolve().then(() => run(state));
		state.promise = promise;
		wireCalls.set(key, state);
		return promise;
	};

	const onServerRequest = (request: TransportServerRequest): void => {
		if (!isCoordinatorToolRequest(request)) return;
		void dispatch(request).catch(() => undefined);
	};

	const cancel = (
		requestId: JsonRpcRequestId,
		cause: CoordinatorToolCancellation["cause"],
	): void => {
		const state = [...wireCalls.values()].find(
			(candidate) =>
				candidate.request.child === options.identity.validator.childId &&
				candidate.request.epoch === options.identity.validator.epoch &&
				String(candidate.request.requestId) === String(requestId),
		);
		if (state === undefined || state.responseAttempted) return;
		state.cancelled = Object.freeze({ requestId, cause });
	};

	const onChildExit = (exit: { readonly child: ChildId; readonly epoch: ChildEpoch }): void => {
		for (const state of wireCalls.values()) {
			if (state.request.child === exit.child && state.request.epoch === exit.epoch) {
				state.childDisconnected = true;
				state.cancelled ??= Object.freeze({
					requestId: state.request.requestId,
					cause: "child_disconnect",
				});
			}
		}
	};

	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		for (const state of wireCalls.values())
			state.cancelled ??= Object.freeze({
				requestId: state.request.requestId,
				cause: "host_shutdown",
			});
	};

	return Object.freeze({ dispatch, onServerRequest, cancel, onChildExit, dispose });
}
