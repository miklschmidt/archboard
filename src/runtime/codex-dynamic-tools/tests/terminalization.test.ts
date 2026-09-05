import { describe, expect, test } from "bun:test";

import { parseDynamicToolCallResponse } from "../../codex-thread-tools/index.js";
import { createCodexDynamicTools } from "../index.js";
import {
	FakeApproval,
	dynamicDecision,
	optionsFor,
	requestFor,
	setupAuthorities,
	turn,
	turnResult,
} from "./support.js";

function cancelledApproval(): FakeApproval {
	return new FakeApproval((request) =>
		dynamicDecision(request, { outcome: "cancelled", cause: "call_cancelled" }),
	);
}

function declinedApproval(): FakeApproval {
	return new FakeApproval((request) =>
		dynamicDecision(request, { outcome: "declined", cause: "person_declined" }),
	);
}

describe("codex dynamic host operation terminalization", () => {
	test("returns approval_required only after before- and after-transition faults are proven terminal", async () => {
		for (const fault of ["before", "after"] as const) {
			const { authorities, caller } = setupAuthorities();
			const approval = cancelledApproval();
			const fixture = optionsFor(authorities, caller, { approval });
			fixture.operationIds.terminalFaults.push(fault);

			const response = await createCodexDynamicTools(fixture.options).dispatch(
				requestFor(authorities, caller, "create_thread", { prompt: fault }, `fault-${fault}`),
			);
			const parsed = parseDynamicToolCallResponse("create_thread", response);

			expect(parsed.envelope.tag).toBe("approval_required");
			expect(fixture.operationIds.retired).toHaveLength(2);
			expect(new Set(fixture.operationIds.retired).size).toBe(2);
			for (const operationId of fixture.operationIds.issued) {
				expect(() =>
					fixture.operationIds.validateCurrentUnconsumedOperationId(operationId),
				).toThrow(/terminal/);
			}
			expect(fixture.operationIds.terminalAttempts).toHaveLength(fault === "before" ? 3 : 2);
		}
	});

	test("returns a confirmed effect after an after-transition consume fault without a second transition", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		fixture.session.turnStartResult = turnResult(turn(authorities, "terminal-send"));
		fixture.operationIds.terminalFaults.push("after");

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "send_message_to_thread", {
				threadId: otherTarget.wireThreadId,
				prompt: "terminal send",
			}),
		);
		const parsed = parseDynamicToolCallResponse("send_message_to_thread", response);

		expect(parsed.envelope).toMatchObject({ tag: "ok", value: { delivery: "delivered" } });
		expect(fixture.operationIds.consumed).toHaveLength(1);
		expect(fixture.operationIds.terminalAttempts).toHaveLength(1);
		expect(() =>
			fixture.operationIds.validateCurrentUnconsumedOperationId(fixture.operationIds.consumed[0]!),
		).toThrow(/terminal/);
	});

	test("returns a refusal only after every issued identity is host-invalid", async () => {
		const { authorities, caller } = setupAuthorities();
		const approval = declinedApproval();
		const fixture = optionsFor(authorities, caller, { approval });
		fixture.operationIds.terminalFaults.push("before");

		const response = await createCodexDynamicTools(fixture.options).dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "declined" }),
		);
		const parsed = parseDynamicToolCallResponse("create_thread", response);

		expect(parsed.envelope).toMatchObject({ tag: "refused", reason: "approval_declined" });
		expect(fixture.operationIds.retired).toHaveLength(2);
		for (const operationId of fixture.operationIds.issued) {
			expect(() => fixture.operationIds.validateCurrentUnconsumedOperationId(operationId)).toThrow(
				/terminal/,
			);
		}
	});

	test("retains unresolved terminality without returning a response", async () => {
		const { authorities, caller } = setupAuthorities();
		const approval = cancelledApproval();
		const fixture = optionsFor(authorities, caller, { approval });
		fixture.operationIds.terminalFaults.push("before", "before", "before", "before");

		const tools = createCodexDynamicTools(fixture.options);
		const pending = tools.dispatch(
			requestFor(authorities, caller, "create_thread", { prompt: "cannot terminalize" }),
		);
		for (let index = 0; index < 100; index++) {
			if (tools.inspectMutationQuarantine().callCount === 1) {
				break;
			}
			await Promise.resolve();
		}

		expect(tools.inspectMutationQuarantine()).toMatchObject({ epochCount: 1, callCount: 1 });
		expect(fixture.transportResponses).toHaveLength(0);
		expect(fixture.operationIds.retired).toHaveLength(0);
		for (const operationId of fixture.operationIds.issued) {
			expect(() =>
				fixture.operationIds.validateCurrentUnconsumedOperationId(operationId),
			).not.toThrow();
		}
		tools.dispose();
		await expect(pending).rejects.toMatchObject({ code: "system_error", retryEligible: false });
	});
});
