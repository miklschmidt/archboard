import type { ChildId, DynamicToolCallId, ThreadId } from "@/shared/codex-workbench-identity";
import type {
	CodexDynamicToolsOptions,
	DynamicCallerAuthority,
	DynamicTargetAuthority,
	DynamicWaitEvent,
	DynamicWaitOwner,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import {
	encodeDynamicCursor,
	unwrapDynamicCursor,
} from "@/runtime/codex-dynamic-tools/lib/cursors";
import { assertWaitTargetAllowed } from "@/runtime/codex-dynamic-tools/lib/classification";
import {
	assertWaitArguments,
	assertWaitCall,
	dynamicError,
	errorCode,
	validateEvent,
} from "@/runtime/codex-dynamic-tools/lib/wait-validation";

/** What one settled wait call reports back to the caller. */
interface WaitProjection {
	readonly event: DynamicWaitEvent["event"];
	readonly threadId: string | null;
	readonly cursor: string | null;
	readonly sequence: number;
}

/** The manifest call one wait takes ownership under. */
interface WaitCall {
	readonly callId: DynamicToolCallId;
	readonly namespace: "archboard_app";
	readonly tool: "wait_threads";
	readonly manifestHash: string;
}

/** Why a wait owner is being released. */
type ReleaseCause = "settle" | "cancellation" | "interruption" | "disconnect";

/** Everything one wait call is made of. */
interface WaitInput {
	readonly threadIds: readonly string[];
	readonly timeoutMs: number;
	readonly cursor?: string;
	readonly caller: DynamicCallerAuthority;
	readonly call: WaitCall;
	readonly classifyTarget: (threadId: unknown) => Promise<DynamicTargetAuthority>;
	readonly options: CodexDynamicToolsOptions;
}

/** The wait's targets, resolved and cross-checked against the caller's authority. */
interface WaitTargets {
	readonly requestedWireIds: readonly string[];
	readonly identityIds: readonly ThreadId[];
	readonly byWireId: ReadonlyMap<string, DynamicTargetAuthority>;
}

/**
 * The query a wait's cursor is bound to, so a cursor cannot be replayed against a different
 * set of threads than the one it was issued for.
 * @param threadIds The wire ThreadIds the call named.
 * @returns The frozen query.
 */
function waitQuery(
	threadIds: readonly string[],
): Readonly<{ readonly threadIds: readonly string[] }> {
	return Object.freeze({ threadIds: Object.freeze([...threadIds]) });
}

/**
 * The values in a stable order with duplicates removed, which is what makes one wait's identity
 * independent of the order the caller happened to name its threads in.
 * @param values The values.
 * @returns The sorted, frozen, unique values.
 */
function sortedUnique(values: readonly string[]): readonly string[] {
	return Object.freeze(
		[...new Set(values)].toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
	);
}

/**
 * The owner identity one wait registers under: which child, caller, turn and call it is, which
 * epoch it belongs to, and which targets it is waiting on.
 * @param caller The caller's authority.
 * @param call The manifest call.
 * @param targets The target thread identities, in a stable order.
 * @returns The frozen owner.
 */
function ownerFor(
	caller: DynamicCallerAuthority,
	call: WaitCall,
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

/**
 * The part of a wait owner the dependency graph is keyed by.
 * @param owner The wait owner.
 * @returns The graph key.
 */
function graphOwner(owner: DynamicWaitOwner) {
	return {
		child: owner.child,
		caller: owner.caller,
		turn: owner.turn,
		call: owner.call,
	} as const;
}

/**
 * Release one wait owner from both the dependency graph and the lifecycle, reporting the graph's
 * failure in preference to the lifecycle's so the first thing that went wrong is the one raised.
 * @param options The dynamic tools options.
 * @param owner The wait owner.
 * @param cause Why the owner is being released.
 */
async function releaseWaitOwner(
	options: CodexDynamicToolsOptions,
	owner: DynamicWaitOwner,
	cause: ReleaseCause,
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
		if (graphError !== null) {
			throw graphError;
		}
		throw error;
	}
	if (graphError !== null) {
		throw graphError;
	}
}

/**
 * Classify every thread the call named, refusing an authority that renames a thread under the
 * boundary and one that hands back the same thread twice.
 * @param input The wait call.
 * @param requestedWireIds The wire ThreadIds the call named, in a stable order.
 * @returns The resolved targets.
 */
async function resolveWaitTargets(
	input: WaitInput,
	requestedWireIds: readonly string[],
): Promise<WaitTargets> {
	const classified: DynamicTargetAuthority[] = [];
	for (const threadId of requestedWireIds) {
		// oxlint-disable-next-line eslint/no-await-in-loop -- each target is classified against the caller's authority in turn; a later refusal must not race an earlier one
		const target = await input.classifyTarget(threadId);
		if (target.wireThreadId !== threadId) {
			throw dynamicError("invalid_call", "The target authority changed a wait ThreadId.");
		}
		assertWaitTargetAllowed(input.caller, target);
		classified.push(target);
	}
	const targetIds = sortedUnique(classified.map((target) => target.wireThreadId));
	if (targetIds.length !== classified.length) {
		throw dynamicError("invalid_call", "The wait target authority returned duplicate ThreadIds.");
	}
	return {
		requestedWireIds,
		identityIds: Object.freeze(
			classified
				.map((target) => target.threadId)
				.toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
		),
		byWireId: new Map(classified.map((target) => [target.wireThreadId, target])),
	};
}

/**
 * Take ownership of the wait: claim the dependency edges, refusing a wait that would close a
 * cycle, and register the owner with the lifecycle, undoing the edges if that fails.
 * @param input The wait call.
 * @param owner The wait owner.
 * @param targets The resolved targets.
 */
async function claimWaitOwnership(
	input: WaitInput,
	owner: DynamicWaitOwner,
	targets: WaitTargets,
): Promise<void> {
	const graphResult = input.options.waitGraph.addEdgeSet({
		owner: graphOwner(owner),
		targets: targets.identityIds,
	});
	if (!graphResult.ok) {
		throw dynamicError("cycle", "The wait would create a dependency cycle.");
	}
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
}

/**
 * The projection one settled event becomes, carrying a cursor bound to this call's own query so
 * the next call resumes exactly where this one left off.
 * @param input The wait call.
 * @param event The settled event.
 * @param requestedWireIds The wire ThreadIds the call named, in a stable order.
 * @param resumedCursor The cursor this call resumed from, used when the event carries none.
 * @returns The projection.
 */
function waitProjection(
	input: WaitInput,
	event: DynamicWaitEvent,
	requestedWireIds: readonly string[],
	resumedCursor: string | null,
): WaitProjection {
	return Object.freeze({
		event: event.event,
		threadId: event.threadId,
		cursor: encodeDynamicCursor({
			child: input.caller.childId,
			epoch: input.caller.epoch,
			method: "wait_threads",
			direction: "event",
			query: waitQuery(requestedWireIds),
			cursor: event.cursor ?? resumedCursor,
			sequence: event.sequence,
		}),
		sequence: event.sequence,
	});
}

/**
 * Tear down every wait this child owns, because the child itself is gone and no owner of its
 * can settle any more. Cleanup reporting failures are swallowed: the teardown is terminal
 * whether or not anything is left to hear about it.
 * @param input The wait call.
 * @param error What the lifecycle threw.
 * @returns The refusal to raise.
 */
async function childGoneRefusal(input: WaitInput, error: unknown): Promise<never> {
	try {
		input.options.waitGraph.release({ cause: "child-exit", child: input.caller.childId });
		await input.options.lifecycle.releaseWaitOwnersForChild({ child: input.caller.childId });
	} catch {
		/* The child teardown owner remains terminal even if cleanup reporting fails. */
	}
	throw dynamicError("stale_child", "The child disconnected before the wait settled.", error);
}

/** The codes that mean the child itself is gone rather than this one wait failing. */
const CHILD_GONE_CODES = new Set(["child_exit", "child_disconnected", "stale_child"]);

/**
 * Why a failed wait's owner is being released, taken from the code the lifecycle raised.
 * @param code The code the lifecycle raised, if any.
 * @returns The release cause.
 */
function releaseCauseFor(code: string | undefined): ReleaseCause {
	if (code === "interruption") {
		return "interruption";
	}
	return code === "disconnect" ? "disconnect" : "cancellation";
}

/**
 * Wait for the first thing to happen on any of the threads a caller named, and report it once.
 *
 * The call takes ownership of its targets before it blocks — claiming dependency edges that
 * refuse a cycle, and registering an owner the lifecycle can release — so nothing can wait on a
 * thread that is waiting on it, and nothing is left holding an owner if the caller goes away.
 * Whatever the authority hands back is validated against what this call actually asked for
 * before it is believed, and the owner is released exactly once on every path out.
 * @param input The wait call.
 * @returns What happened, and the cursor to resume from.
 */
async function waitForDynamicThreads(input: WaitInput): Promise<WaitProjection> {
	assertWaitArguments(input.threadIds, input.timeoutMs);
	assertWaitCall(input.call);
	const requestedWireIds = sortedUnique(input.threadIds);
	const cursor = unwrapDynamicCursor(input.cursor, {
		child: input.caller.childId,
		epoch: input.caller.epoch,
		method: "wait_threads",
		direction: "event",
		query: waitQuery(requestedWireIds),
	});
	const targets = await resolveWaitTargets(input, requestedWireIds);
	const owner = ownerFor(input.caller, input.call, targets.identityIds);
	await claimWaitOwnership(input, owner, targets);
	let released = false;
	/**
	 * Release the owner the first time this is reached, so no path out releases it twice.
	 * @param cause Why the owner is being released.
	 */
	const releaseOnce = async (cause: ReleaseCause): Promise<void> => {
		if (released) {
			return;
		}
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
		validateEvent(event, cursor.sequence, new Set(requestedWireIds), targets.byWireId);
		await releaseOnce("settle");
		return waitProjection(input, event, requestedWireIds, cursor.cursor);
	} catch (error) {
		const code = errorCode(error);
		if (CHILD_GONE_CODES.has(code ?? "")) {
			released = true;
			return await childGoneRefusal(input, error);
		}
		await releaseOnce(releaseCauseFor(code));
		throw dynamicError(
			"invalid_call",
			"The wait call did not remain active until settlement.",
			error,
		);
	}
}

/** The child a wait belongs to. */
type DynamicWaitChild = ChildId;

export { type WaitProjection, waitForDynamicThreads, type DynamicWaitChild };
