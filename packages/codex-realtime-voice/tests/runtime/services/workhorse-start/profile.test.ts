import { describe, expect, test } from "bun:test";

import { createWorkhorseThreadStartParams } from "#runtime/rules/workhorse-start/model.ts";
import { ARCHBOARD_COORDINATOR_NAMESPACE } from "#runtime/services/coordinator-callbacks/tell-coordinator.ts";
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
			model: "gpt-6-astra",
			config: { model_reasoning_effort: "medium" },
			cwd: CHECKOUT_ROOT,
			runtimeWorkspaceRoots: [CHECKOUT_ROOT],
			serviceName: TEST_INSTRUCTIONS.workhorse.serviceName,
			developerInstructions: TEST_INSTRUCTIONS.workhorse.instructions.text,
			ephemeral: false,
			historyMode: "paginated",
			sessionStartSource: "startup",
			threadSource: TEST_INSTRUCTIONS.workhorse.threadSource,
			dynamicTools: [ARCHBOARD_COORDINATOR_NAMESPACE],
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
});
