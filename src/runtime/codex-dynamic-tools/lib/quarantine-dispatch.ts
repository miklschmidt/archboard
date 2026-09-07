import type { DynamicToolCallResponse } from "@/runtime/codex-thread-tools";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import {
	CodexDynamicOperationTerminalizationError,
	type CodexDynamicToolsOptions,
	type DynamicMutationQuarantineIdentity,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import {
	blockedDynamicResponse,
	deferred,
	logicalKey,
	mutationIdentity,
	requestEpochKey,
	requestWireKey,
	type DispatchCandidate,
	type EpochQuarantineOwner,
	type OrdinaryWireOwners,
} from "@/runtime/codex-dynamic-tools/lib/quarantine-support";
import {
	quarantineError,
	type LogicalRunOwner,
	type LogicalRunSignal,
} from "@/runtime/codex-dynamic-tools/lib/quarantine-owners";

/** What the dispatch layer needs from the quarantine boundary that owns it. */
interface QuarantineDispatchDeps {
	readonly options: CodexDynamicToolsOptions;
	readonly quarantines: Map<string, EpochQuarantineOwner>;
	readonly ordinaryWires: OrdinaryWireOwners;
	readonly logicalRuns: Map<string, LogicalRunOwner>;
	readonly isDisposed: () => boolean;
	readonly admitWire: (
		quarantine: EpochQuarantineOwner,
		request: DynamicServerRequest,
		response: DynamicToolCallResponse,
		kind: "logical" | "blocked",
		ownerKey: string | null,
	) => Promise<DynamicToolCallResponse>;
	readonly enterQuarantine: (
		identity: DynamicMutationQuarantineIdentity,
		request: DynamicServerRequest,
		candidate: DispatchCandidate,
	) => Promise<DynamicToolCallResponse>;
}

/**
 * The dispatch half of the quarantine boundary: what happens to one reverse request, given the
 * epochs the boundary is holding and the two things only the boundary itself can do — hold a
 * request against a quarantined epoch, and put a mutation into quarantine.
 * @param deps What the dispatch layer needs from the boundary.
 * @returns The dispatch function.
 */
function createQuarantineDispatch(
	deps: QuarantineDispatchDeps,
): (
	request: DynamicServerRequest,
	run: () => Promise<DispatchCandidate>,
) => Promise<DynamicToolCallResponse> {
	const { options, quarantines, ordinaryWires, logicalRuns, admitWire, enterQuarantine } = deps;

	/**
	 * Write one response to a child that is not quarantined. The response is terminal whether or
	 * not the child is still there to receive it.
	 * @param request The server request.
	 * @param response The response.
	 * @returns The response.
	 */
	const send = async (
		request: DynamicServerRequest,
		response: DynamicToolCallResponse,
	): Promise<DynamicToolCallResponse> => {
		try {
			await options.transport.respond(request, "codex-dynamic-tools", {
				result: response,
			});
		} catch {
			/* The exact response remains terminal when a non-quarantined child disconnects. */
		}
		return response;
	};

	/**
	 * Join a logical mutation already running, so a repeated wire call gets the same answer rather
	 * than executing the mutation a second time.
	 * @param owner The run to join.
	 * @param request The server request.
	 * @returns The response, once the run settles.
	 */
	const joinLogicalRun = (
		owner: LogicalRunOwner,
		request: DynamicServerRequest,
	): Promise<DynamicToolCallResponse> =>
		owner.signal.promise.then(({ response, quarantine }) => {
			if (quarantine === null || !quarantine.active) {
				return send(request, response);
			}
			return admitWire(quarantine, request, response, "logical", logicalKeyFor(request));
		});

	/**
	 * The logical key a request's mutation is owned under, when the request carries one.
	 * @param request The server request.
	 * @returns The key, or null when the request is not a mutation.
	 */
	const logicalKeyFor = (request: DynamicServerRequest): string | null => {
		const identity = mutationIdentity(request, options);
		return identity === null ? null : logicalKey(identity);
	};

	/**
	 * Whether the transport still owns this reverse request, which is what makes answering it
	 * meaningful at all.
	 * @param request The server request.
	 * @returns Whether the transport still owns it.
	 */
	const stillOwnedByTransport = (request: DynamicServerRequest): boolean =>
		options.transport.ownsPendingReverseRequest(request, "codex-dynamic-tools");

	/**
	 * Answer a request that arrived while its epoch is quarantined: join the owner already
	 * holding it, hand back the response its own mutation is waiting to deliver, or block it
	 * behind the epoch's recovery.
	 * @param quarantine The quarantined epoch.
	 * @param request The server request.
	 * @param wireKey The request's wire key.
	 * @returns The response, once the epoch settles.
	 */
	const dispatchQuarantined = (
		quarantine: EpochQuarantineOwner,
		request: DynamicServerRequest,
		wireKey: string,
	): Promise<DynamicToolCallResponse> => {
		const existing = quarantine.wireOwners.get(wireKey);
		if (existing !== undefined) {
			return existing.deferred.promise;
		}
		if (!stillOwnedByTransport(request)) {
			return Promise.reject(
				quarantineError("The dynamic transport no longer owns this reverse request."),
			);
		}
		return holdAgainstEpoch(quarantine, request);
	};

	/**
	 * Hold one request against a quarantined epoch under the response it is owed: the one its own
	 * mutation is waiting to deliver, or a refusal saying the epoch cannot take another call.
	 * @param quarantine The quarantined epoch.
	 * @param request The server request.
	 * @returns The response, once the epoch settles.
	 */
	const holdAgainstEpoch = (
		quarantine: EpochQuarantineOwner,
		request: DynamicServerRequest,
	): Promise<DynamicToolCallResponse> => {
		const ownerKey = logicalKeyFor(request);
		const logical = ownerKey === null ? undefined : quarantine.logicalOwners.get(ownerKey);
		if (logical === undefined) {
			return admitWire(quarantine, request, blockedDynamicResponse(), "blocked", null);
		}
		return admitWire(quarantine, request, logical.response, "logical", logical.key);
	};

	/**
	 * Answer a request that carries no wire identity. Nothing that mutates may execute without
	 * one, because a mutation with no wire identity could not be held if it needed quarantining.
	 * @param request The server request.
	 * @param run What produces the response.
	 * @returns The response.
	 */
	const dispatchWithoutWireIdentity = (
		request: DynamicServerRequest,
		run: () => Promise<DispatchCandidate>,
	): Promise<DynamicToolCallResponse> =>
		run().then((candidate) => {
			if (candidate.settlement !== null) {
				throw quarantineError("A mutation cannot execute without exact wire identity.");
			}
			return send(request, candidate.response);
		});

	/**
	 * Register a logical run so repeated wire calls for one mutation join it rather than running
	 * it again.
	 * @param ownerKey The logical key, when the request carries one.
	 * @returns The run owner, or null when the request is not a mutation.
	 */
	const registerLogicalRun = (ownerKey: string | null): LogicalRunOwner | null => {
		if (ownerKey === null) {
			return null;
		}
		const runOwner: LogicalRunOwner = { signal: deferred<LogicalRunSignal>(), retained: false };
		logicalRuns.set(ownerKey, runOwner);
		void runOwner.signal.promise.catch(() => undefined);
		return runOwner;
	};

	/**
	 * Settle a mutation whose terminality could not be established: put it into quarantine and
	 * tell everyone joined to the run which epoch is now holding it.
	 * @param identity The mutation.
	 * @param request The server request.
	 * @param candidate What the dispatch produced.
	 * @param runOwner The logical run, when there is one.
	 * @param error What terminalization threw.
	 * @returns The response, once the epoch settles.
	 */
	const quarantineCandidate = (
		identity: DynamicMutationQuarantineIdentity,
		request: DynamicServerRequest,
		candidate: DispatchCandidate,
		runOwner: LogicalRunOwner | null,
		error: unknown,
	): Promise<DynamicToolCallResponse> => {
		const response = enterQuarantine(identity, request, candidate);
		const epochOwner = quarantines.get(requestEpochKey(request) ?? "");
		if (epochOwner === undefined) {
			throw new Error("The unresolved mutation has no quarantine.", { cause: error });
		}
		if (runOwner !== null) {
			runOwner.retained = true;
		}
		runOwner?.signal.resolve({ response: candidate.response, quarantine: epochOwner });
		return response;
	};

	/**
	 * Deliver what one dispatch produced: retire the mutation's operation identities and write
	 * the response, or quarantine the epoch when terminality cannot be established.
	 * @param candidate What the dispatch produced.
	 * @param request The server request.
	 * @param identity The mutation, when the request carries one.
	 * @param runOwner The logical run, when there is one.
	 * @returns The response.
	 */
	const settleCandidate = async (
		candidate: DispatchCandidate,
		request: DynamicServerRequest,
		identity: DynamicMutationQuarantineIdentity | null,
		runOwner: LogicalRunOwner | null,
	): Promise<DynamicToolCallResponse> => {
		const settlement = candidate.settlement;
		if (settlement === null) {
			return await deliver(candidate, request, runOwner);
		}
		try {
			settlement.retireUnsettled();
			return await deliver(candidate, request, runOwner);
		} catch (error) {
			if (!(error instanceof CodexDynamicOperationTerminalizationError) || identity === null) {
				throw error;
			}
			return await quarantineCandidate(identity, request, candidate, runOwner, error);
		}
	};

	/**
	 * Write one dispatch's response out and tell everyone joined to the run that nothing is
	 * quarantined.
	 * @param candidate What the dispatch produced.
	 * @param request The server request.
	 * @param runOwner The logical run, when there is one.
	 * @returns The response.
	 */
	const deliver = async (
		candidate: DispatchCandidate,
		request: DynamicServerRequest,
		runOwner: LogicalRunOwner | null,
	): Promise<DynamicToolCallResponse> => {
		const response = await send(request, candidate.response);
		runOwner?.signal.resolve({ response, quarantine: null });
		return response;
	};

	/**
	 * Release a logical run once it has settled, unless a quarantine is still holding it.
	 * @param ownerKey The logical key, when the request carries one.
	 * @param runOwner The logical run, when there is one.
	 */
	const releaseLogicalRun = (ownerKey: string | null, runOwner: LogicalRunOwner | null): void => {
		if (ownerKey !== null && runOwner !== null && !runOwner.retained) {
			logicalRuns.delete(ownerKey);
		}
	};

	/**
	 * Run one dispatch that is not quarantined, joining the logical run already in flight for the
	 * same mutation when there is one.
	 * @param request The server request.
	 * @param run What produces the response.
	 * @returns The response.
	 */
	const executeDispatch = (
		request: DynamicServerRequest,
		run: () => Promise<DispatchCandidate>,
	): Promise<DynamicToolCallResponse> => {
		const identity = mutationIdentity(request, options);
		const ownerKey = identity === null ? null : logicalKey(identity);
		const joined = ownerKey === null ? undefined : logicalRuns.get(ownerKey);
		if (joined !== undefined) {
			return joinLogicalRun(joined, request);
		}
		const runOwner = registerLogicalRun(ownerKey);
		const operation = run().then((candidate) =>
			settleCandidate(candidate, request, identity, runOwner),
		);
		return operation.then(
			(response) => {
				releaseLogicalRun(ownerKey, runOwner);
				return response;
			},
			(error) => {
				runOwner?.signal.reject(error);
				releaseLogicalRun(ownerKey, runOwner);
				throw error;
			},
		);
	};

	/**
	 * The quarantined epoch a request belongs to, when its epoch is one and is still active.
	 * @param request The server request.
	 * @returns The epoch, or null.
	 */
	const activeQuarantineFor = (request: DynamicServerRequest): EpochQuarantineOwner | null => {
		const key = requestEpochKey(request);
		const quarantine = key === null ? undefined : quarantines.get(key);
		if (quarantine === undefined || !quarantine.active) {
			return null;
		}
		return quarantine;
	};

	/**
	 * Answer one dynamic reverse request. A request whose epoch is quarantined is held or blocked
	 * rather than executed; anything else runs once per wire identity.
	 * @param request The server request.
	 * @param run What produces the response.
	 * @returns The response.
	 */
	const dispatch = (
		request: DynamicServerRequest,
		run: () => Promise<DispatchCandidate>,
	): Promise<DynamicToolCallResponse> => {
		const wireKey = requestWireKey(request);
		if (wireKey === null) {
			return dispatchWithoutWireIdentity(request, run);
		}
		const ordinaryExisting = ordinaryWires.get(wireKey);
		if (ordinaryExisting !== undefined) {
			return ordinaryExisting;
		}
		const quarantine = activeQuarantineFor(request);
		if (quarantine !== null) {
			return dispatchQuarantined(quarantine, request, wireKey);
		}
		if (deps.isDisposed()) {
			return Promise.reject(quarantineError("Dynamic tools are disposed."));
		}
		if (!stillOwnedByTransport(request)) {
			return Promise.reject(
				quarantineError("The dynamic transport no longer owns this reverse request."),
			);
		}
		return ordinaryWires.own(wireKey, () => executeDispatch(request, run));
	};
	return dispatch;
}

export { createQuarantineDispatch, type QuarantineDispatchDeps };
