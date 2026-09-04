import type {
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserSnapshot,
} from "../../../shared/codex-browser-model/index.js";
import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import type {
	WorkbenchApprovalBeaconEntry,
	WorkbenchApprovalCard,
	WorkbenchApprovalsBeacon,
	WorkbenchApprovalsInput,
	WorkbenchApprovalsReconciliation,
	WorkbenchApprovalsView,
	WorkbenchDynamicApprovalCard,
	WorkbenchOrdinaryApprovalCard,
} from "../contract.js";
import {
	brokerRows,
	dynamicEffectRows,
	dynamicIdentityRows,
	ordinaryEffectRows,
	ordinaryIdentityRows,
	ordinaryLinks,
	ordinaryNotices,
} from "./disclosure.js";
import { approvalFields } from "./fields.js";
import { approvalOffers, dynamicOffers, dynamicSpoken, ordinarySpoken } from "./offers.js";
import { dynamicApprovalStatus, ordinaryApprovalStatus } from "./status.js";
import type { ApprovalAuthorityContext } from "./status.js";
import {
	DYNAMIC_KICKERS,
	DYNAMIC_TITLES,
	FAMILY_KICKERS,
	FAMILY_TITLES,
	IMMUTABLE_EFFECT_NOTICE,
	NO_RESUME_NOTICE,
} from "./vocabulary.js";

const SUMMARY_LIMIT = 240;

function bounded(value: string): string {
	return value.length <= SUMMARY_LIMIT ? value : `${value.slice(0, SUMMARY_LIMIT)}…`;
}

function ordinarySummary(approval: BrowserApproval): string {
	switch (approval.approvalKind) {
		case "command_execution":
			return approval.command === null
				? "Run a command the host did not publish."
				: bounded(`Run ${approval.command}`);
		case "file_change":
			return "Write the agent's proposed file changes.";
		case "permissions":
			return "Widen the sandbox permissions for this agent.";
		case "apply_patch":
			return `Apply a patch across ${approval.fileCount} file${approval.fileCount === 1 ? "" : "s"}.`;
		case "exec_command":
			return bounded(`Run ${approval.command.join(" ")}`);
		case "user_input":
			return `Answer ${approval.questions.length} question${approval.questions.length === 1 ? "" : "s"} from a tool.`;
		case "elicitation":
			return bounded(`${approval.serverName} asks: ${approval.message}`);
	}
}

function ordinaryCard(
	approval: BrowserApproval,
	context: ApprovalAuthorityContext,
): WorkbenchOrdinaryApprovalCard {
	const status = ordinaryApprovalStatus(approval, context);
	const fields = approvalFields(approval);
	return Object.freeze({
		kind: "ordinary",
		key: `ordinary:${approval.requestId}`,
		family: approval.approvalKind,
		title: FAMILY_TITLES[approval.approvalKind],
		summary: ordinarySummary(approval),
		request: approval,
		identity: ordinaryIdentityRows(approval),
		broker: brokerRows(approval),
		effect: ordinaryEffectRows(approval),
		fields,
		links: ordinaryLinks(approval),
		offers: approvalOffers(approval, status.phase, status.authority),
		spoken: ordinarySpoken(approval, status.phase),
		status,
		expiresAtMs: approval.expiresAtMs,
		notices: ordinaryNotices(approval),
	});
}

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
		offers: dynamicOffers(approval, status.phase, status.authority),
		spoken: dynamicSpoken(),
		status,
		effectHash: approval.effectHash,
		toolResult: approval.toolResult,
		expiresAtMs: approval.expiresAtMs,
		notices: Object.freeze([IMMUTABLE_EFFECT_NOTICE, NO_RESUME_NOTICE]),
	});
}

export function approvalKicker(card: WorkbenchApprovalCard): string {
	return card.kind === "ordinary" ? FAMILY_KICKERS[card.family] : DYNAMIC_KICKERS[card.tool];
}

export function approvalTarget(card: WorkbenchApprovalCard): string {
	if (card.kind === "ordinary") return card.request.binding.target;
	return card.request.effect.target ?? "a new thread that does not exist yet";
}

function authorityContext(input: WorkbenchApprovalsInput): ApprovalAuthorityContext {
	const state = input.state;
	const connection =
		state.connection === "connected"
			? "connected"
			: state.connection === "reconnecting"
				? "reconnecting"
				: "stopped";
	return Object.freeze({
		nowMs: input.nowMs,
		canCommand: input.canCommand,
		connection,
		staleSnapshot: state.kind === "stream",
		connectionReason: "reason" in state ? state.reason : null,
	});
}

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
	const announcement =
		pending > 0
			? `${pending} Codex approval${pending === 1 ? "" : "s"} waiting for you.`
			: cards.length === 0
				? "No Codex approval request is open."
				: `No Codex approval is waiting. ${cards.length} recorded request${cards.length === 1 ? "" : "s"}.`;
	return Object.freeze({
		scope: "app_global",
		pending,
		total: cards.length,
		announcement,
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

function reconciliation(snapshot: BrowserSnapshot): WorkbenchApprovalsReconciliation | null {
	const operation = snapshot.operation;
	if (operation === null) return null;
	return Object.freeze({
		operationId: operation.operationId,
		outcome: operation.outcome,
		label: RECONCILIATION_LABELS[operation.outcome],
		detail: operation.message ?? RECONCILIATION_DETAILS[operation.outcome],
	});
}

function orderedCards(
	snapshot: BrowserSnapshot,
	context: ApprovalAuthorityContext,
): readonly WorkbenchApprovalCard[] {
	const cards: WorkbenchApprovalCard[] = [
		...snapshot.approvals.map((approval) => ordinaryCard(approval, context)),
		...snapshot.dynamicApprovals.map((approval) => dynamicCard(approval, context)),
	];
	const pending = cards.filter((card) => card.status.phase === "pending");
	const settled = cards.filter((card) => card.status.phase !== "pending");
	return Object.freeze([
		...pending.toSorted((left, right) => left.expiresAtMs - right.expiresAtMs),
		...settled,
	]);
}

export function projectWorkbenchApprovals(input: WorkbenchApprovalsInput): WorkbenchApprovalsView {
	const context = authorityContext(input);
	const snapshot = input.state.snapshot;
	const cards = snapshot === null ? Object.freeze([]) : orderedCards(snapshot, context);
	const authorityReason =
		snapshot === null
			? (context.connectionReason ??
				"The workbench has published no snapshot, so no approval can be answered.")
			: context.connection !== "connected"
				? (context.connectionReason ?? "The browser is not connected to the workbench host.")
				: context.staleSnapshot
					? "This snapshot is behind the host, so no decision can name the right request."
					: input.canCommand
						? null
						: "This browser cannot answer approvals until it holds a usable workbench command lease.";
	return Object.freeze({
		beacon: beacon(cards),
		cards,
		reconciliation: snapshot === null ? null : reconciliation(snapshot),
		authority: authorityReason === null ? "live" : "removed",
		authorityReason,
		empty: cards.length === 0 ? "No Codex approval request is open." : null,
	});
}

export function workbenchApprovalsInput(
	state: BrowserWorkbenchState,
	nowMs: number,
	canCommand: boolean,
): WorkbenchApprovalsInput {
	return Object.freeze({ state, nowMs, canCommand });
}
