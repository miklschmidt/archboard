// Project the authoritative workbench state into the approvals surface: one
// card per ordinary and dynamic approval, pending first by expiry, the
// app-global beacon, the host's reconciliation, and whether this browser
// holds any authority at all.

import type {
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserSnapshot,
} from "@/shared/codex-browser-model";
import type {
	WorkbenchApprovalBeaconEntry,
	WorkbenchApprovalCard,
	WorkbenchApprovalsBeacon,
	WorkbenchApprovalsInput,
	WorkbenchApprovalsReconciliation,
	WorkbenchApprovalsView,
	WorkbenchDynamicApprovalCard,
	WorkbenchOrdinaryApprovalCard,
} from "@/ui/workbench-approvals/contracts";
import {
	brokerRows,
	ordinaryEffectRows,
	ordinaryIdentityRows,
	ordinaryLinks,
	ordinaryNotices,
} from "@/ui/workbench-approvals/lib/disclosure";
import {
	dynamicEffectRows,
	dynamicIdentityRows,
} from "@/ui/workbench-approvals/lib/disclosure-dynamic";
import { approvalFields } from "@/ui/workbench-approvals/lib/fields";
import {
	approvalOffers,
	dynamicOffers,
	dynamicSpoken,
	ordinarySpoken,
} from "@/ui/workbench-approvals/lib/offers";
import {
	dynamicApprovalStatus,
	ordinaryApprovalStatus,
	type ApprovalAuthorityContext,
} from "@/ui/workbench-approvals/lib/status";
import {
	DYNAMIC_KICKER,
	DYNAMIC_TITLES,
	FAMILY_KICKERS,
	FAMILY_TITLES,
	IMMUTABLE_EFFECT_NOTICE,
	NO_RESUME_NOTICE,
} from "@/ui/workbench-approvals/lib/vocabulary";
import type {
	WorkbenchTransportCapabilities,
	WorkbenchTransportState,
} from "@/ui/workbench-approvals/transport-port";

const SUMMARY_LIMIT = 240;
const NO_REQUEST = "No Codex approval request is open.";

/**
 * Text within the summary limit.
 * @param value The text.
 * @returns The text, cut with an ellipsis when long.
 */
function bounded(value: string): string {
	return value.length <= SUMMARY_LIMIT ? value : `${value.slice(0, SUMMARY_LIMIT)}…`;
}

/**
 * A count with its noun.
 * @param count The count.
 * @param noun The singular noun.
 * @returns The phrase.
 */
function counted(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * One sentence saying what an ordinary request asks for.
 * @param approval The request.
 * @returns The summary.
 */
function ordinarySummary(approval: BrowserApproval): string {
	switch (approval.approvalKind) {
		case "user_input":
			return `Answer ${counted(approval.questions.length, "question")} from a tool.`;
		case "elicitation":
			return bounded(`${approval.serverName} asks: ${approval.message}`);
		case "file_change":
		case "permissions":
			return STATIC_SUMMARIES[approval.approvalKind];
		default:
			return actionSummary(approval);
	}
}

const STATIC_SUMMARIES = {
	file_change: "Write the agent's proposed file changes.",
	permissions: "Widen the sandbox permissions for this agent.",
} as const;

/**
 * One sentence saying what an action-gating request asks to run or apply.
 * @param approval The request.
 * @returns The summary.
 */
function actionSummary(
	approval: Extract<
		BrowserApproval,
		{ readonly approvalKind: "command_execution" | "exec_command" | "apply_patch" }
	>,
): string {
	switch (approval.approvalKind) {
		case "command_execution":
			return approval.command === null
				? "Run a command the host did not publish."
				: bounded(`Run ${approval.command}`);
		case "exec_command":
			return bounded(`Run ${approval.command.join(" ")}`);
		default:
			return `Apply a patch across ${counted(approval.fileCount, "file")}.`;
	}
}

/**
 * One ordinary card.
 * @param approval The request.
 * @param context The authority context.
 * @returns The card.
 */
function ordinaryCard(
	approval: BrowserApproval,
	context: ApprovalAuthorityContext,
): WorkbenchOrdinaryApprovalCard {
	const status = ordinaryApprovalStatus(approval, context);
	return Object.freeze({
		kind: "ordinary",
		key: `ordinary:${String(approval.requestId)}`,
		family: approval.approvalKind,
		title: FAMILY_TITLES[approval.approvalKind],
		summary: ordinarySummary(approval),
		request: approval,
		identity: ordinaryIdentityRows(approval),
		broker: brokerRows(approval),
		effect: ordinaryEffectRows(approval),
		fields: approvalFields(approval),
		links: ordinaryLinks(approval),
		offers: approvalOffers(approval, status.phase, status.authority),
		spoken: ordinarySpoken(approval, status.phase),
		status,
		expiresAtMs: approval.expiresAtMs,
		notices: ordinaryNotices(approval),
	});
}

/**
 * One dynamic card.
 * @param approval The request.
 * @param context The authority context.
 * @returns The card.
 */
function dynamicCard(
	approval: BrowserDynamicApproval,
	context: ApprovalAuthorityContext,
): WorkbenchDynamicApprovalCard {
	const status = dynamicApprovalStatus(approval, context);
	return Object.freeze({
		kind: "dynamic",
		key: `dynamic:${approval.identity.callId}:${approval.effectHash}`,
		tool: approval.identity.tool,
		title: DYNAMIC_TITLES[approval.identity.tool],
		summary: bounded(approval.effect.visualSummary),
		request: approval,
		identity: dynamicIdentityRows(approval),
		effect: dynamicEffectRows(approval),
		offers: dynamicOffers(status.phase, status.authority),
		spoken: dynamicSpoken(),
		status,
		effectHash: approval.effectHash,
		toolResult: approval.toolResult,
		expiresAtMs: approval.expiresAtMs,
		notices: Object.freeze([IMMUTABLE_EFFECT_NOTICE, NO_RESUME_NOTICE]),
	});
}

/**
 * The kicker over a card's title.
 * @param card The card.
 * @returns The kicker.
 */
function approvalKicker(card: WorkbenchApprovalCard): string {
	return card.kind === "ordinary" ? FAMILY_KICKERS[card.family] : DYNAMIC_KICKER;
}

/**
 * The immutable target a card's request was raised against.
 * @param card The card.
 * @returns The target.
 */
function approvalTarget(card: WorkbenchApprovalCard): string {
	if (card.kind === "ordinary") {
		return card.request.binding.target;
	}
	return card.request.effect.target ?? "a new thread that does not exist yet";
}

/**
 * The connection facts a transport state carries.
 * @param state The transport state.
 * @returns The connection word.
 */
function connectionOf(state: WorkbenchTransportState): ApprovalAuthorityContext["connection"] {
	if (state.connection === "connected") {
		return "connected";
	}
	return state.connection === "reconnecting" ? "reconnecting" : "stopped";
}

/**
 * The authority context for one family.
 * @param input The projection input.
 * @param canRespond Whether the transport accepts that family's response.
 * @returns The context.
 */
function authorityContext(
	input: WorkbenchApprovalsInput,
	canRespond: boolean,
): ApprovalAuthorityContext {
	const state = input.state;
	return Object.freeze({
		nowMs: input.nowMs,
		canCommand: input.canCommand,
		canRespond,
		connection: connectionOf(state),
		staleSnapshot: state.kind === "stream",
		connectionReason: "reason" in state ? state.reason : null,
	});
}

/**
 * The beacon's announcement.
 * @param pending How many cards are pending.
 * @param total How many cards there are.
 * @returns The announcement.
 */
function announcement(pending: number, total: number): string {
	if (pending > 0) {
		return `${counted(pending, "Codex approval")} waiting for you.`;
	}
	return total === 0
		? NO_REQUEST
		: `No Codex approval is waiting. ${counted(total, "recorded request")}.`;
}

/**
 * The app-global beacon.
 * @param cards The cards.
 * @returns The beacon.
 */
function beacon(cards: readonly WorkbenchApprovalCard[]): WorkbenchApprovalsBeacon {
	const pending = cards.filter((card) => card.status.phase === "pending").length;
	const entries: readonly WorkbenchApprovalBeaconEntry[] = cards.map((card) =>
		Object.freeze({
			key: card.key,
			label: `${card.title}: ${card.status.label}`,
			phase: card.status.phase,
			target: approvalTarget(card),
		}),
	);
	return Object.freeze({
		scope: "app_global",
		pending,
		total: cards.length,
		announcement: announcement(pending, cards.length),
		entries: Object.freeze(entries),
	});
}

const RECONCILIATION_LABELS = {
	delivered: "Decision delivered",
	not_delivered: "Decision not delivered",
	outcome_unknown: "Decision outcome unknown",
} as const;

const RECONCILIATION_DETAILS = {
	delivered: "The host confirmed the workbench delivered this decision.",
	not_delivered: "The host confirmed nothing was delivered, so nothing was executed.",
	outcome_unknown:
		"The host lost the answer. Archboard never retries an unknown mutation; read the thread before assuming either result.",
} as const;

/**
 * The host's authoritative outcome for the last operation.
 * @param snapshot The snapshot.
 * @returns The reconciliation, or null when none was published.
 */
function reconciliation(snapshot: BrowserSnapshot): WorkbenchApprovalsReconciliation | null {
	const operation = snapshot.operation;
	if (operation === null) {
		return null;
	}
	return Object.freeze({
		operationId: operation.operationId,
		outcome: operation.outcome,
		label: RECONCILIATION_LABELS[operation.outcome],
		detail: operation.message ?? RECONCILIATION_DETAILS[operation.outcome],
	});
}

/**
 * Every card, pending first by expiry, then the rest in the host's order.
 * @param snapshot The snapshot.
 * @param ordinaryContext The ordinary authority context.
 * @param dynamicContext The dynamic authority context.
 * @returns The cards.
 */
function orderedCards(
	snapshot: BrowserSnapshot,
	ordinaryContext: ApprovalAuthorityContext,
	dynamicContext: ApprovalAuthorityContext,
): readonly WorkbenchApprovalCard[] {
	const cards: WorkbenchApprovalCard[] = [
		...snapshot.approvals.map((approval) => ordinaryCard(approval, ordinaryContext)),
		...snapshot.dynamicApprovals.map((approval) => dynamicCard(approval, dynamicContext)),
	];
	const pending = cards.filter((card) => card.status.phase === "pending");
	const settled = cards.filter((card) => card.status.phase !== "pending");
	return Object.freeze([
		...pending.toSorted((left, right) => left.expiresAtMs - right.expiresAtMs),
		...settled,
	]);
}

/**
 * Why no approval can be answered, if none can.
 * @param input The projection input.
 * @param context The ordinary authority context.
 * @returns The reason, or null while authority is live.
 */
function surfaceAuthorityReason(
	input: WorkbenchApprovalsInput,
	context: ApprovalAuthorityContext,
): string | null {
	const connection = connectionAuthorityReason(input.state.snapshot === null, context);
	if (connection !== null) {
		return connection;
	}
	if (context.staleSnapshot) {
		return "This snapshot is behind the host, so no decision can name the right request.";
	}
	return input.canCommand
		? null
		: "This browser cannot answer approvals until it holds a usable workbench command lease.";
}

/**
 * Why the connection removes every authority, if it does.
 * @param noSnapshot Whether the host has published no snapshot.
 * @param context The ordinary authority context.
 * @returns The reason, or null.
 */
function connectionAuthorityReason(
	noSnapshot: boolean,
	context: ApprovalAuthorityContext,
): string | null {
	if (noSnapshot) {
		return (
			context.connectionReason ??
			"The workbench has published no snapshot, so no approval can be answered."
		);
	}
	if (context.connection !== "connected") {
		return context.connectionReason ?? "The browser is not connected to the workbench host.";
	}
	return null;
}

/**
 * The surface.
 * @param input The projection input.
 * @returns The view.
 */
function projectWorkbenchApprovals(input: WorkbenchApprovalsInput): WorkbenchApprovalsView {
	const context = authorityContext(input, input.canRespondOrdinary);
	const snapshot = input.state.snapshot;
	const cards =
		snapshot === null
			? Object.freeze([])
			: orderedCards(snapshot, context, authorityContext(input, input.canRespondDynamic));
	const authorityReason = surfaceAuthorityReason(input, context);
	return Object.freeze({
		beacon: beacon(cards),
		cards,
		reconciliation: snapshot === null ? null : reconciliation(snapshot),
		authority: authorityReason === null ? "live" : "removed",
		authorityReason,
		empty: cards.length === 0 ? NO_REQUEST : null,
	});
}

/**
 * The projection input for one transport state. The transport already
 * answers whether it would take each response; asking it keeps an approval it
 * has stopped accepting from showing a live decision.
 * @param state The transport state.
 * @param nowMs The clock.
 * @param capabilities The transport capabilities.
 * @returns The input.
 */
function workbenchApprovalsInput(
	state: WorkbenchTransportState,
	nowMs: number,
	capabilities: WorkbenchTransportCapabilities,
): WorkbenchApprovalsInput {
	return Object.freeze({
		state,
		nowMs,
		canCommand: capabilities.canCommand,
		canRespondOrdinary: capabilities.supportsCommand("approvalRespond"),
		canRespondDynamic: capabilities.supportsCommand("dynamicApprovalRespond"),
	});
}

export {
	approvalKicker,
	approvalTarget,
	dynamicCard,
	ordinaryCard,
	projectWorkbenchApprovals,
	workbenchApprovalsInput,
};
