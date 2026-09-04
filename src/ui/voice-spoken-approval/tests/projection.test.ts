import { describe, expect, test } from "bun:test";

import type { BrowserApproval, BrowserVoice } from "../../../shared/codex-browser-model/index.js";
import {
	projectVoiceSpokenApproval,
	VOICE_SPOKEN_APPROVAL_STATES,
	type VoiceSpokenApprovalGatePresentation,
} from "../index.js";
import {
	capturedItem,
	commandApproval,
	dynamicCard,
	gate,
	input,
	NOW,
	ordinaryCard,
	spokenIdentities,
	voice,
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

	test("rejects broader grants, stale authority, other families, and dynamic requests", () => {
		const broader = commandApproval({
			availableDecisions: ["accept", "acceptForSession", "decline"],
		});
		const removed = {
			...ordinaryCard().status,
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
		expect(projectVoiceSpokenApproval(input({ card: dynamicCard() })).reason).toBe(
			"dynamic_approval",
		);
	});
});

describe("gate states", () => {
	test("projects armed, explicit expiry, resolving, fallback, unknown, and stale", () => {
		const final = capturedItem();
		const cases: readonly [
			VoiceSpokenApprovalGatePresentation["state"],
			VoiceSpokenApprovalGatePresentation,
		][] = [
			["armed", gate("armed")],
			["expired", gate("expired")],
			["resolving", gate("resolving", { capturedItem: final })],
			["visual_fallback", gate("visual_fallback", { reason: "realtime_unavailable" })],
			["outcome_unknown", gate("outcome_unknown", { capturedItem: final })],
			["stale_session", gate("stale_session")],
		];

		for (const [state, presentation] of cases) {
			const projected = projectVoiceSpokenApproval(input({ gate: presentation }));
			expect(projected.state, state).toBe(state);
			expect(projected.visualCardPreserved, state).toBe(true);
		}
	});

	test("projects a second request as duplicate while the live gate belongs to the first", () => {
		const secondRequestId = "request-spoken-2" as typeof spokenIdentities.REQUEST_ID;
		const secondCard = ordinaryCard({
			request: commandApproval({ requestId: secondRequestId }),
		});
		const projected = projectVoiceSpokenApproval(input({ card: secondCard, gate: gate("armed") }));

		expect(projected.state).toBe("duplicate");
		expect(projected.reason).toBe("duplicate");
		expect(projected.visualCardPreserved).toBe(true);
		expect(VOICE_SPOKEN_APPROVAL_STATES).not.toContain("awaiting_user" as never);
	});

	test("derives expiry from the immutable deadline before showing a live state", () => {
		const projected = projectVoiceSpokenApproval(
			input({ gate: gate("armed", { expiresAtMs: NOW }), nowMs: NOW }),
		);

		expect(projected.state).toBe("expired");
		expect(projected.reason).toBe("expiry");
	});

	test("fails closed instead of throwing on invalid caller-supplied gate facts", () => {
		const invalid = {
			...gate("armed"),
			effectPrompt: { ...gate("armed").effectPrompt, sequence: -1 },
			expiresAtMs: Number.NaN,
		} as VoiceSpokenApprovalGatePresentation;
		const projected = projectVoiceSpokenApproval(input({ gate: invalid }));

		expect(projected.state).toBe("stale_session");
		expect(projected.reason).toBe("stale_identity");
		expect(projected.visualCardPreserved).toBe(true);
		expect(projected.utterance).toBeNull();
	});

	test("uses ordinary classifier copy and exposes no runtime awaiting state", () => {
		for (const state of [
			"armed",
			"expired",
			"resolving",
			"visual_fallback",
			"outcome_unknown",
		] as const) {
			const presentation =
				state === "resolving" || state === "outcome_unknown"
					? gate(state, { capturedItem: capturedItem() })
					: gate(state);
			const projected = projectVoiceSpokenApproval(input({ gate: presentation }));
			expect(projected.classifierNotice, state).toContain(
				"later ordinary coordinator classifier turn",
			);
			expect(projected.classifierNotice, state).toContain("realtime speech does not");
		}
		expect(VOICE_SPOKEN_APPROVAL_STATES).not.toContain("awaiting_user" as never);
	});
});

describe("utterance evidence", () => {
	test("shows the exact matching final user item only after the effect prompt", () => {
		const final = capturedItem();
		const projected = projectVoiceSpokenApproval(
			input({ gate: gate("resolving", { capturedItem: final }), voice: voice([final]) }),
		);

		expect(projected.state).toBe("resolving");
		expect(projected.utterance).toEqual({
			...final,
			authority: "captured_user_final",
			label: "Captured final user utterance",
		});
		expect(projected.gate.find((row) => row.label === "Effect prompt sequence")?.value).toBe("10");
		expect(projected.utterance?.sequence).toBe(12);
	});

	test("fails closed for ambiguous, missing, provisional, and assistant-only evidence", () => {
		const final = capturedItem();
		const provisional = capturedItem({ final: false });
		const assistant = capturedItem({ speaker: "assistant", text: "I approve." });
		const cases = [
			{
				reason: "ambiguous",
				gate: gate("resolving", { capturedItem: final }),
				voice: voice([final, final]),
			},
			{
				reason: "missing",
				gate: gate("resolving", { capturedItem: final }),
				voice: voice([]),
			},
			{
				reason: "non_final",
				gate: gate("armed", { capturedItem: provisional }),
				voice: voice([provisional]),
			},
			{
				reason: "assistant_only",
				gate: gate("armed", { capturedItem: assistant }),
				voice: voice([assistant]),
			},
		] as const;

		for (const item of cases) {
			const projected = projectVoiceSpokenApproval(input({ gate: item.gate, voice: item.voice }));
			expect(projected.state, item.reason).toBe("visual_fallback");
			expect(projected.reason, item.reason).toBe(item.reason);
			expect(projected.visualCardPreserved, item.reason).toBe(true);
		}
		const provisionalView = projectVoiceSpokenApproval(
			input({ gate: gate("armed", { capturedItem: provisional }), voice: voice([provisional]) }),
		);
		expect(provisionalView.utterance?.label).toBe("Provisional user output");
		const assistantView = projectVoiceSpokenApproval(
			input({ gate: gate("armed", { capturedItem: assistant }), voice: voice([assistant]) }),
		);
		expect(assistantView.utterance?.authority).toBe("non_authoritative");
		expect(assistantView.utterance?.label).toContain("Non-authoritative assistant");
	});

	test("rejects evidence at the effect prompt sequence and every inexact item correlation", () => {
		const early = capturedItem({ sequence: 10 });
		const exact = capturedItem();
		const changed = capturedItem({ text: "Different text." });

		expect(
			projectVoiceSpokenApproval(
				input({ gate: gate("resolving", { capturedItem: early }), voice: voice([early]) }),
			).reason,
		).toBe("ambiguous");
		expect(
			projectVoiceSpokenApproval(
				input({ gate: gate("resolving", { capturedItem: exact }), voice: voice([changed]) }),
			).reason,
		).toBe("missing");
	});

	test("marks same-request identity and realtime-session drift stale", () => {
		const staleApproval = "approval-stale" as typeof spokenIdentities.APPROVAL_ID;
		const staleThread = "thread-stale" as typeof spokenIdentities.THREAD_ID;
		const staleChild = "child-stale" as typeof spokenIdentities.CHILD;
		const otherSession = "realtime-session-2" as NonNullable<BrowserVoice["realtimeSessionId"]>;
		const base = gate("armed");
		const staleFacts: readonly VoiceSpokenApprovalGatePresentation[] = [
			gate("armed", { identity: { approvalId: staleApproval } }),
			gate("armed", { identity: { threadId: staleThread } }),
			{ ...base, binding: { ...base.binding, child: staleChild } },
			{ ...base, binding: { ...base.binding, effect: "a changed effect" } },
		];
		const staleSession = projectVoiceSpokenApproval(
			input({ gate: gate("armed"), voice: voice([], { realtimeSessionId: otherSession }) }),
		);

		for (const stale of staleFacts) {
			const projected = projectVoiceSpokenApproval(input({ gate: stale }));
			expect(projected.state).toBe("stale_session");
			expect(projected.reason).toBe("stale_identity");
		}
		expect(staleSession.state).toBe("stale_session");
		expect(staleSession.reason).toBe("stale_session");
	});

	test("keeps a lost typed-decision result unknown with the captured evidence", () => {
		const final = capturedItem();
		const projected = projectVoiceSpokenApproval(
			input({ gate: gate("outcome_unknown", { capturedItem: final }), voice: voice([final]) }),
		);

		expect(projected.state).toBe("outcome_unknown");
		expect(projected.reason).toBe("lost_result");
		expect(projected.detail).toContain("produced a typed decision");
		expect(projected.detail).toContain("host lost the result");
		expect(projected.detail).toContain("cannot infer delivery and does not retry");
		expect(projected.detail).not.toContain("classifier result was lost");
		expect(projected.utterance?.itemId).toBe(spokenIdentities.ITEM_ID);
		expect(projected.visualCardPreserved).toBe(true);
	});
});
