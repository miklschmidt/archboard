import { TEST_TOOLS } from "#tests/runtime/support/toolset.ts";
import { describe, expect, test } from "bun:test";

import { createWorkhorseThreadStartParams } from "#runtime/workhorses/workhorse-start/rules/model.ts";
import { TEST_INSTRUCTIONS } from "#tests/runtime/support/host.ts";

const CHECKOUT_ROOT = "/workspace/checkout";

describe("codex workhorse start profile", () => {
	test("emits the exact reviewed fields in authored order", () => {
		const params = createWorkhorseThreadStartParams(CHECKOUT_ROOT, TEST_INSTRUCTIONS.workhorse);

		expect(Object.keys(params)).toEqual([
			"model",
			"config",
			"cwd",
			"runtimeWorkspaceRoots",
			"serviceName",
			"developerInstructions",
			"ephemeral",
			"historyMode",
			"sessionStartSource",
			"threadSource",
			"dynamicTools",
			"experimentalRawEvents",
		]);
		expect(params).toMatchObject({
			model: "gpt-6.2-sol",
			config: { model_reasoning_effort: "high" },
			cwd: CHECKOUT_ROOT,
			runtimeWorkspaceRoots: [CHECKOUT_ROOT],
			serviceName: TEST_INSTRUCTIONS.workhorse.identity.serviceName,
			developerInstructions: TEST_INSTRUCTIONS.workhorse.instructions.text,
			ephemeral: false,
			historyMode: "paginated",
			sessionStartSource: "startup",
			threadSource: TEST_INSTRUCTIONS.workhorse.identity.threadSource,
			dynamicTools: [TEST_TOOLS.coordinator.namespace],
			experimentalRawEvents: false,
		});
	});

	test("does not silently turn inherited policy into explicit request fields", () => {
		const params = createWorkhorseThreadStartParams(CHECKOUT_ROOT, TEST_INSTRUCTIONS.workhorse);
		const intentionallyOmitted = [
			"modelProvider",
			"allowProviderModelFallback",
			"serviceTier",
			"approvalPolicy",
			"approvalsReviewer",
			"sandbox",
			"permissions",
			"baseInstructions",
			"personality",
			"multiAgentMode",
			"projectId",
			"environments",
			"selectedCapabilityRoots",
			"mockExperimentalField",
		];
		for (const field of intentionallyOmitted) {
			expect(Object.hasOwn(params, field)).toBe(false);
		}
	});

	test("applies explicit host model, effort, and optional serviceTier selection", () => {
		const withTier = createWorkhorseThreadStartParams(CHECKOUT_ROOT, TEST_INSTRUCTIONS.workhorse, {
			model: "gpt-custom-workhorse",
			effort: "high",
			serviceTier: "priority",
		});
		expect(withTier.model).toBe("gpt-custom-workhorse");
		expect(withTier.config).toEqual({ model_reasoning_effort: "high" });
		expect(withTier.serviceTier).toBe("priority");

		const withoutTier = createWorkhorseThreadStartParams(
			CHECKOUT_ROOT,
			TEST_INSTRUCTIONS.workhorse,
			{
				model: "gpt-custom-workhorse",
				effort: "low",
				serviceTier: null,
			},
		);
		expect(withoutTier.model).toBe("gpt-custom-workhorse");
		expect(withoutTier.config).toEqual({ model_reasoning_effort: "low" });
		expect(Object.hasOwn(withoutTier, "serviceTier")).toBe(false);
	});
});
