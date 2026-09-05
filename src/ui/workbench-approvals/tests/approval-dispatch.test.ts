import { describe, expect, test } from "bun:test";

import type { BrowserApproval, BrowserSnapshot } from "@/shared/codex-browser-model";
import {
	applyApprovalFormEvent,
	initialApprovalForm,
	projectWorkbenchApprovals,
	submitApprovalDecision,
} from "@/ui/workbench-approvals";
import type {
	WorkbenchApprovalCard,
	WorkbenchApprovalDecisionResult,
	WorkbenchApprovalFormState,
	WorkbenchOrdinaryApprovalCard,
} from "@/ui/workbench-approvals/contracts";
import {
	applyPatchApproval,
	commandApproval,
	CREATE_EFFECT,
	dynamicApproval,
	dynamicIdentity,
	elicitationApproval,
	execCommandApproval,
	fileChangeApproval,
	HASH,
	permissionsApproval,
	userInputApproval,
} from "@/ui/workbench-approvals/tests/fixtures";
import {
	approvalsInput,
	CHILD,
	commandIntent,
	connected,
	EPOCH,
	FakeApprovalsTransport,
	FakeTransportError,
	snapshot,
	THREAD,
	type RecordedCommand,
} from "@/ui/workbench-approvals/tests/model";

/**
 * The cards of one snapshot.
 * @param overrides The snapshot's approvals.
 * @returns The cards.
 */
function cards(overrides: Partial<BrowserSnapshot>): readonly WorkbenchApprovalCard[] {
	return projectWorkbenchApprovals(approvalsInput(connected(snapshot(overrides)))).cards;
}

/**
 * The response the first sent draft carried.
 * @param sent The recorded commands.
 * @returns The response, or undefined.
 */
function responseOf(sent: readonly RecordedCommand[]): unknown {
	const draft = sent[0]?.draft;
	return draft?.command === "approvalRespond" ? draft.response : undefined;
}

/**
 * The one ordinary card of one approval.
 * @param approval The approval.
 * @returns The card.
 */
function only(approval: BrowserApproval): WorkbenchOrdinaryApprovalCard {
	const card = cards({ approvals: [approval] })[0];
	if (card?.kind !== "ordinary") {
		throw new Error("Expected one ordinary approval card");
	}
	return card;
}

/**
 * The one dynamic card of the create effect.
 * @returns The card.
 */
function createCard(): WorkbenchApprovalCard {
	const card = cards({ dynamicApprovals: [dynamicApproval(CREATE_EFFECT)] })[0];
	if (card === undefined) {
		throw new Error("Expected one dynamic approval card");
	}
	return card;
}

/**
 * The form seeded from a card's fields.
 * @param card The card.
 * @returns The form.
 */
function seeded(card: WorkbenchOrdinaryApprovalCard): WorkbenchApprovalFormState {
	return initialApprovalForm(card.fields);
}

/**
 * Send one decision through a double.
 * @param card The card.
 * @param offerId The offer.
 * @param form The form.
 * @param transport The double.
 * @returns The outcome and what was sent.
 */
async function send(
	card: WorkbenchApprovalCard,
	offerId: string,
	form: WorkbenchApprovalFormState,
	transport = new FakeApprovalsTransport(),
): Promise<{ outcome: WorkbenchApprovalDecisionResult; sent: readonly RecordedCommand[] }> {
	const outcome = await submitApprovalDecision({
		transport,
		card,
		offerId,
		form,
		target: commandIntent(),
	});
	return { outcome, sent: transport.sent };
}

/**
 * The refusal code of an outcome.
 * @param outcome The outcome.
 * @returns The code, or null when it was not refused.
 */
function codeOf(outcome: WorkbenchApprovalDecisionResult): string | null {
	return outcome.status === "refused" ? outcome.code : null;
}

describe("ordinary approval payloads", () => {
	test("sends the exact host-offered command execution decision", async () => {
		const card = only(commandApproval());
		const { outcome, sent } = await send(card, "decision:1", seeded(card));

		expect(outcome.status).toBe("sent");
		expect(sent[0]?.draft).toEqual({
			command: "approvalRespond",
			requestId: card.request.requestId,
			approvalId: card.request.approvalId,
			response: { approvalKind: "command_execution", decision: "decline" },
		});
		expect(sent[0]?.target).toEqual(commandIntent());
	});

	test("sends a file change session grant only when the host offered it", async () => {
		const card = only(fileChangeApproval());
		const { sent } = await send(card, "decision:1", seeded(card));

		expect(responseOf(sent)).toEqual({ approvalKind: "file_change", decision: "acceptForSession" });
		const narrow = only(fileChangeApproval({ availableDecisions: ["accept"] }));
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
		form = applyApprovalFormEvent(form, { kind: "value", name: "question:token", value: "s3cret" });
		const { sent } = await send(card, "submit", form);

		expect(responseOf(sent)).toEqual({
			approvalKind: "user_input",
			answers: {
				environment: { answers: ["staging", "canary"] },
				token: { answers: ["s3cret"] },
			},
		});
	});

	test("sends an accepted elicitation form with typed content and no secret default", async () => {
		const card = only(elicitationApproval());
		let form = seeded(card);
		form = applyApprovalFormEvent(form, { kind: "value", name: "field:apiKey", value: "token-1" });
		form = applyApprovalFormEvent(form, { kind: "flag", name: "field:tls", value: true });
		const { sent } = await send(card, "submit", form);

		expect(responseOf(sent)).toEqual({
			approvalKind: "elicitation",
			action: "accept",
			content: { host: "https://example.test", port: 443, apiKey: "token-1", tls: true },
			_meta: null,
		});
	});

	test("refuses to send an incomplete elicitation form", async () => {
		const card = only(elicitationApproval());
		const { outcome, sent } = await send(card, "submit", seeded(card));

		expect(outcome.status).toBe("invalid");
		expect(outcome.status === "invalid" ? outcome.errors[0]?.name : null).toBe("field:apiKey");
		expect(sent).toHaveLength(0);
	});

	test("declines and cancels an elicitation without content", async () => {
		const card = only(elicitationApproval());
		const declined = await send(card, "decline", seeded(card));
		const cancelled = await send(card, "cancel", seeded(card));

		expect(responseOf(declined.sent)).toEqual({
			approvalKind: "elicitation",
			action: "decline",
			content: null,
			_meta: null,
		});
		expect(responseOf(cancelled.sent)).toEqual({
			approvalKind: "elicitation",
			action: "cancel",
			content: null,
			_meta: null,
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

		expect(responseOf(granted.sent)).toEqual({
			approvalKind: "permissions",
			permissions: { network: { enabled: true } },
			scope: "session",
			strictAutoReview: true,
		});
		expect(responseOf(declined.sent)).toEqual({
			approvalKind: "permissions",
			permissions: {},
			scope: "turn",
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

		expect(responseOf(approved.sent)).toEqual({
			approvalKind: "apply_patch",
			decision: "approved",
		});
		expect(responseOf(aborted.sent)).toEqual({ approvalKind: "apply_patch", decision: "abort" });
		expect(responseOf(declined.sent)).toEqual({
			approvalKind: "exec_command",
			decision: { denied: { rejection: "Not on this branch." } },
		});
		expect(responseOf(silent.sent)).toEqual({
			approvalKind: "exec_command",
			decision: { denied: { rejection: "Declined at the Archboard workbench." } },
		});
	});
});

describe("dynamic approval dispatch", () => {
	test("echoes the captured link, identity and immutable effect hash", async () => {
		const { outcome, sent } = await send(createCard(), "approve", initialApprovalForm([]));

		expect(outcome.status).toBe("sent");
		expect(sent[0]?.draft).toEqual({
			command: "dynamicApprovalRespond",
			capturedLink: { threadId: THREAD, childId: CHILD, epoch: EPOCH },
			identity: dynamicIdentity(CREATE_EFFECT),
			effectHash: HASH,
			decision: "approve",
		});
		expect(sent[0]?.target).toEqual(commandIntent().authority);
	});

	test("sends a decline and refuses any other decision", async () => {
		const declined = await send(createCard(), "decline", initialApprovalForm([]));
		const broader = await send(createCard(), "acceptForSession", initialApprovalForm([]));

		expect(declined.sent[0]?.draft).toEqual({
			command: "dynamicApprovalRespond",
			capturedLink: { threadId: THREAD, childId: CHILD, epoch: EPOCH },
			identity: dynamicIdentity(CREATE_EFFECT),
			effectHash: HASH,
			decision: "decline",
		});
		expect(codeOf(broader.outcome)).toBe("not_offered");
		expect(broader.sent).toHaveLength(0);
	});
});

describe("captured-target refusals and reconciliation", () => {
	test("refuses a decision with no captured workbench target", async () => {
		const card = only(commandApproval());
		const transport = new FakeApprovalsTransport();
		const outcome = await submitApprovalDecision({
			transport,
			card,
			offerId: "decision:0",
			form: seeded(card),
			target: null,
		});

		expect(codeOf(outcome)).toBe("link_required");
		expect(transport.sent).toHaveLength(0);
	});

	for (const code of ["approval_not_pending", "link_changed"] as const) {
		test(`surfaces the transport's own ${code} refusal`, async () => {
			const card = only(commandApproval());
			const transport = new FakeApprovalsTransport({
				failure: new FakeTransportError(code, "refused"),
			});
			const { outcome } = await send(card, "decision:0", seeded(card), transport);

			expect(codeOf(outcome)).toBe(code);
			expect(outcome.status === "refused" ? outcome.outcome : null).toBe("not_delivered");
			expect(outcome.status === "refused" ? outcome.message.length : 0).toBeGreaterThan(0);
		});
	}

	test("surfaces a refused dynamic approval by its own code", async () => {
		const transport = new FakeApprovalsTransport({
			failure: new FakeTransportError("dynamic_approval_not_pending", "refused"),
		});
		const { outcome } = await send(createCard(), "approve", initialApprovalForm([]), transport);

		expect(codeOf(outcome)).toBe("dynamic_approval_not_pending");
		expect(outcome.status === "refused" ? outcome.message : "").toContain("no longer pending");
	});

	for (const outcomeValue of ["delivered", "not_delivered", "outcome_unknown"] as const) {
		test(`reports ${outcomeValue} from the host result`, async () => {
			const card = only(commandApproval());
			const transport = new FakeApprovalsTransport({ result: { outcome: outcomeValue } });
			const { outcome } = await send(card, "decision:0", seeded(card), transport);

			expect(outcome.status === "sent" ? outcome.outcome : null).toBe(outcomeValue);
		});
	}

	test("reports a gateway-coded refusal carried on a successful response", async () => {
		const card = only(commandApproval());
		const transport = new FakeApprovalsTransport({
			result: { outcome: "not_delivered", code: "not_ready", message: "The lease expired." },
		});
		const { outcome } = await send(card, "decision:0", seeded(card), transport);

		expect(codeOf(outcome)).toBe("not_ready");
		expect(outcome.status === "refused" ? outcome.message : "").toBe("The lease expired.");
	});

	test("classifies an unknown transport failure as an unknown outcome", async () => {
		const card = only(commandApproval());
		const transport = new FakeApprovalsTransport({ failure: new Error("socket exploded") });
		const { outcome } = await send(card, "decision:0", seeded(card), transport);

		expect(codeOf(outcome)).toBe("gateway_error");
		expect(outcome.status === "refused" ? outcome.outcome : null).toBe("outcome_unknown");
	});
});
