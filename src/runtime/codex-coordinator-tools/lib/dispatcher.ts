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
	COORDINATOR_REPLAY_LIMITS,
	CodexCoordinatorToolsError,
	type CodexCoordinatorToolsOptions,
	type CoordinatorToolCancellation,
	type CoordinatorToolDispatchResult,
	type CoordinatorToolDispatcher,
	type CoordinatorReplayStateSnapshot,
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
	readonly wireKey: string;
	readonly request: DynamicServerRequest;
	logicalKey: string | null;
	operationAttempted: boolean;
	responseAttempted: boolean;
	cancelled: CoordinatorToolCancellation | null;
	childDisconnected: boolean;
	readonly cancellation: Promise<void>;
	readonly wakeCancellation: () => void;
	promise: Promise<CoordinatorToolDispatchResult> | null;
}

interface LogicalCallState {
	readonly key: string;
	readonly inputFingerprint: string;
	readonly owner: CallState;
	acceptedAliases: number;
	promise: Promise<CoordinatorToolDispatchResult> | null;
}

interface TerminalLogicalCallState {
	readonly key: string;
	readonly inputFingerprint: string;
	readonly terminal: CoordinatorToolDispatchResult;
}

interface TerminalWireCallState {
	readonly logicalKey: string | null;
	readonly terminal: CoordinatorToolDispatchResult;
}

function errorMessage(error: unknown): string {
	return error instanceof Error && error.message.length > 0 ? error.message : "unknown error";
}

function complete(
	response: DynamicToolResponse,
	attempted: boolean,
): CoordinatorToolDispatchResult {
	return Object.freeze({ response, attempted });
}

function ignoreCancellation(): void {}

function mismatchResponse(): DynamicToolResponse {
	return refusedResponse(
		"invalid_call",
		"The replay arguments do not match the original logical tool call.",
		true,
	);
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
	let epochClosed = false;
	const liveWireCalls = new Map<string, CallState>();
	const retainedWireCalls = new Map<string, TerminalWireCallState>();
	const liveLogicalCalls = new Map<string, LogicalCallState>();
	const retainedLogicalCalls = new Map<string, TerminalLogicalCallState>();

	const removeRetainedLogical = (key: string): void => {
		retainedLogicalCalls.delete(key);
		for (const [wireKey, wire] of retainedWireCalls) {
			if (wire.logicalKey === key) {
				retainedWireCalls.delete(wireKey);
			}
		}
	};

	const retainWire = (key: string, value: TerminalWireCallState): void => {
		retainedWireCalls.delete(key);
		retainedWireCalls.set(key, value);
		while (retainedWireCalls.size > COORDINATOR_REPLAY_LIMITS.retainedWireCalls) {
			const oldest = retainedWireCalls.keys().next().value as string | undefined;
			if (oldest === undefined) {
				break;
			}
			retainedWireCalls.delete(oldest);
		}
	};

	const retainLogical = (value: TerminalLogicalCallState): void => {
		retainedLogicalCalls.delete(value.key);
		retainedLogicalCalls.set(value.key, value);
		while (retainedLogicalCalls.size > COORDINATOR_REPLAY_LIMITS.retainedLogicalCalls) {
			const oldest = retainedLogicalCalls.keys().next().value as string | undefined;
			if (oldest === undefined) {
				break;
			}
			removeRetainedLogical(oldest);
		}
	};

	const currentLogicalKey = (): string | null => {
		const current = options.authority.currentCall();
		return current === null ? null : logicalCallKey(current);
	};

	const pruneStaleTerminals = (): void => {
		const current = currentLogicalKey();
		for (const key of retainedLogicalCalls.keys()) {
			if (key !== current) {
				removeRetainedLogical(key);
			}
		}
		for (const [wireKey, wire] of retainedWireCalls) {
			if (wire.logicalKey !== null && wire.logicalKey !== current) {
				retainedWireCalls.delete(wireKey);
			}
		}
	};

	const retireWire = (
		state: CallState,
		terminal: CoordinatorToolDispatchResult,
		retain: boolean,
	): void => {
		if (liveWireCalls.get(state.wireKey) === state) {
			liveWireCalls.delete(state.wireKey);
		}
		if (!epochClosed && retain) {
			retainWire(state.wireKey, { logicalKey: state.logicalKey, terminal });
		}
	};

	const respondOnce = async (state: CallState, response: DynamicToolResponse): Promise<void> => {
		if (state.responseAttempted || state.childDisconnected) {
			return;
		}
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
		retain = true,
	): Promise<CoordinatorToolDispatchResult> => {
		const terminal = complete(response, state.operationAttempted);
		await respondOnce(state, response);
		retireWire(state, terminal, retain);
		return terminal;
	};

	const unavailable = (attempted: boolean): CoordinatorToolDispatchResult =>
		complete(
			refusedResponse(
				"invalid_call",
				"The coordinator tool call is no longer executing; submit a new call.",
				true,
			),
			attempted,
		);

	const execute = async (
		state: CallState,
		validated: ValidatedCoordinatorToolCall,
	): Promise<CoordinatorToolDispatchResult> => {
		if (state.cancelled !== null || state.childDisconnected || disposed) {
			return unavailable(false);
		}

		let operation: IssuedOperationIdentity | null = null;
		if (validated.namespace === "archboard_workhorse") {
			try {
				operation = issueOperationIdentity(options);
			} catch (error) {
				return complete(
					refusedResponse(
						"system_error",
						`The host could not issue a current operation identity: ${errorMessage(error)}`,
					),
					false,
				);
			}
		}

		await Promise.resolve();
		if (state.cancelled !== null || state.childDisconnected || disposed) {
			return unavailable(false);
		}

		state.operationAttempted = true;
		if (validated.namespace === "archboard_voice") {
			const input = spokenInput(validated);
			const spokenOperation = captureSpokenOperationIdentity(options);
			const result = await options.spokenApproval.resolve(state.request);
			if (state.childDisconnected) {
				return complete(spokenResponse(result, spokenOperation), true);
			}
			if (state.cancelled !== null) {
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
			if (result.tag === "ok" && input.verdict !== result.value.verdict) {
				return complete(
					refusedResponse("invalid_call", "The spoken gate returned a different verdict.", true),
					true,
				);
			}
			return complete(spokenResponse(result, spokenOperation), true);
		}

		if (operation === null) {
			return complete(
				refusedResponse("system_error", "The workhorse call has no issued operation identity."),
				true,
			);
		}
		try {
			const result = await invokeWorkhorse(options.operations, validated, operation);
			if (state.cancelled !== null) {
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
			try {
				validateCoordinatorToolRequest(options, state.request);
			} catch (error) {
				if (isMutation(validated)) {
					return complete(outcomeUnknownResponse(operation.wire), true);
				}
				const reason =
					error instanceof CoordinatorToolValidationError ? error.reason : "unknown_provenance";
				return complete(refusedResponse(reason, errorMessage(error)), true);
			}
			return complete(workhorseResponse(options, validated, operation, result), true);
		} catch (error) {
			const response = responseForWorkhorseError(options, validated, error, operation);
			return complete(response, true);
		}
	};

	const settleWire = async (
		state: CallState,
		logical: LogicalCallState,
	): Promise<CoordinatorToolDispatchResult> => {
		const cancelled = (): CoordinatorToolDispatchResult => unavailable(false);
		let terminal: CoordinatorToolDispatchResult;
		if (state === logical.owner) {
			const disconnected = state.cancellation.then(() =>
				state.childDisconnected ? unavailable(state.operationAttempted) : logical.promise!,
			);
			terminal = await Promise.race([logical.promise!, disconnected]);
		} else {
			const settled = await Promise.race([logical.promise!, state.cancellation.then(cancelled)]);
			if (state.cancelled !== null) {
				terminal = cancelled();
			} else {
				terminal = settled;
			}
		}
		state.operationAttempted = terminal.attempted;
		if (state.childDisconnected) {
			retireWire(state, terminal, true);
			return terminal;
		}
		return finish(state, terminal.response);
	};

	const runWire = async (state: CallState): Promise<CoordinatorToolDispatchResult> => {
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

		const key = logicalCallKey(validated.call);
		state.logicalKey = key;
		const live = liveLogicalCalls.get(key);
		if (live !== undefined) {
			if (live.inputFingerprint !== validated.inputFingerprint) {
				return finish(state, mismatchResponse());
			}
			if (live.acceptedAliases >= COORDINATOR_REPLAY_LIMITS.aliasesPerLiveLogicalCall) {
				return finish(
					state,
					refusedResponse(
						"invalid_call",
						"The logical tool call has reached its concurrent replay limit.",
						true,
					),
				);
			}
			live.acceptedAliases += 1;
			return settleWire(state, live);
		}
		const retained = retainedLogicalCalls.get(key);
		if (retained !== undefined) {
			if (retained.inputFingerprint !== validated.inputFingerprint) {
				return finish(state, mismatchResponse());
			}
			state.operationAttempted = retained.terminal.attempted;
			return finish(state, retained.terminal.response);
		}

		const logical: LogicalCallState = {
			key,
			inputFingerprint: validated.inputFingerprint,
			owner: state,
			acceptedAliases: 0,
			promise: null,
		};
		liveLogicalCalls.set(key, logical);
		{
			const owned = logical;
			owned.promise = execute(state, validated)
				.catch((error: unknown) =>
					complete(
						refusedResponse(
							"system_error",
							`The coordinator tool call failed: ${errorMessage(error)}`,
						),
						state.operationAttempted,
					),
				)
				.then((terminal) => {
					liveLogicalCalls.delete(key);
					if (!epochClosed && currentLogicalKey() === key) {
						retainLogical({
							key,
							inputFingerprint: owned.inputFingerprint,
							terminal,
						});
					}
					return terminal;
				});
		}
		return settleWire(state, logical);
	};

	const dispatch = (
		request: CoordinatorToolsServerRequest,
	): Promise<CoordinatorToolDispatchResult> => {
		if (disposed || epochClosed) {
			return Promise.reject(
				new CodexCoordinatorToolsError(
					"disposed",
					"The coordinator dynamic-tool dispatcher has been disposed.",
				),
			);
		}
		pruneStaleTerminals();
		const key = callKey(request);
		const retained = retainedWireCalls.get(key);
		if (retained !== undefined) {
			return Promise.resolve(retained.terminal);
		}
		const existing = liveWireCalls.get(key);
		if (existing !== undefined) {
			if (existing.request !== request) {
				return Promise.reject(
					new CodexCoordinatorToolsError(
						"duplicate",
						"The dynamic request identity has already been dispatched; no second attempt is allowed.",
					),
				);
			}
			return existing.promise!;
		}
		let wakeCancellation = ignoreCancellation;
		const cancellation = new Promise<void>((resolve) => {
			wakeCancellation = resolve;
		});
		const state: CallState = {
			wireKey: key,
			request,
			logicalKey: null,
			operationAttempted: false,
			responseAttempted: false,
			cancelled: null,
			childDisconnected: false,
			cancellation,
			wakeCancellation,
			promise: null,
		};
		const promise = Promise.resolve().then(() => runWire(state));
		state.promise = promise;
		liveWireCalls.set(key, state);
		return promise;
	};

	const onServerRequest = (request: TransportServerRequest): void => {
		if (!isCoordinatorToolRequest(request)) {
			return;
		}
		void dispatch(request).catch(() => undefined);
	};

	const cancel = (
		requestId: JsonRpcRequestId,
		cause: CoordinatorToolCancellation["cause"],
	): void => {
		const state = [...liveWireCalls.values()].find(
			(candidate) =>
				candidate.request.child === options.identity.validator.childId &&
				candidate.request.epoch === options.identity.validator.epoch &&
				String(candidate.request.requestId) === String(requestId),
		);
		if (state === undefined || state.responseAttempted) {
			return;
		}
		state.cancelled = Object.freeze({ requestId, cause });
		state.wakeCancellation();
	};

	const onChildExit = (exit: { readonly child: ChildId; readonly epoch: ChildEpoch }): void => {
		if (
			exit.child !== options.identity.validator.childId ||
			exit.epoch !== options.identity.validator.epoch
		) {
			return;
		}
		epochClosed = true;
		for (const state of liveWireCalls.values()) {
			if (state.request.child === exit.child && state.request.epoch === exit.epoch) {
				state.childDisconnected = true;
				state.cancelled ??= Object.freeze({
					requestId: state.request.requestId,
					cause: "child_disconnect",
				});
				state.wakeCancellation();
			}
		}
		liveWireCalls.clear();
		retainedWireCalls.clear();
		liveLogicalCalls.clear();
		retainedLogicalCalls.clear();
	};

	const dispose = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		epochClosed = true;
		for (const state of liveWireCalls.values()) {
			state.cancelled ??= Object.freeze({
				requestId: state.request.requestId,
				cause: "host_shutdown",
			});
			state.wakeCancellation();
		}
		liveWireCalls.clear();
		retainedWireCalls.clear();
		liveLogicalCalls.clear();
		retainedLogicalCalls.clear();
	};

	const replayState = (): CoordinatorReplayStateSnapshot =>
		Object.freeze({
			liveWireCount: liveWireCalls.size,
			retainedWireCount: retainedWireCalls.size,
			liveLogicalCount: liveLogicalCalls.size,
			retainedLogicalCount: retainedLogicalCalls.size,
			retainedFingerprintBytes: [...retainedLogicalCalls.values()].reduce(
				(total, value) => total + value.inputFingerprint.length,
				0,
			),
		});

	return Object.freeze({ dispatch, onServerRequest, cancel, onChildExit, replayState, dispose });
}
