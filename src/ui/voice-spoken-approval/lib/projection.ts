import type { BrowserVoice } from "../../../shared/codex-browser-model/index.js";
import {
	isGenuineBinaryApproval,
	type WorkbenchApprovalCard,
	type WorkbenchApprovalDisclosure,
} from "../../workbench-approvals/index.js";
import type {
	VoiceSpokenApprovalFallbackReason,
	VoiceSpokenApprovalGatePresentation,
	VoiceSpokenApprovalInput,
	VoiceSpokenApprovalReason,
	VoiceSpokenApprovalState,
	VoiceSpokenApprovalUtterance,
	VoiceSpokenApprovalView,
} from "../contract.js";

const CLASSIFIER_NOTICE =
	"A later ordinary coordinator classifier turn settles the typed request; realtime speech does not.";

type EvidenceFailureReason =
	| "ambiguous"
	| "missing"
	| "non_final"
	| "assistant_only"
	| "stale_session";

const STATE_COPY = {
	eligible: {
		label: "Spoken approval available",
		detail: "This pending command offers one plain accept or decline.",
	},
	ineligible: { label: "Visual only", detail: "" },
	armed: {
		label: "Armed",
		detail: "The one spoken gate slot is tracking this request after its effect prompt.",
	},
	expired: {
		label: "Expired",
		detail:
			"The spoken gate expired without settling this request. Use the ordinary approval card.",
	},
	resolving: {
		label: "Resolving",
		detail: "The final user utterance is captured and the coordinator is classifying it.",
	},
	visual_fallback: {
		label: "Visual only",
		detail: "Spoken handling stopped. Use the ordinary approval card.",
	},
	outcome_unknown: {
		label: "Outcome unknown",
		detail:
			"The later classifier produced a typed decision and sent it to the resolver, but the host lost the result. Archboard cannot infer delivery and does not retry.",
	},
	duplicate: {
		label: "Visual only",
		detail: "Another request already owns the one spoken gate slot.",
	},
	stale_session: {
		label: "Stale session",
		detail: "The approval identity or realtime session no longer matches these spoken gate facts.",
	},
} as const satisfies Record<
	VoiceSpokenApprovalState,
	{ readonly label: string; readonly detail: string }
>;

const FALLBACK_COPY = {
	ambiguous: "The utterance could not be tied to one plain accept or decline.",
	missing: "No matching user utterance was captured after the effect prompt.",
	non_final: "The matching user item was provisional, so it cannot be classified.",
	assistant_only:
		"Only assistant output followed the effect prompt; assistant output is non-authoritative.",
	lost_result:
		"The host lost the typed decision result after classification. Archboard cannot infer delivery and does not retry.",
	realtime_unavailable: "The realtime session became unavailable.",
	coordinator_unavailable: "The ordinary coordinator became unavailable.",
	stale_identity: "The request, effect, or approval source changed.",
} as const satisfies Record<
	Exclude<VoiceSpokenApprovalFallbackReason, "expiry" | "stale_session" | "duplicate">,
	string
>;

function frozenRows(
	rows: readonly WorkbenchApprovalDisclosure[],
): readonly WorkbenchApprovalDisclosure[] {
	return Object.freeze(rows.map((row) => Object.freeze({ ...row })));
}

function sourceRows(
	card: WorkbenchApprovalCard,
	gate: VoiceSpokenApprovalGatePresentation | null,
): readonly WorkbenchApprovalDisclosure[] {
	const existing =
		card.kind === "ordinary"
			? card.broker
			: [
					{
						label: "Approval source",
						value: "Dynamic coordination approval",
						technical: false,
					},
				];
	const coordinator =
		gate === null
			? []
			: [
					{
						label: "Coordinator thread",
						value: gate.coordinatorThreadId,
						technical: true,
					},
				];
	return frozenRows([...existing, ...coordinator]);
}

function gateRows(
	gate: VoiceSpokenApprovalGatePresentation | null,
): readonly WorkbenchApprovalDisclosure[] {
	if (gate === null) return Object.freeze([]);
	const expiry = Number.isFinite(gate.expiresAtMs)
		? new Date(gate.expiresAtMs).toISOString()
		: "invalid gate expiry";
	return frozenRows([
		{ label: "Realtime session", value: String(gate.realtimeSessionId), technical: true },
		{ label: "Effect prompt item", value: String(gate.effectPrompt.itemId), technical: true },
		{ label: "Effect prompt sequence", value: String(gate.effectPrompt.sequence), technical: true },
		{ label: "Gate expires", value: expiry, technical: true },
	]);
}

function ineligible(card: WorkbenchApprovalCard): VoiceSpokenApprovalReason | null {
	if (card.kind !== "ordinary") return "dynamic_approval";
	const approval = card.request;
	if (approval.lifecycle.state !== "pending" || card.status.phase !== "pending")
		return "not_pending";
	if (card.status.authority !== "live") return "stale_ownership";
	if (!approval.spoken.eligible || approval.spoken.reason !== "eligible")
		return approval.spoken.reason;
	if (approval.approvalKind !== "command_execution") return "unsupported_schema";
	if (!isGenuineBinaryApproval(approval) || !card.spoken.eligible) return "not_binary";
	return null;
}

function identityMatches(
	card: WorkbenchApprovalCard,
	gate: VoiceSpokenApprovalGatePresentation,
): boolean {
	if (card.kind !== "ordinary") return false;
	const request = card.request;
	return (
		request.requestId === gate.requestId &&
		request.approvalId === gate.approvalId &&
		request.threadId === gate.threadId &&
		request.binding.child === gate.binding.child &&
		request.binding.epoch === gate.binding.epoch &&
		request.binding.target === gate.binding.target &&
		request.binding.effect === gate.binding.effect
	);
}

function exactItemMatches(
	voice: BrowserVoice,
	item: NonNullable<VoiceSpokenApprovalGatePresentation["capturedItem"]>,
): number {
	return voice.transcript.filter(
		(candidate) =>
			candidate.itemId === item.itemId &&
			candidate.sequence === item.sequence &&
			candidate.speaker === item.speaker &&
			candidate.text === item.text &&
			candidate.final === item.final,
	).length;
}

function utterance(gate: VoiceSpokenApprovalGatePresentation): VoiceSpokenApprovalUtterance | null {
	const item = gate.capturedItem;
	if (item === null) return null;
	const authoritative = item.speaker === "user" && item.final;
	return Object.freeze({
		...item,
		authority: authoritative ? "captured_user_final" : "non_authoritative",
		label: authoritative
			? "Captured final user utterance"
			: item.speaker === "assistant"
				? "Non-authoritative assistant output"
				: "Provisional user output",
	});
}

function evidenceFailure(
	voice: BrowserVoice,
	gate: VoiceSpokenApprovalGatePresentation,
): EvidenceFailureReason | null {
	const item = gate.capturedItem;
	if (item === null)
		return gate.state === "resolving" || gate.state === "outcome_unknown" ? "missing" : null;
	if (
		item.realtimeSessionId !== gate.realtimeSessionId ||
		voice.realtimeSessionId !== gate.realtimeSessionId
	)
		return "stale_session";
	const matches = exactItemMatches(voice, item);
	if (matches === 0) return "missing";
	if (matches > 1) return "ambiguous";
	if (item.speaker === "assistant") return "assistant_only";
	if (!item.final) return "non_final";
	if (item.text.trim().length === 0) return "missing";
	if (item.sequence <= gate.effectPrompt.sequence) return "ambiguous";
	return null;
}

function view(
	input: VoiceSpokenApprovalInput,
	state: VoiceSpokenApprovalState,
	reason: VoiceSpokenApprovalReason,
	detail?: string,
	shownUtterance: VoiceSpokenApprovalUtterance | null = null,
): VoiceSpokenApprovalView {
	const copy = STATE_COPY[state];
	return Object.freeze({
		state,
		label: copy.label,
		detail: detail ?? copy.detail,
		classifierNotice:
			state === "armed" ||
			state === "expired" ||
			state === "resolving" ||
			state === "visual_fallback" ||
			state === "outcome_unknown"
				? CLASSIFIER_NOTICE
				: null,
		reason,
		visualCardPreserved: true,
		request: frozenRows(input.card.identity),
		effect: frozenRows(input.card.effect),
		source: sourceRows(input.card, input.gate),
		gate: gateRows(input.gate),
		utterance: shownUtterance,
	});
}

export function projectVoiceSpokenApproval(
	input: VoiceSpokenApprovalInput,
): VoiceSpokenApprovalView {
	const refusal = ineligible(input.card);
	if (refusal !== null) return view(input, "ineligible", refusal, input.card.spoken.detail);
	const gate = input.gate;
	if (gate === null) return view(input, "eligible", "eligible");
	if (
		gate.coordinatorThreadId.trim().length === 0 ||
		!Number.isSafeInteger(gate.effectPrompt.sequence) ||
		gate.effectPrompt.sequence < 0 ||
		!Number.isFinite(gate.expiresAtMs)
	)
		return view(input, "stale_session", "stale_identity");
	if (
		input.card.kind === "ordinary" &&
		input.card.request.requestId !== gate.requestId &&
		(gate.state === "armed" || gate.state === "resolving")
	)
		return view(input, "duplicate", "duplicate");
	if (!identityMatches(input.card, gate)) return view(input, "stale_session", "stale_identity");
	if (gate.state === "stale_session") return view(input, "stale_session", "stale_session");
	if (
		(gate.state === "armed" || gate.state === "resolving") &&
		input.voice.realtimeSessionId !== gate.realtimeSessionId
	)
		return view(input, "stale_session", "stale_session");
	const failure = evidenceFailure(input.voice, gate);
	if (failure === "stale_session") return view(input, "stale_session", failure);
	if (failure !== null)
		return view(
			input,
			"visual_fallback",
			failure,
			FALLBACK_COPY[failure],
			failure === "assistant_only" || failure === "non_final" ? utterance(gate) : null,
		);
	const correlatedUtterance = utterance(gate);
	if ((gate.state === "armed" || gate.state === "resolving") && input.nowMs >= gate.expiresAtMs)
		return view(input, "expired", "expiry", undefined, correlatedUtterance);
	if (gate.state === "visual_fallback") {
		return view(input, gate.state, gate.reason, FALLBACK_COPY[gate.reason], correlatedUtterance);
	}
	return view(input, gate.state, gate.reason ?? "eligible", undefined, correlatedUtterance);
}
