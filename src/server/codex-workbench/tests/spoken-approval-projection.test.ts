import { describe, expect, test } from "bun:test";

import type { ApprovalOwnerView } from "../../../runtime/codex-approvals/index.js";
import type {
	SpokenApprovalFallbackReason,
	SpokenApprovalSnapshot,
} from "../../../runtime/codex-spoken-approval/index.js";
import {
	BROWSER_SPOKEN_APPROVAL_REASONS,
	createCodexBrowserModel,
} from "../../../shared/codex-browser-model/index.js";
import {
	parseRealtimeItemId,
	parseRealtimeSessionId,
} from "../../../shared/codex-realtime-host/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
} from "../../../shared/codex-workbench-identity/index.js";
import { projectCodexBrowserState, type BrowserProjectionInput } from "../index.js";
import { commandApprovalOwnerFixture } from "./approval-owner-fixture.js";

const NOW = 1_700_000_000_000;

function expectedBrowserState(reason: SpokenApprovalFallbackReason) {
	switch (reason) {
		case "timeout":
			return "expired";
		case "resolver_lost":
			return "outcome_unknown";
		case "changed_effect":
		case "stale_realtime_session":
		case "stale_state":
			return "stale_session";
		case "approval_unavailable":
		case "not_eligible":
		case "coordinator_unavailable":
		case "realtime_unavailable":
		case "invalid_context":
		case "invalid_effect_prompt":
		case "user_already_spoke":
		case "missing_user_final":
		case "assistant_only":
		case "ambiguous":
		case "classifier_lost":
		case "child_exit":
		case "disposed":
			return "visual_fallback";
	}
	const unhandled: never = reason;
	return unhandled;
}

function owner(authorities: IdentityAuthorities): ApprovalOwnerView {
	const identity = authorities.identity;
	return commandApprovalOwnerFixture({
		identity,
		childId: identity.validator.childId,
		epoch: identity.validator.epoch,
		requestId: identity.decoder.adoptJsonRpcRequestId("spoken-request"),
		threadId: identity.decoder.adoptThreadId("spoken-workhorse"),
		turnId: identity.decoder.adoptTurnId("spoken-turn"),
		itemId: identity.decoder.adoptItemId("spoken-item"),
		approvalId: identity.decoder.adoptApprovalId("spoken-approval"),
		nowMs: NOW,
	});
}

function projectionInput(
	authorities: IdentityAuthorities,
	approval: ApprovalOwnerView,
	spokenApproval: SpokenApprovalSnapshot,
	assistantAfterPrompt = false,
): BrowserProjectionInput {
	const identity = authorities.identity;
	const assistantItem = identity.decoder.adoptItemId("spoken-assistant");
	return {
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "signed_out" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: identity.validator.childId,
			epoch: identity.validator.epoch,
			threadId: approval.snapshot.threadId,
			source: "appServer",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		threadCandidates: { kind: "codex_thread_candidates", state: "unknown" },
		timeline: null,
		queue: { kind: "codex_queue", submissions: [] },
		settings: [],
		approvals: [approval],
		dynamicApprovals: [],
		semantic: { kind: "codex_semantic", outcome: null, freshness: null },
		coordinator: {
			kind: "codex_coordinator",
			state: "ready",
			threadId: spokenApproval.coordinatorThreadId,
			configured: null,
			effective: null,
			reason: null,
		},
		voice: {
			kind: "codex_voice",
			mediaReady: false,
			generation:
				spokenApproval.realtimeSessionId === null
					? null
					: { browserSessionId: spokenApproval.realtimeSessionId },
			coordinatorState: "ready",
			transcript: assistantAfterPrompt
				? [
						{
							itemId: parseRealtimeItemId(assistantItem),
							sequence: 12,
							role: "assistant",
							text: "Do you want me to proceed?",
							status: "final",
						},
					]
				: [],
		},
		spokenApproval,
		lease: null,
		operation: null,
	};
}

function spokenSnapshot(
	authorities: IdentityAuthorities,
	approval: ApprovalOwnerView,
	overrides: Partial<SpokenApprovalSnapshot> = {},
): SpokenApprovalSnapshot {
	const identity = authorities.identity;
	const promptItem = identity.decoder.adoptItemId("spoken-prompt");
	return {
		state: "awaiting_user",
		requestId: approval.snapshot.requestId,
		approvalId: approval.snapshot.approvalId,
		child: approval.snapshot.child,
		epoch: approval.snapshot.epoch,
		coordinatorThreadId: identity.decoder.adoptThreadId("spoken-coordinator"),
		realtimeSessionId: parseRealtimeSessionId("spoken-session"),
		realtimeCorrelationId: null,
		effectSummary: "Run bun test",
		effectFingerprint: approval.snapshot.binding.effect,
		effectPromptItemId: parseRealtimeItemId(promptItem),
		effectPromptSequence: 10,
		finalUserItemId: null,
		finalUserSequence: null,
		finalUserText: null,
		operationId: "spoken-operation",
		classifierTurnId: null,
		resolverCallId: null,
		expiresAtMs: NOW + 30_000,
		settlement: null,
		reason: null,
		...overrides,
	};
}

function withCapturedFinal(
	authorities: IdentityAuthorities,
	snapshot: SpokenApprovalSnapshot,
): SpokenApprovalSnapshot {
	const finalItem = authorities.identity.decoder.adoptItemId("spoken-final-user");
	return {
		...snapshot,
		finalUserItemId: parseRealtimeItemId(finalItem),
		finalUserSequence: 11,
		finalUserText: "Yes, run it",
	};
}

function project(
	authorities: IdentityAuthorities,
	approval: ApprovalOwnerView,
	spokenApproval: SpokenApprovalSnapshot,
	assistantAfterPrompt = false,
) {
	const model = createCodexBrowserModel(authorities);
	const result = projectCodexBrowserState(
		model,
		authorities.identity.decoder,
		projectionInput(authorities, approval, spokenApproval, assistantAfterPrompt),
	);
	expect(result.tag).toBe("projected");
	if (result.tag !== "projected") throw new Error(result.message);
	return result.snapshot.spokenApproval;
}

describe("spoken approval browser projection", () => {
	test("joins the runtime gate to one exact ordinary approval owner", () => {
		const authorities = createIdentityAuthorities();
		const approval = owner(authorities);
		const result = project(authorities, approval, spokenSnapshot(authorities, approval));

		expect(result).toMatchObject({
			kind: "spoken_approval",
			state: "armed",
			approval: {
				requestId: approval.snapshot.requestId,
				threadId: approval.snapshot.threadId,
				binding: {
					child: approval.snapshot.child,
					epoch: approval.snapshot.epoch,
					effect: approval.snapshot.binding.effect,
				},
			},
			capturedUserFinal: null,
			reason: null,
		});
		expect(result.gate?.coordinatorThreadId).toBe(
			authorities.identity.decoder.adoptThreadId("spoken-coordinator"),
		);
	});

	test("nominates only the runtime-captured post-prompt final user item", () => {
		const authorities = createIdentityAuthorities();
		const approval = owner(authorities);
		const captured = withCapturedFinal(
			authorities,
			spokenSnapshot(authorities, approval, { state: "classifying" }),
		);
		const projected = project(authorities, approval, captured);
		if (captured.finalUserItemId === null) throw new Error("fixture lost its final user item");
		expect(projected.state).toBe("resolving");
		expect(projected.capturedUserFinal?.itemId).toBe(captured.finalUserItemId);
		expect(projected.capturedUserFinal?.sequence).toBe(11);
		expect(projected.capturedUserFinal?.text).toBe("Yes, run it");
	});

	test("does not arm or select a post-prompt assistant when captured user evidence is null", () => {
		const authorities = createIdentityAuthorities();
		const approval = owner(authorities);
		const snapshot = spokenSnapshot(authorities, approval, { state: "classifying" });
		const projected = project(authorities, approval, snapshot, true);

		expect(projected.state).toBe("visual_fallback");
		expect(projected.reason).toBe("missing_user_final");
		expect(projected.capturedUserFinal).toBeNull();
	});

	test("maps every runtime fallback reason and reserves unknown outcome for resolver loss", () => {
		const authorities = createIdentityAuthorities();
		const approval = owner(authorities);
		const base = withCapturedFinal(authorities, spokenSnapshot(authorities, approval));

		expect(BROWSER_SPOKEN_APPROVAL_REASONS).toHaveLength(18);
		for (const reason of BROWSER_SPOKEN_APPROVAL_REASONS) {
			const snapshot = {
				...base,
				state: "visual_fallback" as const,
				reason,
				...(reason === "assistant_only"
					? { finalUserItemId: null, finalUserSequence: null, finalUserText: null }
					: {}),
			};
			expect(project(authorities, approval, snapshot).state).toBe(expectedBrowserState(reason));
		}
	});

	test("fails closed when the gate effect no longer matches the approval owner", () => {
		const authorities = createIdentityAuthorities();
		const approval = owner(authorities);
		const projected = project(
			authorities,
			approval,
			spokenSnapshot(authorities, approval, { effectFingerprint: "changed effect" }),
		);
		expect(projected.state).toBe("stale_session");
		expect(projected.reason).toBe("stale_state");
		expect(projected.approval).toBeNull();
	});

	test("fails closed when a settlement names a different approval request", () => {
		const authorities = createIdentityAuthorities();
		const approval = owner(authorities);
		const captured = withCapturedFinal(authorities, spokenSnapshot(authorities, approval));
		const projected = project(authorities, approval, {
			...captured,
			state: "settled",
			settlement: {
				requestId: authorities.identity.decoder.adoptJsonRpcRequestId("other-request"),
				family: "command_execution",
				state: "settled",
				outcome: "delivered",
				reason: "response written",
			},
		});

		expect(projected.state).toBe("stale_session");
		expect(projected.reason).toBe("stale_state");
		expect(projected.settlement).toBeNull();
	});

	test("the shared schema rejects classifier loss as an unknown resolver outcome", () => {
		const authorities = createIdentityAuthorities();
		const approval = owner(authorities);
		const resolved = project(authorities, approval, {
			...withCapturedFinal(authorities, spokenSnapshot(authorities, approval)),
			state: "visual_fallback",
			reason: "resolver_lost",
		});
		const model = createCodexBrowserModel(authorities);
		expect(
			model.BrowserSpokenApprovalSchema.safeParse({ ...resolved, reason: "classifier_lost" })
				.success,
		).toBe(false);
	});
});
