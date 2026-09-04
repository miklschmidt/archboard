import type { BrowserApproval } from "../../../shared/codex-browser-model/index.js";
import type {
	WorkbenchApprovalOffer,
	WorkbenchApprovalPhase,
	WorkbenchApprovalSpoken,
	WorkbenchApprovalTone,
} from "../contract.js";
import { permissionsAreGrantable } from "./fields.js";
import { DYNAMIC_SPOKEN_DETAIL, SPOKEN_REASONS, spokenDetail } from "./vocabulary.js";

type CommandApproval = Extract<BrowserApproval, { readonly approvalKind: "command_execution" }>;
type CommandDecision = CommandApproval["availableDecisions"][number];
type Elicitation = Extract<BrowserApproval, { readonly approvalKind: "elicitation" }>;

export const DECISION_PREFIX = "decision:";
export const OFFER_SUBMIT = "submit";
export const OFFER_DECLINE = "decline";
export const OFFER_CANCEL = "cancel";
export const OFFER_APPROVE = "approve";
export const OFFER_ABORT = "abort";

const PLAIN_DECISION_LABELS = {
	accept: "Approve",
	acceptForSession: "Approve for this session",
	decline: "Decline",
	cancel: "Cancel",
} as const;

const PLAIN_DECISION_TONES = {
	accept: "primary",
	acceptForSession: "secondary",
	decline: "secondary",
	cancel: "quiet",
} as const satisfies Record<keyof typeof PLAIN_DECISION_LABELS, WorkbenchApprovalTone>;

const PLAIN_DECISION_DESCRIPTIONS = {
	accept: null,
	acceptForSession: "A session grant also covers later commands in this session.",
	decline: null,
	cancel: null,
} as const satisfies Record<keyof typeof PLAIN_DECISION_LABELS, string | null>;

function offer(value: {
	readonly id: string;
	readonly label: string;
	readonly tone: WorkbenchApprovalTone;
	readonly description?: string | null;
	readonly submitsForm?: boolean;
	readonly spokenEligible?: boolean;
}): WorkbenchApprovalOffer {
	return Object.freeze({
		id: value.id,
		label: value.label,
		description: value.description ?? null,
		tone: value.tone,
		submitsForm: value.submitsForm ?? false,
		spokenEligible: value.spokenEligible ?? false,
	});
}

function commandDecisionOffer(
	decision: CommandDecision,
	index: number,
	spoken: boolean,
): WorkbenchApprovalOffer {
	const id = `${DECISION_PREFIX}${index}`;
	if (typeof decision === "string")
		return offer({
			id,
			label: PLAIN_DECISION_LABELS[decision],
			tone: PLAIN_DECISION_TONES[decision],
			description: PLAIN_DECISION_DESCRIPTIONS[decision],
			spokenEligible: spoken && (decision === "accept" || decision === "decline"),
		});
	if ("acceptWithExecpolicyAmendment" in decision)
		return offer({
			id,
			label: "Approve with the proposed exec policy amendment",
			tone: "secondary",
			description: `The host proposed: ${decision.acceptWithExecpolicyAmendment.execpolicy_amendment.join(" · ")}`,
		});
	const amendment = decision.applyNetworkPolicyAmendment.network_policy_amendment;
	return offer({
		id,
		label: `${amendment.action === "allow" ? "Allow" : "Deny"} ${amendment.host} in the network policy`,
		tone: "secondary",
		description: "This changes the network policy beyond this one command.",
	});
}

function elicitationOffers(approval: Elicitation): readonly WorkbenchApprovalOffer[] {
	const unsupported = approval.mode === "url" ? approval.url === null : approval.fields === null;
	const accept = offer({
		id: OFFER_SUBMIT,
		label: approval.mode === "url" ? "Accept and open the URL" : "Send this form",
		tone: "primary",
		submitsForm: approval.mode !== "url",
	});
	const rest = [
		offer({ id: OFFER_DECLINE, label: "Decline", tone: "secondary" }),
		offer({ id: OFFER_CANCEL, label: "Cancel", tone: "quiet" }),
	];
	return unsupported ? rest : [accept, ...rest];
}

function ordinaryOffers(
	approval: BrowserApproval,
	spoken: boolean,
): readonly WorkbenchApprovalOffer[] {
	switch (approval.approvalKind) {
		case "command_execution":
			return approval.availableDecisions.map((decision, index) =>
				commandDecisionOffer(decision, index, spoken),
			);
		case "file_change":
			return approval.availableDecisions.map((decision, index) =>
				offer({
					id: `${DECISION_PREFIX}${index}`,
					label: PLAIN_DECISION_LABELS[decision],
					tone: PLAIN_DECISION_TONES[decision],
					description: PLAIN_DECISION_DESCRIPTIONS[decision],
				}),
			);
		case "user_input":
			return [
				offer({ id: OFFER_SUBMIT, label: "Send answers", tone: "primary", submitsForm: true }),
				offer({ id: OFFER_DECLINE, label: "Answer nothing", tone: "quiet" }),
			];
		case "elicitation":
			return elicitationOffers(approval);
		case "permissions":
			// A request that names no grantable permission has nothing to submit: a
			// "grant" would send the same empty profile as the decline.
			return permissionsAreGrantable(approval)
				? [
						offer({
							id: OFFER_SUBMIT,
							label: "Grant the reviewed permissions",
							tone: "primary",
							submitsForm: true,
						}),
						offer({ id: OFFER_DECLINE, label: "Grant nothing", tone: "secondary" }),
					]
				: [offer({ id: OFFER_DECLINE, label: "Grant nothing", tone: "primary" })];
		case "apply_patch":
		case "exec_command":
			return [
				offer({ id: OFFER_APPROVE, label: "Approve", tone: "primary" }),
				offer({ id: OFFER_DECLINE, label: "Decline", tone: "secondary", submitsForm: true }),
				offer({ id: OFFER_ABORT, label: "Cancel", tone: "quiet" }),
			];
	}
}

/**
 * A genuine ordinary binary approval is a command execution whose host-offered
 * decision set is exactly accept and decline. Every other family, every broader
 * grant, and every amendment stays visual-only whatever the host annotated.
 */
export function isGenuineBinaryApproval(approval: BrowserApproval): boolean {
	if (approval.approvalKind !== "command_execution") return false;
	const decisions = approval.availableDecisions;
	return decisions.length === 2 && decisions.includes("accept") && decisions.includes("decline");
}

export function ordinarySpoken(
	approval: BrowserApproval,
	phase: WorkbenchApprovalPhase,
): WorkbenchApprovalSpoken {
	const host = approval.spoken;
	const eligible =
		host.eligible &&
		host.reason === "eligible" &&
		phase === "pending" &&
		isGenuineBinaryApproval(approval);
	if (eligible)
		return Object.freeze({
			eligible: true,
			label: "Spoken approval available",
			detail: SPOKEN_REASONS.eligible,
		});
	const detail = host.eligible
		? "Visual only: this browser could not confirm a plain accept or decline."
		: spokenDetail(host.reason);
	return Object.freeze({ eligible: false, label: "Visual only", detail });
}

export function dynamicSpoken(): WorkbenchApprovalSpoken {
	return Object.freeze({ eligible: false, label: "Visual only", detail: DYNAMIC_SPOKEN_DETAIL });
}

export function approvalOffers(
	approval: BrowserApproval,
	phase: WorkbenchApprovalPhase,
	authority: "live" | "removed",
): readonly WorkbenchApprovalOffer[] {
	if (authority === "removed" || phase !== "pending") return Object.freeze([]);
	return Object.freeze(ordinaryOffers(approval, ordinarySpoken(approval, phase).eligible));
}

/**
 * A dynamic coordination approval offers one approve or decline decision only,
 * and only while it is pending — which the closed model already ties to its
 * browser binding.
 */
export function dynamicOffers(
	phase: WorkbenchApprovalPhase,
	authority: "live" | "removed",
): readonly WorkbenchApprovalOffer[] {
	if (authority === "removed" || phase !== "pending") return Object.freeze([]);
	return Object.freeze([
		offer({ id: OFFER_APPROVE, label: "Approve this effect", tone: "primary" }),
		offer({ id: OFFER_DECLINE, label: "Decline this effect", tone: "secondary" }),
	]);
}
