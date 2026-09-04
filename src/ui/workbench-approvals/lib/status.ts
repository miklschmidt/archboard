import type {
	BrowserApproval,
	BrowserDynamicApproval,
} from "../../../shared/codex-browser-model/index.js";
import type { WorkbenchApprovalPhase, WorkbenchApprovalStatus } from "../contract.js";
import { PHASE_LABELS, TERMINAL_PHASES } from "./vocabulary.js";

export interface ApprovalAuthorityContext {
	readonly nowMs: number;
	readonly canCommand: boolean;
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

function authorityRemoval(
	phase: WorkbenchApprovalPhase,
	context: ApprovalAuthorityContext,
): string | null {
	if (phase !== "pending") return "This request is no longer waiting for a decision.";
	if (context.connection === "stopped")
		return context.connectionReason ?? "The browser is not connected to the Codex workbench host.";
	if (context.connection === "reconnecting")
		return context.connectionReason ?? "The browser is reconnecting to the Codex workbench host.";
	if (context.staleSnapshot)
		return "This snapshot is behind the host, so a decision could name the wrong request.";
	if (!context.canCommand)
		return "This browser cannot answer approvals until it holds a usable workbench command lease.";
	return null;
}

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

function ordinaryPhase(
	approval: BrowserApproval,
	context: ApprovalAuthorityContext,
): WorkbenchApprovalPhase {
	const lifecycle = approval.lifecycle;
	switch (lifecycle.state) {
		case "staged":
			return "staged";
		case "pending":
			return approval.expiresAtMs <= context.nowMs ? "expired" : "pending";
		case "expired":
			return "expired";
		case "stale":
			return "stale";
		case "cancelled":
			return "cancelled";
		case "outcome_unknown":
			return "outcome_unknown";
		case "settled":
			if (lifecycle.outcome === "delivered") return "delivered";
			if (lifecycle.outcome === "not_delivered") return "not_delivered";
			return lifecycle.decision;
	}
}

export function ordinaryApprovalStatus(
	approval: BrowserApproval,
	context: ApprovalAuthorityContext,
): WorkbenchApprovalStatus {
	const phase = ordinaryPhase(approval, context);
	const lifecycle = approval.lifecycle;
	const decision = lifecycle.decision === null ? null : DECISION_WORDS[lifecycle.decision];
	const hostDetail =
		lifecycle.state === "pending" || lifecycle.state === "staged" ? null : lifecycle.reason;
	const clockExpired = lifecycle.state === "pending" && phase === "expired";
	const detail = clockExpired
		? "This request passed its expiry before you answered it. The host has not published its terminal record yet."
		: (hostDetail ?? DEFAULT_DETAILS[phase]);
	return statusFor(phase, detail, decision, lifecycle.outcome, context);
}

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

export function dynamicApprovalStatus(
	approval: BrowserDynamicApproval,
	context: ApprovalAuthorityContext,
): WorkbenchApprovalStatus {
	const phase: WorkbenchApprovalPhase =
		approval.state === "pending" && approval.expiresAtMs <= context.nowMs
			? "expired"
			: approval.state;
	const decisionValue = approval.decision;
	const detail =
		approval.state === "pending" && phase === "expired"
			? "This effect passed its expiry before you answered it. The host has not published its terminal record yet."
			: decisionValue === null
				? DEFAULT_DETAILS[phase]
				: DYNAMIC_CAUSES[decisionValue.cause];
	const decision = decisionValue === null ? null : DYNAMIC_DECISION_WORDS[decisionValue.outcome];
	return statusFor(phase, detail, decision, approval.delivery, context);
}
