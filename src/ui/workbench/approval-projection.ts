// Pure projection of pending and settled approvals into cards: the family,
// the request details, the decisions the model defines, and the phase the
// card is in. Public so tests can reach it.

import type {
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserSpokenApproval,
} from "@/shared/codex-browser-model";
import type { CodexCommandExecutionApprovalDecision } from "@/shared/codex-app-server-contract";
import type { ApprovalChoice } from "@/ui/workbench/contracts";
import { clockTime, counted } from "@/ui/workbench/lib/format";

/** One line of request detail; mono for commands, paths and identifiers. */
interface ApprovalDetail {
	label: string;
	value: string;
	mono: boolean;
}

/** One decision button the model allows. */
interface ApprovalDecisionOption {
	id: string;
	label: string;
	tone: "default" | "outline" | "destructive";
	choice: ApprovalChoice;
}

/** Where a card stands. */
type ApprovalPhase = "pending" | "busy" | "settled" | "outcome_unknown" | "closed";

/** One approval card, whichever family it comes from. */
interface ApprovalCard {
	/** The request id, or a dynamic approval's call id; the busy key. */
	key: string;
	family: string;
	title: string;
	details: readonly ApprovalDetail[];
	phase: ApprovalPhase;
	/** The words for the phase: settlement, unknown outcome, or expiry. */
	phaseText: string;
	decisions: readonly ApprovalDecisionOption[];
	/** Why this approval can or cannot be answered by voice. */
	spokenText: string;
	expiresAtMs: number;
}

const FAMILY_TEXT: Record<BrowserApproval["approvalKind"], string> = {
	command_execution: "Command",
	file_change: "File change",
	user_input: "Question",
	elicitation: "Elicitation",
	permissions: "Permissions",
	apply_patch: "Patch",
	exec_command: "Exec",
};

const COMMAND_DECISION_LABELS: Record<string, string> = {
	accept: "Allow once",
	acceptForSession: "Allow for session",
	decline: "Decline",
	cancel: "Cancel",
};

const DECLINE_LIKE: ReadonlySet<string> = new Set(["decline", "cancel"]);

/**
 * The button tone for a decision id.
 * @param id The decision id.
 * @param first Whether it is the first allowed decision.
 * @returns Destructive for refusals, default for the first acceptance, outline otherwise.
 */
function decisionTone(id: string, first: boolean): ApprovalDecisionOption["tone"] {
	if (DECLINE_LIKE.has(id)) {
		return "destructive";
	}
	return first ? "default" : "outline";
}

/**
 * The label and id of one command execution decision.
 * @param decision The decision as the model allows it.
 * @returns Its id and label.
 */
function commandDecisionName(decision: CodexCommandExecutionApprovalDecision): {
	id: string;
	label: string;
} {
	if (typeof decision === "string") {
		return { id: decision, label: COMMAND_DECISION_LABELS[decision] ?? decision };
	}
	if ("acceptWithExecpolicyAmendment" in decision) {
		return { id: "acceptWithExecpolicyAmendment", label: "Allow and amend policy" };
	}
	const amendment = decision.applyNetworkPolicyAmendment.network_policy_amendment;
	return {
		id: `network:${amendment.action}:${amendment.host}`,
		label: `${amendment.action === "allow" ? "Allow" : "Deny"} network ${amendment.host}`,
	};
}

/**
 * The decision buttons of a command execution approval.
 * @param approval The approval.
 * @returns One option per allowed decision.
 */
function commandDecisions(
	approval: Extract<BrowserApproval, { approvalKind: "command_execution" }>,
): ApprovalDecisionOption[] {
	return approval.availableDecisions.map((decision, index) => {
		const { id, label } = commandDecisionName(decision);
		return {
			id,
			label,
			tone: decisionTone(id, index === 0),
			choice: { kind: "command_decision", decision },
		};
	});
}

/**
 * The decision buttons of a file change approval.
 * @param approval The approval.
 * @returns One option per allowed decision.
 */
function fileChangeDecisions(
	approval: Extract<BrowserApproval, { approvalKind: "file_change" }>,
): ApprovalDecisionOption[] {
	return approval.availableDecisions.map((decision, index) => ({
		id: decision,
		label: COMMAND_DECISION_LABELS[decision] ?? decision,
		tone: decisionTone(decision, index === 0),
		choice: { kind: "file_change_decision", decision },
	}));
}

/**
 * The answer buttons of a question: one per option of each answerable
 * question. Secret questions and free-text questions offer nothing here.
 * @param approval The approval.
 * @returns The options.
 */
function questionDecisions(
	approval: Extract<BrowserApproval, { approvalKind: "user_input" }>,
): ApprovalDecisionOption[] {
	return approval.questions.flatMap((question) => {
		if (question.isSecret || question.options === null) {
			return [];
		}
		return question.options.map((option) => ({
			id: `${question.id}:${option.label}`,
			label: option.label,
			tone: "outline" as const,
			choice: { kind: "answer" as const, questionId: question.id, answer: option.label },
		}));
	});
}

/**
 * Approve and decline, for families whose only decision is yes or no.
 * @param approvable Whether approving is offered at all.
 * @returns The options.
 */
function yesNoDecisions(approvable: boolean): ApprovalDecisionOption[] {
	const decline: ApprovalDecisionOption = {
		id: "decline",
		label: "Decline",
		tone: "destructive",
		choice: { kind: "decline" },
	};
	if (!approvable) {
		return [decline];
	}
	return [
		{ id: "approve", label: "Approve", tone: "default", choice: { kind: "approve" } },
		decline,
	];
}

/**
 * The decisions the model defines for one approval.
 * @param approval The approval.
 * @returns The options, in the order the model lists them.
 */
function approvalDecisions(approval: BrowserApproval): ApprovalDecisionOption[] {
	switch (approval.approvalKind) {
		case "command_execution":
			return commandDecisions(approval);
		case "file_change":
			return fileChangeDecisions(approval);
		case "user_input":
			return questionDecisions(approval);
		case "elicitation":
			return yesNoDecisions(false);
		default:
			return yesNoDecisions(true);
	}
}

type RequestedScope = Extract<BrowserApproval, { approvalKind: "permissions" }>["requestedScope"];

/**
 * The words for a requested permission scope.
 * @param scope The scope.
 * @returns A phrase.
 */
function scopeText(scope: RequestedScope): string {
	const parts = scope.fileAccess.map((access) => `files: ${access}`);
	if (scope.network !== null) {
		parts.push(`network: ${scope.network ? "yes" : "no"}`);
	}
	return parts.length === 0 ? "no scope named" : parts.join(", ");
}

/**
 * The elicitation's message and, when it has one, its URL.
 * @param approval The approval.
 * @returns The rows.
 */
function elicitationDetails(
	approval: Extract<BrowserApproval, { approvalKind: "elicitation" }>,
): ApprovalDetail[] {
	const rows: ApprovalDetail[] = [
		{ label: approval.serverName, value: approval.message, mono: false },
	];
	if (approval.url !== null) {
		rows.push({ label: "URL", value: approval.url, mono: true });
	}
	return rows;
}

/**
 * The command a command execution approval asks to run.
 * @param approval The approval.
 * @returns One mono row.
 */
function commandDetails(
	approval: Extract<BrowserApproval, { approvalKind: "command_execution" }>,
): ApprovalDetail[] {
	return [{ label: "Command", value: approval.command ?? "(not shown)", mono: true }];
}

/**
 * The questions a user-input approval asks.
 * @param approval The approval.
 * @returns One row per question.
 */
function questionDetails(
	approval: Extract<BrowserApproval, { approvalKind: "user_input" }>,
): ApprovalDetail[] {
	return approval.questions.map((question) => ({
		label: question.header,
		value: question.question,
		mono: false,
	}));
}

/**
 * The request details of the families that gate an action.
 * @param approval The approval.
 * @returns The detail rows, empty for a file change whose diff is not projected.
 */
function actionDetails(
	approval: Extract<
		BrowserApproval,
		{ approvalKind: "command_execution" | "exec_command" | "apply_patch" | "file_change" }
	>,
): ApprovalDetail[] {
	switch (approval.approvalKind) {
		case "command_execution":
			return commandDetails(approval);
		case "exec_command":
			return [{ label: "Command", value: approval.command.join(" "), mono: true }];
		case "apply_patch":
			return [{ label: "Files", value: counted(approval.fileCount, "file", "files"), mono: false }];
		default:
			return [];
	}
}

/**
 * The request details of one approval, in mono where technical.
 * @param approval The approval.
 * @returns The detail rows.
 */
function approvalDetails(approval: BrowserApproval): ApprovalDetail[] {
	switch (approval.approvalKind) {
		case "user_input":
			return questionDetails(approval);
		case "elicitation":
			return elicitationDetails(approval);
		case "permissions":
			return [{ label: "Scope", value: scopeText(approval.requestedScope), mono: true }];
		default:
			return actionDetails(approval);
	}
}

/**
 * The common rows every approval carries: target, effect, reason.
 * @param approval The approval.
 * @returns The rows.
 */
function bindingDetails(approval: BrowserApproval): ApprovalDetail[] {
	const rows: ApprovalDetail[] = [
		{ label: "Target", value: approval.binding.target, mono: true },
		{ label: "Effect", value: approval.binding.effect, mono: true },
	];
	if ("reason" in approval && typeof approval.reason === "string") {
		rows.push({ label: "Reason", value: approval.reason, mono: false });
	}
	return rows;
}

/** A phase with its words. */
interface PhaseWords {
	phase: ApprovalPhase;
	phaseText: string;
}

/**
 * The phase while a decision is still possible: pending, or busy on the wire.
 * @param busy Whether a decision is on the wire.
 * @param expiresAtMs When the request expires.
 * @returns The phase and text.
 */
function openPhase(busy: boolean, expiresAtMs: number): PhaseWords {
	return busy
		? { phase: "busy", phaseText: "Sending decision" }
		: { phase: "pending", phaseText: `Expires ${clockTime(expiresAtMs)}` };
}

/**
 * The words for a settled approval: its decision and delivery outcome.
 * @param lifecycle The settled lifecycle.
 * @returns The phrase.
 */
function settledText(
	lifecycle: Extract<BrowserApproval["lifecycle"], { state: "settled" }>,
): string {
	const outcome =
		lifecycle.outcome === null ? "outcome pending" : lifecycle.outcome.replace("_", " ");
	return `${lifecycle.decision} · ${outcome}`;
}

/**
 * The phase of an approval's lifecycle and its words.
 * @param approval The approval.
 * @param busy Whether a decision is on the wire.
 * @returns The phase and text.
 */
function approvalPhase(approval: BrowserApproval, busy: boolean): PhaseWords {
	const { lifecycle } = approval;
	switch (lifecycle.state) {
		case "staged":
		case "pending":
			return openPhase(busy, approval.expiresAtMs);
		case "outcome_unknown":
			return {
				phase: "outcome_unknown",
				phaseText: `Outcome unknown after ${lifecycle.decision}: ${lifecycle.reason}`,
			};
		case "settled":
			return { phase: "settled", phaseText: settledText(lifecycle) };
		default:
			return { phase: "closed", phaseText: `${lifecycle.state}: ${lifecycle.reason}` };
	}
}

const SPOKEN_REASON_TEXT: Record<BrowserApproval["spoken"]["reason"], string> = {
	eligible: "Can be answered by voice",
	not_pending: "Not pending",
	stale_ownership: "Voice cannot answer: ownership changed",
	secret: "Voice cannot answer: secret",
	multi_question: "Voice cannot answer: several questions",
	form: "Voice cannot answer: form",
	url: "Voice cannot answer: needs a URL",
	permission_scope: "Voice cannot answer: permission scope",
	coordinator_blocking: "Voice cannot answer: blocks the coordinator",
	unsupported_schema: "Voice cannot answer: unsupported shape",
	broader_grant: "Voice cannot answer: broader grant",
	not_binary: "Voice cannot answer: not yes or no",
};

/**
 * One approval as a card.
 * @param approval The approval.
 * @param busy Whether its decision is on the wire.
 * @returns The card.
 */
function projectApproval(approval: BrowserApproval, busy: boolean): ApprovalCard {
	const { phase, phaseText } = approvalPhase(approval, busy);
	return {
		key: approval.requestId,
		family: FAMILY_TEXT[approval.approvalKind],
		title: `${FAMILY_TEXT[approval.approvalKind]} approval`,
		details: [...approvalDetails(approval), ...bindingDetails(approval)],
		phase,
		phaseText,
		decisions: phase === "pending" ? approvalDecisions(approval) : [],
		spokenText: SPOKEN_REASON_TEXT[approval.spoken.reason],
		expiresAtMs: approval.expiresAtMs,
	};
}

const DYNAMIC_TOOL_TEXT: Record<BrowserDynamicApproval["effect"]["tool"], string> = {
	create_thread: "Create thread",
	fork_thread: "Fork thread",
	send_message_to_thread: "Message thread",
};

const DYNAMIC_SETTLED_STATES: ReadonlySet<BrowserDynamicApproval["state"]> = new Set([
	"approved",
	"declined",
	"delivered",
]);

/**
 * The phase of a dynamic approval and its words.
 * @param approval The dynamic approval.
 * @param busy Whether its decision is on the wire.
 * @returns The phase and text.
 */
function dynamicPhase(approval: BrowserDynamicApproval, busy: boolean): PhaseWords {
	if (approval.state === "pending") {
		return openPhase(busy, approval.expiresAtMs);
	}
	if (approval.state === "outcome_unknown") {
		return {
			phase: "outcome_unknown",
			phaseText: "Outcome unknown: the decision may or may not have reached Codex",
		};
	}
	const result = approval.toolResult === null ? "" : ` · ${approval.toolResult}`;
	return {
		phase: DYNAMIC_SETTLED_STATES.has(approval.state) ? "settled" : "closed",
		phaseText: `${approval.state.replace("_", " ")}${result}`,
	};
}

/**
 * The request details of a dynamic approval.
 * @param approval The dynamic approval.
 * @returns The rows.
 */
function dynamicDetails(approval: BrowserDynamicApproval): ApprovalDetail[] {
	const { effect } = approval;
	const rows: ApprovalDetail[] = [{ label: "Summary", value: effect.visualSummary, mono: false }];
	if (effect.arguments.prompt !== null) {
		rows.push({ label: "Prompt", value: effect.arguments.prompt, mono: true });
	}
	if (effect.target !== null) {
		rows.push({ label: "Target", value: effect.target, mono: true });
	}
	rows.push({ label: "Hash", value: approval.effectHash, mono: true });
	return rows;
}

/**
 * One dynamic (coordination) approval as a card.
 * @param approval The dynamic approval.
 * @param busy Whether its decision is on the wire.
 * @returns The card.
 */
function projectDynamicApproval(approval: BrowserDynamicApproval, busy: boolean): ApprovalCard {
	const { phase, phaseText } = dynamicPhase(approval, busy);
	return {
		key: approval.identity.callId,
		family: "Coordination",
		title: DYNAMIC_TOOL_TEXT[approval.effect.tool],
		details: dynamicDetails(approval),
		phase,
		phaseText,
		decisions:
			phase === "pending"
				? [
						{ id: "approve", label: "Approve", tone: "default", choice: { kind: "approve" } },
						{ id: "decline", label: "Decline", tone: "destructive", choice: { kind: "decline" } },
					]
				: [],
		spokenText: "Coordination approvals are answered here",
		expiresAtMs: approval.expiresAtMs,
	};
}

const SPOKEN_STATE_TEXT: Record<BrowserSpokenApproval["state"], string> = {
	idle: "",
	armed: "Spoken approval armed: say yes or no",
	resolving: "Spoken approval heard, resolving",
	settled: "Spoken approval settled",
	expired: "Spoken approval expired",
	visual_fallback: "Spoken approval fell back to the buttons",
	outcome_unknown: "Spoken approval: resolver lost, outcome unknown",
	stale_session: "Spoken approval stale: session changed",
};

/**
 * The spoken approval as one line, or null when idle.
 * @param spoken The published spoken approval.
 * @returns The line and whether it is a warning.
 */
function spokenApprovalLine(
	spoken: BrowserSpokenApproval,
): { text: string; warning: boolean } | null {
	if (spoken.state === "idle") {
		return null;
	}
	const parts = [SPOKEN_STATE_TEXT[spoken.state]];
	if (spoken.gate !== null) {
		parts.push(spoken.gate.effectSummary);
	}
	if (spoken.reason !== null) {
		parts.push(spoken.reason.replaceAll("_", " "));
	}
	const warning =
		spoken.state === "outcome_unknown" ||
		spoken.state === "visual_fallback" ||
		spoken.state === "stale_session";
	return { text: parts.join(" · "), warning };
}

export {
	projectApproval,
	projectDynamicApproval,
	spokenApprovalLine,
	type ApprovalCard,
	type ApprovalDecisionOption,
	type ApprovalDetail,
	type ApprovalPhase,
};
