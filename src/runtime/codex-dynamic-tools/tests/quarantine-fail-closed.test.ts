import { describe, expect, test } from "bun:test";

import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createCodexDynamicTools, type CodexDynamicTools } from "../index.js";
import {
	FakeApproval,
	dynamicDecision,
	optionsFor,
	requestFor,
	setupAuthorities,
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

describe("codex dynamic quarantine fail-closed ownership", () => {
	test("invalid teardown proof retains quarantine and surfaces a fatal lifecycle fault", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller, { approval: cancelledApproval() });
		fixture.lifecycle.poisonError = new Error("poison unavailable");
		fixture.operationIds.terminalFaults.push("before", "before", "before", "before");
		const tools = createCodexDynamicTools(fixture.options);
		const pending = tools
			.dispatch(requestFor(authorities, caller, "create_thread", { prompt: "wrong teardown" }))
			.catch((error: unknown) => error);
		await reachQuarantine(tools);

		fixture.lifecycle.completeShutdownWith(
			createIdentityAuthorities().identity.validator.childId,
			caller.epoch,
		);
		await Promise.resolve();
		expect(fixture.lifecycle.fatalFaults).toEqual([
			expect.objectContaining({ reason: "poison_acquisition_failed" }),
		]);
		expect(tools.inspectMutationQuarantine()).toMatchObject({
			epochCount: 1,
			fatalEpochCount: 1,
			entries: [{ state: "fatal" }],
		});

		tools.dispose();
		expect(await pending).toMatchObject({ retryEligible: false });
	});

	test("rejected teardown proof retains quarantine and reports the lifecycle fault", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller, { approval: cancelledApproval() });
		fixture.lifecycle.poisonError = new Error("poison unavailable");
		fixture.operationIds.terminalFaults.push("before", "before", "before", "before");
		const tools = createCodexDynamicTools(fixture.options);
		const pending = tools
			.dispatch(requestFor(authorities, caller, "create_thread", { prompt: "reject teardown" }))
			.catch((error: unknown) => error);
		await reachQuarantine(tools);

		fixture.lifecycle.rejectShutdown(new Error("teardown rejected"));
		await Promise.resolve();
		expect(fixture.lifecycle.fatalFaults).toEqual([
			expect.objectContaining({ reason: "poison_acquisition_failed" }),
		]);
		expect(tools.inspectMutationQuarantine()).toMatchObject({
			epochCount: 1,
			fatalEpochCount: 1,
			entries: [{ state: "fatal" }],
		});

		tools.dispose();
		expect(await pending).toMatchObject({ retryEligible: false });
	});

	test("bounds retained wires at transport capacity and shuts down on overflow", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller, { approval: cancelledApproval() });
		fixture.operationIds.terminalFaults.push("before", "before", "before", "before");
		const tools = createCodexDynamicTools(fixture.options);
		const observed = [
			tools
				.dispatch(
					requestFor(authorities, caller, "create_thread", { prompt: "bounded" }, "bounded-call"),
				)
				.catch((error: unknown) => error),
		];
		await reachQuarantine(tools);
		for (let index = 1; index < 128; index++)
			observed.push(
				tools
					.dispatch(
						requestFor(authorities, caller, "create_thread", { prompt: "bounded" }, "bounded-call"),
					)
					.catch((error: unknown) => error),
			);
		observed.push(
			tools
				.dispatch(
					requestFor(authorities, caller, "create_thread", { prompt: "bounded" }, "bounded-call"),
				)
				.catch((error: unknown) => error),
		);

		expect(tools.inspectMutationQuarantine()).toMatchObject({
			epochCount: 1,
			wireCount: 128,
			blockedWireCount: 0,
			entries: [{ state: "shutdown_pending", wireCount: 128, overflowed: true }],
		});
		expect(fixture.lifecycle.shutdownInputs).toEqual([
			expect.objectContaining({ reason: "wire_capacity_exceeded" }),
		]);
		expect(fixture.operationIds.issued).toHaveLength(2);
		expect(fixture.transportResponses).toHaveLength(0);

		fixture.lifecycle.completeShutdown();
		const outcomes = await Promise.all(observed);
		expect(outcomes).toHaveLength(129);
		expect(outcomes.every((outcome) => outcome instanceof Error)).toBe(true);
		expect(tools.inspectMutationQuarantine()).toMatchObject({ epochCount: 0, wireCount: 0 });
	});

	test("response write failure triggers exact teardown instead of resolving silently", async () => {
		const { authorities, caller } = setupAuthorities();
		let writeAttempts = 0;
		const fixture = optionsFor(authorities, caller, {
			approval: cancelledApproval(),
			transport: {
				respond: async () => {
					writeAttempts += 1;
					throw new Error("transport write failed");
				},
			},
		});
		fixture.operationIds.terminalFaults.push("before", "before", "before", "before");
		const tools = createCodexDynamicTools(fixture.options);
		const pending = tools
			.dispatch(requestFor(authorities, caller, "create_thread", { prompt: "write once" }))
			.catch((error: unknown) => error);
		await reachQuarantine(tools);

		expect(fixture.lifecycle.retryQuarantine()).rejects.toMatchObject({ retryEligible: false });
		expect(writeAttempts).toBe(1);
		expect(fixture.lifecycle.shutdownInputs).toEqual([
			expect.objectContaining({ reason: "response_write_failed" }),
		]);
		expect(tools.inspectMutationQuarantine()).toMatchObject({
			epochCount: 1,
			wireCount: 1,
			entries: [{ state: "shutdown_pending" }],
		});

		fixture.lifecycle.completeShutdown();
		expect(await pending).toMatchObject({ retryEligible: false });
		expect(writeAttempts).toBe(1);
	});
});
