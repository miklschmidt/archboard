import {
	CodexWorkhorseOperationsError,
	type CodexWorkhorseOperations,
} from "../../codex-workhorse-operations/index.js";
import type {
	DynamicServerRequest,
	TransportServerRequest,
} from "../../codex-transport/server-requests.js";
import { type DynamicToolRefusalReason } from "../../codex-coordinator-tool-contract/index.js";
import type {
	ChildId,
	ChildEpoch,
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
} from "./contract.js";
import {
	CoordinatorToolValidationError,
	callKey,
	isCoordinatorToolRequest,
	validateCoordinatorToolRequest,
	type ValidatedCoordinatorToolCall,
} from "./validation.js";
import { okResponse, outcomeUnknownResponse, refusedResponse } from "./response.js";
import type { DynamicToolResponse } from "./contract.js";
import type {
	DelegateToWorkhorseInput,
	DelegateToWorkhorseResult,
	InspectWorkhorseInput,
	InspectWorkhorseResult,
	ManageWorkhorseQueueInput,
	ManageWorkhorseQueueResult,
	ResolveSpokenApprovalInput,
	SteerWorkhorseInput,
	SteerWorkhorseResult,
} from "../../codex-coordinator-tool-contract/index.js";

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

function errorField(error: unknown, field: string): unknown {
	return error !== null && typeof error === "object" ? Reflect.get(error, field) : undefined;
}

function operationIdFromError(error: unknown): string | null {
	const operationId = errorField(error, "operationId");
	return typeof operationId === "string" && operationId.length > 0 ? operationId : null;
}

function outcomeFromError(error: unknown): "not_delivered" | "outcome_unknown" | null {
	const outcome = errorField(error, "outcome");
	return outcome === "not_delivered" || outcome === "outcome_unknown" ? outcome : null;
}

function refusalFromError(error: unknown): DynamicToolRefusalReason | null {
	const code = errorField(error, "code");
	if (
		code === "invalid_call" ||
		code === "not_ready" ||
		code === "not_loaded" ||
		code === "not_controllable" ||
		code === "system_error" ||
		code === "stale_child" ||
		code === "prior_epoch" ||
		code === "unknown_provenance" ||
		code === "approval_declined" ||
		code === "cycle" ||
		code === "busy" ||
		code === "expired" ||
		code === "unsupported"
	)
		return code;
	if (error instanceof CoordinatorToolValidationError) return error.reason;
	return null;
}

function isMutation(call: ValidatedCoordinatorToolCall): boolean {
	return (
		call.tool === "delegate_to_workhorse" ||
		call.tool === "steer_workhorse" ||
		(call.tool === "manage_workhorse_queue" &&
			(call.input as ManageWorkhorseQueueInput).operation !== "list")
	);
}

function safeOperationId(value: string | null): string | null {
	return typeof value === "string" && value.length > 0 && value.length <= 128 ? value : null;
}

function responseOperationId(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): string | null {
	try {
		return safeOperationId(options.authority.operationIdFor(request));
	} catch {
		return null;
	}
}

function spokenOperationId(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): string | null {
	try {
		const operationId = safeOperationId(options.spokenApproval.snapshot().operationId);
		if (operationId !== null) return operationId;
	} catch {
		// Fall back to the host's request identity when the gate has no snapshot.
	}
	return responseOperationId(options, request);
}

function isBoundaryRefusal(reason: CoordinatorToolValidationError["reason"]): boolean {
	return (
		reason === "invalid_call" ||
		reason === "stale_child" ||
		reason === "prior_epoch" ||
		reason === "unknown_provenance"
	);
}

function workhorseCall(
	operations: CodexCoordinatorToolsOptions["operations"],
	validated: ValidatedCoordinatorToolCall,
): Promise<unknown> {
	switch (validated.tool) {
		case "inspect_workhorse":
			return operations.inspect({
				call: validated.call,
				...(validated.input as InspectWorkhorseInput),
			});
		case "delegate_to_workhorse":
			return operations.delegate({
				call: validated.call,
				...(validated.input as DelegateToWorkhorseInput),
			});
		case "manage_workhorse_queue":
			return operations.manageQueue({
				call: validated.call,
				...(validated.input as ManageWorkhorseQueueInput),
			} as Parameters<CodexWorkhorseOperations["manageQueue"]>[0]);
		case "steer_workhorse":
			if (validated.expectedTurnId === null)
				return Promise.reject(new Error("The host did not supply expectedTurnId."));
			return operations.steer({
				call: validated.call,
				expectedTurnId: validated.expectedTurnId,
				...(validated.input as SteerWorkhorseInput),
			});
		case "resolve_spoken_approval":
			return Promise.reject(new Error("voice calls do not use the workhorse operations port"));
	}
}

function workhorseResponse(
	validated: ValidatedCoordinatorToolCall,
	operationId: string,
	result: unknown,
): DynamicToolResponse {
	switch (validated.tool) {
		case "inspect_workhorse":
			return okResponse(validated.tool, operationId, result as InspectWorkhorseResult);
		case "delegate_to_workhorse":
			return okResponse(validated.tool, operationId, result as DelegateToWorkhorseResult);
		case "manage_workhorse_queue":
			return okResponse(validated.tool, operationId, result as ManageWorkhorseQueueResult);
		case "steer_workhorse":
			return okResponse(validated.tool, operationId, result as SteerWorkhorseResult);
		case "resolve_spoken_approval":
			throw new Error("voice calls do not use the workhorse response port");
	}
}

function responseForWorkhorseError(
	validated: ValidatedCoordinatorToolCall,
	error: unknown,
	operationId: string | null,
): DynamicToolResponse {
	const outcome = outcomeFromError(error);
	const errorOperationId = operationIdFromError(error);
	const knownOperationId = safeOperationId(errorOperationId ?? operationId);
	if (
		outcome === "outcome_unknown" ||
		(error instanceof CodexWorkhorseOperationsError && error.code === "outcome_unknown")
	) {
		if (knownOperationId !== null) return outcomeUnknownResponse(knownOperationId);
		return refusedResponse(
			"system_error",
			"The workhorse outcome is unknown and has no current host operation identity.",
		);
	}
	if (outcome === "not_delivered")
		return refusedResponse(
			"system_error",
			`The workhorse operation was not delivered: ${errorMessage(error)}`,
		);
	const reason = refusalFromError(error);
	if (reason !== null) return refusedResponse(reason, errorMessage(error));
	if (isMutation(validated) && knownOperationId !== null)
		return outcomeUnknownResponse(knownOperationId);
	if (isMutation(validated))
		return refusedResponse(
			"system_error",
			"The workhorse mutation failed without a current host operation identity.",
		);
	return refusedResponse("system_error", `The workhorse tool failed: ${errorMessage(error)}`);
}

function spokenResponse(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
	result: Awaited<ReturnType<CodexCoordinatorToolsOptions["spokenApproval"]["resolve"]>>,
): DynamicToolResponse {
	if (result.tag === "refused") return refusedResponse(result.reason, result.message);
	const operationId = spokenOperationId(options, request);
	if (operationId === null)
		return refusedResponse(
			"system_error",
			"The spoken approval settled without a current host operation identity.",
		);
	return okResponse("resolve_spoken_approval", operationId, {
		verdict: result.value.verdict,
		settlement: result.value.settlement,
	});
}

export function createCodexCoordinatorTools(
	options: CodexCoordinatorToolsOptions,
): CoordinatorToolDispatcher {
	let disposed = false;
	const calls = new Map<string, CallState>();

	const respondOnce = async (state: CallState, response: DynamicToolResponse): Promise<void> => {
		if (state.responseAttempted || state.childDisconnected || disposed) return;
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

	const run = async (state: CallState): Promise<CoordinatorToolDispatchResult> => {
		let validated: ValidatedCoordinatorToolCall;
		try {
			validated = validateCoordinatorToolRequest(options, state.request);
		} catch (error) {
			const reason =
				error instanceof CoordinatorToolValidationError ? error.reason : ("invalid_call" as const);
			const message =
				error instanceof Error ? error.message : "The coordinator tool call is invalid.";
			return finish(state, refusedResponse(reason, message, isBoundaryRefusal(reason)));
		}

		if (state.cancelled !== null || state.childDisconnected || disposed)
			return finish(
				state,
				refusedResponse(
					"invalid_call",
					"The coordinator tool call is no longer executing; submit a new call.",
					true,
				),
			);

		let operationId: string | null = null;
		if (validated.namespace === "archboard_workhorse") {
			operationId = responseOperationId(options, state.request);
			if (operationId === null)
				return finish(
					state,
					refusedResponse(
						"not_ready",
						"The host has not supplied a current operation identity for this call.",
					),
				);
		}

		await Promise.resolve();
		if (state.cancelled !== null || state.childDisconnected || disposed)
			return finish(
				state,
				refusedResponse(
					"invalid_call",
					"The coordinator tool call is no longer executing; submit a new call.",
					true,
				),
			);

		state.operationAttempted = true;
		try {
			if (validated.namespace === "archboard_voice") {
				const input = validated.input as ResolveSpokenApprovalInput;
				const result = await options.spokenApproval.resolve(state.request);
				if (state.childDisconnected || disposed)
					return Object.freeze({
						response: spokenResponse(options, state.request, result),
						attempted: true,
					});
				if (state.cancelled !== null) {
					if (result.tag === "refused")
						return finish(state, spokenResponse(options, state.request, result));
					const cancelledOperationId = spokenOperationId(options, state.request);
					if (cancelledOperationId === null)
						return finish(
							state,
							refusedResponse(
								"system_error",
								"The cancelled spoken approval has no current host operation identity.",
								true,
							),
						);
					return finish(state, outcomeUnknownResponse(cancelledOperationId));
				}
				if (result.tag === "ok" && input.verdict !== result.value.verdict)
					return finish(
						state,
						refusedResponse("invalid_call", "The spoken gate returned a different verdict.", true),
					);
				return finish(state, spokenResponse(options, state.request, result));
			}
			const result = await workhorseCall(options.operations, validated);
			if (state.cancelled !== null) {
				if (isMutation(validated) && operationId !== null)
					return finish(state, outcomeUnknownResponse(operationId));
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
				if (isMutation(validated) && operationId !== null)
					return finish(state, outcomeUnknownResponse(operationId));
				const reason =
					error instanceof CoordinatorToolValidationError
						? error.reason
						: ("unknown_provenance" as const);
				return finish(state, refusedResponse(reason, errorMessage(error)));
			}
			if (state.childDisconnected || disposed)
				return Object.freeze({
					response: workhorseResponse(validated, operationId!, result),
					attempted: true,
				});
			return finish(state, workhorseResponse(validated, operationId!, result));
		} catch (error) {
			if (state.childDisconnected || disposed)
				return Object.freeze({
					response: responseForWorkhorseError(validated, error, operationId),
					attempted: true,
				});
			return finish(state, responseForWorkhorseError(validated, error, operationId));
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
		const existing = calls.get(key);
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
		const promise = run(state);
		state.promise = promise;
		calls.set(key, state);
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
		const state = [...calls.values()].find(
			(candidate) =>
				candidate.request.child === options.identity.validator.childId &&
				candidate.request.epoch === options.identity.validator.epoch &&
				String(candidate.request.requestId) === String(requestId),
		);
		if (state === undefined || state.responseAttempted) return;
		state.cancelled = Object.freeze({ requestId, cause });
	};

	const onChildExit = (exit: { readonly child: ChildId; readonly epoch: ChildEpoch }): void => {
		for (const state of calls.values()) {
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
		for (const state of calls.values()) {
			state.cancelled ??= Object.freeze({
				requestId: state.request.requestId,
				cause: "host_shutdown",
			});
		}
	};

	return Object.freeze({ dispatch, onServerRequest, cancel, onChildExit, dispose });
}
