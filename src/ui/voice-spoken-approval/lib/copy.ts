// The words for every spoken state and every host fallback reason. Unknown
// outcomes stay unknown: resolver loss says the host lost the result and
// that Archboard neither infers delivery nor retries.

import type { BrowserSpokenApproval } from "@/shared/codex-browser-model";
import type { VoiceSpokenApprovalState } from "@/ui/voice-spoken-approval/contract";

const CLASSIFIER_NOTICE =
	"A later ordinary coordinator classifier turn settles the typed request; realtime speech does not.";

type SpokenFallbackReason = NonNullable<BrowserSpokenApproval["reason"]>;

/** The label and detail of one state. */
interface StateCopy {
	readonly label: string;
	readonly detail: string;
}

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
} as const satisfies Record<VoiceSpokenApprovalState, StateCopy>;

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

/** States that carry the later-turn notice. */
const NOTICED_STATES: ReadonlySet<VoiceSpokenApprovalState> = new Set([
	"armed",
	"expired",
	"resolving",
	"visual_fallback",
	"outcome_unknown",
]);

/**
 * The words for one state.
 * @param state The state.
 * @returns The label and detail.
 */
function stateCopy(state: VoiceSpokenApprovalState): StateCopy {
	return STATE_COPY[state];
}

/**
 * The words for one host fallback reason.
 * @param reason The reason.
 * @returns The sentence.
 */
function fallbackCopy(reason: SpokenFallbackReason): string {
	return FALLBACK_COPY[reason];
}

/**
 * The later-turn notice for states that carry it.
 * @param state The state.
 * @returns The notice, or null.
 */
function classifierNotice(state: VoiceSpokenApprovalState): string | null {
	return NOTICED_STATES.has(state) ? CLASSIFIER_NOTICE : null;
}

/**
 * The detail for a visual fallback: a known settlement is named, an unknown
 * one is never claimed.
 * @param spoken The spoken approval.
 * @returns The detail sentence.
 */
function visualFallbackDetail(spoken: BrowserSpokenApproval): string {
	const reason = spoken.reason ?? "stale_state";
	const settlement = spoken.settlement;
	if (
		reason !== "resolver_lost" ||
		settlement === null ||
		settlement.outcome === "outcome_unknown"
	) {
		return fallbackCopy(reason);
	}
	const delivery = settlement.outcome === "delivered" ? "delivered" : "not delivered";
	return `The later classifier produced a typed decision, and the host confirmed it was ${delivery}. ${settlement.reason}`;
}

export {
	classifierNotice,
	fallbackCopy,
	stateCopy,
	visualFallbackDetail,
	type SpokenFallbackReason,
};
