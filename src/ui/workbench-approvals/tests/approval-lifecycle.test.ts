import { describe, expect, test } from "bun:test";

import type { BrowserApproval } from "@/shared/codex-browser-model";
import {
	approvalDecisionSignature,
	approvalFocusReturn,
	approvalTarget,
	projectWorkbenchApprovals,
} from "@/ui/workbench-approvals";
import type {
	WorkbenchApprovalCard,
	WorkbenchApprovalPhase,
	WorkbenchApprovalsInput,
	WorkbenchApprovalsView,
} from "@/ui/workbench-approvals/contracts";
import type { WorkbenchTransportState } from "@/ui/workbench-approvals/transport-port";
import {
	commandApproval,
	dynamicApproval,
	dynamicDecision,
	HASH,
	IMMUTABLE_TARGET,
	SEND_EFFECT,
} from "@/ui/workbench-approvals/tests/fixtures";
import {
	approvalsInput,
	connected,
	NOW,
	OTHER_THREAD,
	snapshot,
} from "@/ui/workbench-approvals/tests/model";

type Overrides = Readonly<Record<string, unknown>>;

/**
 * The first card of one state.
 * @param state The transport state.
 * @param overrides Input fields that differ.
 * @returns The card.
 */
function cardFor(
	state: WorkbenchTransportState,
	overrides: Partial<Omit<WorkbenchApprovalsInput, "state">> = {},
): WorkbenchApprovalCard {
	const card = projectWorkbenchApprovals(approvalsInput(state, overrides)).cards[0];
	if (card === undefined) {
		throw new Error("Expected one projected approval card");
	}
	return card;
}

/**
 * The card of a command approval in one lifecycle.
 * @param lifecycle The lifecycle.
 * @returns The card.
 */
function ordinaryCard(lifecycle: Overrides): WorkbenchApprovalCard {
	return cardFor(
		connected(
			snapshot({
				approvals: [
					commandApproval({ lifecycle, spoken: { eligible: false, reason: "not_pending" } }),
				],
			}),
		),
	);
}

/**
 * The card of the send effect with overrides.
 * @param overrides Fields that differ.
 * @returns The card.
 */
function dynamicCard(overrides: Overrides): WorkbenchApprovalCard {
	return cardFor(
		connected(snapshot({ dynamicApprovals: [dynamicApproval(SEND_EFFECT, overrides)] })),
	);
}

/**
 * The surface for some approvals.
 * @param approvals The approvals.
 * @returns The view.
 */
function projectApprovals(approvals: readonly BrowserApproval[]): WorkbenchApprovalsView {
	return projectWorkbenchApprovals(
		approvalsInput(connected(snapshot({ approvals: [...approvals] }))),
	);
}

/**
 * The key of the first card.
 * @param view The view.
 * @returns The key.
 */
function firstKey(view: WorkbenchApprovalsView): string {
	const card = view.cards[0];
	if (card === undefined) {
		throw new Error("Expected one card");
	}
	return card.key;
}

describe("ordinary approval lifecycle", () => {
	const cases: readonly (readonly [string, Overrides, WorkbenchApprovalPhase])[] = [
		["staged", { state: "staged", decision: null, outcome: null, reason: null }, "staged"],
		["pending", { state: "pending", decision: null, outcome: null, reason: null }, "pending"],
		[
			"approved",
			{ state: "settled", decision: "approved", outcome: null, reason: "You approved it." },
			"approved",
		],
		[
			"declined",
			{ state: "settled", decision: "declined", outcome: null, reason: "You declined it." },
			"declined",
		],
	];

	for (const [name, lifecycle, phase] of cases) {
		test(`keeps the immutable target and removes dead authority for ${name}`, () => {
			const card = ordinaryCard(lifecycle);

			expect(card.status.phase).toBe(phase);
			expect(approvalTarget(card)).toBe(IMMUTABLE_TARGET);
			expect(card.status.resumable).toBe(false);
			expect(card.status.authority).toBe(phase === "pending" ? "live" : "removed");
			expect(card.offers.length > 0).toBe(phase === "pending");
		});
	}

	test("carries the host's own reason into the terminal detail", () => {
		const card = ordinaryCard({
			state: "settled",
			decision: "declined",
			outcome: null,
			reason: "You declined it.",
		});

		expect(card.status.detail).toBe("You declined it.");
		expect(card.status.decision).toBe("You declined this request.");
	});

	test("treats a pending request past its expiry as expired without inventing a host record", () => {
		const card = cardFor(connected(snapshot({ approvals: [commandApproval()] })), {
			nowMs: NOW + 90_001,
		});

		expect(card.status.phase).toBe("expired");
		expect(card.status.detail).toContain("has not published its terminal record yet");
		expect(card.offers).toHaveLength(0);
		expect(card.spoken.eligible).toBe(false);
	});
});

describe("connection and lease authority", () => {
	test("removes authority while the browser is reconnecting", () => {
		const card = cardFor({
			kind: "connection",
			state: "reconnecting",
			connection: "reconnecting",
			snapshot: snapshot({ approvals: [commandApproval()] }),
			sequence: 4,
			reason: "The workbench socket dropped.",
		});

		expect(card.offers).toHaveLength(0);
		expect(card.status.authorityReason).toBe("The workbench socket dropped.");
		expect(approvalTarget(card)).toBe(IMMUTABLE_TARGET);
	});

	test("removes authority on a stale snapshot", () => {
		const card = cardFor({
			kind: "stream",
			state: "stale_snapshot",
			connection: "connected",
			snapshot: snapshot({ approvals: [commandApproval()] }),
			sequence: 4,
			expectedSequence: 5,
			receivedSequence: 9,
			reason: "The workbench missed a delta.",
		});

		expect(card.offers).toHaveLength(0);
		expect(card.status.authorityReason).toContain("behind the host");
	});

	test("removes authority without a usable command lease", () => {
		const card = cardFor(connected(snapshot({ approvals: [commandApproval()] })), {
			canCommand: false,
		});

		expect(card.offers).toHaveLength(0);
		expect(card.status.authorityReason).toContain("workbench command lease");
	});

	test("removes a dynamic decision the transport already refuses", () => {
		const card = cardFor(
			connected(snapshot({ dynamicApprovals: [dynamicApproval(SEND_EFFECT)] })),
			{
				canRespondDynamic: false,
			},
		);

		expect(card.offers).toHaveLength(0);
		expect(card.status.authorityReason).toContain("no longer accepts a response");
	});

	test("reports no card and no authority when the host published no snapshot", () => {
		const stopped = projectWorkbenchApprovals(
			approvalsInput(
				{
					kind: "connection",
					state: "stopped",
					connection: "stopped",
					snapshot: null,
					sequence: null,
					reason: "The workbench stopped.",
				},
				{ canCommand: false, canRespondOrdinary: false, canRespondDynamic: false },
			),
		);

		expect(stopped.cards).toHaveLength(0);
		expect(stopped.authority).toBe("removed");
		expect(stopped.authorityReason).toBe("The workbench stopped.");
		expect(stopped.beacon.announcement).toBe("No Codex approval request is open.");
	});
});

describe("dynamic approval lifecycle", () => {
	const approved = dynamicDecision(SEND_EFFECT, "approved", "person_approved");
	const cases: readonly (readonly [WorkbenchApprovalPhase, Overrides])[] = [
		["pending", {}],
		["approved", { state: "approved", decision: approved, binding: null }],
		[
			"declined",
			{
				state: "declined",
				decision: dynamicDecision(SEND_EFFECT, "declined", "person_declined"),
				toolResult: "refused:approval_declined",
				binding: null,
			},
		],
		[
			"expired",
			{
				state: "expired",
				decision: dynamicDecision(SEND_EFFECT, "expired", "deadline_reached"),
				toolResult: "refused:expired",
				binding: null,
			},
		],
		[
			"stale",
			{ state: "stale", decision: approved, toolResult: "refused:prior_epoch", binding: null },
		],
		["delivered", { state: "delivered", decision: approved, delivery: "delivered", binding: null }],
		[
			"not_delivered",
			{
				state: "not_delivered",
				decision: approved,
				delivery: "not_delivered",
				toolResult: "transport_not_delivered",
				binding: null,
			},
		],
		[
			"outcome_unknown",
			{ state: "outcome_unknown", decision: approved, delivery: "outcome_unknown", binding: null },
		],
	];

	for (const [phase, overrides] of cases) {
		test(`keeps the immutable effect and target for ${phase}`, () => {
			const card = dynamicCard(overrides);

			expect(card.status.phase).toBe(phase);
			expect(card.kind === "dynamic" ? card.effectHash : null).toBe(HASH);
			expect(approvalTarget(card)).toBe(String(OTHER_THREAD));
			expect(card.status.resumable).toBe(false);
			expect(card.spoken.eligible).toBe(false);
			expect(card.offers).toHaveLength(phase === "pending" ? 2 : 0);
		});
	}

	test("an unknown outcome stays unknown and tells the person not to assume either result", () => {
		const card = dynamicCard({
			state: "outcome_unknown",
			decision: approved,
			delivery: "outcome_unknown",
			binding: null,
		});

		expect(card.status.phase).toBe("outcome_unknown");
		expect(card.status.delivery).toBe("outcome_unknown");
		expect(card.status.recovery).toContain("never retries an unknown mutation");
		expect(card.status.terminal).toBe(true);
	});

	test("cannot receive a pending effect without a browser binding", () => {
		// The closed contract already refuses it, so the surface never has to
		// render a pending decision it could not send.
		expect(() => dynamicCard({ binding: null })).toThrow();
	});

	test("names a child disconnect rather than a generic failure", () => {
		const card = dynamicCard({
			state: "disconnected",
			decision: dynamicDecision(SEND_EFFECT, "disconnected", "child_disconnected"),
			delivery: "not_delivered",
			toolResult: "transport_not_delivered",
			binding: null,
		});

		expect(card.status.detail).toContain("Codex child disconnected");
		expect(card.status.delivery).toBe("not_delivered");
	});
});

describe("focus return", () => {
	test("returns focus when the focused card loses its authority", () => {
		const pending = projectApprovals([commandApproval()]);
		const key = firstKey(pending);
		const settled = projectApprovals([
			commandApproval({
				lifecycle: {
					state: "settled",
					decision: "approved",
					outcome: "delivered",
					reason: "Delivered.",
				},
				spoken: { eligible: false, reason: "not_pending" },
			}),
		]);
		const settledCard = settled.cards[0];
		if (settledCard === undefined) {
			throw new Error("Expected one settled card");
		}
		const change = approvalFocusReturn(
			approvalDecisionSignature(pending.cards),
			[{ ...settledCard, key }],
			key,
		);

		expect(change?.key).toBe(key);
		expect(change?.announcement).toContain("no longer accepts a decision");
		expect(change?.announcement).toContain("Focus returned to the approvals heading.");
	});

	test("returns focus when the card disappears entirely", () => {
		const pending = projectApprovals([commandApproval()]);
		const change = approvalFocusReturn(
			approvalDecisionSignature(pending.cards),
			[],
			firstKey(pending),
		);

		expect(change?.announcement).toContain("gone from this workbench");
	});

	test("leaves focus alone while the card still accepts a decision", () => {
		const pending = projectApprovals([commandApproval()]);

		expect(
			approvalFocusReturn(
				approvalDecisionSignature(pending.cards),
				pending.cards,
				firstKey(pending),
			),
		).toBeNull();
		expect(approvalFocusReturn("", pending.cards, null)).toBeNull();
	});
});
