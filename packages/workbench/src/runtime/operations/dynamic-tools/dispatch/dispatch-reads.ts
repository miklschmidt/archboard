import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
} from "#runtime/protocol/thread-tools/manifest.ts";
import { type DynamicToolCallResponse } from "#runtime/protocol/thread-tools/results.ts";
import type { DynamicServerRequest } from "@archboard/codex-app-server/transport";
import type {
	CodexDynamicToolsOptions,
	DynamicCallerAuthority,
} from "#runtime/protocol/dynamic-tools/contract.ts";
import { resolveTarget } from "#runtime/rules/dynamic-tools/authority/authority-classification.ts";
import type { ValidatedDynamicCall } from "#runtime/rules/dynamic-tools/request-validation.ts";
import {
	issueReadOperation,
	operationWireForIssuedResult,
} from "#runtime/rules/dynamic-tools/effects/effects.ts";
import {
	projectList,
	projectRead,
} from "#runtime/operations/dynamic-tools/projection/projection.ts";
import { dynamicResponse } from "#runtime/operations/dynamic-tools/dispatch/response.ts";
import { waitForDynamicThreads } from "#runtime/services/dynamic-tools/wait.ts";
import {
	unwrapPageCursor,
	wrapPageCursor,
} from "#runtime/operations/dynamic-tools/dispatch/dispatch-support.ts";

/** How many threads a listing returns when the caller does not say. */
const DEFAULT_LIST_LIMIT = 10;

/** How many turns a read returns when the caller does not say. */
const DEFAULT_TURN_LIMIT = 10;

/** How long a wait blocks for when the caller does not say. */
const DEFAULT_WAIT_TIMEOUT_MS = 120_000;

/**
 * The operation identity one read is carried out under, issued and serialized before anything
 * is read, so the response names the identity the read was accounted for by.
 * @param options The dynamic tools options.
 * @returns The serialized identity.
 */
function readOperationId(options: CodexDynamicToolsOptions): string {
	return operationWireForIssuedResult(options, issueReadOperation(options).resultOperationId);
}

/**
 * List the threads the caller may see, with its page cursor bound to the query it was issued
 * for so it cannot be replayed against a different listing.
 * @param call The validated call.
 * @param caller The caller's authority.
 * @param options The dynamic tools options.
 * @returns The response.
 */
async function dispatchListThreads(
	call: ValidatedDynamicCall & { name: "list_threads" },
	caller: DynamicCallerAuthority,
	options: CodexDynamicToolsOptions,
): Promise<DynamicToolCallResponse> {
	const operationId = readOperationId(options);
	const limit = call.arguments.limit ?? DEFAULT_LIST_LIMIT;
	const page = await projectList(
		{
			cursor: unwrapPageCursor(call.arguments.cursor, caller, "thread/list", "desc", { limit }),
			limit,
		},
		caller,
		{
			session: options.session,
			/**
			 * Classify one listed thread against the caller's own authority.
			 * @param threadId The thread.
			 * @param observed What was observed about it.
			 * @returns The classification.
			 */
			classifyTarget: (threadId, observed) => resolveTarget(caller, threadId, options, observed),
		},
	);
	return dynamicResponse(call.name, {
		tag: "ok",
		operationId,
		value: {
			threads: page.threads,
			nextCursor: wrapPageCursor(page.nextCursor, caller, "thread/list", "desc", { limit }),
		},
	});
}

/**
 * Read one thread's recent turns.
 * @param call The validated call.
 * @param caller The caller's authority.
 * @param options The dynamic tools options.
 * @returns The response.
 */
async function dispatchReadThread(
	call: ValidatedDynamicCall & { name: "read_thread" },
	caller: DynamicCallerAuthority,
	options: CodexDynamicToolsOptions,
): Promise<DynamicToolCallResponse> {
	const operationId = readOperationId(options);
	const args = call.arguments;
	const turnLimit = args.turnLimit ?? DEFAULT_TURN_LIMIT;
	const includeOutputs = args.includeOutputs ?? false;
	const query = { threadId: args.threadId, turnLimit, includeOutputs };
	const page = await projectRead(
		{
			targetThreadId: args.threadId,
			cursor: unwrapPageCursor(args.cursor, caller, "thread/turns/list", "desc", query),
			turnLimit,
			includeOutputs,
		},
		caller,
		{
			session: options.session,
			/**
			 * Classify the thread being read against the caller's own authority.
			 * @param threadId The thread.
			 * @param observed What was observed about it.
			 * @returns The classification.
			 */
			classifyTarget: (threadId, observed) => resolveTarget(caller, threadId, options, observed),
		},
	);
	return dynamicResponse(call.name, {
		tag: "ok",
		operationId,
		value: {
			threadId: page.threadId,
			turns: page.turns,
			nextCursor: wrapPageCursor(page.nextCursor, caller, "thread/turns/list", "desc", query),
		},
	});
}

/**
 * Wait for the first thing to happen on any of the threads the caller named.
 * @param call The validated call.
 * @param caller The caller's authority.
 * @param request The server request, which names the call the wait takes ownership under.
 * @param options The dynamic tools options.
 * @returns The response.
 */
async function dispatchWaitThreads(
	call: ValidatedDynamicCall & { name: "wait_threads" },
	caller: DynamicCallerAuthority,
	request: DynamicServerRequest,
	options: CodexDynamicToolsOptions,
): Promise<DynamicToolCallResponse> {
	const operationId = readOperationId(options);
	const args = call.arguments;
	const wait = await waitForDynamicThreads({
		threadIds: args.threadIds,
		timeoutMs: args.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS,
		...(args.cursor === undefined ? {} : { cursor: args.cursor }),
		caller,
		call: {
			callId: request.logicalCall.callId,
			namespace: ARCHBOARD_APP_NAMESPACE.name,
			tool: "wait_threads",
			manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
		},
		/**
		 * Classify one wait target against the caller's own authority.
		 * @param threadId The thread.
		 * @returns The classification.
		 */
		classifyTarget: (threadId) => resolveTarget(caller, threadId, options),
		options,
	});
	return dynamicResponse(call.name, {
		tag: "ok",
		operationId,
		value: { event: wait.event, threadId: wait.threadId, cursor: wait.cursor },
	});
}

/**
 * Answer one of the three calls that only read, or nothing when the call mutates.
 * @param call The validated call.
 * @param caller The caller's authority.
 * @param request The server request.
 * @param options The dynamic tools options.
 * @returns The response, or null when the call is a mutation.
 */
async function dispatchRead(
	call: ValidatedDynamicCall,
	caller: DynamicCallerAuthority,
	request: DynamicServerRequest,
	options: CodexDynamicToolsOptions,
): Promise<DynamicToolCallResponse | null> {
	if (call.name === "list_threads") {
		return await dispatchListThreads(call, caller, options);
	}
	if (call.name === "read_thread") {
		return await dispatchReadThread(call, caller, options);
	}
	if (call.name === "wait_threads") {
		return await dispatchWaitThreads(call, caller, request, options);
	}
	return null;
}

export { dispatchRead };
