import { describe, expect, test } from "bun:test";

import type {
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserSnapshot,
} from "../../../shared/codex-browser-model/index.js";
import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import {
	approvalDecisionSignature,
	approvalFocusReturn,
	approvalTarget,
	projectWorkbenchApprovals,
	type WorkbenchApprovalCard,
	type WorkbenchApprovalPhase,
} from "../index.js";
import {
	commandApproval,
	connected,
	dynamicApproval,
	dynamicIdentity,
	HASH,
	NOW,
	SEND_EFFECT,
	snapshot,
} from "./fixtures.js";

type Lifecycle = BrowserApproval["lifecycle"];
type DynamicDecision = NonNullable<BrowserDynamicApproval["decision"]>;

const IMMUTABLE_TARGET = "workhorse-a in the archboard checkout";

function ordinary(lifecycle: Lifecycle, overrides: Partial<BrowserApproval> = {}): BrowserApproval {
	return commandApproval({
		lifecycle,
		spoken: { eligible: false, reason: "not_pending" },
		...overrides,
	} as never);
}

function cardFor(
	state: BrowserWorkbenchState,
	options: { readonly canCommand?: boolean; readonly nowMs?: number } = {},
): WorkbenchApprovalCard {
	const projected = projectWorkbenchApprovals({
		state,
		nowMs: options.nowMs ?? NOW,
		canCommand: options.canCommand ?? true,
	});
	const card = projected.cards[0];
	if (card === undefined) throw new Error("Expected one projected approval card");
	return card;
}

function ordinaryCard(
	lifecycle: Lifecycle,
	overrides: Partial<BrowserApproval> = {},
): WorkbenchApprovalCard {
	return cardFor(connected(snapshot({ approvals: [ordinary(lifecycle, overrides)] })));
}

function dynamicDecision(
	outcome: DynamicDecision["outcome"],
	cause: DynamicDecision["cause"],
): DynamicDecision {
	return {
		outcome,
		identity: dynamicIdentity("send_message_to_thread"),
		effectHash: HASH,
		decidedAtMs: NOW,
		cause,
	} as DynamicDecision;
}

function dynamicCard(overrides: Partial<BrowserDynamicApproval>): WorkbenchApprovalCard {
	return cardFor(
		connected(snapshot({ dynamicApprovals: [dynamicApproval(SEND_EFFECT, overrides)] })),
	);
}

describe("ordinary approval lifecycle", () => {
	const cases: readonly (readonly [string, Lifecycle, WorkbenchApprovalPhase])[] = [
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
		[
			"delivered",
			{ state: "settled", decision: "approved", outcome: "delivered", reason: "Delivered." },
			"delivered",
		],
		[
			"not_delivered",
			{
				state: "settled",
				decision: "approved",
				outcome: "not_delivered",
				reason: "The child exited.",
			},
			"not_delivered",
		],
		[
			"expired",
			{ state: "expired", decision: "cancelled", outcome: null, reason: "The deadline passed." },
			"expired",
		],
		[
			"cancelled",
			{ state: "cancelled", decision: "cancelled", outcome: null, reason: "The turn stopped." },
			"cancelled",
		],
		[
			"stale ownership",
			{ state: "stale", decision: "cancelled", outcome: null, reason: "A new child epoch." },
			"stale",
		],
		[
			"outcome_unknown",
			{
				state: "outcome_unknown",
				decision: "approved",
				outcome: "outcome_unknown",
				reason: "The write was lost.",
			},
			"outcome_unknown",
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

	test("reports no card and no authority when the host published no snapshot", () => {
		const projected = projectWorkbenchApprovals({
			state: {
				kind: "connection",
				state: "stopped",
				connection: "stopped",
				snapshot: null,
				sequence: null,
				reason: "The workbench stopped.",
			},
			nowMs: NOW,
			canCommand: false,
		});

		expect(projected.cards).toHaveLength(0);
		expect(projected.authority).toBe("removed");
		expect(projected.beacon.announcement).toBe("No Codex approval request is open.");
	});
});

describe("dynamic approval lifecycle", () => {
	const cases: readonly (readonly [WorkbenchApprovalPhase, Partial<BrowserDynamicApproval>])[] = [
		["pending", {}],
		[
			"approved",
			{
				state: "approved",
				decision: dynamicDecision("approved", "person_approved"),
				binding: null,
			},
		],
		[
			"declined",
			{
				state: "declined",
				decision: dynamicDecision("declined", "person_declined"),
				toolResult: "refused:approval_declined",
				binding: null,
			},
		],
		[
			"expired",
			{
				state: "expired",
				decision: dynamicDecision("expired", "deadline_reached"),
				toolResult: "refused:expired",
				binding: null,
			},
		],
		[
			"cancelled",
			{
				state: "cancelled",
				decision: dynamicDecision("cancelled", "caller_turn_interrupted"),
				toolResult: "approval_required",
				binding: null,
			},
		],
		[
			"disconnected",
			{
				state: "disconnected",
				decision: dynamicDecision("disconnected", "child_disconnected"),
				delivery: "not_delivered",
				toolResult: "transport_not_delivered",
				binding: null,
			},
		],
		[
			"stale",
			{
				state: "stale",
				decision: dynamicDecision("approved", "person_approved"),
				toolResult: "refused:prior_epoch",
				binding: null,
			},
		],
		[
			"delivered",
			{
				state: "delivered",
				decision: dynamicDecision("approved", "person_approved"),
				delivery: "delivered",
				binding: null,
			},
		],
		[
			"not_delivered",
			{
				state: "not_delivered",
				decision: dynamicDecision("approved", "person_approved"),
				delivery: "not_delivered",
				toolResult: "transport_not_delivered",
				binding: null,
			},
		],
		[
			"outcome_unknown",
			{
				state: "outcome_unknown",
				decision: dynamicDecision("approved", "person_approved"),
				delivery: "outcome_unknown",
				binding: null,
			},
		],
	];

	for (const [phase, overrides] of cases)
		test(`keeps the immutable effect and target for ${phase}`, () => {
			const card = dynamicCard(overrides as Partial<BrowserDynamicApproval>);

			expect(card.status.phase).toBe(phase);
			expect(card.kind === "dynamic" && card.effectHash).toBe(HASH);
			expect(approvalTarget(card)).toBe("workhorse-b");
			expect(card.status.resumable).toBe(false);
			expect(card.spoken.eligible).toBe(false);
			expect(card.offers).toHaveLength(phase === "pending" ? 2 : 0);
		});

	test("removes the decision when the host published no browser binding", () => {
		const card = dynamicCard({ binding: null });

		expect(card.status.phase).toBe("pending");
		expect(card.offers).toHaveLength(0);
	});

	test("names a child disconnect rather than a generic failure", () => {
		const card = dynamicCard({
			state: "disconnected",
			decision: dynamicDecision("disconnected", "child_disconnected"),
			delivery: "not_delivered",
			toolResult: "transport_not_delivered",
			binding: null,
		} as Partial<BrowserDynamicApproval>);

		expect(card.status.detail).toContain("Codex child disconnected");
		expect(card.status.delivery).toBe("not_delivered");
	});
});

describe("app-global beacon and reconciliation", () => {
	test("announces terminal states off-focus alongside pending ones", () => {
		const projected = projectWorkbenchApprovals({
			state: connected(
				snapshot({
					approvals: [
						commandApproval(),
						ordinary(
							{
								state: "outcome_unknown",
								decision: "approved",
								outcome: "outcome_unknown",
								reason: "The write was lost.",
							},
							{ requestId: "request-9" } as never,
						),
					],
					dynamicApprovals: [dynamicApproval(SEND_EFFECT)],
				}),
			),
			nowMs: NOW,
			canCommand: true,
		});

		expect(projected.beacon.pending).toBe(2);
		expect(projected.beacon.total).toBe(3);
		expect(projected.beacon.entries.map((entry) => entry.phase)).toContain("outcome_unknown");
		for (const entry of projected.beacon.entries) expect(entry.target.length).toBeGreaterThan(0);
	});

	test("reads authoritative reconciliation from the host operation outcome", () => {
		const outcomes = ["delivered", "not_delivered", "outcome_unknown"] as const;
		for (const outcome of outcomes) {
			const operation: BrowserSnapshot["operation"] = {
				kind: "operation_outcome",
				operationId: "lease-1",
				outcome,
				message: null,
			} as BrowserSnapshot["operation"];
			const projected = projectWorkbenchApprovals({
				state: connected(snapshot({ operation })),
				nowMs: NOW,
				canCommand: true,
			});

			expect(projected.reconciliation?.outcome).toBe(outcome);
			expect(projected.reconciliation?.label.length).toBeGreaterThan(0);
		}
	});
});

describe("focus return", () => {
	test("returns focus when the focused card loses its authority", () => {
		const before = projectWorkbenchApprovals({
			state: connected(snapshot({ approvals: [commandApproval()] })),
			nowMs: NOW,
			canCommand: true,
		});
		const after = projectWorkbenchApprovals({
			state: connected(
				snapshot({
					approvals: [
						ordinary({
							state: "settled",
							decision: "approved",
							outcome: "delivered",
							reason: "Delivered.",
						}),
					],
				}),
			),
			nowMs: NOW,
			canCommand: true,
		});
		const change = approvalFocusReturn(
			approvalDecisionSignature(before.cards),
			after.cards,
			"ordinary:request-1",
		);

		expect(change?.key).toBe("ordinary:request-1");
		expect(change?.announcement).toContain("no longer accepts a decision");
		expect(change?.announcement).toContain("Focus returned to the approvals heading.");
	});

	test("returns focus when the card disappears entirely", () => {
		const before = projectWorkbenchApprovals({
			state: connected(snapshot({ approvals: [commandApproval()] })),
			nowMs: NOW,
			canCommand: true,
		});
		const change = approvalFocusReturn(
			approvalDecisionSignature(before.cards),
			[],
			"ordinary:request-1",
		);

		expect(change?.announcement).toContain("gone from this workbench");
	});

	test("leaves focus alone while the card still accepts a decision", () => {
		const projected = projectWorkbenchApprovals({
			state: connected(snapshot({ approvals: [commandApproval()] })),
			nowMs: NOW,
			canCommand: true,
		});

		expect(
			approvalFocusReturn(
				approvalDecisionSignature(projected.cards),
				projected.cards,
				"ordinary:request-1",
			),
		).toBeNull();
		expect(approvalFocusReturn("", projected.cards, null)).toBeNull();
	});
});
