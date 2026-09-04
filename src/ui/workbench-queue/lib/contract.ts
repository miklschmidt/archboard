import type { BrowserQueue, BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
	BrowserWorkbenchTransportErrorCode,
} from "../../workbench-transport/index.js";

/**
 * The six controls this module is allowed to offer, and nothing else.
 *
 * Five of them are queue commands the gateway publishes. `list` is not: the
 * closed browser contract has no `queueList` command. It does not need one —
 * serving a browser snapshot request re-reads the authoritative queue for the
 * link this pane is on before it projects, so asking the transport to refresh is
 * a genuine read of the host's list rather than a redraw of the last command's
 * result. Inventing a command the gateway would refuse would be the lie.
 */
export const WORKBENCH_QUEUE_CONTROLS = [
	"add",
	"list",
	"edit",
	"cancel",
	"reorder",
	"start",
] as const;

export type WorkbenchQueueControl = (typeof WORKBENCH_QUEUE_CONTROLS)[number];

export type WorkbenchQueueEntry = BrowserQueue["entries"][number];
export type WorkbenchQueueSubmissionId = WorkbenchQueueEntry["submissionId"];
export type WorkbenchQueueOperationId = NonNullable<WorkbenchQueueEntry["operationId"]>;

type WorkbenchThreadLink = BrowserSnapshot["threadLink"];
type WorkbenchTimelineTurn = NonNullable<BrowserSnapshot["timeline"]>["turns"][number];

/**
 * Every state AC #2 names. `loading`, `restarted` and `outcome_unknown` are not
 * queue statuses on the wire: loading is the window before the first
 * authoritative snapshot, restarted is a child epoch that replaced the one this
 * queue was presented for (ADR 0019 voids every execution proof with the
 * child), and outcome_unknown also covers a command whose own outcome was lost.
 */
export type WorkbenchQueueState =
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
	| "unavailable"
	| "outcome_unknown";

export interface WorkbenchQueueAvailability {
	readonly enabled: boolean;
	/** Why the control is unavailable. Always present when it is disabled. */
	readonly reason: string | null;
}

/** The exact child identity a rendered queue belongs to. */
export interface WorkbenchQueueChildIdentity {
	readonly childId: NonNullable<WorkbenchThreadLink["childId"]>;
	readonly epoch: NonNullable<WorkbenchThreadLink["epoch"]>;
}

/** What the queue is, in workhorse and coordinator terms, in every state. */
export interface WorkbenchQueueCorrelation {
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

export type WorkbenchQueueOwnership = "coordinator" | "foreign";

export interface WorkbenchQueueEntryView {
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

export interface WorkbenchQueueView {
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

export interface WorkbenchQueuePending {
	readonly control: WorkbenchQueueControl;
	readonly submissionId: WorkbenchQueueSubmissionId | null;
}

/**
 * Authoritative reconciliation only. `reconciled` means the host answered
 * `delivered` and republished the queue; nothing here reports a terminal or
 * reordered state the host has not confirmed.
 */
export type WorkbenchQueueSettlementState = "reconciled" | "refused" | "outcome_unknown";

export interface WorkbenchQueueSettlement {
	readonly control: WorkbenchQueueControl;
	readonly state: WorkbenchQueueSettlementState;
	readonly code: BrowserWorkbenchTransportErrorCode | null;
	readonly message: string;
	readonly submissionId: WorkbenchQueueSubmissionId | null;
}

export interface WorkbenchQueueProjectionInput {
	readonly state: BrowserWorkbenchState;
	readonly capabilities: BrowserWorkbenchCapabilities;
	/** The child the visible queue was presented for; a different one restarted. */
	readonly presentedChild?: WorkbenchQueueChildIdentity | null;
	/** Why no command target could be captured for the queue on screen. */
	readonly targetBlock?: string | null;
	readonly pending?: WorkbenchQueuePending | null;
	readonly settlement?: WorkbenchQueueSettlement | null;
}

export type WorkbenchQueueReorderDirection = "earlier" | "later";

export type WorkbenchQueueReorderMove =
	| Readonly<{ kind: "step"; direction: WorkbenchQueueReorderDirection }>
	/** A pointer drop before the entry currently at this 1-based position. */
	| Readonly<{ kind: "drop"; position: number }>;

export type WorkbenchQueueReorderPlan =
	| Readonly<{
			moved: true;
			submissionId: WorkbenchQueueSubmissionId;
			fromPosition: number;
			toPosition: number;
			/** Every submission in the queue, in the requested order. */
			orderedSubmissionIds: readonly WorkbenchQueueSubmissionId[];
	  }>
	| Readonly<{ moved: false; reason: string }>;

/** The transport surface this module uses; it never owns or starts one. */
export type WorkbenchQueueTransport = Pick<
	BrowserWorkbenchTransport,
	"capabilities" | "captureCommandTarget" | "command" | "refresh" | "state" | "subscribe"
>;

export interface WorkbenchQueueActions {
	readonly list: () => Promise<WorkbenchQueueSettlement>;
	readonly add: (
		prompt: string,
		target: BrowserWorkbenchCommandTarget,
	) => Promise<WorkbenchQueueSettlement>;
	readonly edit: (
		submissionId: WorkbenchQueueSubmissionId,
		prompt: string,
		target: BrowserWorkbenchCommandTarget,
	) => Promise<WorkbenchQueueSettlement>;
	readonly cancel: (
		submissionId: WorkbenchQueueSubmissionId,
		target: BrowserWorkbenchCommandTarget,
	) => Promise<WorkbenchQueueSettlement>;
	readonly reorder: (
		orderedSubmissionIds: readonly WorkbenchQueueSubmissionId[],
		target: BrowserWorkbenchCommandTarget,
		submissionId?: WorkbenchQueueSubmissionId | null,
	) => Promise<WorkbenchQueueSettlement>;
	readonly start: (
		submissionId: WorkbenchQueueSubmissionId,
		target: BrowserWorkbenchCommandTarget,
	) => Promise<WorkbenchQueueSettlement>;
}

/**
 * Ids of the sibling workbench regions this queue cross-links to. The composer
 * owns the ids; the queue never invents a route.
 */
export interface WorkbenchQueueCrossLinks {
	readonly workhorseTimelineId: string;
	readonly coordinatorDisclosureId: string;
	readonly approvalsId: string;
}

export interface WorkbenchQueueProps {
	readonly transport: WorkbenchQueueTransport;
	readonly crossLinks: WorkbenchQueueCrossLinks;
	readonly className?: string;
}
