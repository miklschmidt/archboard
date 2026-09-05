// The behaviour the archived approval-surface owner asserted through the old
// markup, re-targeted at the projection: every family under its real
// identity, the broker identity, the exact host-offered decisions, reviewed
// fields, secrets, safe links, permission scope, dynamic effect facts, spoken
// eligibility, terminal authority, reconciliation and the app-global beacon.

import { describe, expect, test } from "bun:test";

import type { BrowserApproval, BrowserSnapshot } from "@/shared/codex-browser-model";
import {
	approvalKicker,
	projectWorkbenchApprovals,
	validateApprovalForm,
} from "@/ui/workbench-approvals";
import type {
	WorkbenchApprovalCard,
	WorkbenchApprovalFormState,
	WorkbenchApprovalsView,
	WorkbenchOrdinaryApprovalCard,
} from "@/ui/workbench-approvals/contracts";
import {
	applyPatchApproval,
	commandApproval,
	CREATE_EFFECT,
	dynamicApproval,
	dynamicDecision,
	elicitationApproval,
	execCommandApproval,
	fileChangeApproval,
	IMMUTABLE_TARGET,
	OTHER_FORK_EFFECT,
	permissionsApproval,
	safeUrlElicitation,
	SELF_FORK_EFFECT,
	SEND_EFFECT,
	TERMINAL_LIFECYCLES,
	unsafeUrlElicitation,
	userInputApproval,
} from "@/ui/workbench-approvals/tests/fixtures";
import {
	approvalParses,
	approvalsInput,
	COMMAND_ID,
	connected,
	NOW,
	OTHER_THREAD,
	snapshot,
	THREAD,
	TURN,
} from "@/ui/workbench-approvals/tests/model";

const ORDINARY: readonly BrowserApproval[] = [
	commandApproval(),
	fileChangeApproval(),
	permissionsApproval(),
	applyPatchApproval(),
	execCommandApproval(),
	userInputApproval(),
	elicitationApproval(),
];

const DYNAMIC = [
	dynamicApproval(CREATE_EFFECT),
	dynamicApproval(SELF_FORK_EFFECT),
	dynamicApproval(OTHER_FORK_EFFECT),
	dynamicApproval(SEND_EFFECT),
];

/**
 * The surface for one snapshot.
 * @param overrides The snapshot's approvals.
 * @returns The view.
 */
function surface(overrides: Partial<BrowserSnapshot>): WorkbenchApprovalsView {
	return projectWorkbenchApprovals(approvalsInput(connected(snapshot(overrides))));
}

/**
 * The one ordinary card of one approval.
 * @param approval The approval.
 * @returns The card.
 */
function only(approval: BrowserApproval): WorkbenchOrdinaryApprovalCard {
	const card = surface({ approvals: [approval] }).cards[0];
	if (card?.kind !== "ordinary") {
		throw new Error("Expected one ordinary card");
	}
	return card;
}

/**
 * The value of one disclosed row.
 * @param card The card.
 * @param label The row's label.
 * @returns The value, or undefined.
 */
function rowValue(card: WorkbenchApprovalCard, label: string): string | undefined {
	const rows =
		card.kind === "ordinary"
			? [...card.identity, ...card.broker, ...card.effect]
			: [...card.identity, ...card.effect];
	return rows.find((row) => row.label === label)?.value;
}

/**
 * The dynamic card whose effect carries one host summary.
 * @param summary The effect's visual summary.
 * @param cards The cards.
 * @returns The card.
 */
function dynamicFor(
	summary: string,
	cards: readonly WorkbenchApprovalCard[],
): WorkbenchApprovalCard {
	const card = cards.find(
		(candidate) =>
			candidate.kind === "dynamic" && candidate.request.effect.visualSummary === summary,
	);
	if (card === undefined) {
		throw new Error(`Expected a card for ${summary}`);
	}
	return card;
}

/**
 * An empty form.
 * @returns The form.
 */
function emptyForm(): WorkbenchApprovalFormState {
	return { values: {}, selections: {}, flags: {} };
}

describe("ordinary approval families", () => {
	test("projects all seven families under their real discriminated identity", () => {
		const { cards } = surface({ approvals: [...ORDINARY] });
		const families = cards.map((card) => (card.kind === "ordinary" ? card.family : null));

		expect(families).toEqual([
			"command_execution",
			"file_change",
			"permissions",
			"apply_patch",
			"exec_command",
			"user_input",
			"elicitation",
		]);
		expect(cards.map(approvalKicker)).toEqual([
			"Command execution approval",
			"File change approval",
			"Permissions approval",
			"Legacy apply patch approval",
			"Legacy exec command approval",
			"Tool user input request",
			"MCP elicitation request",
		]);
	});

	test("carries the broker identity on every ordinary card", () => {
		for (const card of surface({ approvals: [...ORDINARY] }).cards) {
			expect(card.kind).toBe("ordinary");
			expect(rowValue(card, "Broker link")).toBe("pane primary to workhorse-a");
			expect(rowValue(card, "Broker effect")).toBe("run one command in the workspace");
			expect(rowValue(card, "Broker target")).toBe(IMMUTABLE_TARGET);
		}
	});

	test("names a missing turn, item and ApprovalId rather than inventing one", () => {
		const card = only(applyPatchApproval());

		expect(rowValue(card, "Turn")).toContain("no turn identity");
		expect(rowValue(card, "Item")).toContain("no item identity");
		expect(rowValue(card, "Approval id")).toContain("no ApprovalId");
	});

	test("offers exactly the decisions the host published", () => {
		expect(only(commandApproval()).offers.map((offer) => offer.label)).toEqual([
			"Approve",
			"Decline",
		]);
		expect(only(fileChangeApproval()).offers.map((offer) => offer.label)).toEqual([
			"Approve",
			"Approve for this session",
			"Decline",
			"Cancel",
		]);
	});

	test("offers a host-proposed amendment as its own decision instead of an editable one", () => {
		const card = only(
			commandApproval({
				availableDecisions: [
					"accept",
					{ acceptWithExecpolicyAmendment: { execpolicy_amendment: ["allow", "bun"] } },
					{
						applyNetworkPolicyAmendment: {
							network_policy_amendment: { host: "registry.npmjs.org", action: "allow" },
						},
					},
					"decline",
				],
				spoken: { eligible: false, reason: "broader_grant" },
			}),
		);

		expect(card.offers.map((offer) => offer.label)).toEqual([
			"Approve",
			"Approve with the proposed exec policy amendment",
			"Allow registry.npmjs.org in the network policy",
			"Decline",
		]);
		expect(card.offers.some((offer) => offer.spokenEligible)).toBe(false);
	});

	test("projects every reviewed elicitation field with its control", () => {
		const card = only(elicitationApproval());

		expect(card.fields.map((field) => [field.name, field.control])).toEqual([
			["field:host", "url"],
			["field:port", "integer"],
			["field:apiKey", "secret"],
			["field:tls", "boolean"],
			["field:tier", "enum"],
		]);
	});

	test("never echoes a secret answer or defaults one", () => {
		const fields = [...only(elicitationApproval()).fields, ...only(userInputApproval()).fields];
		const secrets = fields.filter((field) => field.secret);

		expect(secrets).toHaveLength(2);
		for (const field of secrets) {
			expect(field.defaultValue).toBeNull();
		}
		expect(only(userInputApproval()).notices).toContain(
			"A secret answer is never shown back, never defaulted, and never spoken.",
		);
	});

	test("links a safe http URL and refuses an unsafe one the contract also rejects", () => {
		expect(approvalParses(unsafeUrlElicitation())).toBe(false);
		const safe = only(safeUrlElicitation());
		expect(safe.links).toEqual([
			{ label: "https://example.test/consent", href: "https://example.test/consent" },
		]);
		const missing = only(safeUrlElicitation({ url: null }));
		expect(missing.links).toEqual([]);
		expect(missing.notices).toContain(
			"The host published no safe http or https URL, so nothing here can be opened.",
		);
		expect(missing.offers.map((offer) => offer.id)).toEqual(["decline", "cancel"]);
	});

	test("validates the exact fields it projected", () => {
		const card = only(elicitationApproval());

		expect(validateApprovalForm(card.fields, emptyForm()).map((error) => error.name)).toEqual([
			"field:host",
			"field:port",
			"field:apiKey",
		]);
	});

	test("discloses the requested permission scope and never invents a path grant", () => {
		const card = only(permissionsApproval());

		expect(rowValue(card, "Requested file access")).toBe("read, write");
		expect(card.notices.some((notice) => notice.includes("never invents a path list"))).toBe(true);
		expect(card.fields.map((field) => field.name)).toEqual([
			"permission:network",
			"permission:scope",
			"permission:strict_auto_review",
		]);
	});

	test("offers no grant when the request names nothing this browser can grant", () => {
		const card = only(
			permissionsApproval({ requestedScope: { network: null, fileAccess: ["read"] } }),
		);

		expect(card.fields).toHaveLength(0);
		expect(card.offers.map((offer) => offer.id)).toEqual(["decline"]);
		expect(card.notices).toEqual([
			"This request names no permission this browser can grant, so the only honest answer here is to grant nothing.",
		]);
	});
});

describe("dynamic coordination approvals", () => {
	test("discloses the exact target, prompt, boundary, OperationIds and expiry", () => {
		const { cards } = surface({ dynamicApprovals: DYNAMIC });
		const create = dynamicFor(CREATE_EFFECT.visualSummary, cards);
		const selfFork = dynamicFor(SELF_FORK_EFFECT.visualSummary, cards);
		const otherFork = dynamicFor(OTHER_FORK_EFFECT.visualSummary, cards);
		const send = dynamicFor(SEND_EFFECT.visualSummary, cards);

		expect(rowValue(create, "Target thread")).toContain("new thread that does not exist yet");
		expect(rowValue(create, "Prompt")).toBe("Investigate the queue backlog.");
		expect(rowValue(create, "Effective fork boundary")).toContain("no fork boundary");
		expect(rowValue(create, "Mutation OperationId")).toBe(CREATE_EFFECT.mutationOperationId);
		expect(rowValue(create, "Initial turn OperationId")).toBe(
			CREATE_EFFECT.initialTurnOperationId ?? "",
		);
		expect(rowValue(selfFork, "Effective fork boundary")).toBe(
			`Self fork before the calling turn ${TURN}.`,
		);
		expect(rowValue(otherFork, "Effective fork boundary")).toBe(
			"Fork of another thread from its current head.",
		);
		expect(rowValue(otherFork, "Prompt")).toContain("starts no turn");
		expect(rowValue(send, "Target thread")).toBe(OTHER_THREAD);
		expect(rowValue(send, "Expires")).toBe(new Date(NOW + 90_000).toISOString());
	});

	test("retains the immutable effect hash and fabricates no ApprovalId or turn", () => {
		const card = dynamicFor(
			CREATE_EFFECT.visualSummary,
			surface({ dynamicApprovals: DYNAMIC }).cards,
		);

		expect(rowValue(card, "Effect hash")).toBe(`sha256:${"a".repeat(64)}`);
		expect(rowValue(card, "Calling turn")).toBe(TURN);
		expect(card.identity.some((row) => row.label === "Approval id")).toBe(false);
		expect(card.notices).toContain(
			"The effect and its hash are fixed. Approving sends exactly this effect, or nothing.",
		);
	});

	test("permits one approve or decline decision only", () => {
		for (const card of surface({ dynamicApprovals: DYNAMIC }).cards) {
			expect(card.offers.map((offer) => offer.id)).toEqual(["approve", "decline"]);
			expect(card.offers.some((offer) => offer.label.includes("for this session"))).toBe(false);
			expect(card.status.resumable).toBe(false);
			expect(card.notices.some((notice) => notice.includes("cannot be resumed"))).toBe(true);
		}
	});

	test("keeps a terminal approval_required tool result unresumable", () => {
		const cancelled = dynamicApproval(SEND_EFFECT, {
			state: "cancelled",
			decision: dynamicDecision(SEND_EFFECT, "cancelled", "call_cancelled"),
			toolResult: "approval_required",
			binding: null,
		});
		const card = dynamicFor(
			SEND_EFFECT.visualSummary,
			surface({ dynamicApprovals: [cancelled] }).cards,
		);

		expect(card.offers).toHaveLength(0);
		expect(card.status.resumable).toBe(false);
		expect(rowValue(card, "Tool result")).toBe("approval_required");
	});

	for (const cause of ["browser_disconnected", "child_disconnected"] as const) {
		test(`projects a ${cause} as a terminal dynamic decision`, () => {
			const child = cause === "child_disconnected";
			const approval = dynamicApproval(SEND_EFFECT, {
				state: "disconnected",
				decision: dynamicDecision(SEND_EFFECT, "disconnected", cause),
				delivery: child ? "not_delivered" : null,
				toolResult: child ? "transport_not_delivered" : "approval_required",
				binding: null,
			});
			const card = dynamicFor(
				SEND_EFFECT.visualSummary,
				surface({ dynamicApprovals: [approval] }).cards,
			);

			expect(card.status.phase).toBe("disconnected");
			expect(card.offers).toHaveLength(0);
			expect(card.kind === "dynamic" ? card.effectHash : null).toBe(`sha256:${"a".repeat(64)}`);
		});
	}
});

describe("spoken eligibility", () => {
	test("annotates only a genuine ordinary binary approval", () => {
		const { cards } = surface({ approvals: [...ORDINARY], dynamicApprovals: DYNAMIC });
		const eligible = cards.filter((card) => card.spoken.eligible);

		expect(eligible).toHaveLength(1);
		expect(eligible[0]?.kind === "ordinary" ? eligible[0].family : null).toBe("command_execution");
		for (const card of cards.filter((candidate) => candidate.kind === "dynamic")) {
			expect(card.spoken.detail).toContain("never spoken-eligible");
		}
	});

	test("refuses a host annotation that is not a plain accept or decline", () => {
		const card = only(
			commandApproval({
				availableDecisions: ["accept", "acceptForSession", "decline"],
				spoken: { eligible: true, reason: "eligible" },
			}),
		);

		expect(card.spoken.eligible).toBe(false);
		expect(card.spoken.detail).toContain("could not confirm a plain accept or decline");
		expect(card.offers.some((offer) => offer.spokenEligible)).toBe(false);
	});

	test("says why every other family stays visual only", () => {
		const details = surface({ approvals: [...ORDINARY] }).cards.map((card) => card.spoken.detail);

		expect(details.some((detail) => detail.includes("this request carries a secret"))).toBe(true);
		expect(details.some((detail) => detail.includes("scoped permission grant"))).toBe(true);
		expect(details.some((detail) => detail.includes("needs a form"))).toBe(true);
		expect(details.some((detail) => detail.includes("grants more than this one action"))).toBe(
			true,
		);
	});
});

describe("terminal decisions", () => {
	for (const [phase, lifecycle] of TERMINAL_LIFECYCLES) {
		test(`projects the ${phase} decision against its immutable target with no authority`, () => {
			const card = only(
				commandApproval({ lifecycle, spoken: { eligible: false, reason: "not_pending" } }),
			);

			expect<string>(card.status.phase).toBe(phase);
			expect(rowValue(card, "Broker target")).toBe(IMMUTABLE_TARGET);
			expect(card.offers).toHaveLength(0);
			expect(card.spoken.eligible).toBe(false);
			expect(card.status.authority).toBe("removed");
		});
	}

	test("removes the decision when the transport already refuses that response", () => {
		const projected = projectWorkbenchApprovals(
			approvalsInput(
				connected(
					snapshot({
						approvals: [commandApproval()],
						dynamicApprovals: [dynamicApproval(SEND_EFFECT)],
					}),
				),
				{ canRespondOrdinary: false },
			),
		);

		expect(projected.cards[0]?.offers).toHaveLength(0);
		expect(projected.cards[0]?.status.authorityReason).toContain("no longer accepts a response");
		expect(projected.cards[1]?.offers).toHaveLength(2);
	});

	for (const outcome of ["delivered", "not_delivered", "outcome_unknown"] as const) {
		test(`reads the authoritative ${outcome} reconciliation`, () => {
			const projected = surface({
				operation: { kind: "operation_outcome", operationId: COMMAND_ID, outcome, message: null },
			});

			expect(projected.reconciliation?.outcome).toBe(outcome);
			expect(projected.reconciliation?.label.length).toBeGreaterThan(0);
		});
	}
});

describe("the app-global beacon", () => {
	test("announces every card, pending and terminal, in one live region", () => {
		const settled = commandApproval({
			lifecycle: {
				state: "outcome_unknown",
				decision: "approved",
				outcome: "outcome_unknown",
				reason: "The write was lost.",
			},
			spoken: { eligible: false, reason: "not_pending" },
		});
		const { beacon } = surface({ approvals: [...ORDINARY, settled], dynamicApprovals: DYNAMIC });
		const pendingCount = ORDINARY.length + DYNAMIC.length;

		expect(beacon.scope).toBe("app_global");
		expect(beacon.pending).toBe(pendingCount);
		expect(beacon.total).toBe(pendingCount + 1);
		expect(beacon.entries.map((entry) => entry.phase)).toContain("outcome_unknown");
		expect(beacon.announcement).toBe(`${pendingCount} Codex approvals waiting for you.`);
		for (const entry of beacon.entries) {
			expect(entry.target.length).toBeGreaterThan(0);
		}
		expect(beacon.entries.some((entry) => entry.target === THREAD)).toBe(true);
	});

	test("reports the empty surface without inventing a request", () => {
		const projected = surface({});

		expect(projected.empty).toBe("No Codex approval request is open.");
		expect(projected.cards).toHaveLength(0);
	});
});
