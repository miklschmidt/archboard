import { describe, expect, test } from "bun:test";

import type {
	BrowserApproval,
	BrowserSnapshot,
} from "../../../shared/codex-browser-model/index.js";
import { BrowserWorkbenchTransportError } from "../../workbench-transport/index.js";
import {
	applyApprovalFormEvent,
	initialApprovalForm,
	projectWorkbenchApprovals,
	submitApprovalDecision,
	type WorkbenchApprovalCard,
	type WorkbenchApprovalFormState,
	type WorkbenchOrdinaryApprovalCard,
} from "../index.js";
import {
	applyPatchApproval,
	commandApproval,
	commandTarget,
	connected,
	CREATE_EFFECT,
	dynamicApproval,
	elicitationApproval,
	execCommandApproval,
	fakeTransport,
	fileChangeApproval,
	HASH,
	NOW,
	permissionsApproval,
	snapshot,
	userInputApproval,
} from "./fixtures.js";

function cards(overrides: Partial<BrowserSnapshot>): readonly WorkbenchApprovalCard[] {
	return projectWorkbenchApprovals({
		state: connected(snapshot(overrides)),
		nowMs: NOW,
		canCommand: true,
	}).cards;
}

function only(approval: BrowserApproval): WorkbenchOrdinaryApprovalCard {
	const card = cards({ approvals: [approval] })[0];
	if (card?.kind !== "ordinary") throw new Error("Expected one ordinary approval card");
	return card;
}

function seeded(card: WorkbenchOrdinaryApprovalCard): WorkbenchApprovalFormState {
	return initialApprovalForm(card.fields);
}

async function send(
	card: WorkbenchApprovalCard,
	offerId: string,
	form: WorkbenchApprovalFormState,
	transport = fakeTransport(),
) {
	const outcome = await submitApprovalDecision({
		transport,
		card,
		offerId,
		form,
		target: commandTarget(),
	});
	return { outcome, sent: transport.sent };
}

describe("ordinary approval payloads", () => {
	test("sends the exact host-offered command execution decision", async () => {
		const card = only(commandApproval());
		const { outcome, sent } = await send(card, "decision:1", seeded(card));

		expect(outcome.status).toBe("sent");
		expect(sent[0]?.draft).toEqual({
			command: "approvalRespond",
			requestId: "request-1",
			approvalId: "approval-1",
			response: { approvalKind: "command_execution", decision: "decline" },
		});
		expect(sent[0]?.target).toEqual(commandTarget());
	});

	test("sends a file change session grant only when the host offered it", async () => {
		const card = only(fileChangeApproval());
		const { sent } = await send(card, "decision:1", seeded(card));

		expect(sent[0]?.draft).toMatchObject({
			response: { approvalKind: "file_change", decision: "acceptForSession" },
		});
		const narrow = only(fileChangeApproval({ availableDecisions: ["accept"] } as never));
		expect(narrow.offers.map((offer) => offer.id)).toEqual(["decision:0"]);
	});

	test("sends the reviewed answers for a multi-question tool request", async () => {
		const card = only(userInputApproval());
		let form = seeded(card);
		form = applyApprovalFormEvent(form, {
			kind: "selection",
			name: "question:environment",
			value: ["staging"],
		});
		form = applyApprovalFormEvent(form, {
			kind: "value",
			name: "question:environment",
			value: "canary",
		});
		form = applyApprovalFormEvent(form, {
			kind: "value",
			name: "question:token",
			value: "s3cret",
		});
		const { sent } = await send(card, "submit", form);

		expect(sent[0]?.draft).toMatchObject({
			response: {
				approvalKind: "user_input",
				answers: {
					environment: { answers: ["staging", "canary"] },
					token: { answers: ["s3cret"] },
				},
			},
		});
	});

	test("sends an accepted elicitation form with typed content and no secret default", async () => {
		const card = only(elicitationApproval());
		let form = seeded(card);
		form = applyApprovalFormEvent(form, {
			kind: "value",
			name: "field:apiKey",
			value: "token-1",
		});
		form = applyApprovalFormEvent(form, { kind: "flag", name: "field:tls", value: true });
		const { sent } = await send(card, "submit", form);

		expect(sent[0]?.draft).toMatchObject({
			response: {
				approvalKind: "elicitation",
				action: "accept",
				content: {
					host: "https://example.test",
					port: 443,
					apiKey: "token-1",
					tls: true,
				},
				_meta: null,
			},
		});
	});

	test("refuses to send an incomplete elicitation form", async () => {
		const card = only(elicitationApproval());
		const { outcome, sent } = await send(card, "submit", seeded(card));

		expect(outcome.status).toBe("invalid");
		expect(outcome.status === "invalid" && outcome.errors[0]?.name).toBe("field:apiKey");
		expect(sent).toHaveLength(0);
	});

	test("declines and cancels an elicitation without content", async () => {
		const card = only(elicitationApproval());
		const declined = await send(card, "decline", seeded(card));
		const cancelled = await send(card, "cancel", seeded(card));

		expect(declined.sent[0]?.draft).toMatchObject({
			response: { approvalKind: "elicitation", action: "decline", content: null },
		});
		expect(cancelled.sent[0]?.draft).toMatchObject({
			response: { approvalKind: "elicitation", action: "cancel", content: null },
		});
	});

	test("grants only the reviewed permission fields and never invents a path list", async () => {
		const card = only(permissionsApproval());
		let form = seeded(card);
		form = applyApprovalFormEvent(form, {
			kind: "value",
			name: "permission:scope",
			value: "session",
		});
		form = applyApprovalFormEvent(form, {
			kind: "flag",
			name: "permission:strict_auto_review",
			value: true,
		});
		const granted = await send(card, "submit", form);
		const declined = await send(card, "decline", seeded(card));

		expect(granted.sent[0]?.draft).toMatchObject({
			response: {
				approvalKind: "permissions",
				permissions: { network: { enabled: true } },
				scope: "session",
				strictAutoReview: true,
			},
		});
		expect(declined.sent[0]?.draft).toMatchObject({
			response: { approvalKind: "permissions", permissions: {}, scope: "turn" },
		});
	});

	test("sends legacy review decisions with the person's decline reason", async () => {
		const patch = only(applyPatchApproval());
		const exec = only(execCommandApproval());
		const approved = await send(patch, "approve", seeded(patch));
		const aborted = await send(patch, "abort", seeded(patch));
		const declined = await send(
			exec,
			"decline",
			applyApprovalFormEvent(seeded(exec), {
				kind: "value",
				name: "decline_reason",
				value: "Not on this branch.",
			}),
		);
		const silent = await send(exec, "decline", seeded(exec));

		expect(approved.sent[0]?.draft).toMatchObject({
			response: { approvalKind: "apply_patch", decision: "approved" },
		});
		expect(aborted.sent[0]?.draft).toMatchObject({
			response: { approvalKind: "apply_patch", decision: "abort" },
		});
		expect(declined.sent[0]?.draft).toMatchObject({
			response: {
				approvalKind: "exec_command",
				decision: { denied: { rejection: "Not on this branch." } },
			},
		});
		expect(silent.sent[0]?.draft).toMatchObject({
			response: {
				approvalKind: "exec_command",
				decision: { denied: { rejection: "Declined at the Archboard workbench." } },
			},
		});
	});
});

describe("dynamic approval dispatch", () => {
	test("echoes the captured link, identity and immutable effect hash", async () => {
		const card = cards({ dynamicApprovals: [dynamicApproval(CREATE_EFFECT)] })[0]!;
		const { outcome, sent } = await send(card, "approve", initialApprovalForm([]));

		expect(outcome.status).toBe("sent");
		expect(sent[0]?.draft).toEqual({
			command: "dynamicApprovalRespond",
			capturedLink: { threadId: "workhorse-a", childId: "child-a", epoch: "epoch-a" },
			identity: {
				child: "child-a",
				epoch: "epoch-a",
				threadId: "workhorse-a",
				turnId: "turn-a",
				callId: "call-create_thread",
				namespace: "archboard_app",
				tool: "create_thread",
				manifestHash: "manifest-1",
				operationId: "operation-create_thread",
			},
			effectHash: HASH,
			decision: "approve",
		});
		expect(sent[0]?.target).toEqual(commandTarget());
	});

	test("sends a decline and refuses any other decision", async () => {
		const card = cards({ dynamicApprovals: [dynamicApproval(CREATE_EFFECT)] })[0]!;
		const declined = await send(card, "decline", initialApprovalForm([]));
		const broader = await send(card, "acceptForSession", initialApprovalForm([]));

		expect(declined.sent[0]?.draft).toMatchObject({ decision: "decline" });
		expect(broader.outcome.status).toBe("refused");
		expect(broader.outcome.status === "refused" && broader.outcome.code).toBe("not_offered");
		expect(broader.sent).toHaveLength(0);
	});
});

describe("captured-target refusals and reconciliation", () => {
	test("refuses a decision with no captured workbench target", async () => {
		const card = only(commandApproval());
		const transport = fakeTransport();
		const outcome = await submitApprovalDecision({
			transport,
			card,
			offerId: "decision:0",
			form: seeded(card),
			target: null,
		});

		expect(outcome.status === "refused" && outcome.code).toBe("link_required");
		expect(transport.sent).toHaveLength(0);
	});

	test("surfaces the transport's own approval and link refusals", async () => {
		const card = only(commandApproval());
		for (const code of ["approval_not_pending", "link_changed"] as const) {
			const transport = fakeTransport({
				failure: new BrowserWorkbenchTransportError(code, "refused", {
					outcome: "not_delivered",
				}),
			});
			const outcome = await submitApprovalDecision({
				transport,
				card,
				offerId: "decision:0",
				form: seeded(card),
				target: commandTarget(),
			});

			expect(outcome.status === "refused" && outcome.code).toBe(code);
			expect(outcome.status === "refused" && outcome.outcome).toBe("not_delivered");
			expect(outcome.status === "refused" && outcome.message.length).toBeGreaterThan(0);
		}
	});

	test("surfaces a refused dynamic approval by its own code", async () => {
		const card = cards({ dynamicApprovals: [dynamicApproval(CREATE_EFFECT)] })[0]!;
		const transport = fakeTransport({
			failure: new BrowserWorkbenchTransportError("dynamic_approval_not_pending", "refused", {
				outcome: "not_delivered",
			}),
		});
		const outcome = await submitApprovalDecision({
			transport,
			card,
			offerId: "approve",
			form: initialApprovalForm([]),
			target: commandTarget(),
		});

		expect(outcome.status === "refused" && outcome.code).toBe("dynamic_approval_not_pending");
		expect(outcome.status === "refused" && outcome.message).toContain("no longer pending");
	});

	test("reports delivered, not_delivered and outcome_unknown from the host result", async () => {
		const card = only(commandApproval());
		for (const outcomeValue of ["delivered", "not_delivered", "outcome_unknown"] as const) {
			const transport = fakeTransport({ result: { outcome: outcomeValue } });
			const outcome = await submitApprovalDecision({
				transport,
				card,
				offerId: "decision:0",
				form: seeded(card),
				target: commandTarget(),
			});

			expect(outcome.status === "sent" && outcome.outcome).toBe(outcomeValue);
		}
	});

	test("reports a gateway-coded refusal carried on a successful response", async () => {
		const card = only(commandApproval());
		const transport = fakeTransport({
			result: { outcome: "not_delivered", code: "not_ready", message: "The lease expired." },
		});
		const outcome = await submitApprovalDecision({
			transport,
			card,
			offerId: "decision:0",
			form: seeded(card),
			target: commandTarget(),
		});

		expect(outcome.status === "refused" && outcome.code).toBe("not_ready");
		expect(outcome.status === "refused" && outcome.message).toBe("The lease expired.");
	});

	test("classifies an unknown transport failure as an unknown outcome", async () => {
		const card = only(commandApproval());
		const transport = fakeTransport({ failure: new Error("socket exploded") });
		const outcome = await submitApprovalDecision({
			transport,
			card,
			offerId: "decision:0",
			form: seeded(card),
			target: commandTarget(),
		});

		expect(outcome.status === "refused" && outcome.code).toBe("gateway_error");
		expect(outcome.status === "refused" && outcome.outcome).toBe("outcome_unknown");
	});
});
