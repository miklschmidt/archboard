import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
	type DynamicToolCallResponse,
} from "../../codex-thread-tools/index.js";
import type { DynamicServerRequest } from "../../codex-transport/server-requests.js";
import {
	CodexDynamicEpochQuarantinedError,
	CodexDynamicOperationTerminalizationError,
	type CodexDynamicToolsOptions,
	type DynamicMutationQuarantineIdentity,
	type DynamicMutationQuarantineInspection,
	type DynamicMutationQuarantineOwner,
	type DynamicMutationQuarantineState,
	type DynamicMutationToolName,
	type DynamicMutationTerminalProof,
} from "./contract.js";
import type { DynamicOperationSettlement } from "./effects.js";
import { validateDynamicCall } from "./classification.js";

function isMutationTool(value: string): value is DynamicMutationToolName {
	return value === "create_thread" || value === "fork_thread" || value === "send_message_to_thread";
}

interface DispatchCandidate {
	readonly response: DynamicToolCallResponse;
	readonly settlement: DynamicOperationSettlement | null;
}

interface QuarantineEntry {
	readonly key: string;
	readonly identity: DynamicMutationQuarantineIdentity;
	readonly request: DynamicServerRequest;
	readonly response: DynamicToolCallResponse;
	readonly settlement: DynamicOperationSettlement;
	readonly promise: Promise<DynamicToolCallResponse>;
	readonly resolve: (response: DynamicToolCallResponse) => void;
	readonly reject: (error: unknown) => void;
	settled: boolean;
}

interface EpochQuarantine {
	readonly key: string;
	readonly child: DynamicMutationQuarantineIdentity["child"];
	readonly epoch: DynamicMutationQuarantineIdentity["epoch"];
	readonly entries: Map<string, QuarantineEntry>;
	state: DynamicMutationQuarantineState;
}

export interface DynamicQuarantineDispatcher {
	readonly dispatch: (
		request: DynamicServerRequest,
		run: () => Promise<DispatchCandidate>,
	) => Promise<DynamicToolCallResponse>;
	readonly inspect: () => DynamicMutationQuarantineInspection;
	readonly dispose: () => void;
}

function mutationIdentity(
	request: DynamicServerRequest,
	options: CodexDynamicToolsOptions,
): DynamicMutationQuarantineIdentity | null {
	let tool: DynamicMutationToolName;
	try {
		const call = validateDynamicCall(request, options);
		if (!isMutationTool(call.name)) return null;
		tool = call.name;
	} catch {
		return null;
	}
	return Object.freeze({
		child: request.logicalCall.child,
		epoch: request.logicalCall.epoch,
		threadId: request.logicalCall.threadId,
		turnId: request.logicalCall.turnId,
		callId: request.logicalCall.callId,
		namespace: ARCHBOARD_APP_NAMESPACE.name,
		tool,
		manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
	});
}

function identityKey(identity: DynamicMutationQuarantineIdentity): string {
	return JSON.stringify([
		identity.child,
		identity.epoch,
		identity.threadId,
		identity.turnId,
		identity.callId,
		identity.namespace,
		identity.tool,
		identity.manifestHash,
	]);
}

function epochKey(child: unknown, epoch: unknown): string | null {
	return typeof child === "string" && typeof epoch === "string"
		? JSON.stringify([child, epoch])
		: null;
}

function requestEpochKey(value: unknown): string | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	if (!("child" in value) || !("epoch" in value)) return null;
	return epochKey(value.child, value.epoch);
}

function exactOwner(
	value: DynamicMutationQuarantineOwner,
	identity: DynamicMutationQuarantineIdentity,
): DynamicMutationQuarantineOwner {
	if (
		value === null ||
		typeof value !== "object" ||
		value.child !== identity.child ||
		value.epoch !== identity.epoch ||
		typeof value.poisoned !== "boolean" ||
		!value.poisoned ||
		!(value.childExit instanceof Promise) ||
		Object.keys(value).toSorted().join(",") !== "child,childExit,epoch,poisoned"
	)
		throw new Error("The lifecycle port did not return the exact poisoned epoch owner.");
	return value;
}

function pendingEntry(
	key: string,
	identity: DynamicMutationQuarantineIdentity,
	request: DynamicServerRequest,
	candidate: DispatchCandidate,
): QuarantineEntry {
	if (candidate.settlement === null)
		throw new Error("An unresolved dynamic operation has no settlement owner.");
	let resolve!: (response: DynamicToolCallResponse) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<DynamicToolCallResponse>((accept, decline) => {
		resolve = accept;
		reject = decline;
	});
	return {
		key,
		identity,
		request,
		response: candidate.response,
		settlement: candidate.settlement,
		promise,
		resolve,
		reject,
		settled: false,
	};
}

export function createDynamicQuarantineDispatcher(
	options: CodexDynamicToolsOptions,
): DynamicQuarantineDispatcher {
	let disposed = false;
	const logicalOwners = new Map<string, Promise<DynamicToolCallResponse>>();
	const retainedLogicalOwners = new Set<string>();
	const quarantines = new Map<string, EpochQuarantine>();

	const removeQuarantine = (quarantine: EpochQuarantine, clearLogicalOwners: boolean): void => {
		if (quarantines.get(quarantine.key) === quarantine) quarantines.delete(quarantine.key);
		if (!clearLogicalOwners) return;
		for (const entry of quarantine.entries.values()) {
			retainedLogicalOwners.delete(entry.key);
			logicalOwners.delete(entry.key);
		}
	};

	const rejectQuarantine = (quarantine: EpochQuarantine, error: unknown): void => {
		removeQuarantine(quarantine, true);
		for (const entry of quarantine.entries.values()) {
			if (entry.settled) continue;
			entry.settled = true;
			entry.reject(error);
		}
	};

	const completeQuarantine = async (quarantine: EpochQuarantine): Promise<void> => {
		if (disposed || quarantines.get(quarantine.key) !== quarantine)
			throw new CodexDynamicEpochQuarantinedError(
				"The dynamic mutation quarantine is no longer active.",
			);
		quarantine.state = "terminalizing";
		let firstError: unknown = null;
		for (const entry of quarantine.entries.values()) {
			try {
				entry.settlement.retireUnsettled();
			} catch (error) {
				firstError ??= error;
			}
		}
		const unresolved = [...quarantine.entries.values()].reduce(
			(count, entry) => count + entry.settlement.unresolvedOperationCount(),
			0,
		);
		if (firstError !== null || unresolved !== 0) {
			quarantine.state = "poisoned";
			throw firstError instanceof Error
				? firstError
				: new CodexDynamicEpochQuarantinedError(
						"The poisoned epoch still owns unresolved operation identities.",
						firstError,
					);
		}

		removeQuarantine(quarantine, false);
		for (const entry of quarantine.entries.values()) {
			if (entry.settled) continue;
			entry.settled = true;
			try {
				await options.transport.respond(entry.request, "codex-dynamic-tools", {
					result: entry.response,
				});
			} catch {
				/* The exact response remains terminal even when its child has disconnected. */
			}
			entry.resolve(entry.response);
		}
	};

	const poison = (
		quarantine: EpochQuarantine,
		identity: DynamicMutationQuarantineIdentity,
	): void => {
		const retryTerminalization = async (): Promise<DynamicMutationTerminalProof> => {
			await completeQuarantine(quarantine);
			return Object.freeze({ terminal: true, unresolvedOperationCount: 0 });
		};
		try {
			const owner = exactOwner(
				options.lifecycle.poisonEpochAndOwnMutationQuarantine({
					identity,
					retryTerminalization,
				}),
				identity,
			);
			quarantine.state = "poisoned";
			void owner.childExit.then(
				(exit) => {
					if (
						exit === null ||
						typeof exit !== "object" ||
						exit.child !== quarantine.child ||
						exit.epoch !== quarantine.epoch ||
						typeof exit.exited !== "boolean" ||
						!exit.exited ||
						Object.keys(exit).toSorted().join(",") !== "child,epoch,exited"
					) {
						quarantine.state = "poison_failed";
						return undefined;
					}
					if (quarantines.get(quarantine.key) !== quarantine) {
						for (const entry of quarantine.entries.values()) {
							retainedLogicalOwners.delete(entry.key);
							logicalOwners.delete(entry.key);
						}
						return undefined;
					}
					rejectQuarantine(
						quarantine,
						new CodexDynamicEpochQuarantinedError(
							"The exact child epoch exited while its mutation response was quarantined.",
						),
					);
					return undefined;
				},
				() => {
					if (quarantines.get(quarantine.key) === quarantine) quarantine.state = "poison_failed";
					return undefined;
				},
			);
		} catch {
			quarantine.state = "poison_failed";
		}
	};

	const enterQuarantine = (
		identity: DynamicMutationQuarantineIdentity,
		request: DynamicServerRequest,
		candidate: DispatchCandidate,
	): Promise<DynamicToolCallResponse> => {
		const logicalKey = identityKey(identity);
		const quarantineKey = epochKey(identity.child, identity.epoch);
		if (quarantineKey === null) throw new Error("A valid mutation identity has no epoch key.");
		const existing = quarantines.get(quarantineKey);
		const entry = pendingEntry(logicalKey, identity, request, candidate);
		retainedLogicalOwners.add(logicalKey);
		if (existing !== undefined) {
			existing.entries.set(logicalKey, entry);
			return entry.promise;
		}
		const quarantine: EpochQuarantine = {
			key: quarantineKey,
			child: identity.child,
			epoch: identity.epoch,
			entries: new Map([[logicalKey, entry]]),
			state: "poisoning",
		};
		quarantines.set(quarantineKey, quarantine);
		poison(quarantine, identity);
		return entry.promise;
	};

	const send = async (
		request: DynamicServerRequest,
		response: DynamicToolCallResponse,
	): Promise<DynamicToolCallResponse> => {
		try {
			await options.transport.respond(request, "codex-dynamic-tools", { result: response });
		} catch {
			/* The child disconnect is a single not-delivered response attempt. */
		}
		return response;
	};

	const dispatch = (
		request: DynamicServerRequest,
		run: () => Promise<DispatchCandidate>,
	): Promise<DynamicToolCallResponse> => {
		const identity = mutationIdentity(request, options);
		const logicalKey = identity === null ? null : identityKey(identity);
		if (logicalKey !== null) {
			const existing = logicalOwners.get(logicalKey);
			if (existing !== undefined) return existing;
		}
		const quarantineKey = requestEpochKey(request);
		if (quarantineKey !== null && quarantines.has(quarantineKey))
			return Promise.reject(
				new CodexDynamicEpochQuarantinedError(
					"The child epoch is poisoned by an unresolved dynamic mutation.",
				),
			);
		if (disposed)
			return Promise.reject(new CodexDynamicEpochQuarantinedError("Dynamic tools are disposed."));

		const owner = run().then(async (candidate) => {
			if (candidate.settlement === null) return send(request, candidate.response);
			try {
				candidate.settlement.retireUnsettled();
				return send(request, candidate.response);
			} catch (error) {
				if (!(error instanceof CodexDynamicOperationTerminalizationError) || identity === null)
					throw error;
				return enterQuarantine(identity, request, candidate);
			}
		});
		if (logicalKey !== null) {
			logicalOwners.set(logicalKey, owner);
			void owner.then(
				() => {
					if (!retainedLogicalOwners.has(logicalKey)) logicalOwners.delete(logicalKey);
					return undefined;
				},
				() => {
					if (!retainedLogicalOwners.has(logicalKey)) logicalOwners.delete(logicalKey);
					return undefined;
				},
			);
		}
		return owner;
	};

	const inspect = (): DynamicMutationQuarantineInspection => {
		const entries = [...quarantines.values()].flatMap((quarantine) =>
			[...quarantine.entries.values()].map((entry) =>
				Object.freeze({
					identity: entry.identity,
					state: quarantine.state,
					unresolvedOperationCount: entry.settlement.unresolvedOperationCount(),
				}),
			),
		);
		return Object.freeze({
			epochCount: quarantines.size,
			callCount: entries.length,
			entries: Object.freeze(entries),
		});
	};

	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		for (const quarantine of quarantines.values())
			rejectQuarantine(
				quarantine,
				new CodexDynamicEpochQuarantinedError(
					"Dynamic tools were disposed while mutation terminality was unresolved.",
				),
			);
		logicalOwners.clear();
		retainedLogicalOwners.clear();
	};

	return Object.freeze({ dispatch, inspect, dispose });
}
