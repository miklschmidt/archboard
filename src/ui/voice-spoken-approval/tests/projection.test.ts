import { describe, expect, test } from "bun:test";

import type {
	BrowserApproval,
	BrowserSpokenApproval,
} from "../../../shared/codex-browser-model/index.js";
import { projectVoiceSpokenApproval, VOICE_SPOKEN_APPROVAL_STATES } from "../index.js";
import {
	capturedUserFinal,
	commandApproval,
	input,
	ordinaryCard,
	pendingStatus,
	spokenApproval,
	spokenGate,
	spokenIdentities,
	spokenIdentity,
} from "./fixtures.js";

const INELIGIBLE_HOST_REASONS = [
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
] as const satisfies readonly Exclude<BrowserApproval["spoken"]["reason"], "eligible">[];

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
} as const satisfies Record<
	NonNullable<BrowserSpokenApproval["reason"]>,
	Exclude<BrowserSpokenApproval["state"], "idle" | "armed" | "resolving" | "settled">
>;

describe("spoken eligibility", () => {
	test("admits only the live pending broker command with exact accept and decline", () => {
		const projected = projectVoiceSpokenApproval(input());

		expect(projected.state).toBe("eligible");
		expect(projected.reason).toBe("eligible");
		expect(projected.visualCardPreserved).toBe(true);
		expect(projected.utterance).toBeNull();
	});

	for (const reason of INELIGIBLE_HOST_REASONS)
		test(`preserves the host's ${reason} visual-only reason`, () => {
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

	test("rejects broader grants, stale authority, and other ordinary families", () => {
		const broader = commandApproval({
			availableDecisions: ["accept", "acceptForSession", "decline"],
		});
		const removed = {
			...pendingStatus,
			authority: "removed" as const,
			authorityReason: "The browser lost command authority.",
		};
		const fileChange = {
			...commandApproval(),
			approvalKind: "file_change",
		} as unknown as BrowserApproval;

		expect(
			projectVoiceSpokenApproval(
				input({ card: ordinaryCard({ request: broader, spokenEligible: false }) }),
			).reason,
		).toBe("not_binary");
		expect(
			projectVoiceSpokenApproval(input({ card: ordinaryCard({ status: removed }) })).reason,
		).toBe("stale_ownership");
		expect(
			projectVoiceSpokenApproval(input({ card: ordinaryCard({ request: fileChange }) })).reason,
		).toBe("unsupported_schema");
	});
});

describe("canonical spoken state", () => {
	test("projects every authoritative fallback reason without inventing outcome certainty", () => {
		for (const [reason, state] of Object.entries(FALLBACK_STATE_BY_REASON) as [
			NonNullable<BrowserSpokenApproval["reason"]>,
			Exclude<BrowserSpokenApproval["state"], "idle" | "armed" | "resolving" | "settled">,
		][]) {
			const projected = projectVoiceSpokenApproval(
				input({ spokenApproval: spokenApproval(state, { reason }) }),
			);

			expect(projected.state, reason).toBe(state);
			expect(projected.reason, reason).toBe(reason);
			expect(projected.visualCardPreserved, reason).toBe(true);
		}
	});

	test("projects a second card as duplicate while a different live request owns the slot", () => {
		const secondRequestId = "request-spoken-2" as typeof spokenIdentities.REQUEST_ID;
		const secondCard = ordinaryCard({
			request: commandApproval({ requestId: secondRequestId }),
		});
		const projected = projectVoiceSpokenApproval(
			input({ card: secondCard, spokenApproval: spokenApproval("armed") }),
		);

		expect(projected.state).toBe("duplicate");
		expect(projected.reason).toBe("duplicate");
		expect(projected.visualCardPreserved).toBe(true);
		expect(VOICE_SPOKEN_APPROVAL_STATES).not.toContain("awaiting_user" as never);
	});

	test("requires the complete exact joined identity before showing an armed state", () => {
		const armed = projectVoiceSpokenApproval(input({ spokenApproval: spokenApproval("armed") }));
		const missingGate = projectVoiceSpokenApproval(
			input({ spokenApproval: spokenApproval("armed", { gate: null }) }),
		);

		expect(armed.state).toBe("armed");
		expect(armed.source.find((row) => row.label === "Coordinator thread")?.value).toBe(
			spokenIdentities.COORDINATOR_THREAD_ID,
		);
		expect(missingGate.state).toBe("stale_session");
		expect(missingGate.visualCardPreserved).toBe(true);
	});

	test("keeps same-request identity mismatches distinct from a duplicate request", () => {
		const staleApproval = "approval-stale" as typeof spokenIdentities.APPROVAL_ID;
		const staleThread = "thread-stale" as typeof spokenIdentities.THREAD_ID;
		const staleChild = "child-stale" as typeof spokenIdentities.CHILD;
		const baseIdentity = spokenIdentity();
		const staleIdentities = [
			spokenIdentity({ approvalId: staleApproval }),
			spokenIdentity({ threadId: staleThread }),
			spokenIdentity({ binding: { ...baseIdentity.binding, child: staleChild } }),
			spokenIdentity({
				binding: { ...baseIdentity.binding, effect: "a changed effect" },
			}),
		] as const;

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
				spokenApproval: spokenApproval("stale_session", {
					reason: "stale_realtime_session",
				}),
			}),
		);

		expect(projected.state).toBe("stale_session");
		expect(projected.reason).toBe("stale_realtime_session");
	});

	test("fails closed when authoritative captured evidence is absent while resolving", () => {
		const projected = projectVoiceSpokenApproval(
			input({
				spokenApproval: spokenApproval("resolving", { capturedUserFinal: null }),
			}),
		);

		expect(projected.state).toBe("visual_fallback");
		expect(projected.reason).toBe("missing_user_final");
		expect(projected.utterance).toBeNull();
		expect(projected.visualCardPreserved).toBe(true);
	});

	test("shows the authoritative final user item after the immutable effect prompt", () => {
		const captured = capturedUserFinal();
		const projected = projectVoiceSpokenApproval(
			input({
				spokenApproval: spokenApproval("resolving", { capturedUserFinal: captured }),
			}),
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
			input({
				spokenApproval: spokenApproval("visual_fallback", { reason: "classifier_lost" }),
			}),
		);
		const resolverLost = projectVoiceSpokenApproval(
			input({
				spokenApproval: spokenApproval("outcome_unknown", { reason: "resolver_lost" }),
			}),
		);

		expect(classifierLost.state).toBe("visual_fallback");
		expect(classifierLost.detail).toContain("without a typed decision");
		expect(resolverLost.state).toBe("outcome_unknown");
		expect(resolverLost.detail).toContain("produced a typed decision");
		expect(resolverLost.detail).toContain("host lost the result");
		expect(resolverLost.detail).toContain("cannot infer delivery and does not retry");
		expect(resolverLost.detail).not.toContain("classifier result was lost");
	});

	test("keeps a matching canonical unknown outcome ahead of ordinary terminal eligibility", () => {
		const request = commandApproval({
			lifecycle: {
				state: "outcome_unknown",
				decision: "approved",
				outcome: "outcome_unknown",
				reason: "The resolver result was lost.",
			},
			spoken: { eligible: false, reason: "not_pending" },
		});
		const status = {
			...pendingStatus,
			phase: "outcome_unknown" as const,
			label: "Outcome unknown",
			detail: "The resolver result was lost.",
			recovery: "Read the thread before assuming either result.",
			decision: "You approved this request.",
			delivery: "outcome_unknown" as const,
			terminal: true,
			authority: "removed" as const,
			authorityReason: "This request is no longer waiting for a decision.",
		};
		const card = ordinaryCard({ request, status });
		const projected = projectVoiceSpokenApproval(
			input({ card, spokenApproval: spokenApproval("outcome_unknown") }),
		);

		expect(card.request.lifecycle.state).toBe("outcome_unknown");
		expect(card.status.phase).toBe("outcome_unknown");
		expect(projected.state).toBe("outcome_unknown");
		expect(projected.reason).toBe("resolver_lost");
		expect(projected.visualCardPreserved).toBe(true);
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
		const status = {
			...pendingStatus,
			phase: "not_delivered" as const,
			label: "Not delivered",
			detail: "The broker confirmed nothing was delivered.",
			recovery: "Nothing was executed.",
			decision: "You approved this request.",
			delivery: "not_delivered" as const,
			terminal: true,
			authority: "removed" as const,
			authorityReason: "This request is no longer waiting for a decision.",
		};
		const settlement = {
			state: "settled" as const,
			outcome: "not_delivered" as const,
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
		const status = {
			...pendingStatus,
			phase: "delivered" as const,
			terminal: true,
		};
		const projected = projectVoiceSpokenApproval(
			input({
				card: ordinaryCard({ request, status }),
				spokenApproval: spokenApproval("settled"),
			}),
		);

		expect(projected.state).toBe("ineligible");
		expect(projected.reason).toBe("not_pending");
	});

	test("uses later-turn copy and exposes no runtime awaiting state", () => {
		for (const state of [
			"armed",
			"expired",
			"resolving",
			"visual_fallback",
			"outcome_unknown",
		] as const) {
			const projected = projectVoiceSpokenApproval(
				input({ spokenApproval: spokenApproval(state) }),
			);
			expect(projected.classifierNotice, state).toContain(
				"later ordinary coordinator classifier turn",
			);
			expect(projected.classifierNotice, state).toContain("realtime speech does not");
		}
		expect(VOICE_SPOKEN_APPROVAL_STATES).not.toContain("awaiting_user" as never);
	});

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
	});
});
