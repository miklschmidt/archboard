import type { BrowserSpokenApproval } from "../../../shared/codex-browser-model/index.js";
import {
	isGenuineBinaryApproval,
	type WorkbenchApprovalDisclosure,
	type WorkbenchOrdinaryApprovalCard,
} from "../../workbench-approvals/index.js";
import type {
	VoiceSpokenApprovalInput,
	VoiceSpokenApprovalReason,
	VoiceSpokenApprovalState,
	VoiceSpokenApprovalUtterance,
	VoiceSpokenApprovalView,
} from "../contract.js";

const CLASSIFIER_NOTICE =
	"A later ordinary coordinator classifier turn settles the typed request; realtime speech does not.";

type SpokenFallbackReason = NonNullable<BrowserSpokenApproval["reason"]>;
type SpokenApprovalIdentity = NonNullable<BrowserSpokenApproval["approval"]>;
type SpokenGate = NonNullable<BrowserSpokenApproval["gate"]>;

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
		detail: "The final user utterance is captured; ordinary coordinator handling is in progress.",
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
		detail: "The approval identity or realtime session no longer matches this spoken state.",
	},
} as const satisfies Record<
	VoiceSpokenApprovalState,
	{ readonly label: string; readonly detail: string }
>;

const FALLBACK_COPY = {
	approval_unavailable: "The ordinary approval is no longer available.",
	not_eligible: "The host no longer permits spoken handling for this approval.",
	coordinator_unavailable: "The ordinary coordinator became unavailable.",
	realtime_unavailable: "The realtime session became unavailable.",
	invalid_context: "The spoken request context was incomplete or invalid.",
	invalid_effect_prompt: "The effect prompt could not be correlated safely.",
	user_already_spoke: "A user utterance already preceded this effect prompt.",
	missing_user_final: "No final user utterance was captured after the effect prompt.",
	assistant_only:
		"Only assistant output followed the effect prompt; assistant output is non-authoritative.",
	ambiguous: "The utterance could not be tied to one plain accept or decline.",
	changed_effect: "The requested effect changed after the spoken gate was armed.",
	stale_realtime_session: "The realtime session no longer matches the armed gate.",
	stale_state: "The approval identity or lifecycle no longer matches the armed gate.",
	timeout: "The spoken gate expired before a typed decision settled the request.",
	classifier_lost: "The ordinary classifier turn ended without a typed decision.",
	resolver_lost:
		"The host lost the typed decision result after resolver delivery. Archboard cannot infer delivery and does not retry.",
	child_exit: "The bound Codex child exited while spoken handling was active.",
	disposed: "The spoken approval owner stopped before this request settled.",
} as const satisfies Record<SpokenFallbackReason, string>;

function frozenRows(
	rows: readonly WorkbenchApprovalDisclosure[],
): readonly WorkbenchApprovalDisclosure[] {
	return Object.freeze(rows.map((row) => Object.freeze({ ...row })));
}

function sourceRows(
	card: WorkbenchOrdinaryApprovalCard,
	gate: BrowserSpokenApproval["gate"],
): readonly WorkbenchApprovalDisclosure[] {
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
	return frozenRows([...card.broker, ...coordinator]);
}

function gateRows(gate: BrowserSpokenApproval["gate"]): readonly WorkbenchApprovalDisclosure[] {
	if (gate === null) return Object.freeze([]);
	return frozenRows([
		{ label: "Realtime session", value: String(gate.realtimeSessionId), technical: true },
		{ label: "Effect summary", value: gate.effectSummary, technical: false },
		{ label: "Effect fingerprint", value: gate.effectFingerprint, technical: true },
		{ label: "Effect prompt item", value: String(gate.effectPrompt.itemId), technical: true },
		{ label: "Effect prompt sequence", value: String(gate.effectPrompt.sequence), technical: true },
		{ label: "Gate expires", value: new Date(gate.expiresAtMs).toISOString(), technical: true },
	]);
}

function ineligible(card: WorkbenchOrdinaryApprovalCard): VoiceSpokenApprovalReason | null {
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

function approvalIdentityMatches(
	card: WorkbenchOrdinaryApprovalCard,
	approval: SpokenApprovalIdentity,
): boolean {
	const request = card.request;
	return (
		request.requestId === approval.requestId &&
		request.approvalId === approval.approvalId &&
		request.threadId === approval.threadId &&
		request.binding.child === approval.binding.child &&
		request.binding.epoch === approval.binding.epoch &&
		request.binding.target === approval.binding.target &&
		request.binding.effect === approval.binding.effect
	);
}

function gateMatchesApproval(approval: SpokenApprovalIdentity, gate: SpokenGate): boolean {
	return (
		gate.effectFingerprint === approval.binding.effect &&
		gate.effectSummary.trim().length > 0 &&
		Number.isSafeInteger(gate.effectPrompt.sequence) &&
		gate.effectPrompt.sequence >= 0 &&
		Number.isFinite(gate.expiresAtMs)
	);
}

function utterance(spoken: BrowserSpokenApproval): VoiceSpokenApprovalUtterance | null {
	const item = spoken.capturedUserFinal;
	const gate = spoken.gate;
	if (item === null || gate === null) return null;
	return Object.freeze({
		...item,
		realtimeSessionId: gate.realtimeSessionId,
		authority: "captured_user_final",
		label: "Captured final user utterance",
	});
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
		source: sourceRows(input.card, input.spokenApproval.gate),
		gate: gateRows(input.spokenApproval.gate),
		utterance: shownUtterance,
	});
}

function staleReason(reason: BrowserSpokenApproval["reason"]): VoiceSpokenApprovalReason {
	return reason ?? "stale_state";
}

export function projectVoiceSpokenApproval(
	input: VoiceSpokenApprovalInput,
): VoiceSpokenApprovalView {
	const refusal = ineligible(input.card);
	if (refusal !== null) return view(input, "ineligible", refusal, input.card.spoken.detail);

	const spoken = input.spokenApproval;
	if (spoken.state === "idle") return view(input, "eligible", "eligible");

	const live = spoken.state === "armed" || spoken.state === "resolving";
	if (
		live &&
		spoken.approval !== null &&
		spoken.approval.requestId !== input.card.request.requestId
	)
		return view(input, "duplicate", "duplicate");

	if (spoken.state === "stale_session")
		return view(input, "stale_session", staleReason(spoken.reason));

	if (spoken.approval !== null && !approvalIdentityMatches(input.card, spoken.approval))
		return view(input, "stale_session", staleReason(spoken.reason));

	if (
		live &&
		(spoken.approval === null ||
			spoken.gate === null ||
			!gateMatchesApproval(spoken.approval, spoken.gate))
	)
		return view(input, "stale_session", staleReason(spoken.reason));

	const captured = utterance(spoken);
	if (spoken.state === "resolving" && captured === null)
		return view(input, "visual_fallback", "missing_user_final", FALLBACK_COPY.missing_user_final);

	if (spoken.state === "settled")
		return view(
			input,
			"visual_fallback",
			staleReason(spoken.reason),
			"Spoken handling settled, but the ordinary approval still appears pending.",
			captured,
		);

	if (spoken.state === "visual_fallback") {
		const reason = spoken.reason ?? "stale_state";
		return view(input, "visual_fallback", reason, FALLBACK_COPY[reason], captured);
	}

	return view(
		input,
		spoken.state,
		spoken.reason ??
			(spoken.state === "expired"
				? "timeout"
				: spoken.state === "outcome_unknown"
					? "resolver_lost"
					: "eligible"),
		undefined,
		captured,
	);
}
