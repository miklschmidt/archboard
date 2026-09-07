import type { TransportServerRequest } from "@/runtime/codex-transport/server-requests";
import type { ChildEpoch, ChildId, JsonRpcRequestId } from "@/shared/codex-workbench-identity";
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
} from "@/runtime/codex-coordinator-tools/lib/contract";
import {
	complete,
	errorMessage,
	executeCall,
	unavailable,
} from "@/runtime/codex-coordinator-tools/lib/call-execution";
import {
	createReplayLedger,
	type CallState,
	type LogicalCallState,
	type TerminalLogicalCallState,
} from "@/runtime/codex-coordinator-tools/lib/replay-ledger";
import { refusedResponse } from "@/runtime/codex-coordinator-tools/lib/response";
import {
	CoordinatorToolValidationError,
	callKey,
	isCoordinatorToolRequest,
	logicalCallKey,
	validateCoordinatorToolRequest,
	type ValidatedCoordinatorToolCall,
} from "@/runtime/codex-coordinator-tools/lib/validation";

/**
 * A no-op placeholder for the cancellation waker until the promise executor installs the real one.
 */
function ignoreCancellation(): void {}

/**
 * The refusal for a replay whose arguments differ from the logical call it claims to repeat.
 * @returns The frozen response.
 */
function mismatchResponse(): DynamicToolResponse {
	return refusedResponse(
		"invalid_call",
		"The replay arguments do not match the original logical tool call.",
		true,
	);
}

/**
 * Whether a validation failure means the request never belonged here, so the app-server should
 * see the call itself fail rather than a refusal from a tool that ran.
 * @param reason - The validation failure reason.
 * @returns True for provenance and identity failures.
 */
function isBoundaryRefusal(reason: CoordinatorToolValidationError["reason"]): boolean {
	return (
		reason === "invalid_call" ||
		reason === "stale_child" ||
		reason === "prior_epoch" ||
		reason === "unknown_provenance"
	);
}

/**
 * Create the dispatcher that executes the coordinator's dynamic tool calls exactly once per
 * logical call, answers wire retries from what it remembers, and never lets a cancelled or
 * disconnected call start a new effect.
 * @param options - The authorities, ports and transport the dispatcher works through.
 * @returns The dispatcher.
 */
export function createCodexCoordinatorTools(
	options: CodexCoordinatorToolsOptions,
): CoordinatorToolDispatcher {
	let disposed = false;
	let epochClosed = false;
	const ledger = createReplayLedger();
	const { liveWireCalls, retainedWireCalls, liveLogicalCalls, retainedLogicalCalls } = ledger;

	/**
	 * The key of the logical call the host is executing right now.
	 * @returns The key, or null when no call is executing.
	 */
	const currentLogicalKey = (): string | null => {
		const current = options.authority.currentCall();
		return current === null ? null : logicalCallKey(current);
	};

	/**
	 * Take a wire call out of the live set and, unless the epoch closed, remember its result.
	 * @param state - The wire call.
	 * @param terminal - Its settled result.
	 * @param retain - Whether a later retry may be answered from this result.
	 */
	const retireWire = (
		state: CallState,
		terminal: CoordinatorToolDispatchResult,
		retain: boolean,
	): void => {
		if (liveWireCalls.get(state.wireKey) === state) {
			liveWireCalls.delete(state.wireKey);
		}
		if (!epochClosed && retain) {
			ledger.retainWire(state.wireKey, { logicalKey: state.logicalKey, terminal });
		}
	};

	/**
	 * Send the wire response at most once; a disconnected child gets nothing.
	 * @param state - The wire call.
	 * @param response - The response to send.
	 */
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

	/**
	 * Respond to a wire call and retire it.
	 * @param state - The wire call.
	 * @param response - The response to send.
	 * @param retain - Whether a later retry may be answered from this result.
	 * @returns The settled result.
	 */
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

	/**
	 * Wait for the logical call a wire call belongs to and answer the wire call from it, unless
	 * the wire call is cancelled or its child disconnects first.
	 * @param state - The wire call.
	 * @param logical - The logical call it belongs to or aliases.
	 * @returns The settled result.
	 */
	const settleWire = async (
		state: CallState,
		logical: LogicalCallState,
	): Promise<CoordinatorToolDispatchResult> => {
		/**
		 * The result for an alias that was cancelled while waiting.
		 * @returns The unavailable result.
		 */
		const cancelled = (): CoordinatorToolDispatchResult => unavailable(false);
		let terminal: CoordinatorToolDispatchResult;
		if (state === logical.owner) {
			const disconnected = state.cancellation.then(() =>
				state.childDisconnected ? unavailable(state.operationAttempted) : logical.promise!,
			);
			terminal = await Promise.race([logical.promise!, disconnected]);
		} else {
			const settled = await Promise.race([logical.promise!, state.cancellation.then(cancelled)]);
			terminal = state.cancelled === null ? settled : cancelled();
		}
		state.operationAttempted = terminal.attempted;
		if (state.childDisconnected) {
			retireWire(state, terminal, true);
			return terminal;
		}
		return finish(state, terminal.response);
	};

	/**
	 * Attach a wire retry to the logical call that is still executing, if its arguments match and
	 * the alias limit allows.
	 * @param state - The wire call.
	 * @param live - The executing logical call.
	 * @param validated - The retry's validated call.
	 * @returns The settled result.
	 */
	const replayLive = (
		state: CallState,
		live: LogicalCallState,
		validated: ValidatedCoordinatorToolCall,
	): Promise<CoordinatorToolDispatchResult> => {
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
	};

	/**
	 * Answer a wire retry from a logical call that already settled, if its arguments match.
	 * @param state - The wire call.
	 * @param retained - The settled logical call.
	 * @param validated - The retry's validated call.
	 * @returns The settled result.
	 */
	const replayRetained = (
		state: CallState,
		retained: TerminalLogicalCallState,
		validated: ValidatedCoordinatorToolCall,
	): Promise<CoordinatorToolDispatchResult> => {
		if (retained.inputFingerprint !== validated.inputFingerprint) {
			return finish(state, mismatchResponse());
		}
		state.operationAttempted = retained.terminal.attempted;
		return finish(state, retained.terminal.response);
	};

	/**
	 * Start executing a new logical call owned by this wire call.
	 * @param state - The wire call.
	 * @param key - The logical call key.
	 * @param validated - The validated call.
	 * @returns The settled result.
	 */
	const startLogical = (
		state: CallState,
		key: string,
		validated: ValidatedCoordinatorToolCall,
	): Promise<CoordinatorToolDispatchResult> => {
		const logical: LogicalCallState = {
			key,
			inputFingerprint: validated.inputFingerprint,
			owner: state,
			acceptedAliases: 0,
			promise: null,
		};
		liveLogicalCalls.set(key, logical);
		logical.promise = executeCall({ options, disposed: () => disposed }, state, validated)
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
					ledger.retainLogical({ key, inputFingerprint: logical.inputFingerprint, terminal });
				}
				return terminal;
			});
		return settleWire(state, logical);
	};

	/**
	 * Validate a wire call and route it to a fresh execution, a live logical call, or a retained
	 * result.
	 * @param state - The wire call.
	 * @returns The settled result.
	 */
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
			return replayLive(state, live, validated);
		}
		const retained = retainedLogicalCalls.get(key);
		if (retained !== undefined) {
			return replayRetained(state, retained, validated);
		}
		return startLogical(state, key, validated);
	};

	/**
	 * Accept one wire request, answering an exact repeat from memory and refusing a second
	 * distinct request under the same identity.
	 * @param request - The coordinator-owned dynamic tool request.
	 * @returns The settled result.
	 */
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
		ledger.pruneStaleTerminals(currentLogicalKey());
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

	/**
	 * Listener entry point: dispatch the requests this module owns and ignore the rest.
	 * @param request - Any server request from the transport.
	 */
	const onServerRequest = (request: TransportServerRequest): void => {
		if (!isCoordinatorToolRequest(request)) {
			return;
		}
		void dispatch(request).catch(() => undefined);
	};

	/**
	 * Mark a live call cancelled, unless it has already answered, and wake whatever waits on it.
	 * @param requestId - The wire request id.
	 * @param cause - Why the call is cancelled.
	 */
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

	/**
	 * Whether an exit names the child and epoch this dispatcher serves.
	 * @param exit - The exited child and epoch.
	 * @returns True when it is ours.
	 */
	const isOwnChild = (exit: { readonly child: ChildId; readonly epoch: ChildEpoch }): boolean =>
		exit.child === options.identity.validator.childId &&
		exit.epoch === options.identity.validator.epoch;

	/**
	 * Mark every live call of an exited child disconnected so no response or retry can follow, then
	 * forget everything.
	 * @param exit - The exited child and epoch.
	 */
	const onChildExit = (exit: { readonly child: ChildId; readonly epoch: ChildEpoch }): void => {
		if (!isOwnChild(exit)) {
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
		ledger.clear();
	};

	/**
	 * Shut the dispatcher down: cancel every live call for host shutdown and forget everything.
	 */
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
		ledger.clear();
	};

	/**
	 * Count-only replay ownership inspection.
	 * @returns The counts.
	 */
	const replayState = (): CoordinatorReplayStateSnapshot => ledger.snapshot();

	return Object.freeze({ dispatch, onServerRequest, cancel, onChildExit, replayState, dispose });
}
