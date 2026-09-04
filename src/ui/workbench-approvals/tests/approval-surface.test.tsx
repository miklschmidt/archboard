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
} from "./fixtures.js";
import {
	approvalsInput,
	connected,
	fakeTransport,
	model,
	NOW,
	OPERATION_OUTCOME_ID,
	OTHER_THREAD,
	snapshot,
	TURN,
	type FakeTransportOptions,
} from "./model.js";

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

function render(
	overrides: Partial<BrowserSnapshot> = {},
	transport: FakeTransportOptions = {},
): string {
	return renderToStaticMarkup(
		<WorkbenchApprovals
			now={fixedNow}
			state={connected(snapshot(overrides))}
			transport={fakeTransport(transport)}
		/>,
	);
}

function view(overrides: Partial<BrowserSnapshot> = {}) {
	return projectWorkbenchApprovals(approvalsInput(connected(snapshot(overrides))));
}

function first(overrides: Partial<BrowserSnapshot>): WorkbenchApprovalCard {
	const card = view(overrides).cards[0];
	if (card === undefined) throw new Error("Expected one projected approval card");
	return card;
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

		expect(markup).toContain("Approval broker identity");
		expect(markup).toContain("pane primary to workhorse-a");
		expect(markup).toContain("run one command in the workspace");
		for (const card of view({ approvals: ORDINARY }).cards) {
			expect(card.kind).toBe("ordinary");
			expect(rowValue(card, "Broker child")).toBe(String(snapshot().threadLink.childId));
			expect(rowValue(card, "Broker target")).toBe(IMMUTABLE_TARGET);
		}
	});

	test("names a missing turn, item and ApprovalId rather than inventing one", () => {
		const card = first({ approvals: [applyPatchApproval()] });

		expect(rowValue(card, "Turn")).toContain("no turn identity");
		expect(rowValue(card, "Item")).toContain("no item identity");
		expect(rowValue(card, "Approval id")).toContain("no ApprovalId");
	});

	test("offers exactly the decisions the host published", () => {
		const command = first({ approvals: [commandApproval()] });
		const fileChange = first({ approvals: [fileChangeApproval()] });

		expect(command.offers.map((offer) => offer.label)).toEqual(["Approve", "Decline"]);
		expect(fileChange.offers.map((offer) => offer.label)).toEqual([
			"Approve",
			"Approve for this session",
			"Decline",
			"Cancel",
		]);
	});

	test("renders a host-proposed amendment as its own offer instead of an editable one", () => {
		const card = first({
			approvals: [
				commandApproval({
					availableDecisions: [
						"accept",
						{ acceptWithExecpolicyAmendment: { execpolicy_amendment: ["allow rm"] } },
						{
							applyNetworkPolicyAmendment: {
								network_policy_amendment: { host: "registry.test", action: "allow" },
							},
						},
					],
					spoken: { eligible: false, reason: "broader_grant" },
				}),
			],
		});

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
		for (const control of ["url", "integer", "boolean", "enum", "secret"])
			expect(markup).toContain(`data-approval-field-control="${control}"`);
	});

	test("never echoes a secret answer or defaults one", () => {
		const approvals = [userInputApproval(), elicitationApproval()];
		const markup = render({ approvals });
		const secrets = view({ approvals })
			.cards.flatMap((card) => (card.kind === "ordinary" ? card.fields : []))
			.filter((field) => field.secret);

		expect(secrets).toHaveLength(2);
		for (const field of secrets) expect(field.defaultValue).toBeNull();
		expect(markup).toContain('type="password"');
		expect(markup).toContain('data-approval-field-secret="true"');
		expect(markup).not.toContain('type="password" value');
		expect(markup).toContain("A secret answer is never shown back");
	});

	test("links a safe http URL and refuses an unsafe one the contract also rejects", () => {
		const unsafe = unsafeUrlElicitation();

		expect(model.BrowserApprovalSchema.safeParse(unsafe).success).toBe(false);
		expect(render({ approvals: [safeUrlElicitation()] })).toContain(
			'href="https://example.test/consent"',
		);
		const markup = render({
			approvals: [unsafe as unknown as BrowserSnapshot["approvals"][number]],
		});
		expect(markup).not.toContain("javascript:alert(1)");
		expect(markup).toContain("no safe http or https URL");
	});

	test("validates the exact fields it rendered", () => {
		const card = first({ approvals: [elicitationApproval()] }) as WorkbenchOrdinaryApprovalCard;
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

	test("offers no grant when the request names nothing this browser can grant", () => {
		const approval = permissionsApproval({
			requestedScope: { network: null, fileAccess: ["read"] },
		});
		const card = first({ approvals: [approval] }) as WorkbenchOrdinaryApprovalCard;
		const markup = render({ approvals: [approval] });

		expect(card.fields).toHaveLength(0);
		expect(card.offers.map((offer) => offer.id)).toEqual(["decline"]);
		expect(card.notices).toContain(
			"This request names no permission this browser can grant, so the only honest answer here is to grant nothing.",
		);
		expect(markup).not.toContain("Grant the reviewed permissions");
	});
});

describe("dynamic coordination approvals", () => {
	test("discloses the exact target, prompt, boundary, OperationIds and expiry", () => {
		const [create, selfFork, otherFork, send] = view({ dynamicApprovals: DYNAMIC }).cards;

		expect(rowValue(create!, "Target thread")).toContain("new thread that does not exist yet");
		expect(rowValue(create!, "Prompt")).toBe("Investigate the queue backlog.");
		expect(rowValue(create!, "Effective fork boundary")).toContain("no fork boundary");
		expect(rowValue(create!, "Mutation OperationId")).toBe(
			String(CREATE_EFFECT.mutationOperationId),
		);
		expect(rowValue(create!, "Initial turn OperationId")).toBe(
			String(CREATE_EFFECT.initialTurnOperationId),
		);
		expect(rowValue(selfFork!, "Effective fork boundary")).toBe(
			`Self fork before the calling turn ${String(TURN)}.`,
		);
		expect(rowValue(otherFork!, "Effective fork boundary")).toBe(
			"Fork of another thread from its current head.",
		);
		expect(rowValue(otherFork!, "Prompt")).toContain("starts no turn");
		expect(rowValue(send!, "Target thread")).toBe(String(OTHER_THREAD));
		expect(rowValue(send!, "Expires")).toBe(new Date(NOW + 90_000).toISOString());
	});

	test("retains the immutable effect hash and fabricates no ApprovalId or turn", () => {
		const markup = render({ dynamicApprovals: DYNAMIC });
		const card = first({ dynamicApprovals: DYNAMIC });

		expect(rowValue(card, "Effect hash")).toBe(`sha256:${"a".repeat(64)}`);
		expect(rowValue(card, "Calling turn")).toBe(String(TURN));
		expect(card.identity.some((row) => row.label === "Approval id")).toBe(false);
		expect(markup).toContain("The effect and its hash are fixed");
	});

	test("permits one approve or decline decision only", () => {
		const markup = render({ dynamicApprovals: DYNAMIC });

		for (const card of view({ dynamicApprovals: DYNAMIC }).cards)
			expect(card.offers.map((offer) => offer.id)).toEqual(["approve", "decline"]);
		expect(markup).not.toContain("for this session");
		expect(markup).toContain('data-approval-resumable="false"');
		expect(markup).toContain("cannot be resumed");
	});

	test("keeps a terminal approval_required tool result unresumable", () => {
		const cancelled = dynamicApproval(SEND_EFFECT, {
			state: "cancelled",
			decision: dynamicDecision(SEND_EFFECT, "cancelled", "call_cancelled"),
			toolResult: "approval_required",
			binding: null,
		});
		const card = first({ dynamicApprovals: [cancelled] });
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
		const card = first({
			approvals: [
				commandApproval({
					availableDecisions: ["accept", "acceptForSession", "decline"],
					spoken: { eligible: true, reason: "eligible" },
				}),
			],
		});

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

describe("terminal lifecycle states", () => {
	for (const [phase, lifecycle] of TERMINAL_LIFECYCLES)
		test(`renders the ${phase} decision against its immutable target with no authority`, () => {
			const approval = commandApproval({
				lifecycle,
				spoken: { eligible: false, reason: "not_pending" },
			});
			const card = first({ approvals: [approval] });
			const markup = render({ approvals: [approval] });

			expect(String(card.status.phase)).toBe(phase);
			expect(rowValue(card, "Broker target")).toBe(IMMUTABLE_TARGET);
			expect(card.offers).toHaveLength(0);
			expect(card.spoken.eligible).toBe(false);
			expect(markup).toContain(`data-approval-phase="${phase}"`);
			expect(markup).toContain('data-approval-offers="removed"');
			expect(markup).not.toContain('data-approval-offers="live"');
		});

	test("renders a browser and a child disconnect as terminal dynamic decisions", () => {
		for (const cause of ["browser_disconnected", "child_disconnected"] as const) {
			const approval = dynamicApproval(SEND_EFFECT, {
				state: "disconnected",
				decision: dynamicDecision(SEND_EFFECT, "disconnected", cause),
				delivery: cause === "child_disconnected" ? "not_delivered" : null,
				toolResult:
					cause === "child_disconnected" ? "transport_not_delivered" : "approval_required",
				binding: null,
			});
			const card = first({ dynamicApprovals: [approval] });

			expect(card.status.phase).toBe("disconnected");
			expect(card.offers).toHaveLength(0);
			expect(card.kind === "dynamic" && card.effectHash).toBe(`sha256:${"a".repeat(64)}`);
			expect(render({ dynamicApprovals: [approval] })).toContain(
				'data-approval-phase="disconnected"',
			);
		}
	});

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
		expect(
			render({ approvals: [permissionsApproval()] }, { unsupported: ["approvalRespond"] }),
		).toContain('data-approval-fields="read_only"');
	});

	test("reads authoritative delivered, not_delivered and outcome_unknown reconciliation", () => {
		for (const outcome of ["delivered", "not_delivered", "outcome_unknown"] as const) {
			const operation = {
				kind: "operation_outcome",
				operationId: OPERATION_OUTCOME_ID,
				outcome,
				message: null,
			} as BrowserSnapshot["operation"];
			const projected = view({ operation });

			expect(projected.reconciliation?.outcome).toBe(outcome);
			expect(render({ operation })).toContain(`data-approvals-reconciliation="${outcome}"`);
		}
	});
});

describe("app-global visibility", () => {
	test("announces every card, pending and terminal, in one app-global live region", () => {
		const settled = commandApproval({
			lifecycle: {
				state: "outcome_unknown",
				decision: "approved",
				outcome: "outcome_unknown",
				reason: "The write was lost.",
			},
			spoken: { eligible: false, reason: "not_pending" },
		});
		const overrides = { approvals: [...ORDINARY, settled], dynamicApprovals: DYNAMIC };
		const markup = render(overrides);
		const beacon = view(overrides).beacon;

		expect(beacon.scope).toBe("app_global");
		expect(beacon.pending).toBe(ORDINARY.length + DYNAMIC.length);
		expect(beacon.total).toBe(ORDINARY.length + DYNAMIC.length + 1);
		expect(beacon.entries.map((entry) => entry.phase)).toContain("outcome_unknown");
		expect(markup).toContain('data-approvals-scope="app-global"');
		expect(markup).toContain('aria-live="assertive"');
		for (const entry of beacon.entries) {
			expect(markup).toContain(`data-approval-beacon="${entry.key}"`);
			expect(entry.target.length).toBeGreaterThan(0);
		}
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
