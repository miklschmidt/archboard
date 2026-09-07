import type { DynamicToolCallResponse } from "@/runtime/codex-thread-tools";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import {
	type CodexDynamicToolsOptions,
	type DynamicFatalLifecycleFault,
	type DynamicMutationQuarantineIdentity,
	type DynamicMutationQuarantineInspection,
	type DynamicMutationTerminalProof,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import {
	createOrdinaryWireOwners,
	deferred,
	DYNAMIC_QUARANTINE_WIRE_CAP,
	type DispatchCandidate,
	type EpochQuarantineOwner,
	exactPoisonOwner,
	exactShutdownOwner,
	exactTeardownProof,
	logicalKey,
	requestEpochKey,
	requestWireKey,
	type QuarantineLogicalOwner,
	type QuarantineWireOwner,
} from "@/runtime/codex-dynamic-tools/lib/quarantine-support";
import { createQuarantineDispatch } from "@/runtime/codex-dynamic-tools/lib/quarantine-dispatch";
import {
	beyondRecovery,
	exactChildExit,
	inspectQuarantines,
	retireLogicalOwners,
	pendingWire,
	quarantineError,
	type DynamicQuarantineDispatcher,
	type LogicalRunOwner,
} from "@/runtime/codex-dynamic-tools/lib/quarantine-owners";

/** Why an epoch is being torn down fail-closed. */
type ShutdownReason =
	| "poison_acquisition_failed"
	| "wire_capacity_exceeded"
	| "response_write_failed";

/**
 * The one boundary every dynamic reverse request passes through, so that a mutation whose
 * terminality cannot be established never simply disappears: its epoch is poisoned, its
 * response is held, and every later call on that epoch is either joined to it or blocked until
 * the epoch either recovers and delivers what it owes or is torn down fail-closed.
 * @param options The dynamic tools options.
 * @returns The dispatcher.
 */
function createDynamicQuarantineDispatcher(
	options: CodexDynamicToolsOptions,
): DynamicQuarantineDispatcher {
	let disposed = false;
	const quarantines = new Map<string, EpochQuarantineOwner>();
	const ordinaryWires = createOrdinaryWireOwners();
	const logicalRuns = new Map<string, LogicalRunOwner>();

	/**
	 * Record that an epoch has gone fatal and tell the lifecycle, keeping local ownership even
	 * when the lifecycle cannot be told.
	 * @param quarantine The quarantined epoch.
	 * @param reason Why it went fatal.
	 * @param message Human-readable explanation.
	 * @param cause The underlying thrown value.
	 */
	const reportFatal = (
		quarantine: EpochQuarantineOwner,
		reason: DynamicFatalLifecycleFault["reason"],
		message: string,
		cause: unknown,
	): void => {
		quarantine.state = "fatal";
		try {
			options.lifecycle.reportFatalLifecycleFault(
				Object.freeze({
					child: quarantine.child,
					epoch: quarantine.epoch,
					reason,
					message,
					cause,
				}),
			);
		} catch {
			/* Local fatal ownership remains authoritative when reporting fails. */
		}
	};

	/**
	 * Drop a quarantined epoch without delivering what it was holding, rejecting every call that
	 * was waiting on it. This is what a fail-closed teardown or a child exit leaves behind.
	 * @param quarantine The quarantined epoch.
	 * @param error What every waiting call is rejected with.
	 */
	const clearWithoutResponses = (quarantine: EpochQuarantineOwner, error: unknown): void => {
		if (quarantines.get(quarantine.key) === quarantine) {
			quarantines.delete(quarantine.key);
		}
		quarantine.active = false;
		for (const owner of quarantine.logicalOwners.values()) {
			logicalRuns.delete(owner.key);
		}
		for (const wire of quarantine.wireOwners.values()) {
			if (wire.settled) {
				continue;
			}
			wire.settled = true;
			wire.deferred.reject(error);
		}
		quarantine.overflowDeferred?.reject(error);
		quarantine.overflowDeferred = null;
	};

	/**
	 * Tear an epoch down fail-closed, because nothing it is holding can be delivered safely any
	 * more. The epoch goes fatal if ownership of the shutdown cannot be taken, or if the teardown
	 * does not prove the child's session and transport actually closed.
	 * @param quarantine The quarantined epoch.
	 * @param reason Why the shutdown is being started.
	 * @param cause The underlying thrown value.
	 */
	const startShutdown = (
		quarantine: EpochQuarantineOwner,
		reason: ShutdownReason,
		cause: unknown,
	): void => {
		if (quarantine.shutdownStarted || quarantine.state === "fatal") {
			return;
		}
		quarantine.shutdownStarted = true;
		quarantine.state = "shutdown_pending";
		let owner;
		try {
			owner = exactShutdownOwner(
				options.lifecycle.failClosedShutdownEpoch({
					child: quarantine.child,
					epoch: quarantine.epoch,
					reason,
				}),
				quarantine,
			);
		} catch (error) {
			reportFatal(
				quarantine,
				reason,
				"Fail-closed shutdown ownership could not be acquired for the quarantined epoch.",
				{ cause, error },
			);
			return;
		}
		void owner.teardown.then(
			(proof) => settledTeardown(quarantine, reason, cause, proof),
			(error) => {
				reportFatal(
					quarantine,
					reason,
					"Fail-closed shutdown did not prove exact session and transport teardown.",
					error,
				);
				return undefined;
			},
		);
	};

	/**
	 * Act on the teardown proof a fail-closed shutdown returned: clear the epoch when the proof
	 * holds, and go fatal when it does not.
	 * @param quarantine The quarantined epoch.
	 * @param reason Why the shutdown was started.
	 * @param cause The underlying thrown value.
	 * @param proof What the teardown returned.
	 * @returns Nothing.
	 */
	const settledTeardown = (
		quarantine: EpochQuarantineOwner,
		reason: ShutdownReason,
		cause: unknown,
		proof: Parameters<typeof exactTeardownProof>[0],
	): undefined => {
		if (!exactTeardownProof(proof, quarantine)) {
			reportFatal(
				quarantine,
				reason,
				"Fail-closed shutdown returned invalid exact teardown proof.",
				proof,
			);
			return undefined;
		}
		clearWithoutResponses(
			quarantine,
			quarantineError("The exact child session and transport closed fail-closed.", cause),
		);
		return undefined;
	};

	/**
	 * Write out everything a recovered epoch was holding, one response at a time. The first write
	 * that fails stops the rest and tears the epoch down fail-closed, because a partly delivered
	 * recovery is worse than none.
	 * @param quarantine The quarantined epoch.
	 */
	const writeRecoveredWires = async (quarantine: EpochQuarantineOwner): Promise<void> => {
		for (const wire of quarantine.wireOwners.values()) {
			if (wire.settled || wire.writeAttempted) {
				continue;
			}
			wire.writeAttempted = true;
			try {
				// oxlint-disable-next-line eslint/no-await-in-loop -- the held responses are written to the child's stdio in order; concurrent writes would interleave frames
				await options.transport.respond(wire.request, "codex-dynamic-tools", {
					result: wire.response,
				});
			} catch (error) {
				startShutdown(quarantine, "response_write_failed", error);
				return;
			}
			wire.settled = true;
			wire.deferred.resolve(wire.response);
		}
		quarantine.active = false;
		quarantines.delete(quarantine.key);
	};

	/**
	 * Whether an epoch is one this dispatcher is still holding and can still act on.
	 * @param quarantine The quarantined epoch.
	 * @returns Whether the epoch is live here.
	 */
	const stillOwned = (quarantine: EpochQuarantineOwner): boolean => {
		if (disposed || !quarantine.active) {
			return false;
		}
		return quarantines.get(quarantine.key) === quarantine;
	};

	/**
	 * Refuse to finish a quarantine this dispatcher no longer holds, or one whose only way out is
	 * a fail-closed teardown.
	 * @param quarantine The quarantined epoch.
	 */
	const assertRecoverable = (quarantine: EpochQuarantineOwner): void => {
		if (!stillOwned(quarantine)) {
			throw quarantineError("The dynamic mutation quarantine is no longer active.");
		}
		if (beyondRecovery(quarantine.state)) {
			throw quarantineError("The dynamic mutation quarantine requires fail-closed teardown.");
		}
	};

	/**
	 * Try to finish a quarantine: retire what the epoch still owes, and if nothing is left
	 * unresolved, deliver the responses it was holding. Anything that fails leaves the epoch
	 * poisoned rather than pretending the mutation was accounted for.
	 * @param quarantine The quarantined epoch.
	 * @returns The proof that the epoch's mutations are terminal.
	 */
	const completeQuarantine = async (
		quarantine: EpochQuarantineOwner,
	): Promise<DynamicMutationTerminalProof> => {
		assertRecoverable(quarantine);
		quarantine.state = "terminalizing";
		const { firstError, unresolved } = retireLogicalOwners(quarantine);
		if (firstError !== null || unresolved !== 0) {
			quarantine.state = "poisoned";
			throw firstError instanceof Error
				? firstError
				: quarantineError("The poisoned epoch still owns unresolved operation identities.");
		}
		await writeRecoveredWires(quarantine);
		if (beyondRecovery(quarantine.state)) {
			throw quarantineError("A recovered response could not be delivered safely.");
		}
		return Object.freeze({ terminal: true, unresolvedOperationCount: 0 });
	};

	/**
	 * Act on the child-exit proof a poisoned epoch's owner returned: an epoch whose child exited
	 * while it was still holding a response cannot deliver it, so it is cleared.
	 * @param quarantine The quarantined epoch.
	 * @param exit What the owner returned.
	 * @returns Nothing.
	 */
	const settledChildExit = (quarantine: EpochQuarantineOwner, exit: unknown): undefined => {
		if (!exactChildExit(exit, quarantine)) {
			reportFatal(
				quarantine,
				"invalid_child_exit_proof",
				"Mutation quarantine received invalid exact child-exit proof.",
				exit,
			);
			return undefined;
		}
		if (!quarantine.active) {
			for (const logical of quarantine.logicalOwners.values()) {
				logicalRuns.delete(logical.key);
			}
			return undefined;
		}
		clearWithoutResponses(
			quarantine,
			quarantineError("The exact child epoch exited while its response was quarantined."),
		);
		return undefined;
	};

	/**
	 * Poison the epoch a mutation could not be accounted for in, taking ownership of its recovery
	 * so nothing else can execute on it until it either recovers or is torn down.
	 * @param quarantine The quarantined epoch.
	 * @param identity The mutation that could not be accounted for.
	 */
	const poison = (
		quarantine: EpochQuarantineOwner,
		identity: DynamicMutationQuarantineIdentity,
	): void => {
		let owner;
		try {
			owner = exactPoisonOwner(
				options.lifecycle.poisonEpochAndOwnMutationQuarantine({
					identity,
					/**
					 * Try again to finish the quarantine, which is how the lifecycle asks the boundary
					 * whether the epoch can now deliver what it owes.
					 * @returns The proof that the epoch's mutations are terminal.
					 */
					retryTerminalization: (): Promise<DynamicMutationTerminalProof> =>
						completeQuarantine(quarantine),
				}),
				identity,
			);
			quarantine.state = "poisoned";
		} catch (error) {
			startShutdown(quarantine, "poison_acquisition_failed", error);
			return;
		}
		void owner.childExit.then(
			(exit) => settledChildExit(quarantine, exit),
			(error) => {
				if (quarantine.active) {
					reportFatal(
						quarantine,
						"invalid_child_exit_proof",
						"Mutation quarantine child-exit ownership rejected without proof.",
						error,
					);
				}
				return undefined;
			},
		);
	};

	/**
	 * Refuse to hold any more of an epoch's reverse requests, because it is already holding as
	 * many as the transport's reviewed capacity allows. The epoch is torn down fail-closed and
	 * every waiting call settles on that teardown.
	 * @param quarantine The quarantined epoch.
	 * @returns The response every overflowing call gets.
	 */
	const overflowWire = (quarantine: EpochQuarantineOwner): Promise<DynamicToolCallResponse> => {
		quarantine.overflowed = true;
		quarantine.overflowDeferred ??= deferred<DynamicToolCallResponse>();
		startShutdown(
			quarantine,
			"wire_capacity_exceeded",
			new Error("The quarantined epoch exceeded the accepted reverse-request capacity."),
		);
		return quarantine.overflowDeferred.promise;
	};

	/**
	 * Hold one reverse request against a quarantined epoch, joining the owner already holding it
	 * when there is one, and tearing the epoch down when it is holding more than the reviewed
	 * reverse-request capacity allows.
	 * @param quarantine The quarantined epoch.
	 * @param request The server request.
	 * @param response The response it will get once the epoch recovers.
	 * @param kind Whether the request carries a logical mutation or is simply blocked.
	 * @param ownerKey The logical owner it belongs to, when it belongs to one.
	 * @returns The response, once the epoch settles.
	 */
	const admitWire = (
		quarantine: EpochQuarantineOwner,
		request: DynamicServerRequest,
		response: DynamicToolCallResponse,
		kind: QuarantineWireOwner["kind"],
		ownerKey: string | null,
	): Promise<DynamicToolCallResponse> => {
		const wireKey = requestWireKey(request);
		if (wireKey === null) {
			return Promise.reject(new Error("Missing dynamic wire identity."));
		}
		const existing = quarantine.wireOwners.get(wireKey);
		if (existing !== undefined) {
			return existing.deferred.promise;
		}
		if (quarantine.wireOwners.size >= DYNAMIC_QUARANTINE_WIRE_CAP) {
			return overflowWire(quarantine);
		}
		const wire = pendingWire(request, response, kind, ownerKey);
		quarantine.wireOwners.set(wire.key, wire);
		if (ownerKey !== null) {
			quarantine.logicalOwners.get(ownerKey)?.wireKeys.add(wire.key);
		}
		return wire.deferred.promise;
	};

	/**
	 * Put a mutation whose terminality could not be established into quarantine, creating the
	 * epoch's owner if this is the first such mutation on it, and poisoning the epoch.
	 * @param identity The mutation.
	 * @param request The server request.
	 * @param candidate What the dispatch produced.
	 * @returns The response, once the epoch settles.
	 */
	const enterQuarantine = (
		identity: DynamicMutationQuarantineIdentity,
		request: DynamicServerRequest,
		candidate: DispatchCandidate,
	): Promise<DynamicToolCallResponse> => {
		if (candidate.settlement === null) {
			throw new Error("An unresolved dynamic operation has no settlement owner.");
		}
		const ownerKey = logicalKey(identity);
		const key = requestEpochKey(request);
		if (key === null) {
			throw new Error("A valid mutation identity has no epoch key.");
		}
		let quarantine = quarantines.get(key);
		if (quarantine === undefined) {
			quarantine = {
				key,
				child: identity.child,
				epoch: identity.epoch,
				logicalOwners: new Map(),
				wireOwners: new Map(),
				state: "poisoning",
				overflowed: false,
				active: true,
				shutdownStarted: false,
				overflowDeferred: null,
			};
			quarantines.set(key, quarantine);
		}
		const logical: QuarantineLogicalOwner = {
			key: ownerKey,
			identity,
			response: candidate.response,
			settlement: candidate.settlement,
			wireKeys: new Set(),
		};
		quarantine.logicalOwners.set(ownerKey, logical);
		const result = admitWire(quarantine, request, logical.response, "logical", ownerKey);
		if (quarantine.state === "poisoning") {
			poison(quarantine, identity);
		}
		return result;
	};

	const dispatch = createQuarantineDispatch({
		options,
		quarantines,
		ordinaryWires,
		logicalRuns,
		/**
		 * Whether the boundary has been disposed.
		 * @returns Whether it is disposed.
		 */
		isDisposed: (): boolean => disposed,
		admitWire,
		enterQuarantine,
	});

	/**
	 * What the boundary is holding right now.
	 * @returns The inspection.
	 */
	const inspect = (): DynamicMutationQuarantineInspection =>
		inspectQuarantines(quarantines, ordinaryWires);

	/** Drop everything the boundary is holding, rejecting every call still waiting on it. */
	const dispose = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		for (const quarantine of quarantines.values()) {
			clearWithoutResponses(
				quarantine,
				quarantineError("Dynamic tools were disposed while mutation terminality was unresolved."),
			);
		}
		quarantines.clear();
		ordinaryWires.clear();
		logicalRuns.clear();
	};

	return Object.freeze({ dispatch, inspect, dispose });
}

export { type DynamicQuarantineDispatcher, createDynamicQuarantineDispatcher };
