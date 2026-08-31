import type {
	ChildId,
	DynamicToolCallId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
} from "../../codex-thread-tools/index.js";
import {
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicCallerAuthority,
	type DynamicTargetAuthority,
	type DynamicWaitEvent,
	type DynamicWaitOwner,
} from "./contract.js";
import { encodeDynamicCursor, unwrapDynamicCursor } from "./cursors.js";
import { assertWaitTargetAllowed } from "./classification.js";

export interface WaitProjection {
	readonly event: DynamicWaitEvent["event"];
	readonly threadId: string | null;
	readonly cursor: string | null;
	readonly sequence: number;
}

function dynamicError(
	code: "invalid_call" | "cycle" | "stale_child",
	message: string,
	cause?: unknown,
) {
	return new CodexDynamicToolsError(code, message, cause);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactEventKeys(
	value: Readonly<Record<string, unknown>>,
	keys: readonly string[],
): boolean {
	return (
		Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key)) &&
		keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
	);
}

function errorCode(error: unknown): string | undefined {
	return typeof error === "object" && error !== null && "code" in error
		? String((error as { readonly code: unknown }).code)
		: undefined;
}

function waitQuery(
	threadIds: readonly string[],
): Readonly<{ readonly threadIds: readonly string[] }> {
	return Object.freeze({ threadIds: Object.freeze([...threadIds]) });
}

function sortedUnique(values: readonly string[]): readonly string[] {
	return Object.freeze(
		[...new Set(values)].toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
	);
}

function ownerFor(
	caller: DynamicCallerAuthority,
	call: {
		readonly callId: DynamicToolCallId;
		readonly namespace: "archboard_app";
		readonly tool: "wait_threads";
		readonly manifestHash: string;
	},
	targets: readonly ThreadId[],
): DynamicWaitOwner {
	return Object.freeze({
		child: caller.childId,
		caller: caller.threadId,
		turn: caller.turnId,
		call: call.callId,
		epoch: caller.epoch,
		namespace: call.namespace,
		tool: call.tool,
		manifestHash: call.manifestHash,
		sortedTargetThreadIds: Object.freeze([...targets]),
		operationId: null,
	});
}

function graphOwner(owner: DynamicWaitOwner) {
	return {
		child: owner.child,
		caller: owner.caller,
		turn: owner.turn,
		call: owner.call,
	} as const;
}

async function releaseWaitOwner(
	options: CodexDynamicToolsOptions,
	owner: DynamicWaitOwner,
	cause: "settle" | "cancellation" | "interruption" | "disconnect",
): Promise<void> {
	let graphError: unknown = null;
	try {
		options.waitGraph.release({ cause, owner: graphOwner(owner) });
	} catch (error) {
		graphError = error;
	}
	try {
		await options.lifecycle.releaseWaitOwner({ owner, cause });
	} catch (error) {
		if (graphError !== null) throw graphError;
		throw error;
	}
	if (graphError !== null) throw graphError;
}

function validateEvent(
	event: DynamicWaitEvent,
	previousSequence: number,
	targetIds: ReadonlySet<string>,
	targets: ReadonlyMap<string, DynamicTargetAuthority>,
): void {
	if (!isRecord(event) || typeof event.event !== "string")
		throw dynamicError("invalid_call", "The wait authority returned an invalid event.");
	const eventKeys =
		event.event === "timeout"
			? ["event", "threadId", "sequence", "cursor"]
			: event.event === "completed" || event.event === "attention"
				? [
						"event",
						"threadId",
						"sequence",
						"cursor",
						...(event.event === "attention" &&
						targets.get(typeof event.threadId === "string" ? event.threadId : "")?.status !==
							"systemError"
							? ["targetOwned"]
							: []),
					]
				: null;
	const systemErrorAttention =
		event.event === "attention" &&
		targets.get(typeof event.threadId === "string" ? event.threadId : "")?.status === "systemError";
	if (
		eventKeys === null ||
		(!exactEventKeys(event, eventKeys) &&
			!(
				systemErrorAttention &&
				exactEventKeys(event, ["event", "threadId", "sequence", "cursor", "targetOwned"])
			))
	)
		throw dynamicError("invalid_call", "The wait authority returned an invalid event shape.");
	if (!Number.isSafeInteger(event.sequence) || event.sequence < 0)
		throw dynamicError("invalid_call", "The wait authority returned an invalid event sequence.");
	if (
		event.cursor !== null &&
		(typeof event.cursor !== "string" || event.cursor.length === 0 || event.cursor.length > 1_024)
	)
		throw dynamicError("invalid_call", "The wait authority returned an invalid event cursor.");
	if (event.event === "timeout") {
		if (event.threadId !== null || event.sequence !== previousSequence)
			throw dynamicError("invalid_call", "A timeout must not deliver a target event.");
		return;
	}
	if (!targetIds.has(event.threadId))
		throw dynamicError("invalid_call", "The wait authority returned an event for another thread.");
	if (event.sequence <= previousSequence)
		throw dynamicError("invalid_call", "The wait authority returned an already-delivered event.");
	if (event.event === "attention") {
		const target = targets.get(event.threadId);
		if (Object.prototype.hasOwnProperty.call(event, "targetOwned") && event.targetOwned !== true)
			throw dynamicError("invalid_call", "Attention ownership must be explicitly true.");
		if (target === undefined || (target.status !== "systemError" && event.targetOwned !== true))
			throw dynamicError("invalid_call", "Attention was not proven to belong to a wait target.");
	}
}

export async function waitForDynamicThreads(input: {
	readonly threadIds: readonly string[];
	readonly timeoutMs: number;
	readonly cursor?: string;
	readonly caller: DynamicCallerAuthority;
	readonly call: {
		readonly callId: DynamicToolCallId;
		readonly namespace: "archboard_app";
		readonly tool: "wait_threads";
		readonly manifestHash: string;
	};
	readonly classifyTarget: (threadId: unknown) => Promise<DynamicTargetAuthority>;
	readonly options: CodexDynamicToolsOptions;
}): Promise<WaitProjection> {
	if (
		!Array.isArray(input.threadIds) ||
		input.threadIds.length === 0 ||
		input.threadIds.length > 8 ||
		input.threadIds.some(
			(threadId) => typeof threadId !== "string" || threadId.length === 0 || threadId.length > 128,
		) ||
		!Number.isSafeInteger(input.timeoutMs) ||
		input.timeoutMs < 0 ||
		input.timeoutMs > 120_000
	)
		throw dynamicError("invalid_call", "The wait arguments are outside the reviewed bounds.");
	if (
		!isRecord(input.call) ||
		!exactEventKeys(input.call, ["callId", "namespace", "tool", "manifestHash"]) ||
		typeof input.call.callId !== "string" ||
		input.call.callId.length === 0 ||
		input.call.namespace !== ARCHBOARD_APP_NAMESPACE.name ||
		input.call.tool !== "wait_threads" ||
		input.call.manifestHash !== ARCHBOARD_APP_MANIFEST_SHA256
	)
		throw dynamicError(
			"invalid_call",
			"The wait owner identity is not the reviewed manifest call.",
		);
	const requestedWireIds = sortedUnique(input.threadIds);
	const cursor = unwrapDynamicCursor(input.cursor, {
		child: input.caller.childId,
		epoch: input.caller.epoch,
		method: "wait_threads",
		direction: "event",
		query: waitQuery(requestedWireIds),
	});
	const classified: DynamicTargetAuthority[] = [];
	for (const threadId of requestedWireIds) {
		const target = await input.classifyTarget(threadId);
		if (target.wireThreadId !== threadId)
			throw dynamicError("invalid_call", "The target authority changed a wait ThreadId.");
		assertWaitTargetAllowed(input.caller, target);
		classified.push(target);
	}
	const targetIds = sortedUnique(classified.map((target) => target.wireThreadId));
	if (targetIds.length !== classified.length)
		throw dynamicError("invalid_call", "The wait target authority returned duplicate ThreadIds.");
	const targetIdentityIds = Object.freeze(
		classified
			.map((target) => target.threadId)
			.toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
	);
	const owner = ownerFor(input.caller, input.call, targetIdentityIds);
	const targetMap = new Map(classified.map((target) => [target.wireThreadId, target]));
	const graphResult = input.options.waitGraph.addEdgeSet({
		owner: graphOwner(owner),
		targets: targetIdentityIds,
	});
	if (!graphResult.ok) throw dynamicError("cycle", "The wait would create a dependency cycle.");
	try {
		await input.options.lifecycle.registerWaitOwner({ owner });
	} catch (error) {
		try {
			await releaseWaitOwner(input.options, owner, "cancellation");
		} catch (cleanupError) {
			throw dynamicError(
				"invalid_call",
				"The wait owner could not be registered or cleaned up.",
				cleanupError,
			);
		}
		throw dynamicError("invalid_call", "The wait owner could not be registered.", error);
	}
	let released = false;
	const releaseOnce = async (
		cause: "settle" | "cancellation" | "interruption" | "disconnect",
	): Promise<void> => {
		if (released) return;
		released = true;
		await releaseWaitOwner(input.options, owner, cause);
	};
	try {
		const event = await input.options.lifecycle.waitForTargets({
			owner,
			cursor: cursor.cursor,
			timeoutMs: input.timeoutMs,
			previousSequence: cursor.sequence,
		});
		validateEvent(event, cursor.sequence, new Set(requestedWireIds), targetMap);
		await releaseOnce("settle");
		const eventCursor = event.cursor ?? cursor.cursor;
		const outputCursor = encodeDynamicCursor({
			child: input.caller.childId,
			epoch: input.caller.epoch,
			method: "wait_threads",
			direction: "event",
			query: waitQuery(requestedWireIds),
			cursor: eventCursor,
			sequence: event.sequence,
		});
		return Object.freeze({
			event: event.event,
			threadId: event.threadId,
			cursor: outputCursor,
			sequence: event.sequence,
		});
	} catch (error) {
		const code = errorCode(error);
		if (code === "child_exit" || code === "child_disconnected" || code === "stale_child") {
			released = true;
			try {
				input.options.waitGraph.release({ cause: "child-exit", child: input.caller.childId });
				await input.options.lifecycle.releaseWaitOwnersForChild({ child: input.caller.childId });
			} catch {
				/* The child teardown owner remains terminal even if cleanup reporting fails. */
			}
			throw dynamicError("stale_child", "The child disconnected before the wait settled.", error);
		}
		const cause =
			code === "interruption"
				? "interruption"
				: code === "disconnect"
					? "disconnect"
					: "cancellation";
		await releaseOnce(cause);
		throw dynamicError(
			"invalid_call",
			"The wait call did not remain active until settlement.",
			error,
		);
	}
}

export type DynamicWaitChild = ChildId;
