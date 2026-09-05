// The spoken approval projection: which state the one spoken gate presents
// beside an ordinary card, with exact identity joins before anything reads as
// armed and unknown outcomes kept unknown.

import type { BrowserSpokenApproval } from "@/shared/codex-browser-model";
import type {
	VoiceSpokenApprovalInput,
	VoiceSpokenApprovalReason,
	VoiceSpokenApprovalState,
	VoiceSpokenApprovalUtterance,
	VoiceSpokenApprovalView,
} from "@/ui/voice-spoken-approval/contract";
import {
	classifierNotice,
	fallbackCopy,
	stateCopy,
	visualFallbackDetail,
} from "@/ui/voice-spoken-approval/lib/copy";
import { frozenRows, gateRows, sourceRows, utterance } from "@/ui/voice-spoken-approval/lib/rows";
import { isGenuineBinaryApproval } from "@/ui/workbench-approvals";
import type { WorkbenchOrdinaryApprovalCard } from "@/ui/workbench-approvals/contracts";

type SpokenApprovalIdentity = NonNullable<BrowserSpokenApproval["approval"]>;
type SpokenGate = NonNullable<BrowserSpokenApproval["gate"]>;

/** How the projection presents one state. */
interface Presentation {
	readonly state: VoiceSpokenApprovalState;
	readonly reason: VoiceSpokenApprovalReason;
	readonly detail?: string;
	readonly utterance?: VoiceSpokenApprovalUtterance | null;
}

/**
 * Why the ordinary card is not spoken-eligible, or null when it is.
 * @param card The ordinary card.
 * @returns The reason, or null.
 */
function ineligible(card: WorkbenchOrdinaryApprovalCard): VoiceSpokenApprovalReason | null {
	const approval = card.request;
	if (approval.lifecycle.state !== "pending" || card.status.phase !== "pending") {
		return "not_pending";
	}
	if (card.status.authority !== "live") {
		return "stale_ownership";
	}
	if (!approval.spoken.eligible || approval.spoken.reason !== "eligible") {
		return approval.spoken.reason;
	}
	return binaryRefusal(card);
}

/**
 * Why the card is not a genuine binary command approval, or null when it is.
 * @param card The ordinary card.
 * @returns The reason, or null.
 */
function binaryRefusal(card: WorkbenchOrdinaryApprovalCard): VoiceSpokenApprovalReason | null {
	if (card.request.approvalKind !== "command_execution") {
		return "unsupported_schema";
	}
	return isGenuineBinaryApproval(card.request) && card.spoken.eligible ? null : "not_binary";
}

/**
 * Whether the spoken identity names exactly the card's request.
 * @param card The ordinary card.
 * @param approval The spoken identity.
 * @returns True on an exact match.
 */
function approvalIdentityMatches(
	card: WorkbenchOrdinaryApprovalCard,
	approval: SpokenApprovalIdentity,
): boolean {
	const request = card.request;
	return (
		request.requestId === approval.requestId &&
		request.approvalId === approval.approvalId &&
		request.threadId === approval.threadId &&
		bindingMatches(request.binding, approval.binding)
	);
}

/**
 * Whether two bindings name the same child, epoch, target and effect.
 * @param left One binding.
 * @param right Another binding.
 * @returns True on an exact match.
 */
function bindingMatches(
	left: WorkbenchOrdinaryApprovalCard["request"]["binding"],
	right: SpokenApprovalIdentity["binding"],
): boolean {
	return (
		left.child === right.child &&
		left.epoch === right.epoch &&
		left.target === right.target &&
		left.effect === right.effect
	);
}

/**
 * Whether a gate is coherent with its approval.
 * @param approval The spoken identity.
 * @param gate The gate.
 * @returns True when the gate's facts are complete and name the effect.
 */
function gateMatchesApproval(approval: SpokenApprovalIdentity, gate: SpokenGate): boolean {
	return (
		gate.effectFingerprint === approval.binding.effect &&
		gate.effectSummary.trim().length > 0 &&
		Number.isSafeInteger(gate.effectPrompt.sequence) &&
		gate.effectPrompt.sequence >= 0 &&
		Number.isFinite(gate.expiresAtMs)
	);
}

/**
 * A stale reason, defaulting to stale state.
 * @param reason The host's reason.
 * @returns The reason.
 */
function staleReason(reason: BrowserSpokenApproval["reason"]): VoiceSpokenApprovalReason {
	return reason ?? "stale_state";
}

/**
 * The frozen view for one presentation.
 * @param input The projection input.
 * @param shown The state, reason, detail and utterance.
 * @returns The view.
 */
function view(input: VoiceSpokenApprovalInput, shown: Presentation): VoiceSpokenApprovalView {
	const copy = stateCopy(shown.state);
	return Object.freeze({
		state: shown.state,
		label: copy.label,
		detail: shown.detail ?? copy.detail,
		classifierNotice: classifierNotice(shown.state),
		reason: shown.reason,
		visualCardPreserved: true,
		request: frozenRows(input.card.identity),
		effect: frozenRows(input.card.effect),
		source: sourceRows(input.card, input.spokenApproval.gate),
		gate: gateRows(input.spokenApproval.gate),
		utterance: shown.utterance ?? null,
	});
}

/** How the spoken owner relates to this card. */
interface Relation {
	readonly live: boolean;
	readonly sameRequest: boolean;
	readonly exactApproval: boolean;
}

/**
 * How the spoken owner relates to this card.
 * @param input The projection input.
 * @returns The relation.
 */
function relation(input: VoiceSpokenApprovalInput): Relation {
	const spoken = input.spokenApproval;
	const live = spoken.state === "armed" || spoken.state === "resolving";
	const sameRequest =
		spoken.approval !== null && spoken.approval.requestId === input.card.request.requestId;
	const exactApproval =
		sameRequest && spoken.approval !== null && approvalIdentityMatches(input.card, spoken.approval);
	return { live, sameRequest, exactApproval };
}

/**
 * Whether a live gate is missing or incoherent with its approval.
 * @param spoken The spoken approval.
 * @returns True when the live state cannot be trusted.
 */
function liveGateStale(spoken: BrowserSpokenApproval): boolean {
	return (
		spoken.approval === null ||
		spoken.gate === null ||
		!gateMatchesApproval(spoken.approval, spoken.gate)
	);
}

/**
 * The presentation of a settled spoken owner.
 * @param input The projection input.
 * @param captured The captured utterance, if any.
 * @returns The presentation.
 */
function settledPresentation(
	input: VoiceSpokenApprovalInput,
	captured: VoiceSpokenApprovalUtterance | null,
): Presentation {
	if (input.card.status.terminal) {
		return {
			state: "ineligible",
			reason: "not_pending",
			detail: input.card.spoken.detail,
			utterance: captured,
		};
	}
	return {
		state: "visual_fallback",
		reason: staleReason(input.spokenApproval.reason),
		detail: "Spoken handling settled, but the ordinary approval still appears pending.",
		utterance: captured,
	};
}

/**
 * The presentation of the owner's own terminal states.
 * @param spoken The spoken approval.
 * @param captured The captured utterance, if any.
 * @returns The presentation.
 */
function ownerPresentation(
	spoken: BrowserSpokenApproval,
	captured: VoiceSpokenApprovalUtterance | null,
): Presentation {
	if (spoken.state === "visual_fallback") {
		return {
			state: "visual_fallback",
			reason: staleReason(spoken.reason),
			detail: visualFallbackDetail(spoken),
			utterance: captured,
		};
	}
	const fallback: Partial<Record<BrowserSpokenApproval["state"], VoiceSpokenApprovalReason>> = {
		expired: "timeout",
		outcome_unknown: "resolver_lost",
	};
	return {
		state: spoken.state === "idle" || spoken.state === "settled" ? "eligible" : spoken.state,
		reason: spoken.reason ?? fallback[spoken.state] ?? "eligible",
		utterance: captured,
	};
}

/**
 * The presentation decided by the owner's state alone: idle is eligible, and
 * a live owner on another request makes this card a duplicate.
 * @param spoken The spoken approval.
 * @param related The relation.
 * @returns The presentation, or null to keep deciding.
 */
function ownerStatePresentation(
	spoken: BrowserSpokenApproval,
	related: Relation,
): Presentation | null {
	if (spoken.state === "idle") {
		return { state: "eligible", reason: "eligible" };
	}
	if (related.live && spoken.approval !== null && !related.sameRequest) {
		return { state: "duplicate", reason: "duplicate" };
	}
	return null;
}

/**
 * The presentation of a stale identity or an untrustworthy live gate.
 * @param spoken The spoken approval.
 * @param related The relation.
 * @returns The stale presentation, or null when the identity holds.
 */
function stalePresentation(spoken: BrowserSpokenApproval, related: Relation): Presentation | null {
	const identityStale =
		spoken.state === "stale_session" || (spoken.approval !== null && !related.exactApproval);
	if (identityStale || (related.live && liveGateStale(spoken))) {
		return { state: "stale_session", reason: staleReason(spoken.reason) };
	}
	return null;
}

/**
 * The presentation once the gate is trusted, by what was captured.
 * @param input The projection input.
 * @param spoken The spoken approval.
 * @returns The presentation.
 */
function capturedPresentation(
	input: VoiceSpokenApprovalInput,
	spoken: BrowserSpokenApproval,
): Presentation {
	const captured = utterance(spoken);
	if (spoken.state === "resolving" && captured === null) {
		return {
			state: "visual_fallback",
			reason: "missing_user_final",
			detail: fallbackCopy("missing_user_final"),
		};
	}
	if (spoken.state === "settled") {
		return settledPresentation(input, captured);
	}
	return ownerPresentation(spoken, captured);
}

/**
 * Why the card refuses spoken handling, when its eligibility is in question.
 * @param input The projection input.
 * @param related The relation.
 * @returns The refusal, or null.
 */
function eligibilityRefusal(
	input: VoiceSpokenApprovalInput,
	related: Relation,
): VoiceSpokenApprovalReason | null {
	const spoken = input.spokenApproval;
	const questioned = spoken.state === "idle" || related.live || !related.exactApproval;
	return questioned ? ineligible(input.card) : null;
}

/**
 * Projects the spoken state beside one ordinary card.
 * @param input The projection input.
 * @returns The view.
 */
function projectVoiceSpokenApproval(input: VoiceSpokenApprovalInput): VoiceSpokenApprovalView {
	const spoken = input.spokenApproval;
	const related = relation(input);
	if (related.sameRequest && !related.exactApproval) {
		return view(input, { state: "stale_session", reason: staleReason(spoken.reason) });
	}
	const refusal = eligibilityRefusal(input, related);
	if (refusal !== null) {
		return view(input, { state: "ineligible", reason: refusal, detail: input.card.spoken.detail });
	}
	const shown =
		ownerStatePresentation(spoken, related) ??
		stalePresentation(spoken, related) ??
		capturedPresentation(input, spoken);
	return view(input, shown);
}

export { projectVoiceSpokenApproval };
