// The queue's typed inputs and outputs: the states it can be in, what each
// entry may do, the reorder plan, the settlement of one command, and the
// actions the committed queue panel calls (`@/ui/workbench/contracts`).

import type { BrowserQueue, BrowserSnapshot } from "@/shared/codex-browser-model";
import type {
	WorkbenchCommandIntent,
	WorkbenchTransportCapabilities,
	WorkbenchTransportErrorCode,
	WorkbenchTransportState,
} from "@/ui/workbench-queue/transport-port";

/**
 * The six controls this module offers, and nothing else.
 *
 * Five are queue commands the gateway publishes. `list` is not: the closed
 * browser contract has no `queueList` command. Serving a snapshot request
 * re-reads the authoritative queue for the link this pane is on, so a refresh
 * is a genuine read of the host's list rather than a redraw of the last
 * command's result.
 */
const WORKBENCH_QUEUE_CONTROLS = ["add", "list", "edit", "cancel", "reorder", "start"] as const;

type WorkbenchQueueControl = (typeof WORKBENCH_QUEUE_CONTROLS)[number];

type WorkbenchQueueEntry = BrowserQueue["entries"][number];
type WorkbenchQueueSubmissionId = WorkbenchQueueEntry["submissionId"];
type WorkbenchQueueOperationId = NonNullable<WorkbenchQueueEntry["operationId"]>;

type WorkbenchThreadLink = BrowserSnapshot["threadLink"];
type WorkbenchTimelineTurn = NonNullable<BrowserSnapshot["timeline"]>["turns"][number];

/**
 * Every state the queue region can be in. `loading`, `restarted` and
 * `outcome_unknown` are not queue statuses on the wire: loading is the window
 * before the first authoritative snapshot, restarted is a child epoch that
 * replaced the one this queue was presented for (ADR 0019 voids every
 * execution proof with the child), and outcome_unknown also covers a command
 * whose own outcome was lost.
 */
type WorkbenchQueueState =
	| "loading"
	| "empty"
	| "queued"
	| "running"
	| "interrupted_preserved"
	| "approval_blocked"
	| "failed"
	| "restarted"
	| "completed"
	| "stale"
	| "reconnecting"
	| "disconnected"
	| "session_stopped"
	| "session_incompatible"
	| "unavailable"
	| "outcome_unknown";

/** Whether a control is offered, and why not when it is not. */
interface WorkbenchQueueAvailability {
	readonly enabled: boolean;
	/** Always present when the control is disabled. */
	readonly reason: string | null;
}

/** The exact child identity a presented queue belongs to. */
interface WorkbenchQueueChildIdentity {
	readonly childId: NonNullable<WorkbenchThreadLink["childId"]>;
	readonly epoch: NonNullable<WorkbenchThreadLink["epoch"]>;
}

/** What the queue is, in workhorse and coordinator terms, in every state. */
interface WorkbenchQueueCorrelation {
	readonly linkState: WorkbenchThreadLink["state"] | null;
	readonly workhorseThreadId: WorkbenchThreadLink["threadId"];
	readonly workhorseThreadStatus: WorkbenchThreadLink["status"] | null;
	readonly child: WorkbenchQueueChildIdentity | null;
	readonly activeTurnId: WorkbenchTimelineTurn["turnId"] | null;
	readonly activeTurnStatus: WorkbenchTimelineTurn["status"] | null;
	readonly coordinatorThreadId: BrowserSnapshot["coordinator"]["threadId"];
	readonly coordinatorState: BrowserSnapshot["coordinator"]["state"] | null;
	readonly blockingApprovals: number;
	readonly sequence: number | null;
	/** One sentence naming the queue, its workhorse, and its coordinator. */
	readonly summary: string;
}

type WorkbenchQueueOwnership = "coordinator" | "foreign";

/** One entry as the host holds it, with what this pane may do to it. */
interface WorkbenchQueueEntryView {
	readonly submissionId: WorkbenchQueueSubmissionId;
	readonly prompt: string;
	readonly status: WorkbenchQueueEntry["status"];
	readonly statusLabel: string;
	readonly position: number;
	readonly total: number;
	readonly ownership: WorkbenchQueueOwnership;
	readonly ownershipLabel: string;
	readonly coordinatorOperationId: WorkbenchQueueOperationId | null;
	/** Accessible row name: position, ownership, and the prompt's first words. */
	readonly label: string;
	/** How this entry relates to the linked workhorse right now. */
	readonly correlation: string;
	readonly edit: WorkbenchQueueAvailability;
	readonly cancel: WorkbenchQueueAvailability;
	readonly start: WorkbenchQueueAvailability;
	readonly moveEarlier: WorkbenchQueueAvailability;
	readonly moveLater: WorkbenchQueueAvailability;
}

/** A queue command that is on the wire and not yet settled. */
interface WorkbenchQueuePending {
	readonly control: WorkbenchQueueControl;
	readonly submissionId: WorkbenchQueueSubmissionId | null;
}

/**
 * Authoritative reconciliation only. `reconciled` means the host answered
 * `delivered` and republished the queue; nothing here reports a terminal or
 * reordered state the host has not confirmed.
 */
type WorkbenchQueueSettlementState = "reconciled" | "refused" | "outcome_unknown";

/** How one queue command settled. */
interface WorkbenchQueueSettlement {
	readonly control: WorkbenchQueueControl;
	readonly state: WorkbenchQueueSettlementState;
	readonly code: WorkbenchTransportErrorCode | null;
	readonly message: string;
	readonly submissionId: WorkbenchQueueSubmissionId | null;
}

/** Everything the queue region shows. */
interface WorkbenchQueueView {
	readonly state: WorkbenchQueueState;
	readonly label: string;
	readonly detail: string;
	readonly recovery: string;
	readonly correlation: WorkbenchQueueCorrelation;
	readonly entries: readonly WorkbenchQueueEntryView[];
	readonly coordinatorOwnedCount: number;
	readonly foreignCount: number;
	readonly add: WorkbenchQueueAvailability;
	readonly list: WorkbenchQueueAvailability;
	readonly reorder: WorkbenchQueueAvailability;
	/** True while nothing on screen may be treated as current. */
	readonly stale: boolean;
	readonly pending: WorkbenchQueuePending | null;
	readonly settlement: WorkbenchQueueSettlement | null;
}

/** What the projection reads. */
interface WorkbenchQueueProjectionInput {
	readonly state: WorkbenchTransportState;
	readonly capabilities: WorkbenchTransportCapabilities;
	/** The child the visible queue was presented for; a different one restarted. */
	readonly presentedChild?: WorkbenchQueueChildIdentity | null;
	/** Why no command target could be captured for the queue on screen. */
	readonly targetBlock?: string | null;
	readonly pending?: WorkbenchQueuePending | null;
	readonly settlement?: WorkbenchQueueSettlement | null;
}

type WorkbenchQueueReorderDirection = "earlier" | "later";

type WorkbenchQueueReorderMove =
	| Readonly<{ kind: "step"; direction: WorkbenchQueueReorderDirection }>
	/** A pointer drop before the entry currently at this 1-based position. */
	| Readonly<{ kind: "drop"; position: number }>;

type WorkbenchQueueReorderPlan =
	| Readonly<{
			moved: true;
			submissionId: WorkbenchQueueSubmissionId;
			fromPosition: number;
			toPosition: number;
			/** Every submission in the queue, in the requested order. */
			orderedSubmissionIds: readonly WorkbenchQueueSubmissionId[];
	  }>
	| Readonly<{ moved: false; reason: string }>;

/** The six queue commands, each against the target captured when it was offered. */
interface WorkbenchQueueCommands {
	readonly list: () => Promise<WorkbenchQueueSettlement>;
	readonly add: (
		prompt: string,
		target: WorkbenchCommandIntent,
	) => Promise<WorkbenchQueueSettlement>;
	readonly edit: (
		submissionId: WorkbenchQueueSubmissionId,
		prompt: string,
		target: WorkbenchCommandIntent,
	) => Promise<WorkbenchQueueSettlement>;
	readonly cancel: (
		submissionId: WorkbenchQueueSubmissionId,
		target: WorkbenchCommandIntent,
	) => Promise<WorkbenchQueueSettlement>;
	readonly reorder: (
		orderedSubmissionIds: readonly WorkbenchQueueSubmissionId[],
		target: WorkbenchCommandIntent,
		submissionId?: WorkbenchQueueSubmissionId | null,
	) => Promise<WorkbenchQueueSettlement>;
	readonly start: (
		submissionId: WorkbenchQueueSubmissionId,
		target: WorkbenchCommandIntent,
	) => Promise<WorkbenchQueueSettlement>;
}

/** The target captured for the queue on screen, or why none could be. */
type WorkbenchQueueTargetCapture =
	| Readonly<{ captured: true; target: WorkbenchCommandIntent }>
	| Readonly<{ captured: false; reason: string }>;

export {
	WORKBENCH_QUEUE_CONTROLS,
	type WorkbenchQueueAvailability,
	type WorkbenchQueueChildIdentity,
	type WorkbenchQueueCommands,
	type WorkbenchQueueControl,
	type WorkbenchQueueCorrelation,
	type WorkbenchQueueEntry,
	type WorkbenchQueueEntryView,
	type WorkbenchQueueOperationId,
	type WorkbenchQueueOwnership,
	type WorkbenchQueuePending,
	type WorkbenchQueueProjectionInput,
	type WorkbenchQueueReorderDirection,
	type WorkbenchQueueReorderMove,
	type WorkbenchQueueReorderPlan,
	type WorkbenchQueueSettlement,
	type WorkbenchQueueSettlementState,
	type WorkbenchQueueState,
	type WorkbenchQueueSubmissionId,
	type WorkbenchQueueTargetCapture,
	type WorkbenchQueueView,
};
