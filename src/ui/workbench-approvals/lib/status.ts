// Where one approval stands, in one vocabulary for both families, and
// whether this browser may still decide it. An unknown outcome stays
// unknown: nothing here reads a lost answer as either result.

import type { BrowserApproval, BrowserDynamicApproval } from "@/shared/codex-browser-model";
import type {
	WorkbenchApprovalPhase,
	WorkbenchApprovalStatus,
} from "@/ui/workbench-approvals/contracts";
import { PHASE_LABELS, TERMINAL_PHASES } from "@/ui/workbench-approvals/lib/vocabulary";

/** What decides whether a decision may still be sent. */
interface ApprovalAuthorityContext {
	readonly nowMs: number;
	readonly canCommand: boolean;
	/** Whether the transport would accept this kind of approval response now. */
	readonly canRespond: boolean;
	readonly connection: "connected" | "reconnecting" | "stopped";
	readonly staleSnapshot: boolean;
	readonly connectionReason: string | null;
}

const RECOVERY = {
	staged: null,
	pending: null,
	approved: null,
	declined: null,
	cancelled: "The agent must raise the request again if it still needs the effect.",
	expired: "The agent must raise the request again if it still needs the effect.",
	stale: "Wait for the host to publish a fresh snapshot before acting on this.",
	disconnected: "Reconnect the workbench; the agent must raise the request again.",
	delivered: null,
	not_delivered: "The host never delivered the decision, so nothing was executed.",
	outcome_unknown:
		"Archboard never retries an unknown mutation. Read the thread before assuming either result.",
} as const satisfies Record<WorkbenchApprovalPhase, string | null>;

const DECISION_WORDS = {
	approved: "You approved this request.",
	declined: "You declined this request.",
	cancelled: "The host cancelled this request.",
} as const;

const DEFAULT_DETAILS = {
	staged: "The host staged this request and has not opened it for a decision.",
	pending: "The host is waiting for your decision.",
	approved: "The host recorded your approval.",
	declined: "The host recorded your decline.",
	cancelled: "The host cancelled this request before it was answered.",
	expired: "This request passed its expiry before it was answered.",
	stale: "The request no longer belongs to the current child epoch.",
	disconnected: "The connection that owned this request was lost.",
	delivered: "The host delivered your decision.",
	not_delivered: "The host could not deliver your decision.",
	outcome_unknown: "The host lost the answer, so the outcome of your decision is unknown.",
} as const satisfies Record<WorkbenchApprovalPhase, string>;

const CLOCK_EXPIRED_ORDINARY =
	"This request passed its expiry before you answered it. The host has not published its terminal record yet.";
const CLOCK_EXPIRED_DYNAMIC =
	"This effect passed its expiry before you answered it. The host has not published its terminal record yet.";

const DYNAMIC_CAUSES = {
	person_approved: "You approved this effect.",
	person_declined: "You declined this effect.",
	deadline_reached: "The approval deadline passed before you answered.",
	call_cancelled: "The agent cancelled its own call.",
	caller_turn_interrupted: "The calling turn was interrupted.",
	host_shutdown: "The host shut down before you answered.",
	browser_disconnected: "This browser lost the approval before you answered.",
	child_disconnected: "The Codex child disconnected before the decision reached it.",
} as const;

const DYNAMIC_DECISION_WORDS = {
	approved: "You approved this effect.",
	declined: "You declined this effect.",
	expired: null,
	cancelled: null,
	disconnected: null,
} as const;

/**
 * Why the connection removes authority, if it does.
 * @param context The authority context.
 * @returns The reason, or null.
 */
function connectionRemoval(context: ApprovalAuthorityContext): string | null {
	if (context.connection === "stopped") {
		return context.connectionReason ?? "The browser is not connected to the Codex workbench host.";
	}
	if (context.connection === "reconnecting") {
		return context.connectionReason ?? "The browser is reconnecting to the Codex workbench host.";
	}
	return null;
}

/**
 * Why a decision cannot be sent, if it cannot.
 * @param phase The phase.
 * @param context The authority context.
 * @returns The reason, or null while authority is live.
 */
function authorityRemoval(
	phase: WorkbenchApprovalPhase,
	context: ApprovalAuthorityContext,
): string | null {
	if (phase !== "pending") {
		return "This request is no longer waiting for a decision.";
	}
	const connection = connectionRemoval(context);
	if (connection !== null) {
		return connection;
	}
	if (context.staleSnapshot) {
		return "This snapshot is behind the host, so a decision could name the wrong request.";
	}
	if (!context.canCommand) {
		return "This browser cannot answer approvals until it holds a usable workbench command lease.";
	}
	return context.canRespond ? null : "The workbench no longer accepts a response for this request.";
}

/**
 * One status.
 * @param phase The phase.
 * @param detail The words for it.
 * @param decision What the host recorded, or null.
 * @param delivery The delivery outcome, or null.
 * @param context The authority context.
 * @returns The status.
 */
function statusFor(
	phase: WorkbenchApprovalPhase,
	detail: string,
	decision: string | null,
	delivery: WorkbenchApprovalStatus["delivery"],
	context: ApprovalAuthorityContext,
): WorkbenchApprovalStatus {
	const authorityReason = authorityRemoval(phase, context);
	return Object.freeze({
		phase,
		label: PHASE_LABELS[phase],
		detail,
		recovery: RECOVERY[phase],
		decision,
		delivery,
		terminal: TERMINAL_PHASES.has(phase),
		authority: authorityReason === null ? "live" : "removed",
		authorityReason,
		resumable: false,
	});
}

/**
 * The phase of a settled ordinary lifecycle: its delivery when the host
 * published one, else its decision.
 * @param lifecycle The settled lifecycle.
 * @returns The phase.
 */
function settledPhase(
	lifecycle: Extract<BrowserApproval["lifecycle"], { readonly state: "settled" }>,
): WorkbenchApprovalPhase {
	if (lifecycle.outcome === "delivered") {
		return "delivered";
	}
	if (lifecycle.outcome === "not_delivered") {
		return "not_delivered";
	}
	return lifecycle.decision;
}

/**
 * The phase of one ordinary approval.
 * @param approval The request.
 * @param context The authority context.
 * @returns The phase; a pending request past its expiry is expired.
 */
function ordinaryPhase(
	approval: BrowserApproval,
	context: ApprovalAuthorityContext,
): WorkbenchApprovalPhase {
	const lifecycle = approval.lifecycle;
	switch (lifecycle.state) {
		case "pending":
			return approval.expiresAtMs <= context.nowMs ? "expired" : "pending";
		case "settled":
			return settledPhase(lifecycle);
		default:
			return lifecycle.state;
	}
}

/**
 * The detail of one ordinary approval: the host's own reason once it
 * published one, the clock's expiry, else the phase's default.
 * @param approval The request.
 * @param phase The phase.
 * @returns The detail.
 */
function ordinaryDetail(approval: BrowserApproval, phase: WorkbenchApprovalPhase): string {
	const lifecycle = approval.lifecycle;
	if (lifecycle.state === "pending" && phase === "expired") {
		return CLOCK_EXPIRED_ORDINARY;
	}
	const open = lifecycle.state === "pending" || lifecycle.state === "staged";
	const hostDetail = open ? null : lifecycle.reason;
	return hostDetail ?? DEFAULT_DETAILS[phase];
}

/**
 * The status of one ordinary approval.
 * @param approval The request.
 * @param context The authority context.
 * @returns The status.
 */
function ordinaryApprovalStatus(
	approval: BrowserApproval,
	context: ApprovalAuthorityContext,
): WorkbenchApprovalStatus {
	const phase = ordinaryPhase(approval, context);
	const lifecycle = approval.lifecycle;
	const decision = lifecycle.decision === null ? null : DECISION_WORDS[lifecycle.decision];
	return statusFor(phase, ordinaryDetail(approval, phase), decision, lifecycle.outcome, context);
}

/**
 * The detail of one dynamic approval.
 * @param approval The request.
 * @param phase The phase.
 * @returns The detail.
 */
function dynamicDetail(approval: BrowserDynamicApproval, phase: WorkbenchApprovalPhase): string {
	if (approval.state === "pending" && phase === "expired") {
		return CLOCK_EXPIRED_DYNAMIC;
	}
	return approval.decision === null
		? DEFAULT_DETAILS[phase]
		: DYNAMIC_CAUSES[approval.decision.cause];
}

/**
 * The status of one dynamic approval.
 * @param approval The request.
 * @param context The authority context.
 * @returns The status.
 */
function dynamicApprovalStatus(
	approval: BrowserDynamicApproval,
	context: ApprovalAuthorityContext,
): WorkbenchApprovalStatus {
	const clockExpired = approval.state === "pending" && approval.expiresAtMs <= context.nowMs;
	const phase: WorkbenchApprovalPhase = clockExpired ? "expired" : approval.state;
	const decision =
		approval.decision === null ? null : DYNAMIC_DECISION_WORDS[approval.decision.outcome];
	return statusFor(phase, dynamicDetail(approval, phase), decision, approval.delivery, context);
}

export { dynamicApprovalStatus, ordinaryApprovalStatus, type ApprovalAuthorityContext };
