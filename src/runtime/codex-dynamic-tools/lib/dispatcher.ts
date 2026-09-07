import type { DynamicToolCallResponse, GeneralThreadToolName } from "@/runtime/codex-thread-tools";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import {
	CodexDynamicOperationTerminalizationError,
	CodexDynamicToolsError,
	type CodexDynamicTools,
	type CodexDynamicToolsOptions,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import { dynamicErrorForResponse } from "@/runtime/codex-dynamic-tools/lib/classification";
import { resolveCaller } from "@/runtime/codex-dynamic-tools/lib/authority-classification";
import { validateDynamicCall } from "@/runtime/codex-dynamic-tools/lib/request-validation";
import { createDynamicOperationRecoverySettlement } from "@/runtime/codex-dynamic-tools/lib/effects";
import {
	invalidDynamicResponse,
	refusedDynamicResponse,
} from "@/runtime/codex-dynamic-tools/lib/response";
import { createDynamicQuarantineDispatcher } from "@/runtime/codex-dynamic-tools/lib/quarantine";
import {
	assertCallExecuting,
	boundedFailureMessage,
	freezeDynamicRequest,
	isMutationToolName,
	isRecord,
	refusalReasonForResponse,
} from "@/runtime/codex-dynamic-tools/lib/dispatch-support";
import { dispatchRead } from "@/runtime/codex-dynamic-tools/lib/dispatch-reads";
import {
	dispatchMutation,
	type MutationCall,
	type MutationDispatchState,
} from "@/runtime/codex-dynamic-tools/lib/dispatch-mutations";

/**
 * Whether a validated call is one of the three that mutate.
 * @param call The validated call.
 * @returns Whether it mutates.
 */
function isMutationCall(
	call: Awaited<ReturnType<typeof validateDynamicCall>>,
): call is MutationCall {
	return isMutationToolName(call.name);
}

/**
 * Answer one validated call, whichever kind it is.
 * @param request The frozen server request.
 * @param options The dynamic tools options.
 * @param state Where the call's settlement is recorded.
 * @param caller The caller's authority.
 * @param call The validated call.
 * @returns The response.
 */
async function dispatchValidated(
	request: DynamicServerRequest,
	options: CodexDynamicToolsOptions,
	state: MutationDispatchState,
	caller: Awaited<ReturnType<typeof resolveCaller>>,
	call: Awaited<ReturnType<typeof validateDynamicCall>>,
): Promise<DynamicToolCallResponse> {
	const read = await dispatchRead(call, caller, request, options);
	if (read !== null) {
		return read;
	}
	if (!isMutationCall(call)) {
		throw new CodexDynamicToolsError(
			"unsupported",
			"The dynamic tool is not a mutation or read operation.",
		);
	}
	return await dispatchMutation(call, request, caller, options, state);
}

/**
 * The response a failed dispatch turns into. A call that got as far as having a caller and a
 * name is refused under that name, so the child is told which of its calls failed; anything
 * earlier can only be reported as an invalid call.
 * @param error What the dispatch threw.
 * @param knownName The call's name, once it was known.
 * @param boundaryValidated Whether the caller's authority was resolved.
 * @returns The response.
 */
function dispatchFailureResponse(
	error: unknown,
	knownName: GeneralThreadToolName | null,
	boundaryValidated: boolean,
): DynamicToolCallResponse {
	const failure = dynamicErrorForResponse(error);
	if (boundaryValidated && knownName !== null) {
		return refusedDynamicResponse(
			knownName,
			refusalReasonForResponse(failure.code),
			boundedFailureMessage(failure.message),
		);
	}
	return invalidDynamicResponse(
		failure.code === "unsupported" ? "unsupported" : "invalid_call",
		boundedFailureMessage(failure.message),
	);
}

/**
 * Answer one dynamic reverse request, from validating what it says to reporting what it did.
 *
 * Everything the call does is done under the caller's own authority, resolved before anything
 * else and asserted still executing before a person is asked about anything. A failure that
 * reaches here is turned into a response rather than raised, except one the operation authority
 * could not settle, which belongs to the quarantine boundary.
 * @param request The server request.
 * @param options The dynamic tools options.
 * @param state Where the call's settlement is recorded.
 * @returns The response.
 */
async function dispatchOne(
	request: DynamicServerRequest,
	options: CodexDynamicToolsOptions,
	state: MutationDispatchState,
): Promise<DynamicToolCallResponse> {
	let knownName: GeneralThreadToolName | null = null;
	let boundaryValidated = false;
	try {
		const call = validateDynamicCall(request, options);
		knownName = call.name;
		const immutableRequest = freezeDynamicRequest(request);
		const caller = await resolveCaller(immutableRequest, options);
		boundaryValidated = true;
		await assertCallExecuting(options, immutableRequest, caller, "before_approval");
		return await dispatchValidated(immutableRequest, options, state, caller, call);
	} catch (error) {
		if (error instanceof CodexDynamicOperationTerminalizationError) {
			throw error;
		}
		return dispatchFailureResponse(error, knownName, boundaryValidated);
	}
}

/**
 * The response a call gets when its operation identities could not be proven settled: the
 * epoch is quarantined, and the call is refused rather than reported as having done nothing.
 * @param options The dynamic tools options.
 * @param state What the call left behind.
 * @param error What the operation authority raised.
 * @returns The response and the settlement the quarantine will retry.
 */
function quarantinedDispatch(
	options: CodexDynamicToolsOptions,
	state: MutationDispatchState,
	error: CodexDynamicOperationTerminalizationError,
): {
	response: DynamicToolCallResponse;
	settlement: ReturnType<typeof createDynamicOperationRecoverySettlement>;
} {
	if (state.mutationName === null) {
		throw error;
	}
	return {
		response: refusedDynamicResponse(
			state.mutationName,
			"system_error",
			"The dynamic operation authority is quarantined pending host recovery.",
		),
		settlement:
			state.operationSettlement ?? createDynamicOperationRecoverySettlement(options, error),
	};
}

/**
 * The dynamic tool boundary a child talks to: one response per reverse request, every mutation
 * put to a person first, and every operation identity accounted for even when the host cannot
 * prove it settled.
 * @param options The dynamic tools options.
 * @returns The dynamic tools.
 */
function createCodexDynamicTools(options: CodexDynamicToolsOptions): CodexDynamicTools {
	if (options.checkoutRoot.length === 0) {
		throw new CodexDynamicToolsError("invalid_call", "Dynamic tools require a checkout root.");
	}
	let disposed = false;
	const responses = new WeakMap<object, Promise<DynamicToolCallResponse>>();
	const quarantine = createDynamicQuarantineDispatcher(options);

	/**
	 * Run one request through the quarantine boundary, recording what it left behind.
	 * @param request The server request.
	 * @returns The response.
	 */
	const run = (request: DynamicServerRequest): Promise<DynamicToolCallResponse> => {
		const state: MutationDispatchState = { operationSettlement: null, mutationName: null };
		return quarantine.dispatch(request, async () => {
			try {
				return {
					response: await dispatchOne(request, options, state),
					settlement: state.operationSettlement,
				};
			} catch (error) {
				if (!(error instanceof CodexDynamicOperationTerminalizationError)) {
					throw error;
				}
				return quarantinedDispatch(options, state, error);
			}
		});
	};

	/**
	 * Answer one reverse request, giving a repeated request the answer the first one got.
	 * @param request The server request.
	 * @returns The response.
	 */
	const dispatch = (request: DynamicServerRequest): Promise<DynamicToolCallResponse> => {
		const cacheKey = isRecord(request) ? request : null;
		const existing = cacheKey === null ? undefined : responses.get(cacheKey);
		if (existing !== undefined) {
			return existing;
		}
		const response = disposed
			? Promise.resolve(invalidDynamicResponse("invalid_call", "Dynamic tools are disposed."))
			: run(request);
		if (cacheKey !== null) {
			responses.set(cacheKey, response);
		}
		return response;
	};

	/** Stop answering, and drop everything the quarantine boundary is holding. */
	const dispose = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		quarantine.dispose();
	};

	return Object.freeze({
		dispatch,
		inspectMutationQuarantine: quarantine.inspect,
		dispose,
	});
}

const createCodexDynamicToolDispatcher = createCodexDynamicTools;

export { createCodexDynamicTools, createCodexDynamicToolDispatcher };
