import { describe, expect, test } from "bun:test";

import { createCodexDynamicTools, type CodexDynamicTools } from "../index.js";
import { parseDynamicToolCallResponse } from "../../codex-thread-tools/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import {
	FakeApproval,
	dynamicDecision,
	optionsFor,
	requestFor,
	setupAuthorities,
	turn,
	turnResult,
} from "./support.js";

async function reachQuarantine(tools: CodexDynamicTools): Promise<void> {
	for (let index = 0; index < 100; index++) {
		if (tools.inspectMutationQuarantine().callCount > 0) return;
		await Promise.resolve();
	}
	throw new Error("the mutation did not reach quarantine");
}

function cancelledApproval(): FakeApproval {
	return new FakeApproval((request) =>
		dynamicDecision(request, { outcome: "cancelled", cause: "call_cancelled" }),
	);
}

describe("codex dynamic unresolved mutation quarantine", () => {
	test("joins reconstructed and same-object replay without issuing another authority", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const approval = cancelledApproval();
		const fixture = optionsFor(authorities, caller, { approval });
		fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		fixture.operationIds.terminalFaults.push("before", "before", "before", "before");
		const tools = createCodexDynamicTools(fixture.options);
		const request = requestFor(
			authorities,
			caller,
			"create_thread",
			{ prompt: "owned once" },
			"quarantined-call",
		);

		const original = tools.dispatch(request);
		expect(tools.dispatch(request)).toBe(original);
		await reachQuarantine(tools);
		const reconstructed = requestFor(
			authorities,
			caller,
			"create_thread",
			{ prompt: "owned once" },
			"quarantined-call",
		);
		expect(tools.dispatch(reconstructed)).toBe(original);

		const issued = fixture.operationIds.issued.length;
		const approvals = approval.presented.length;
		const effects = fixture.session.calls.length;
		expect(
			tools.dispatch(
				requestFor(authorities, caller, "send_message_to_thread", {
					threadId: otherTarget.wireThreadId,
					prompt: "must be blocked",
				}),
			),
		).rejects.toMatchObject({ code: "system_error", retryEligible: false });
		expect(
			tools.dispatch(requestFor(authorities, caller, "list_threads", { limit: 1 })),
		).rejects.toMatchObject({ code: "system_error", retryEligible: false });
		expect(fixture.operationIds.issued).toHaveLength(issued);
		expect(approval.presented).toHaveLength(approvals);
		expect(fixture.session.calls).toHaveLength(effects);
		expect(fixture.transportResponses).toHaveLength(0);
		expect(tools.inspectMutationQuarantine()).toMatchObject({
			epochCount: 1,
			callCount: 1,
			entries: [{ state: "poisoned", unresolvedOperationCount: 2 }],
		});
		expect(JSON.stringify(tools.inspectMutationQuarantine())).not.toContain("owned once");

		tools.dispose();
		expect(original).rejects.toMatchObject({ retryEligible: false });
	});

	test("delivers the original canonical response only after lifecycle-triggered terminal proof", async () => {
		const { authorities, caller } = setupAuthorities();
		const approval = cancelledApproval();
		const fixture = optionsFor(authorities, caller, { approval });
		fixture.operationIds.terminalFaults.push("before", "before", "before", "before");
		const tools = createCodexDynamicTools(fixture.options);
		const pending = tools.dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "recover once" }),
		);
		await reachQuarantine(tools);

		expect(fixture.lifecycle.quarantineInputs).toHaveLength(1);
		expect(fixture.lifecycle.poisonedEpochs).toContain(
			`${String(caller.childId)}:${String(caller.epoch)}`,
		);
		expect(fixture.transportResponses).toHaveLength(0);
		fixture.operationIds.terminalFaults.push("before", "before");
		expect(fixture.lifecycle.retryQuarantine()).rejects.toMatchObject({
			retryEligible: false,
		});
		expect(tools.inspectMutationQuarantine()).toMatchObject({ epochCount: 1, callCount: 1 });
		expect(fixture.transportResponses).toHaveLength(0);
		expect(await fixture.lifecycle.retryQuarantine()).toEqual({
			terminal: true,
			unresolvedOperationCount: 0,
		});
		const response = await pending;
		const issued = fixture.operationIds.issued.length;
		const approvals = approval.presented.length;
		const replay = tools.dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "recover once" }),
		);

		expect(response.success).toBe(true);
		expect(replay).toBe(pending);
		expect(await replay).toBe(response);
		expect(fixture.operationIds.issued).toHaveLength(issued);
		expect(approval.presented).toHaveLength(approvals);
		expect(fixture.transportResponses).toHaveLength(1);
		expect(tools.inspectMutationQuarantine()).toEqual({
			epochCount: 0,
			callCount: 0,
			entries: [],
		});
		for (const operationId of fixture.operationIds.issued)
			expect(() => fixture.operationIds.validateCurrentUnconsumedOperationId(operationId)).toThrow(
				/terminal/,
			);
	});

	test("holds a confirmed effect response until its consumed identity is terminal", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		fixture.session.turnStartResult = turnResult(turn(authorities, "quarantined-send"));
		fixture.operationIds.terminalFaults.push("before", "before", "before", "before");
		const tools = createCodexDynamicTools(fixture.options);
		const pending = tools.dispatch(
			requestFor(authorities, caller, "send_message_to_thread", {
				threadId: otherTarget.wireThreadId,
				prompt: "send exactly once",
			}),
		);
		await reachQuarantine(tools);

		expect(fixture.session.calls.map(({ method }) => method)).toEqual(["turn/start"]);
		expect(fixture.transportResponses).toHaveLength(0);
		expect(tools.inspectMutationQuarantine()).toMatchObject({
			epochCount: 1,
			callCount: 1,
			entries: [{ unresolvedOperationCount: 1 }],
		});
		await fixture.lifecycle.retryQuarantine();
		const response = await pending;
		const parsed = parseDynamicToolCallResponse("send_message_to_thread", response);

		expect(parsed.envelope).toMatchObject({ tag: "ok", value: { delivery: "delivered" } });
		expect(fixture.operationIds.consumed).toHaveLength(1);
		expect(fixture.operationIds.retired).toHaveLength(0);
		expect(() =>
			fixture.operationIds.validateCurrentUnconsumedOperationId(fixture.operationIds.consumed[0]!),
		).toThrow(/terminal/);
		expect(fixture.transportResponses).toHaveLength(1);
	});

	test("retains an outer ID when initial ID issuance and cleanup both fail", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.operationIds.issueErrorAt = 2;
		fixture.operationIds.terminalFaults.push("before", "before", "before", "before");
		const tools = createCodexDynamicTools(fixture.options);
		const pending = tools.dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "partial issuance" }),
		);
		await reachQuarantine(tools);

		expect(fixture.operationIds.issued).toHaveLength(1);
		expect(fixture.approval.presented).toHaveLength(0);
		expect(fixture.session.calls).toHaveLength(0);
		expect(fixture.transportResponses).toHaveLength(0);
		expect(tools.inspectMutationQuarantine()).toMatchObject({
			epochCount: 1,
			callCount: 1,
			entries: [{ unresolvedOperationCount: 1 }],
		});

		await fixture.lifecycle.retryQuarantine();
		const response = await pending;
		expect(response.success).toBe(true);
		expect(fixture.operationIds.retired).toHaveLength(1);
		expect(() =>
			fixture.operationIds.validateCurrentUnconsumedOperationId(fixture.operationIds.retired[0]!),
		).toThrow(/terminal/);
		expect(fixture.transportResponses).toHaveLength(1);
	});

	test("lets exact child exit close the pending owner without a dynamic response", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller, { approval: cancelledApproval() });
		fixture.operationIds.terminalFaults.push("before", "before", "before", "before");
		const tools = createCodexDynamicTools(fixture.options);
		const pending = tools.dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "exit closes" }),
		);
		await reachQuarantine(tools);

		fixture.lifecycle.exitQuarantine();
		expect(pending).rejects.toMatchObject({ code: "system_error", retryEligible: false });
		expect(fixture.transportResponses).toHaveLength(0);
		expect(tools.inspectMutationQuarantine()).toMatchObject({ epochCount: 0, callCount: 0 });
	});

	test("does not clear ownership for a different child exit", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller, { approval: cancelledApproval() });
		fixture.operationIds.terminalFaults.push("before", "before", "before", "before");
		const tools = createCodexDynamicTools(fixture.options);
		const pending = tools.dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "wrong exit stays owned" }),
		);
		await reachQuarantine(tools);

		fixture.lifecycle.exitQuarantineWith(
			createIdentityAuthorities().identity.validator.childId,
			caller.epoch,
		);
		await Promise.resolve();
		expect(tools.inspectMutationQuarantine()).toMatchObject({
			epochCount: 1,
			callCount: 1,
			entries: [{ state: "poison_failed" }],
		});
		expect(fixture.transportResponses).toHaveLength(0);

		tools.dispose();
		expect(pending).rejects.toMatchObject({ retryEligible: false });
	});

	test("dispose rejects and clears every retained owner without inventing a response", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller, { approval: cancelledApproval() });
		fixture.operationIds.terminalFaults.push("before", "before", "before", "before");
		const tools = createCodexDynamicTools(fixture.options);
		const pending = tools.dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "dispose closes" }),
		);
		await reachQuarantine(tools);

		tools.dispose();
		expect(pending).rejects.toMatchObject({ code: "system_error", retryEligible: false });
		expect(fixture.transportResponses).toHaveLength(0);
		expect(tools.inspectMutationQuarantine()).toEqual({
			epochCount: 0,
			callCount: 0,
			entries: [],
		});
	});
});
