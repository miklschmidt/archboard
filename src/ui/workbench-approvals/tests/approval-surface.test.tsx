import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import {
	initialApprovalForm,
	projectWorkbenchApprovals,
	validateApprovalForm,
	WorkbenchApprovals,
	type WorkbenchApprovalCard,
	type WorkbenchOrdinaryApprovalCard,
} from "../index.js";
import {
	applyPatchApproval,
	commandApproval,
	connected,
	CREATE_EFFECT,
	dynamicApproval,
	elicitationApproval,
	execCommandApproval,
	fakeTransport,
	fileChangeApproval,
	NOW,
	OTHER_FORK_EFFECT,
	permissionsApproval,
	SELF_FORK_EFFECT,
	SEND_EFFECT,
	snapshot,
	userInputApproval,
} from "./fixtures.js";

const ORDINARY = [
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

const fixedNow = (): number => NOW;

function render(overrides: Partial<BrowserSnapshot> = {}): string {
	return renderToStaticMarkup(
		<WorkbenchApprovals
			now={fixedNow}
			state={connected(snapshot(overrides))}
			transport={fakeTransport()}
		/>,
	);
}

function view(overrides: Partial<BrowserSnapshot> = {}) {
	return projectWorkbenchApprovals({
		state: connected(snapshot(overrides)),
		nowMs: NOW,
		canCommand: true,
	});
}

function rowValue(card: WorkbenchApprovalCard, label: string): string {
	const rows =
		card.kind === "ordinary"
			? [...card.identity, ...card.effect, ...card.broker]
			: [...card.identity, ...card.effect];
	const match = rows.find((row) => row.label === label);
	if (match === undefined) throw new Error(`No disclosure row ${label}`);
	return match.value;
}

describe("ordinary approval families", () => {
	test("renders all seven families under their real discriminated identity", () => {
		const markup = render({ approvals: ORDINARY });

		for (const family of [
			"command_execution",
			"file_change",
			"permissions",
			"apply_patch",
			"exec_command",
			"user_input",
			"elicitation",
		])
			expect(markup).toContain(`data-approval-family="${family}"`);
		expect(markup).toContain("Command execution approval");
		expect(markup).toContain("Legacy apply patch approval");
		expect(markup).toContain("Legacy exec command approval");
		expect(markup).toContain("Tool user input request");
		expect(markup).toContain("MCP elicitation request");
	});

	test("renders the broker identity on every ordinary card", () => {
		const markup = render({ approvals: ORDINARY });
		const cards = view({ approvals: ORDINARY }).cards;

		expect(markup).toContain("Approval broker identity");
		expect(markup).toContain("pane primary to workhorse-a");
		expect(markup).toContain("run one command in the workspace");
		for (const card of cards) {
			expect(card.kind).toBe("ordinary");
			expect(rowValue(card, "Broker child")).toBe("child-a");
			expect(rowValue(card, "Broker child epoch")).toBe("epoch-a");
		}
	});

	test("names a missing turn, item and ApprovalId rather than inventing one", () => {
		const card = view({ approvals: [applyPatchApproval()] }).cards[0]!;

		expect(rowValue(card, "Turn")).toContain("no turn identity");
		expect(rowValue(card, "Item")).toContain("no item identity");
		expect(rowValue(card, "Approval id")).toContain("no ApprovalId");
	});

	test("offers exactly the decisions the host published", () => {
		const cards = view({ approvals: [commandApproval(), fileChangeApproval()] }).cards;
		const command = cards.find((card) => card.key === "ordinary:request-1")!;
		const fileChange = cards.find((card) => card.key === "ordinary:request-2")!;

		expect(command.offers.map((offer) => offer.label)).toEqual(["Approve", "Decline"]);
		expect(fileChange.offers.map((offer) => offer.label)).toEqual([
			"Approve",
			"Approve for this session",
			"Decline",
			"Cancel",
		]);
	});

	test("renders a host-proposed amendment as its own offer instead of an editable one", () => {
		const approval = commandApproval({
			availableDecisions: [
				"accept",
				{ acceptWithExecpolicyAmendment: { execpolicy_amendment: ["allow rm"] } },
				{
					applyNetworkPolicyAmendment: {
						network_policy_amendment: { host: "registry.test", action: "allow" },
					},
				},
			],
		} as never);
		const card = view({ approvals: [approval] }).cards[0]!;

		expect(card.offers.map((offer) => offer.label)).toEqual([
			"Approve",
			"Approve with the proposed exec policy amendment",
			"Allow registry.test in the network policy",
		]);
		expect(card.offers.some((offer) => offer.spokenEligible)).toBe(false);
	});
});

describe("reviewed fields, secrets and URLs", () => {
	test("renders every reviewed elicitation field with its control", () => {
		const markup = render({ approvals: [elicitationApproval()] });

		expect(markup).toContain('data-approval-field="field:host"');
		expect(markup).toContain('data-approval-field-control="url"');
		expect(markup).toContain('data-approval-field-control="integer"');
		expect(markup).toContain('data-approval-field-control="boolean"');
		expect(markup).toContain('data-approval-field-control="enum"');
		expect(markup).toContain('data-approval-field-control="secret"');
	});

	test("never echoes a secret answer or defaults one", () => {
		const markup = render({ approvals: [userInputApproval(), elicitationApproval()] });
		const cards = view({ approvals: [userInputApproval(), elicitationApproval()] }).cards;
		const secrets = cards
			.flatMap((card) => (card.kind === "ordinary" ? card.fields : []))
			.filter((field) => field.secret);

		expect(secrets).toHaveLength(2);
		for (const field of secrets) expect(field.defaultValue).toBeNull();
		expect(markup).toContain('type="password"');
		expect(markup).toContain('data-approval-field-secret="true"');
		expect(markup).not.toContain('type="password" value');
		expect(markup).toContain("A secret answer is never shown back");
	});

	test("links a safe http URL and refuses an unsafe one", () => {
		const safe = elicitationApproval({
			mode: "url",
			url: "https://example.test/consent",
			fields: null,
		} as never);
		const unsafe = elicitationApproval({
			mode: "url",
			url: "javascript:alert(1)",
			fields: null,
		} as never);

		expect(render({ approvals: [safe] })).toContain('href="https://example.test/consent"');
		const unsafeMarkup = render({ approvals: [unsafe] });
		expect(unsafeMarkup).not.toContain("javascript:alert(1)");
		expect(unsafeMarkup).toContain("no safe http or https URL");
	});

	test("validates the exact fields it rendered", () => {
		const card = view({ approvals: [elicitationApproval()] })
			.cards[0] as WorkbenchOrdinaryApprovalCard;
		const empty = initialApprovalForm(card.fields);

		expect(validateApprovalForm(card.fields, empty).map((error) => error.name)).toEqual([
			"field:apiKey",
		]);
		const badPort = { ...empty, values: { ...empty.values, "field:port": "70000" } };
		expect(validateApprovalForm(card.fields, badPort)[0]?.message).toContain("at most 65535");
		const badHost = { ...empty, values: { ...empty.values, "field:host": "ftp://example.test" } };
		expect(validateApprovalForm(card.fields, badHost)[0]?.message).toContain("http or https URL");
	});

	test("discloses the requested permission scope and never invents a path grant", () => {
		const markup = render({ approvals: [permissionsApproval()] });

		expect(markup).toContain("Requested file access");
		expect(markup).toContain("Archboard never invents a path list");
		expect(markup).toContain('data-approval-field="permission:scope"');
		expect(markup).toContain('data-approval-field="permission:network"');
	});
});

describe("dynamic coordination approvals", () => {
	test("discloses the exact target, prompt, boundary, OperationIds and expiry", () => {
		const cards = view({ dynamicApprovals: DYNAMIC }).cards;
		const [create, selfFork, otherFork, send] = cards;

		expect(rowValue(create!, "Target thread")).toContain("new thread that does not exist yet");
		expect(rowValue(create!, "Prompt")).toBe("Investigate the queue backlog.");
		expect(rowValue(create!, "Effective fork boundary")).toContain("no fork boundary");
		expect(rowValue(create!, "Mutation OperationId")).toBe("operation-create_thread");
		expect(rowValue(create!, "Initial turn OperationId")).toBe("operation-create_thread-turn");
		expect(rowValue(selfFork!, "Effective fork boundary")).toBe(
			"Self fork before the calling turn turn-a.",
		);
		expect(rowValue(otherFork!, "Effective fork boundary")).toBe(
			"Fork of another thread from its current head.",
		);
		expect(rowValue(otherFork!, "Prompt")).toContain("starts no turn");
		expect(rowValue(send!, "Target thread")).toBe("workhorse-b");
		expect(rowValue(send!, "Expires")).toBe(new Date(NOW + 90_000).toISOString());
	});

	test("retains the immutable effect hash and fabricates no ApprovalId or turn", () => {
		const markup = render({ dynamicApprovals: DYNAMIC });
		const card = view({ dynamicApprovals: DYNAMIC }).cards[0]!;

		expect(rowValue(card, "Effect hash")).toBe(`sha256:${"a".repeat(64)}`);
		expect(rowValue(card, "Calling turn")).toBe("turn-a");
		expect(card.identity.some((row) => row.label === "Approval id")).toBe(false);
		expect(markup).toContain("The effect and its hash are fixed");
	});

	test("permits one approve or decline decision only", () => {
		const markup = render({ dynamicApprovals: DYNAMIC });
		const cards = view({ dynamicApprovals: DYNAMIC }).cards;

		for (const card of cards)
			expect(card.offers.map((offer) => offer.id)).toEqual(["approve", "decline"]);
		expect(markup).not.toContain("for this session");
		expect(markup).toContain('data-approval-resumable="false"');
		expect(markup).toContain("cannot be resumed");
	});

	test("keeps a terminal approval_required tool result unresumable", () => {
		const cancelled = dynamicApproval(SEND_EFFECT, {
			state: "cancelled",
			decision: {
				outcome: "cancelled",
				identity: dynamicApproval(SEND_EFFECT).identity,
				effectHash: `sha256:${"a".repeat(64)}`,
				decidedAtMs: NOW,
				cause: "call_cancelled",
			},
			toolResult: "approval_required",
			binding: null,
		} as never);
		const card = view({ dynamicApprovals: [cancelled] }).cards[0]!;
		const markup = render({ dynamicApprovals: [cancelled] });

		expect(card.offers).toHaveLength(0);
		expect(card.status.resumable).toBe(false);
		expect(rowValue(card, "Tool result")).toBe("approval_required");
		expect(markup).toContain('data-approval-offers="removed"');
		expect(markup).not.toContain("Approve this effect");
	});
});

describe("spoken eligibility", () => {
	test("annotates only a genuine ordinary binary approval", () => {
		const cards = view({ approvals: ORDINARY, dynamicApprovals: DYNAMIC }).cards;
		const eligible = cards.filter((card) => card.spoken.eligible);

		expect(eligible).toHaveLength(1);
		expect(eligible[0]?.kind === "ordinary" && eligible[0].family).toBe("command_execution");
		for (const card of cards.filter((candidate) => candidate.kind === "dynamic"))
			expect(card.spoken.detail).toContain("never spoken-eligible");
	});

	test("refuses a host annotation that is not a plain accept or decline", () => {
		const broader = commandApproval({
			availableDecisions: ["accept", "acceptForSession", "decline"],
			spoken: { eligible: true, reason: "eligible" },
		} as never);
		const card = view({ approvals: [broader] }).cards[0]!;

		expect(card.spoken.eligible).toBe(false);
		expect(card.spoken.detail).toContain("could not confirm a plain accept or decline");
		expect(card.offers.some((offer) => offer.spokenEligible)).toBe(false);
	});

	test("says why every other family stays visual only", () => {
		const markup = render({ approvals: ORDINARY });

		expect(markup).toContain("this request carries a secret");
		expect(markup).toContain("scoped permission grant");
		expect(markup).toContain("needs a form");
		expect(markup).toContain("grants more than this one action");
	});
});

describe("app-global visibility and lifecycle", () => {
	test("announces every card in one app-global live region", () => {
		const markup = render({ approvals: ORDINARY, dynamicApprovals: DYNAMIC });
		const beacon = view({ approvals: ORDINARY, dynamicApprovals: DYNAMIC }).beacon;

		expect(beacon.scope).toBe("app_global");
		expect(beacon.entries).toHaveLength(ORDINARY.length + DYNAMIC.length);
		expect(markup).toContain('data-approvals-scope="app-global"');
		expect(markup).toContain('aria-live="assertive"');
		for (const entry of beacon.entries)
			expect(markup).toContain(`data-approval-beacon="${entry.key}"`);
	});

	test("keeps a focus anchor on the surface heading", () => {
		expect(render({ approvals: ORDINARY })).toContain('tabindex="-1"');
	});

	test("reports the empty surface without inventing a request", () => {
		const markup = render();

		expect(markup).toContain("No Codex approval request is open.");
		expect(markup).not.toContain('data-approval-kind="ordinary"');
	});
});
