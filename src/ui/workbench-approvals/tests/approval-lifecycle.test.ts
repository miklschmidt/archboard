import { describe, expect, test } from "bun:test";

import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import {
	approvalDecisionSignature,
	approvalFocusReturn,
	approvalTarget,
	projectWorkbenchApprovals,
	type WorkbenchApprovalCard,
	type WorkbenchApprovalPhase,
	type WorkbenchApprovalsInput,
} from "../index.js";
import {
	commandApproval,
	dynamicApproval,
	dynamicDecision,
	HASH,
	IMMUTABLE_TARGET,
	SEND_EFFECT,
} from "./fixtures.js";
import { approvalsInput, connected, NOW, OTHER_THREAD, snapshot } from "./model.js";

type Overrides = Readonly<Record<string, unknown>>;

function cardFor(
	state: BrowserWorkbenchState,
	overrides: Partial<Omit<WorkbenchApprovalsInput, "state">> = {},
): WorkbenchApprovalCard {
	const card = projectWorkbenchApprovals(approvalsInput(state, overrides)).cards[0];
	if (card === undefined) throw new Error("Expected one projected approval card");
	return card;
}

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

function dynamicCard(overrides: Overrides): WorkbenchApprovalCard {
	return cardFor(
		connected(snapshot({ dynamicApprovals: [dynamicApproval(SEND_EFFECT, overrides)] })),
	);
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

	for (const [name, lifecycle, phase] of cases)
		test(`keeps the immutable target and removes dead authority for ${name}`, () => {
			const card = ordinaryCard(lifecycle);

			expect(card.status.phase).toBe(phase);
			expect(approvalTarget(card)).toBe(IMMUTABLE_TARGET);
			expect(card.status.resumable).toBe(false);
			if (phase === "pending") {
				expect(card.status.authority).toBe("live");
				expect(card.offers.length).toBeGreaterThan(0);
			} else {
				expect(card.status.authority).toBe("removed");
				expect(card.offers).toHaveLength(0);
			}
		});

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
			{ canRespondDynamic: false },
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
		expect(stopped.beacon.announcement).toBe("No Codex approval request is open.");
	});
});

describe("dynamic approval lifecycle", () => {
	const cases: readonly (readonly [WorkbenchApprovalPhase, Overrides])[] = [
		["pending", {}],
		[
			"approved",
			{
				state: "approved",
				decision: dynamicDecision(SEND_EFFECT, "approved", "person_approved"),
				binding: null,
			},
		],
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
			{
				state: "stale",
				decision: dynamicDecision(SEND_EFFECT, "approved", "person_approved"),
				toolResult: "refused:prior_epoch",
				binding: null,
			},
		],
		[
			"delivered",
			{
				state: "delivered",
				decision: dynamicDecision(SEND_EFFECT, "approved", "person_approved"),
				delivery: "delivered",
				binding: null,
			},
		],
		[
			"not_delivered",
			{
				state: "not_delivered",
				decision: dynamicDecision(SEND_EFFECT, "approved", "person_approved"),
				delivery: "not_delivered",
				toolResult: "transport_not_delivered",
				binding: null,
			},
		],
		[
			"outcome_unknown",
			{
				state: "outcome_unknown",
				decision: dynamicDecision(SEND_EFFECT, "approved", "person_approved"),
				delivery: "outcome_unknown",
				binding: null,
			},
		],
	];

	for (const [phase, overrides] of cases)
		test(`keeps the immutable effect and target for ${phase}`, () => {
			const card = dynamicCard(overrides);

			expect(card.status.phase).toBe(phase);
			expect(card.kind === "dynamic" && card.effectHash).toBe(HASH);
			expect(approvalTarget(card)).toBe(String(OTHER_THREAD));
			expect(card.status.resumable).toBe(false);
			expect(card.spoken.eligible).toBe(false);
			expect(card.offers).toHaveLength(phase === "pending" ? 2 : 0);
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

function projectApprovals(approvals: ReturnType<typeof commandApproval>[]) {
	return projectWorkbenchApprovals(approvalsInput(connected(snapshot({ approvals }))));
}

describe("focus return", () => {
	test("returns focus when the focused card loses its authority", () => {
		const pending = projectApprovals([commandApproval()]);
		const key = pending.cards[0]!.key;
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
		const change = approvalFocusReturn(
			approvalDecisionSignature(pending.cards),
			[{ ...settled.cards[0]!, key } as WorkbenchApprovalCard],
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
			pending.cards[0]!.key,
		);

		expect(change?.announcement).toContain("gone from this workbench");
	});

	test("leaves focus alone while the card still accepts a decision", () => {
		const pending = projectApprovals([commandApproval()]);

		expect(
			approvalFocusReturn(
				approvalDecisionSignature(pending.cards),
				pending.cards,
				pending.cards[0]!.key,
			),
		).toBeNull();
		expect(approvalFocusReturn("", pending.cards, null)).toBeNull();
	});
});
