import type { OwnedWaitCleanupCause, WaitOwner } from "@/runtime/codex-wait-graph";
import type {
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	ThreadId,
	TurnId,
} from "@/shared/codex-workbench-identity";
import type { DynamicMutationToolName } from "@/runtime/codex-dynamic-tools/lib/vocabulary";

interface DynamicWaitOwner extends WaitOwner {
	readonly epoch: ChildEpoch;
	readonly namespace: "archboard_app";
	readonly tool: "wait_threads";
	readonly manifestHash: string;
	readonly sortedTargetThreadIds: readonly ThreadId[];
	readonly operationId: null;
}

interface DynamicMutationQuarantineIdentity {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly callId: DynamicToolCallId;
	readonly namespace: "archboard_app";
	readonly tool: DynamicMutationToolName;
	readonly manifestHash: string;
}

interface DynamicMutationTerminalProof {
	readonly terminal: true;
	readonly unresolvedOperationCount: 0;
}

interface DynamicMutationQuarantineExit {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly exited: true;
}

interface DynamicMutationQuarantineOwner {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly poisoned: true;
	readonly childExit: Promise<DynamicMutationQuarantineExit>;
}

type DynamicFailClosedShutdownReason =
	| "poison_acquisition_failed"
	| "wire_capacity_exceeded"
	| "response_write_failed";

interface DynamicEpochTeardownProof {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly sessionClosed: true;
	readonly transportClosed: true;
}

interface DynamicFailClosedShutdownOwner {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly shutdownInitiated: true;
	readonly teardown: Promise<DynamicEpochTeardownProof>;
}

interface DynamicFatalLifecycleFault {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly reason: DynamicFailClosedShutdownReason | "invalid_child_exit_proof";
	readonly message: string;
	readonly cause: unknown;
}

type DynamicMutationQuarantineState =
	| "poisoning"
	| "poisoned"
	| "terminalizing"
	| "shutdown_pending"
	| "fatal";

interface DynamicMutationQuarantineInspection {
	readonly epochCount: number;
	readonly callCount: number;
	readonly ordinaryInFlightWireCount: number;
	readonly wireCount: number;
	readonly blockedWireCount: number;
	readonly fatalEpochCount: number;
	readonly entries: readonly Readonly<{
		readonly identity: DynamicMutationQuarantineIdentity;
		readonly state: DynamicMutationQuarantineState;
		readonly unresolvedOperationCount: number;
		readonly wireCount: number;
		readonly blockedWireCount: number;
		readonly overflowed: boolean;
	}>[];
}

type DynamicWaitEvent =
	| {
			readonly event: "completed" | "attention";
			readonly threadId: string;
			readonly sequence: number;
			readonly cursor: string | null;
			/** Required for attention unless the target is already systemError. */
			readonly targetOwned?: true;
	  }
	| {
			readonly event: "timeout";
			readonly threadId: null;
			readonly sequence: number;
			readonly cursor: string | null;
	  };

type DynamicWaitReleaseCause = Exclude<OwnedWaitCleanupCause, "decline">;

export type {
	DynamicEpochTeardownProof,
	DynamicFailClosedShutdownOwner,
	DynamicFailClosedShutdownReason,
	DynamicFatalLifecycleFault,
	DynamicMutationQuarantineExit,
	DynamicMutationQuarantineIdentity,
	DynamicMutationQuarantineInspection,
	DynamicMutationQuarantineOwner,
	DynamicMutationQuarantineState,
	DynamicMutationTerminalProof,
	DynamicWaitEvent,
	DynamicWaitOwner,
	DynamicWaitReleaseCause,
};
