import { describe, expect, test } from "bun:test";

import type { BrowserApproval, BrowserSpokenApproval } from "@/shared/codex-browser-model";
import {
	projectVoiceSpokenApproval,
	VOICE_SPOKEN_APPROVAL_STATES,
} from "@/ui/voice-spoken-approval";
import type { VoiceSpokenApprovalState } from "@/ui/voice-spoken-approval";
import type { WorkbenchApprovalStatus } from "@/ui/workbench-approvals/contracts";
import {
	PENDING_STATUS,
	capturedUserFinal,
	commandApproval,
	input,
	ordinaryCard,
	spokenApproval,
	spokenGate,
	spokenIdentities,
	spokenIdentity,
} from "@/ui/voice-spoken-approval/tests/fixtures";

type IneligibleReason = Exclude<BrowserApproval["spoken"]["reason"], "eligible">;

const INELIGIBLE_HOST_REASONS: IneligibleReason[] = [
	"not_pending",
	"stale_ownership",
	"secret",
	"multi_question",
	"form",
	"url",
	"permission_scope",
	"coordinator_blocking",
	"unsupported_schema",
	"broader_grant",
	"not_binary",
];

type FallbackState = Exclude<
	BrowserSpokenApproval["state"],
	"idle" | "armed" | "resolving" | "settled"
>;

const FALLBACK_STATE_BY_REASON = {
	approval_unavailable: "visual_fallback",
	not_eligible: "visual_fallback",
	coordinator_unavailable: "visual_fallback",
	realtime_unavailable: "visual_fallback",
	invalid_context: "visual_fallback",
	invalid_effect_prompt: "visual_fallback",
	user_already_spoke: "visual_fallback",
	missing_user_final: "visual_fallback",
	assistant_only: "visual_fallback",
	ambiguous: "visual_fallback",
	changed_effect: "stale_session",
	stale_realtime_session: "stale_session",
	stale_state: "stale_session",
	timeout: "expired",
	classifier_lost: "visual_fallback",
	resolver_lost: "outcome_unknown",
	child_exit: "visual_fallback",
	disposed: "visual_fallback",
} as const satisfies Record<NonNullable<BrowserSpokenApproval["reason"]>, FallbackState>;

type FallbackReason = NonNullable<BrowserSpokenApproval["reason"]>;

const FALLBACK_REASONS: readonly FallbackReason[] = [
	"approval_unavailable",
	"not_eligible",
	"coordinator_unavailable",
	"realtime_unavailable",
	"invalid_context",
	"invalid_effect_prompt",
	"user_already_spoke",
	"missing_user_final",
	"assistant_only",
	"ambiguous",
	"changed_effect",
	"stale_realtime_session",
	"stale_state",
	"timeout",
	"classifier_lost",
	"resolver_lost",
	"child_exit",
	"disposed",
];

/** Every host reason is listed once. */
const FALLBACK_REASON_COUNT: number = Object.keys(FALLBACK_STATE_BY_REASON).length;

const FALLBACK_CASES: [FallbackReason, FallbackState][] = FALLBACK_REASONS.map(
	(reason): [FallbackReason, FallbackState] => [reason, FALLBACK_STATE_BY_REASON[reason]],
);

/**
 * A terminal status in one phase.
 * @param phase The phase.
 * @param detail The detail.
 * @param delivery The delivery outcome.
 * @returns The status.
 */
function terminalStatus(
	phase: WorkbenchApprovalStatus["phase"],
	detail: string,
	delivery: WorkbenchApprovalStatus["delivery"],
): WorkbenchApprovalStatus {
	return {
		...PENDING_STATUS,
		phase,
		label: detail,
		detail,
		recovery: "Read the thread before assuming either result.",
		decision: "You approved this request.",
		delivery,
		terminal: true,
		authority: "removed",
		authorityReason: "This request is no longer waiting for a decision.",
	};
}

describe("spoken eligibility", () => {
	test("admits only the live pending broker command with exact accept and decline", () => {
		const projected = projectVoiceSpokenApproval(input());

		expect(projected.state).toBe("eligible");
		expect(projected.reason).toBe("eligible");
		expect(projected.visualCardPreserved).toBe(true);
		expect(projected.utterance).toBeNull();
	});

	test.each(INELIGIBLE_HOST_REASONS)("preserves the host's %s visual-only reason", (reason) => {
		const humanReason = `Human explanation for ${reason}.`;
		const request = commandApproval({ spoken: { eligible: false, reason } });
		const projected = projectVoiceSpokenApproval(
			input({ card: ordinaryCard({ request, spokenDetail: humanReason }) }),
		);

		expect(projected.state).toBe("ineligible");
		expect(projected.reason).toBe(reason);
		expect(projected.detail).toBe(humanReason);
		expect(projected.visualCardPreserved).toBe(true);
	});

	test("rejects broader grants and stale authority", () => {
		const broader = commandApproval({
			availableDecisions: ["accept", "acceptForSession", "decline"],
		});
		const removed: WorkbenchApprovalStatus = {
			...PENDING_STATUS,
			authority: "removed",
			authorityReason: "The browser lost command authority.",
		};

		expect(
			projectVoiceSpokenApproval(
				input({ card: ordinaryCard({ request: broader, spokenEligible: false }) }),
			).reason,
		).toBe("not_binary");
		expect(
			projectVoiceSpokenApproval(input({ card: ordinaryCard({ status: removed }) })).reason,
		).toBe("stale_ownership");
	});
});

describe("canonical spoken state", () => {
	test("lists every host fallback reason", () => {
		expect(FALLBACK_REASONS).toHaveLength(FALLBACK_REASON_COUNT);
	});

	test.each(FALLBACK_CASES)(
		"projects the %s fallback reason as %s without inventing outcome certainty",
		(reason, state) => {
			const projected = projectVoiceSpokenApproval(
				input({ spokenApproval: spokenApproval(state, { reason }) }),
			);

			expect(projected.state).toBe(state);
			expect(projected.reason).toBe(reason);
			expect(projected.visualCardPreserved).toBe(true);
		},
	);

	test("projects a second card as duplicate while a different live request owns the slot", () => {
		const secondCard = ordinaryCard({
			request: commandApproval({ requestId: spokenIdentities.SECOND_REQUEST_ID }),
		});
		const projected = projectVoiceSpokenApproval(
			input({ card: secondCard, spokenApproval: spokenApproval("armed") }),
		);

		expect(projected.state).toBe("duplicate");
		expect(projected.reason).toBe("duplicate");
		expect(projected.visualCardPreserved).toBe(true);
		const states: readonly string[] = VOICE_SPOKEN_APPROVAL_STATES;
		expect(states).not.toContain("awaiting_user");
	});

	test("requires the complete exact joined identity before showing an armed state", () => {
		const armed = projectVoiceSpokenApproval(input({ spokenApproval: spokenApproval("armed") }));
		const missingGate = projectVoiceSpokenApproval(
			input({ spokenApproval: spokenApproval("armed", { gate: null }) }),
		);

		expect(armed.state).toBe("armed");
		expect(armed.source.find((row) => row.label === "Coordinator thread")?.value).toBe(
			String(spokenIdentities.COORDINATOR_THREAD_ID),
		);
		expect(missingGate.state).toBe("stale_session");
		expect(missingGate.visualCardPreserved).toBe(true);
	});

	test("keeps same-request identity mismatches distinct from a duplicate request", () => {
		const baseIdentity = spokenIdentity();
		const staleIdentities = [
			spokenIdentity({ approvalId: spokenIdentities.STALE_APPROVAL_ID }),
			spokenIdentity({ threadId: spokenIdentities.STALE_THREAD_ID }),
			spokenIdentity({ binding: { ...baseIdentity.binding, target: "another target" } }),
			spokenIdentity({ binding: { ...baseIdentity.binding, effect: "a changed effect" } }),
		];

		for (const approval of staleIdentities) {
			const projected = projectVoiceSpokenApproval(
				input({ spokenApproval: spokenApproval("armed", { approval }) }),
			);
			expect(projected.state).toBe("stale_session");
			expect(projected.reason).toBe("stale_state");
		}
	});

	test("projects explicit stale realtime identity as stale session", () => {
		const projected = projectVoiceSpokenApproval(
			input({
				spokenApproval: spokenApproval("stale_session", { reason: "stale_realtime_session" }),
			}),
		);

		expect(projected.state).toBe("stale_session");
		expect(projected.reason).toBe("stale_realtime_session");
	});

	test("fails closed when authoritative captured evidence is absent while resolving", () => {
		const projected = projectVoiceSpokenApproval(
			input({ spokenApproval: spokenApproval("resolving", { capturedUserFinal: null }) }),
		);

		expect(projected.state).toBe("visual_fallback");
		expect(projected.reason).toBe("missing_user_final");
		expect(projected.utterance).toBeNull();
		expect(projected.visualCardPreserved).toBe(true);
	});

	test("shows the authoritative final user item after the immutable effect prompt", () => {
		const captured = capturedUserFinal();
		const projected = projectVoiceSpokenApproval(
			input({ spokenApproval: spokenApproval("resolving", { capturedUserFinal: captured }) }),
		);

		expect(projected.state).toBe("resolving");
		expect(projected.gate.find((row) => row.label === "Effect prompt sequence")?.value).toBe("10");
		expect(projected.utterance).toEqual({
			...captured,
			realtimeSessionId: spokenIdentities.SESSION_ID,
			authority: "captured_user_final",
			label: "Captured final user utterance",
		});
		expect(projected.utterance?.sequence).toBe(12);
	});

	test("keeps classifier loss visual-only and only resolver loss outcome-unknown", () => {
		const classifierLost = projectVoiceSpokenApproval(
			input({ spokenApproval: spokenApproval("visual_fallback", { reason: "classifier_lost" }) }),
		);
		const resolverLost = projectVoiceSpokenApproval(
			input({ spokenApproval: spokenApproval("outcome_unknown", { reason: "resolver_lost" }) }),
		);

		expect(classifierLost.state).toBe("visual_fallback");
		expect(classifierLost.detail).toContain("without a typed decision");
		expect(resolverLost.state).toBe("outcome_unknown");
		expect(resolverLost.detail).toContain("produced a typed decision");
		expect(resolverLost.detail).toContain("host lost the result");
		expect(resolverLost.detail).toContain("cannot infer delivery and does not retry");
		expect(resolverLost.detail).not.toContain("classifier result was lost");
	});

	test("an unknown terminal outcome stays unknown with resolver loss visible and no spoken eligibility", () => {
		// The observable contract the former server-backed owner proved: the
		// ordinary card reaches outcome_unknown, the spoken projection stays
		// outcome_unknown with resolver_lost as its reason, the visual card is
		// preserved, and nothing offers spoken eligibility.
		const request = commandApproval({
			lifecycle: {
				state: "outcome_unknown",
				decision: "approved",
				outcome: "outcome_unknown",
				reason: "The resolver result was lost.",
			},
			spoken: { eligible: false, reason: "not_pending" },
		});
		const status = terminalStatus(
			"outcome_unknown",
			"The resolver result was lost.",
			"outcome_unknown",
		);
		const card = ordinaryCard({ request, status });
		const projected = projectVoiceSpokenApproval(
			input({ card, spokenApproval: spokenApproval("outcome_unknown") }),
		);

		expect(card.request.lifecycle.state).toBe("outcome_unknown");
		expect(card.status.phase).toBe("outcome_unknown");
		expect(card.spoken.eligible).toBe(false);
		expect(projected.state).toBe("outcome_unknown");
		expect(projected.reason).toBe("resolver_lost");
		expect(projected.label).toBe("Outcome unknown");
		expect(projected.detail).toContain("host lost the result");
		expect(projected.visualCardPreserved).toBe(true);
		expect(projected.utterance?.authority).toBe("captured_user_final");
	});

	test("states a known not-delivered settlement without claiming delivery is unknown", () => {
		const request = commandApproval({
			lifecycle: {
				state: "settled",
				decision: "approved",
				outcome: "not_delivered",
				reason: "The broker confirmed nothing was delivered.",
			},
			spoken: { eligible: false, reason: "not_pending" },
		});
		const status = terminalStatus(
			"not_delivered",
			"The broker confirmed nothing was delivered.",
			"not_delivered",
		);
		const settlement: BrowserSpokenApproval["settlement"] = {
			state: "settled",
			outcome: "not_delivered",
			reason: "The broker confirmed nothing was delivered.",
		};
		const projected = projectVoiceSpokenApproval(
			input({
				card: ordinaryCard({ request, status }),
				spokenApproval: spokenApproval("visual_fallback", {
					capturedUserFinal: capturedUserFinal(),
					reason: "resolver_lost",
					settlement,
				}),
			}),
		);

		expect(projected.state).toBe("visual_fallback");
		expect(projected.reason).toBe("resolver_lost");
		expect(projected.detail).toContain("host confirmed it was not delivered");
		expect(projected.detail).toContain(settlement.reason);
		expect(projected.detail).not.toContain("cannot infer delivery");
	});

	test("fails a settled snapshot closed while an ordinary card still appears pending", () => {
		const projected = projectVoiceSpokenApproval(
			input({ spokenApproval: spokenApproval("settled") }),
		);

		expect(projected.state).toBe("visual_fallback");
		expect(projected.reason).toBe("stale_state");
	});

	test("treats settled state as ineligible once the ordinary card is terminal", () => {
		const request = commandApproval({
			lifecycle: {
				state: "settled",
				decision: "approved",
				outcome: "delivered",
				reason: "The decision was delivered.",
			},
			spoken: { eligible: false, reason: "not_pending" },
		});
		const status: WorkbenchApprovalStatus = {
			...PENDING_STATUS,
			phase: "delivered",
			terminal: true,
		};
		const projected = projectVoiceSpokenApproval(
			input({ card: ordinaryCard({ request, status }), spokenApproval: spokenApproval("settled") }),
		);

		expect(projected.state).toBe("ineligible");
		expect(projected.reason).toBe("not_pending");
	});

	test.each(["armed", "expired", "resolving", "visual_fallback", "outcome_unknown"] as const)(
		"uses later-turn copy for the %s state",
		(state) => {
			const projected = projectVoiceSpokenApproval(
				input({ spokenApproval: spokenApproval(state) }),
			);
			expect(projected.classifierNotice).toContain("later ordinary coordinator classifier turn");
			expect(projected.classifierNotice).toContain("realtime speech does not");
		},
	);

	test("keeps canonical gate facts immutable in the projection", () => {
		const gate = spokenGate();
		const projected = projectVoiceSpokenApproval(
			input({ spokenApproval: spokenApproval("armed", { gate }) }),
		);

		expect(projected.gate).toContainEqual({
			label: "Effect fingerprint",
			value: gate.effectFingerprint,
			technical: true,
		});
		expect(Object.isFrozen(projected.gate)).toBe(true);
		const seen: VoiceSpokenApprovalState = projected.state;
		expect(seen).toBe("armed");
	});
});
