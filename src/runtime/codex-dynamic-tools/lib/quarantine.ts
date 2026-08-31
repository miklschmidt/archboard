import type { DynamicToolCallResponse } from "../../codex-thread-tools/index.js";
import type { DynamicServerRequest } from "../../codex-transport/server-requests.js";
import {
	CodexDynamicEpochQuarantinedError,
	CodexDynamicOperationTerminalizationError,
	type CodexDynamicToolsOptions,
	type DynamicFatalLifecycleFault,
	type DynamicMutationQuarantineIdentity,
	type DynamicMutationQuarantineInspection,
	type DynamicMutationTerminalProof,
} from "./contract.js";
import {
	blockedDynamicResponse,
	createOrdinaryWireOwners,
	deferred,
	DYNAMIC_QUARANTINE_WIRE_CAP,
	type DispatchCandidate,
	type EpochQuarantineOwner,
	exactPoisonOwner,
	exactShutdownOwner,
	exactTeardownProof,
	logicalKey,
	mutationIdentity,
	requestEpochKey,
	requestWireKey,
	type QuarantineLogicalOwner,
	type QuarantineWireOwner,
} from "./quarantine-support.js";

export interface DynamicQuarantineDispatcher {
	readonly dispatch: (
		request: DynamicServerRequest,
		run: () => Promise<DispatchCandidate>,
	) => Promise<DynamicToolCallResponse>;
	readonly inspect: () => DynamicMutationQuarantineInspection;
	readonly dispose: () => void;
}

function exactChildExit(value: unknown, quarantine: EpochQuarantineOwner): boolean {
	return (
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		"child" in value &&
		value.child === quarantine.child &&
		"epoch" in value &&
		value.epoch === quarantine.epoch &&
		"exited" in value &&
		value.exited === true &&
		Object.keys(value).toSorted().join(",") === "child,epoch,exited"
	);
}

function quarantineError(message: string, cause?: unknown): CodexDynamicEpochQuarantinedError {
	return new CodexDynamicEpochQuarantinedError(message, cause);
}

function pendingWire(
	request: DynamicServerRequest,
	response: DynamicToolCallResponse,
	kind: QuarantineWireOwner["kind"],
	ownerKey: string | null,
): QuarantineWireOwner {
	const key = requestWireKey(request);
	if (key === null) throw new Error("A dynamic request has no exact wire identity.");
	return {
		key,
		requestId: request.requestId,
		request,
		response,
		kind,
		logicalKey: ownerKey,
		deferred: deferred<DynamicToolCallResponse>(),
		writeAttempted: false,
		settled: false,
	};
}

interface LogicalRunSignal {
	readonly response: DynamicToolCallResponse;
	readonly quarantine: EpochQuarantineOwner | null;
}

interface LogicalRunOwner {
	readonly signal: ReturnType<typeof deferred<LogicalRunSignal>>;
	retained: boolean;
}

export function createDynamicQuarantineDispatcher(
	options: CodexDynamicToolsOptions,
): DynamicQuarantineDispatcher {
	let disposed = false;
	const quarantines = new Map<string, EpochQuarantineOwner>();
	const ordinaryWires = createOrdinaryWireOwners();
	const logicalRuns = new Map<string, LogicalRunOwner>();

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

	const clearWithoutResponses = (quarantine: EpochQuarantineOwner, error: unknown): void => {
		if (quarantines.get(quarantine.key) === quarantine) quarantines.delete(quarantine.key);
		quarantine.active = false;
		for (const owner of quarantine.logicalOwners.values()) logicalRuns.delete(owner.key);
		for (const wire of quarantine.wireOwners.values()) {
			if (wire.settled) continue;
			wire.settled = true;
			wire.deferred.reject(error);
		}
		quarantine.overflowDeferred?.reject(error);
		quarantine.overflowDeferred = null;
	};

	const startShutdown = (
		quarantine: EpochQuarantineOwner,
		reason: "poison_acquisition_failed" | "wire_capacity_exceeded" | "response_write_failed",
		cause: unknown,
	): void => {
		if (quarantine.shutdownStarted || quarantine.state === "fatal") return;
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
			(proof) => {
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
			},
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

	const writeRecoveredWires = async (quarantine: EpochQuarantineOwner): Promise<void> => {
		for (const wire of quarantine.wireOwners.values()) {
			if (wire.settled || wire.writeAttempted) continue;
			wire.writeAttempted = true;
			try {
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

	const completeQuarantine = async (
		quarantine: EpochQuarantineOwner,
	): Promise<DynamicMutationTerminalProof> => {
		if (disposed || quarantines.get(quarantine.key) !== quarantine || !quarantine.active)
			throw quarantineError("The dynamic mutation quarantine is no longer active.");
		const recoveredState = quarantine.state as string;
		if (recoveredState === "shutdown_pending" || recoveredState === "fatal")
			throw quarantineError("The dynamic mutation quarantine requires fail-closed teardown.");
		quarantine.state = "terminalizing";
		let firstError: unknown = null;
		for (const owner of quarantine.logicalOwners.values()) {
			try {
				owner.settlement.retireUnsettled();
			} catch (error) {
				firstError ??= error;
			}
		}
		const unresolved = [...quarantine.logicalOwners.values()].reduce(
			(count, owner) => count + owner.settlement.unresolvedOperationCount(),
			0,
		);
		if (firstError !== null || unresolved !== 0) {
			quarantine.state = "poisoned";
			throw firstError instanceof Error
				? firstError
				: quarantineError("The poisoned epoch still owns unresolved operation identities.");
		}
		await writeRecoveredWires(quarantine);
		const postWriteState = quarantine.state as string;
		if (postWriteState === "shutdown_pending" || postWriteState === "fatal")
			throw quarantineError("A recovered response could not be delivered safely.");
		return Object.freeze({ terminal: true, unresolvedOperationCount: 0 });
	};

	const poison = (
		quarantine: EpochQuarantineOwner,
		identity: DynamicMutationQuarantineIdentity,
	): void => {
		let owner;
		try {
			owner = exactPoisonOwner(
				options.lifecycle.poisonEpochAndOwnMutationQuarantine({
					identity,
					retryTerminalization: () => completeQuarantine(quarantine),
				}),
				identity,
			);
			quarantine.state = "poisoned";
		} catch (error) {
			startShutdown(quarantine, "poison_acquisition_failed", error);
			return;
		}
		void owner.childExit.then(
			(exit) => {
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
					for (const logical of quarantine.logicalOwners.values()) logicalRuns.delete(logical.key);
					return undefined;
				}
				clearWithoutResponses(
					quarantine,
					quarantineError("The exact child epoch exited while its response was quarantined."),
				);
				return undefined;
			},
			(error) => {
				if (quarantine.active)
					reportFatal(
						quarantine,
						"invalid_child_exit_proof",
						"Mutation quarantine child-exit ownership rejected without proof.",
						error,
					);
				return undefined;
			},
		);
	};

	const admitWire = (
		quarantine: EpochQuarantineOwner,
		request: DynamicServerRequest,
		response: DynamicToolCallResponse,
		kind: QuarantineWireOwner["kind"],
		ownerKey: string | null,
	): Promise<DynamicToolCallResponse> => {
		const wireKey = requestWireKey(request);
		if (wireKey === null) return Promise.reject(new Error("Missing dynamic wire identity."));
		const existing = quarantine.wireOwners.get(wireKey);
		if (existing !== undefined) return existing.deferred.promise;
		if (quarantine.wireOwners.size >= DYNAMIC_QUARANTINE_WIRE_CAP) {
			quarantine.overflowed = true;
			quarantine.overflowDeferred ??= deferred<DynamicToolCallResponse>();
			startShutdown(
				quarantine,
				"wire_capacity_exceeded",
				new Error("The quarantined epoch exceeded the accepted reverse-request capacity."),
			);
			return quarantine.overflowDeferred.promise;
		}
		const wire = pendingWire(request, response, kind, ownerKey);
		quarantine.wireOwners.set(wire.key, wire);
		if (ownerKey !== null) quarantine.logicalOwners.get(ownerKey)?.wireKeys.add(wire.key);
		return wire.deferred.promise;
	};

	const enterQuarantine = (
		identity: DynamicMutationQuarantineIdentity,
		request: DynamicServerRequest,
		candidate: DispatchCandidate,
	): Promise<DynamicToolCallResponse> => {
		if (candidate.settlement === null)
			throw new Error("An unresolved dynamic operation has no settlement owner.");
		const ownerKey = logicalKey(identity);
		const key = requestEpochKey(request);
		if (key === null) throw new Error("A valid mutation identity has no epoch key.");
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
		if (quarantine.state === "poisoning") poison(quarantine, identity);
		return result;
	};

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

	const joinLogicalRun = (
		owner: LogicalRunOwner,
		request: DynamicServerRequest,
	): Promise<DynamicToolCallResponse> =>
		owner.signal.promise.then(({ response, quarantine }) => {
			if (quarantine === null || !quarantine.active) return send(request, response);
			return admitWire(quarantine, request, response, "logical", logicalKeyFor(request));
		});

	const logicalKeyFor = (request: DynamicServerRequest): string | null => {
		const identity = mutationIdentity(request, options);
		return identity === null ? null : logicalKey(identity);
	};

	const dispatch = (
		request: DynamicServerRequest,
		run: () => Promise<DispatchCandidate>,
	): Promise<DynamicToolCallResponse> => {
		const wireKey = requestWireKey(request);
		if (wireKey === null)
			return run().then((candidate) => {
				if (candidate.settlement !== null)
					throw quarantineError("A mutation cannot execute without exact wire identity.");
				return send(request, candidate.response);
			});
		const ordinaryExisting = ordinaryWires.get(wireKey);
		if (ordinaryExisting !== undefined) return ordinaryExisting;
		const key = requestEpochKey(request);
		const quarantine = key === null ? undefined : quarantines.get(key);
		if (quarantine?.active) {
			const existing = quarantine.wireOwners.get(wireKey);
			if (existing !== undefined) return existing.deferred.promise;
			if (!options.transport.ownsPendingReverseRequest(request, "codex-dynamic-tools"))
				return Promise.reject(
					quarantineError("The dynamic transport no longer owns this reverse request."),
				);
			const identity = mutationIdentity(request, options);
			const ownerKey = identity === null ? null : logicalKey(identity);
			const logical = ownerKey === null ? undefined : quarantine.logicalOwners.get(ownerKey);
			return admitWire(
				quarantine,
				request,
				logical?.response ?? blockedDynamicResponse(),
				logical === undefined ? "blocked" : "logical",
				logical?.key ?? null,
			);
		}
		if (disposed) return Promise.reject(quarantineError("Dynamic tools are disposed."));
		if (!options.transport.ownsPendingReverseRequest(request, "codex-dynamic-tools"))
			return Promise.reject(
				quarantineError("The dynamic transport no longer owns this reverse request."),
			);

		const execute = (): Promise<DynamicToolCallResponse> => {
			const identity = mutationIdentity(request, options);
			const ownerKey = identity === null ? null : logicalKey(identity);
			if (ownerKey !== null) {
				const existing = logicalRuns.get(ownerKey);
				if (existing !== undefined) return joinLogicalRun(existing, request);
			}
			const runOwner =
				ownerKey === null ? null : { signal: deferred<LogicalRunSignal>(), retained: false };
			if (ownerKey !== null && runOwner !== null) {
				logicalRuns.set(ownerKey, runOwner);
				void runOwner.signal.promise.catch(() => undefined);
			}
			const operation = run().then(async (candidate) => {
				if (candidate.settlement === null) {
					const response = await send(request, candidate.response);
					runOwner?.signal.resolve({ response, quarantine: null });
					return response;
				}
				try {
					candidate.settlement.retireUnsettled();
					const response = await send(request, candidate.response);
					runOwner?.signal.resolve({ response, quarantine: null });
					return response;
				} catch (error) {
					if (!(error instanceof CodexDynamicOperationTerminalizationError) || identity === null)
						throw error;
					const response = enterQuarantine(identity, request, candidate);
					const epochOwner = quarantines.get(requestEpochKey(request) ?? "");
					if (epochOwner === undefined)
						throw new Error("The unresolved mutation has no quarantine.", { cause: error });
					if (runOwner !== null) runOwner.retained = true;
					runOwner?.signal.resolve({ response: candidate.response, quarantine: epochOwner });
					return response;
				}
			});
			return operation.then(
				(response) => {
					if (ownerKey !== null && runOwner !== null && !runOwner.retained)
						logicalRuns.delete(ownerKey);
					return response;
				},
				(error) => {
					runOwner?.signal.reject(error);
					if (ownerKey !== null && runOwner !== null && !runOwner.retained)
						logicalRuns.delete(ownerKey);
					throw error;
				},
			);
		};
		return ordinaryWires.own(wireKey, execute);
	};

	const inspect = (): DynamicMutationQuarantineInspection => {
		const active = [...quarantines.values()].filter((quarantine) => quarantine.active);
		const entries = active.flatMap((quarantine) => {
			const blocked = [...quarantine.wireOwners.values()].filter(
				(wire) => wire.kind === "blocked",
			).length;
			return [...quarantine.logicalOwners.values()].map((owner) =>
				Object.freeze({
					identity: owner.identity,
					state: quarantine.state,
					unresolvedOperationCount: owner.settlement.unresolvedOperationCount(),
					wireCount: owner.wireKeys.size,
					blockedWireCount: blocked,
					overflowed: quarantine.overflowed,
				}),
			);
		});
		return Object.freeze({
			epochCount: active.length,
			callCount: entries.length,
			ordinaryInFlightWireCount: ordinaryWires.size(),
			wireCount: active.reduce((count, owner) => count + owner.wireOwners.size, 0),
			blockedWireCount: active.reduce(
				(count, owner) =>
					count + [...owner.wireOwners.values()].filter((wire) => wire.kind === "blocked").length,
				0,
			),
			fatalEpochCount: active.filter((owner) => owner.state === "fatal").length,
			entries: Object.freeze(entries),
		});
	};

	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		for (const quarantine of quarantines.values())
			clearWithoutResponses(
				quarantine,
				quarantineError("Dynamic tools were disposed while mutation terminality was unresolved."),
			);
		quarantines.clear();
		ordinaryWires.clear();
		logicalRuns.clear();
	};

	return Object.freeze({ dispatch, inspect, dispose });
}
