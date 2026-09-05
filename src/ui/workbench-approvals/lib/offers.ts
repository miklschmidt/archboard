// The decisions the model allows on one request, and whether a request may
// also be answered by voice. Offers exist only while a request is pending
// and this browser holds authority; every other state is read-only.

import type { BrowserApproval } from "@/shared/codex-browser-model";
import type {
	WorkbenchApprovalOffer,
	WorkbenchApprovalPhase,
	WorkbenchApprovalSpoken,
	WorkbenchApprovalTone,
} from "@/ui/workbench-approvals/contracts";
import { permissionsAreGrantable } from "@/ui/workbench-approvals/lib/fields";
import {
	DYNAMIC_SPOKEN_DETAIL,
	SPOKEN_REASONS,
	spokenDetail,
} from "@/ui/workbench-approvals/lib/vocabulary";

type CommandApproval = Extract<BrowserApproval, { readonly approvalKind: "command_execution" }>;
type CommandDecision = CommandApproval["availableDecisions"][number];
type FileChangeApproval = Extract<BrowserApproval, { readonly approvalKind: "file_change" }>;
type Elicitation = Extract<BrowserApproval, { readonly approvalKind: "elicitation" }>;
type Authority = "live" | "removed";

const DECISION_PREFIX = "decision:";
const OFFER_SUBMIT = "submit";
const OFFER_DECLINE = "decline";
const OFFER_CANCEL = "cancel";
const OFFER_APPROVE = "approve";
const OFFER_ABORT = "abort";

const PLAIN_DECISION_LABELS = {
	accept: "Approve",
	acceptForSession: "Approve for this session",
	decline: "Decline",
	cancel: "Cancel",
} as const;

type PlainDecision = keyof typeof PLAIN_DECISION_LABELS;

const PLAIN_DECISION_TONES = {
	accept: "primary",
	acceptForSession: "secondary",
	decline: "secondary",
	cancel: "quiet",
} as const satisfies Record<PlainDecision, WorkbenchApprovalTone>;

const PLAIN_DECISION_DESCRIPTIONS = {
	accept: null,
	acceptForSession: "A session grant also covers later commands in this session.",
	decline: null,
	cancel: null,
} as const satisfies Record<PlainDecision, string | null>;

/** An offer's optional facts. */
type OfferSeed = Pick<WorkbenchApprovalOffer, "id" | "label" | "tone"> &
	Partial<Pick<WorkbenchApprovalOffer, "description" | "submitsForm" | "spokenEligible">>;

/**
 * One offer, frozen.
 * @param seed The offer's facts.
 * @returns The offer.
 */
function offer(seed: OfferSeed): WorkbenchApprovalOffer {
	return Object.freeze({
		description: null,
		submitsForm: false,
		spokenEligible: false,
		...seed,
	});
}

/**
 * The offer for a plain host-offered decision.
 * @param id The offer id.
 * @param decision The decision.
 * @param spokenEligible Whether voice may answer it.
 * @returns The offer.
 */
function plainDecisionOffer(
	id: string,
	decision: PlainDecision,
	spokenEligible: boolean,
): WorkbenchApprovalOffer {
	return offer({
		id,
		label: PLAIN_DECISION_LABELS[decision],
		tone: PLAIN_DECISION_TONES[decision],
		description: PLAIN_DECISION_DESCRIPTIONS[decision],
		spokenEligible,
	});
}

/**
 * The offer for one command execution decision, plain or amended.
 * @param decision The host-offered decision.
 * @param index Its position among the offered decisions.
 * @param spoken Whether the request as a whole is spoken-eligible.
 * @returns The offer.
 */
function commandDecisionOffer(
	decision: CommandDecision,
	index: number,
	spoken: boolean,
): WorkbenchApprovalOffer {
	const id = `${DECISION_PREFIX}${index}`;
	if (typeof decision === "string") {
		const binary = decision === "accept" || decision === "decline";
		return plainDecisionOffer(id, decision, spoken && binary);
	}
	if ("acceptWithExecpolicyAmendment" in decision) {
		return offer({
			id,
			label: "Approve with the proposed exec policy amendment",
			tone: "secondary",
			description: `The host proposed: ${decision.acceptWithExecpolicyAmendment.execpolicy_amendment.join(" · ")}`,
		});
	}
	const amendment = decision.applyNetworkPolicyAmendment.network_policy_amendment;
	return offer({
		id,
		label: `${amendment.action === "allow" ? "Allow" : "Deny"} ${amendment.host} in the network policy`,
		tone: "secondary",
		description: "This changes the network policy beyond this one command.",
	});
}

/**
 * The offers of a file change: the host-offered decisions, in order.
 * @param approval The request.
 * @returns The offers.
 */
function fileChangeOffers(approval: FileChangeApproval): readonly WorkbenchApprovalOffer[] {
	return approval.availableDecisions.map((decision, index) =>
		plainDecisionOffer(`${DECISION_PREFIX}${index}`, decision, false),
	);
}

/**
 * The offers of an elicitation: accept only when the host published what
 * accepting needs.
 * @param approval The request.
 * @returns The offers.
 */
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

/**
 * The offers of a permissions request. A request that names no grantable
 * permission has nothing to submit: a "grant" would send the same empty
 * profile as the decline.
 * @param approval The request.
 * @returns The offers.
 */
function permissionsOffers(approval: BrowserApproval): readonly WorkbenchApprovalOffer[] {
	if (!permissionsAreGrantable(approval)) {
		return [offer({ id: OFFER_DECLINE, label: "Grant nothing", tone: "primary" })];
	}
	return [
		offer({
			id: OFFER_SUBMIT,
			label: "Grant the reviewed permissions",
			tone: "primary",
			submitsForm: true,
		}),
		offer({ id: OFFER_DECLINE, label: "Grant nothing", tone: "secondary" }),
	];
}

const USER_INPUT_OFFERS: readonly WorkbenchApprovalOffer[] = Object.freeze([
	offer({ id: OFFER_SUBMIT, label: "Send answers", tone: "primary", submitsForm: true }),
	offer({ id: OFFER_DECLINE, label: "Answer nothing", tone: "quiet" }),
]);

const LEGACY_OFFERS: readonly WorkbenchApprovalOffer[] = Object.freeze([
	offer({ id: OFFER_APPROVE, label: "Approve", tone: "primary" }),
	offer({ id: OFFER_DECLINE, label: "Decline", tone: "secondary", submitsForm: true }),
	offer({ id: OFFER_ABORT, label: "Cancel", tone: "quiet" }),
]);

/**
 * The offers of the families whose decisions the host enumerates.
 * @param approval The request.
 * @param spoken Whether the request is spoken-eligible.
 * @returns The offers, in the host's order.
 */
function enumeratedOffers(
	approval: CommandApproval | FileChangeApproval,
	spoken: boolean,
): readonly WorkbenchApprovalOffer[] {
	if (approval.approvalKind === "file_change") {
		return fileChangeOffers(approval);
	}
	return approval.availableDecisions.map((decision, index) =>
		commandDecisionOffer(decision, index, spoken),
	);
}

/**
 * The offers of one ordinary request.
 * @param approval The request.
 * @param spoken Whether the request is spoken-eligible.
 * @returns The offers.
 */
function ordinaryOffers(
	approval: BrowserApproval,
	spoken: boolean,
): readonly WorkbenchApprovalOffer[] {
	switch (approval.approvalKind) {
		case "command_execution":
		case "file_change":
			return enumeratedOffers(approval, spoken);
		case "user_input":
			return USER_INPUT_OFFERS;
		case "elicitation":
			return elicitationOffers(approval);
		case "permissions":
			return permissionsOffers(approval);
		default:
			return LEGACY_OFFERS;
	}
}

/**
 * A genuine ordinary binary approval is a command execution whose host-offered
 * decision set is exactly accept and decline. Every other family, every
 * broader grant, and every amendment stays visual-only whatever the host
 * annotated.
 * @param approval The request.
 * @returns True for exactly accept and decline on a command execution.
 */
function isGenuineBinaryApproval(approval: BrowserApproval): boolean {
	if (approval.approvalKind !== "command_execution") {
		return false;
	}
	const decisions = approval.availableDecisions;
	return decisions.length === 2 && decisions.includes("accept") && decisions.includes("decline");
}

/**
 * Whether an ordinary request may be answered by voice, and why.
 * @param approval The request.
 * @param phase Its phase.
 * @returns The spoken facts.
 */
function ordinarySpoken(
	approval: BrowserApproval,
	phase: WorkbenchApprovalPhase,
): WorkbenchApprovalSpoken {
	const host = approval.spoken;
	const eligible =
		host.eligible &&
		host.reason === "eligible" &&
		phase === "pending" &&
		isGenuineBinaryApproval(approval);
	if (eligible) {
		return Object.freeze({
			eligible: true,
			label: "Spoken approval available",
			detail: SPOKEN_REASONS.eligible,
		});
	}
	const detail = host.eligible
		? "Visual only: this browser could not confirm a plain accept or decline."
		: spokenDetail(host.reason);
	return Object.freeze({ eligible: false, label: "Visual only", detail });
}

/**
 * A dynamic coordination approval is never spoken-eligible.
 * @returns The spoken facts.
 */
function dynamicSpoken(): WorkbenchApprovalSpoken {
	return Object.freeze({ eligible: false, label: "Visual only", detail: DYNAMIC_SPOKEN_DETAIL });
}

/**
 * The offers of one ordinary request while it can still be decided.
 * @param approval The request.
 * @param phase Its phase.
 * @param authority Whether this browser may decide it.
 * @returns The offers; none unless pending with live authority.
 */
function approvalOffers(
	approval: BrowserApproval,
	phase: WorkbenchApprovalPhase,
	authority: Authority,
): readonly WorkbenchApprovalOffer[] {
	if (authority === "removed" || phase !== "pending") {
		return Object.freeze([]);
	}
	return Object.freeze(ordinaryOffers(approval, ordinarySpoken(approval, phase).eligible));
}

/**
 * A dynamic coordination approval offers one approve or decline decision
 * only, and only while it is pending.
 * @param phase Its phase.
 * @param authority Whether this browser may decide it.
 * @returns The offers.
 */
function dynamicOffers(
	phase: WorkbenchApprovalPhase,
	authority: Authority,
): readonly WorkbenchApprovalOffer[] {
	if (authority === "removed" || phase !== "pending") {
		return Object.freeze([]);
	}
	return Object.freeze([
		offer({ id: OFFER_APPROVE, label: "Approve this effect", tone: "primary" }),
		offer({ id: OFFER_DECLINE, label: "Decline this effect", tone: "secondary" }),
	]);
}

export {
	DECISION_PREFIX,
	OFFER_ABORT,
	OFFER_APPROVE,
	OFFER_CANCEL,
	OFFER_DECLINE,
	OFFER_SUBMIT,
	approvalOffers,
	dynamicOffers,
	dynamicSpoken,
	isGenuineBinaryApproval,
	ordinarySpoken,
};
