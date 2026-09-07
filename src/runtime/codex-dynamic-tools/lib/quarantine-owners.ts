import type { DynamicToolCallResponse } from "@/runtime/codex-thread-tools";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import {
	CodexDynamicEpochQuarantinedError,
	type DynamicMutationQuarantineInspection,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import {
	deferred,
	fieldsOf,
	requestWireKey,
	type DispatchCandidate,
	type EpochQuarantineOwner,
	type OrdinaryWireOwners,
	type QuarantineWireOwner,
} from "@/runtime/codex-dynamic-tools/lib/quarantine-support";

/** The quarantine boundary every dynamic reverse request passes through. */
interface DynamicQuarantineDispatcher {
	readonly dispatch: (
		request: DynamicServerRequest,
		run: () => Promise<DispatchCandidate>,
	) => Promise<DynamicToolCallResponse>;
	readonly inspect: () => DynamicMutationQuarantineInspection;
	readonly dispose: () => void;
}

/** What one logical run tells the wire calls that joined it. */
interface LogicalRunSignal {
	readonly response: DynamicToolCallResponse;
	readonly quarantine: EpochQuarantineOwner | null;
}

/** One logical mutation run, and whether a quarantine still needs it. */
interface LogicalRunOwner {
	readonly signal: ReturnType<typeof deferred<LogicalRunSignal>>;
	retained: boolean;
}

/**
 * Build a quarantine refusal.
 * @param message Human-readable explanation.
 * @param cause The underlying thrown value, if any.
 * @returns The refusal error.
 */
function quarantineError(message: string, cause?: unknown): CodexDynamicEpochQuarantinedError {
	return new CodexDynamicEpochQuarantinedError(message, cause);
}

/**
 * Whether the child-exit proof is the exact one for this quarantined epoch. The proof is read
 * through its own fields, so a lifecycle port that hands back something else is refused rather
 * than believed.
 * @param value What the port returned.
 * @param quarantine The epoch the proof must be for.
 * @returns Whether the proof holds.
 */
function exactChildExit(value: unknown, quarantine: EpochQuarantineOwner): boolean {
	const fields = fieldsOf(value);
	if (fields === null || Object.keys(fields).toSorted().join(",") !== "child,epoch,exited") {
		return false;
	}
	if (fields["child"] !== quarantine.child || fields["epoch"] !== quarantine.epoch) {
		return false;
	}
	return fields["exited"] === true;
}

/**
 * The wire owner one quarantined reverse request is held under, so its response can be written
 * once the epoch recovers rather than being lost while the epoch is poisoned.
 * @param request The server request.
 * @param response The response it will get.
 * @param kind Whether the request carries a logical mutation or is simply blocked.
 * @param ownerKey The logical owner it belongs to, when it belongs to one.
 * @returns The wire owner.
 */
function pendingWire(
	request: DynamicServerRequest,
	response: DynamicToolCallResponse,
	kind: QuarantineWireOwner["kind"],
	ownerKey: string | null,
): QuarantineWireOwner {
	const key = requestWireKey(request);
	if (key === null) {
		throw new Error("A dynamic request has no exact wire identity.");
	}
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

/**
 * Retire every unsettled operation the epoch's logical owners hold, keeping the first failure
 * and counting whatever is still unresolved afterwards.
 * @param quarantine The quarantined epoch.
 * @returns The first failure, if any, and the unresolved count.
 */
function retireLogicalOwners(quarantine: EpochQuarantineOwner): {
	firstError: unknown;
	unresolved: number;
} {
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
	return { firstError, unresolved };
}

/**
 * Whether an epoch's state means it can only be torn down, never recovered.
 * @param state The epoch's state.
 * @returns Whether recovery is off the table.
 */
function beyondRecovery(state: string): boolean {
	return state === "shutdown_pending" || state === "fatal";
}

/**
 * How many of one epoch's held wire calls are simply blocked rather than carrying a mutation.
 * @param quarantine The quarantined epoch.
 * @returns The blocked count.
 */
function blockedWireCount(quarantine: EpochQuarantineOwner): number {
	return [...quarantine.wireOwners.values()].filter((wire) => wire.kind === "blocked").length;
}

/**
 * What one quarantined epoch's logical owners look like from outside.
 * @param quarantine The quarantined epoch.
 * @returns One entry per logical owner.
 */
function epochEntries(
	quarantine: EpochQuarantineOwner,
): DynamicMutationQuarantineInspection["entries"][number][] {
	const blocked = blockedWireCount(quarantine);
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
}

/**
 * What the quarantine boundary is holding right now: which epochs are quarantined, how many
 * calls and wire requests each is holding, and how many have gone fatal.
 * @param quarantines The quarantined epochs by key.
 * @param ordinaryWires The owners of the wire calls that are not quarantined.
 * @returns The inspection.
 */
function inspectQuarantines(
	quarantines: ReadonlyMap<string, EpochQuarantineOwner>,
	ordinaryWires: OrdinaryWireOwners,
): DynamicMutationQuarantineInspection {
	const active = [...quarantines.values()].filter((quarantine) => quarantine.active);
	const entries = active.flatMap((quarantine) => epochEntries(quarantine));
	return Object.freeze({
		epochCount: active.length,
		callCount: entries.length,
		ordinaryInFlightWireCount: ordinaryWires.size(),
		wireCount: active.reduce((count, owner) => count + owner.wireOwners.size, 0),
		blockedWireCount: active.reduce((count, owner) => count + blockedWireCount(owner), 0),
		fatalEpochCount: active.filter((owner) => owner.state === "fatal").length,
		entries: Object.freeze(entries),
	});
}

export {
	type DynamicQuarantineDispatcher,
	type LogicalRunOwner,
	type LogicalRunSignal,
	beyondRecovery,
	exactChildExit,
	inspectQuarantines,
	pendingWire,
	quarantineError,
	retireLogicalOwners,
};
