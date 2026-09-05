// The behaviour the archived mounted-approvals owner asserted through the old
// cards, re-targeted at the controller that now feeds the committed approvals
// panel: a decision on the wire disables that card and no other, the result
// stays beside the card, the panel's choices resolve to exact wire drafts, and
// a choice the host did not offer never reaches the wire.

import { describe, expect, test } from "bun:test";

import { createWorkbenchApprovalsController } from "@/ui/workbench-approvals";
import type { WorkbenchApprovalsController } from "@/ui/workbench-approvals";
import {
	commandApproval,
	CREATE_EFFECT,
	dynamicApproval,
	dynamicIdentity,
	execCommandApproval,
	HASH,
	permissionsApproval,
	userInputApproval,
} from "@/ui/workbench-approvals/tests/fixtures";
import {
	CHILD,
	connected,
	EPOCH,
	FakeApprovalsTransport,
	NOW,
	snapshot,
	THREAD,
	type FakeTransportOptions,
} from "@/ui/workbench-approvals/tests/model";

/**
 * A fixed clock.
 * @returns The fixture instant.
 */
function fixedNow(): number {
	return NOW;
}

/**
 * A controller over a double holding the given approvals.
 * @param options How the double behaves.
 * @returns Both.
 */
function controllerWith(options: FakeTransportOptions = {}): {
	transport: FakeApprovalsTransport;
	controller: WorkbenchApprovalsController;
} {
	const transport = new FakeApprovalsTransport({
		state: connected(
			snapshot({
				approvals: [
					commandApproval(),
					userInputApproval(),
					permissionsApproval(),
					execCommandApproval(),
				],
				dynamicApprovals: [dynamicApproval(CREATE_EFFECT)],
			}),
		),
		...options,
	});
	return {
		transport,
		controller: createWorkbenchApprovalsController(transport, { now: fixedNow }),
	};
}

/**
 * The first sent draft.
 * @param transport The double.
 * @returns The draft.
 */
function sentDraft(transport: FakeApprovalsTransport): unknown {
	return transport.sent[0]?.draft;
}

/** A one-question tool request the panel can answer with one option. */
const ONE_QUESTION = userInputApproval({
	questions: [
		{
			id: "environment",
			header: "Which environment",
			question: "Which environment should the deploy target?",
			isOther: false,
			isSecret: false,
			options: [
				{ label: "staging", description: "The shared staging cluster" },
				{ label: "production", description: "The live cluster" },
			],
		},
	],
	spoken: { eligible: false, reason: "form" },
});

describe("approvals controller decisions", () => {
	test("resolves the panel's command decision onto the exact host-offered decision", async () => {
		const { transport, controller } = controllerWith();
		const approval = commandApproval();

		const result = await controller.respondToApproval(approval, {
			kind: "command_decision",
			decision: "decline",
		});

		expect(result.status).toBe("sent");
		expect(sentDraft(transport)).toEqual({
			command: "approvalRespond",
			requestId: approval.requestId,
			approvalId: approval.approvalId,
			response: { approvalKind: "command_execution", decision: "decline" },
		});
	});

	test("refuses a decision the host did not offer without reaching the wire", async () => {
		const { transport, controller } = controllerWith();

		const result = await controller.respondToApproval(commandApproval(), {
			kind: "command_decision",
			decision: "acceptForSession",
		});

		expect(result.status).toBe("refused");
		expect(result.status === "refused" ? result.code : null).toBe("not_offered");
		expect(transport.sent).toEqual([]);
	});

	test("answers a one-question request with the chosen option", async () => {
		const { transport, controller } = controllerWith();

		const result = await controller.respondToApproval(ONE_QUESTION, {
			kind: "answer",
			questionId: "environment",
			answer: "staging",
		});

		expect(result.status).toBe("sent");
		expect(sentDraft(transport)).toMatchObject({
			response: { approvalKind: "user_input", answers: { environment: { answers: ["staging"] } } },
		});
	});

	test("refuses one answer to a request whose other question still needs one", async () => {
		// The panel offers one option at a time; a secret or free-text question has
		// no control there, so the reviewed answers stay incomplete and nothing is
		// sent in their place.
		const { transport, controller } = controllerWith();

		const result = await controller.respondToApproval(userInputApproval(), {
			kind: "answer",
			questionId: "environment",
			answer: "staging",
		});

		expect(result.status).toBe("invalid");
		expect(result.status === "invalid" ? result.errors.map((error) => error.name) : []).toEqual([
			"question:token",
		]);
		expect(transport.sent).toEqual([]);
	});

	test("approves a permissions request with the reviewed defaults and declines with nothing", async () => {
		const { transport, controller } = controllerWith();

		await controller.respondToApproval(permissionsApproval(), { kind: "approve" });
		await controller.respondToApproval(permissionsApproval(), { kind: "decline" });

		expect(transport.sent[0]?.draft).toMatchObject({
			response: {
				approvalKind: "permissions",
				permissions: { network: { enabled: true } },
				scope: "turn",
			},
		});
		expect(transport.sent[1]?.draft).toMatchObject({
			response: { approvalKind: "permissions", permissions: {}, scope: "turn" },
		});
	});

	test("declines a legacy review with the default reason", async () => {
		const { transport, controller } = controllerWith();

		await controller.respondToApproval(execCommandApproval(), { kind: "decline" });

		expect(sentDraft(transport)).toMatchObject({
			response: {
				approvalKind: "exec_command",
				decision: { denied: { rejection: "Declined at the Archboard workbench." } },
			},
		});
	});

	test("sends a dynamic verdict under the exact lease with the immutable hash", async () => {
		const { transport, controller } = controllerWith();

		await controller.respondToDynamicApproval(dynamicApproval(CREATE_EFFECT), "approve");

		expect(sentDraft(transport)).toEqual({
			command: "dynamicApprovalRespond",
			capturedLink: { threadId: THREAD, childId: CHILD, epoch: EPOCH },
			identity: dynamicIdentity(CREATE_EFFECT),
			effectHash: HASH,
			decision: "approve",
		});
		expect(transport.sent[0]?.target).toMatchObject({ childId: CHILD, epoch: EPOCH });
	});
});

describe("approvals controller busy state", () => {
	test("marks only the deciding card busy while its decision is on the wire", async () => {
		const gate = Promise.withResolvers<void>();
		const { controller } = controllerWith({ gate: gate.promise });
		const approval = commandApproval();
		const seen: (readonly string[])[] = [];
		controller.subscribe(() => {
			seen.push(controller.decisionState().busyApprovals);
		});

		const deciding = controller.respondToApproval(approval, { kind: "approve" });
		expect(controller.decisionState().busyApprovals).toEqual([String(approval.requestId)]);
		const second = await controller.respondToApproval(approval, { kind: "decline" });
		expect(second.status === "refused" ? second.code : null).toBe("decision_in_flight");
		gate.resolve();
		await deciding;

		expect(controller.decisionState().busyApprovals).toEqual([]);
		expect(seen).toEqual([[String(approval.requestId)], []]);
	});

	test("keeps the result beside the card once the decision settles", async () => {
		const { controller } = controllerWith({ result: { outcome: "outcome_unknown" } });
		const approval = commandApproval();

		await controller.respondToApproval(approval, { kind: "approve" });

		const result = controller.decisionState().results.get(String(approval.requestId));
		expect(result?.status).toBe("sent");
		expect(result?.status === "sent" ? result.outcome : null).toBe("outcome_unknown");
		expect(result?.status === "sent" ? result.message : "").toContain(
			"never retries an unknown mutation",
		);
	});

	test("refuses a decision when no target can be captured", async () => {
		const { transport, controller } = controllerWith({ target: null });

		const result = await controller.respondToApproval(commandApproval(), { kind: "approve" });

		expect(result.status === "refused" ? result.code : null).toBe("link_required");
		expect(transport.sent).toEqual([]);
	});

	test("projects the surface for the transport as it stands", () => {
		const { controller } = controllerWith();

		const view = controller.view(NOW);

		expect(view.beacon.pending).toBe(5);
		expect(view.authority).toBe("live");
	});
});
