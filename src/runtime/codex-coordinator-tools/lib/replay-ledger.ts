import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import {
	COORDINATOR_REPLAY_LIMITS,
	type CoordinatorToolCancellation,
	type CoordinatorToolDispatchResult,
	type CoordinatorReplayStateSnapshot,
} from "@/runtime/codex-coordinator-tools/lib/contract";

/** One wire request from arrival until its response is settled. */
interface CallState {
	readonly wireKey: string;
	readonly request: DynamicServerRequest;
	logicalKey: string | null;
	operationAttempted: boolean;
	responseAttempted: boolean;
	cancelled: CoordinatorToolCancellation | null;
	childDisconnected: boolean;
	readonly cancellation: Promise<void>;
	readonly wakeCancellation: () => void;
	promise: Promise<CoordinatorToolDispatchResult> | null;
}

/** One logical call while its owning wire request executes; replays attach to it as aliases. */
interface LogicalCallState {
	readonly key: string;
	readonly inputFingerprint: string;
	readonly owner: CallState;
	acceptedAliases: number;
	promise: Promise<CoordinatorToolDispatchResult> | null;
}

/** A settled logical call kept so a later replay can be answered without a second attempt. */
interface TerminalLogicalCallState {
	readonly key: string;
	readonly inputFingerprint: string;
	readonly terminal: CoordinatorToolDispatchResult;
}

/** A settled wire request kept so the exact same request id is answered identically. */
interface TerminalWireCallState {
	readonly logicalKey: string | null;
	readonly terminal: CoordinatorToolDispatchResult;
}

/** The live and retained call records one dispatcher owns, with their retention rules. */
interface ReplayLedger {
	readonly liveWireCalls: Map<string, CallState>;
	readonly retainedWireCalls: Map<string, TerminalWireCallState>;
	readonly liveLogicalCalls: Map<string, LogicalCallState>;
	readonly retainedLogicalCalls: Map<string, TerminalLogicalCallState>;
	/** Retain one settled wire request, evicting the oldest beyond the limit. */
	readonly retainWire: (key: string, value: TerminalWireCallState) => void;
	/** Retain one settled logical call, evicting the oldest beyond the limit. */
	readonly retainLogical: (value: TerminalLogicalCallState) => void;
	/** Drop every retained record that does not belong to the current logical call. */
	readonly pruneStaleTerminals: (currentLogicalKey: string | null) => void;
	/** Forget every record, live and retained. */
	readonly clear: () => void;
	/** Count-only view of what is held. */
	readonly snapshot: () => CoordinatorReplayStateSnapshot;
}

/**
 * Create the ledger that remembers which calls are executing and which settled results may still
 * be replayed, bounded so a chatty coordinator cannot grow host memory.
 * @returns A fresh, empty ledger.
 */
function createReplayLedger(): ReplayLedger {
	const liveWireCalls = new Map<string, CallState>();
	const retainedWireCalls = new Map<string, TerminalWireCallState>();
	const liveLogicalCalls = new Map<string, LogicalCallState>();
	const retainedLogicalCalls = new Map<string, TerminalLogicalCallState>();

	/**
	 * Forget one retained logical call together with the wire records that replayed it.
	 * @param key - The logical call key.
	 */
	const removeRetainedLogical = (key: string): void => {
		retainedLogicalCalls.delete(key);
		for (const [wireKey, wire] of retainedWireCalls) {
			if (wire.logicalKey === key) {
				retainedWireCalls.delete(wireKey);
			}
		}
	};

	/**
	 * Retain one settled wire request as the newest entry, evicting the oldest beyond the limit.
	 * @param key - The wire call key.
	 * @param value - The settled result.
	 */
	const retainWire = (key: string, value: TerminalWireCallState): void => {
		retainedWireCalls.delete(key);
		retainedWireCalls.set(key, value);
		while (retainedWireCalls.size > COORDINATOR_REPLAY_LIMITS.retainedWireCalls) {
			const oldest = retainedWireCalls.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			retainedWireCalls.delete(oldest);
		}
	};

	/**
	 * Retain one settled logical call as the newest entry, evicting the oldest beyond the limit.
	 * @param value - The settled result and its fingerprint.
	 */
	const retainLogical = (value: TerminalLogicalCallState): void => {
		retainedLogicalCalls.delete(value.key);
		retainedLogicalCalls.set(value.key, value);
		while (retainedLogicalCalls.size > COORDINATOR_REPLAY_LIMITS.retainedLogicalCalls) {
			const oldest = retainedLogicalCalls.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			removeRetainedLogical(oldest);
		}
	};

	/**
	 * Drop every retained record that does not belong to the current logical call, because only
	 * the executing call may still be replayed.
	 * @param currentLogicalKey - The key of the call the host is executing, or null.
	 */
	const pruneStaleTerminals = (currentLogicalKey: string | null): void => {
		for (const key of retainedLogicalCalls.keys()) {
			if (key !== currentLogicalKey) {
				removeRetainedLogical(key);
			}
		}
		for (const [wireKey, wire] of retainedWireCalls) {
			if (wire.logicalKey !== null && wire.logicalKey !== currentLogicalKey) {
				retainedWireCalls.delete(wireKey);
			}
		}
	};

	/**
	 * Forget every record, live and retained.
	 */
	const clear = (): void => {
		liveWireCalls.clear();
		retainedWireCalls.clear();
		liveLogicalCalls.clear();
		retainedLogicalCalls.clear();
	};

	/**
	 * Count what is held without exposing any call, input or response.
	 * @returns The counts.
	 */
	const snapshot = (): CoordinatorReplayStateSnapshot =>
		Object.freeze({
			liveWireCount: liveWireCalls.size,
			retainedWireCount: retainedWireCalls.size,
			liveLogicalCount: liveLogicalCalls.size,
			retainedLogicalCount: retainedLogicalCalls.size,
			retainedFingerprintBytes: [...retainedLogicalCalls.values()].reduce(
				(total, value) => total + value.inputFingerprint.length,
				0,
			),
		});

	return Object.freeze({
		liveWireCalls,
		retainedWireCalls,
		liveLogicalCalls,
		retainedLogicalCalls,
		retainWire,
		retainLogical,
		pruneStaleTerminals,
		clear,
		snapshot,
	});
}

export {
	type CallState,
	type LogicalCallState,
	type TerminalLogicalCallState,
	type TerminalWireCallState,
	type ReplayLedger,
	createReplayLedger,
};
