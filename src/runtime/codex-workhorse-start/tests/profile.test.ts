import { describe, expect, test } from "bun:test";

import {
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
} from "@archboard/workbench/instructions";
import { WORKHORSE_INSTRUCTION_HASH, createWorkhorseThreadStartParams } from "../index.js";
import { ARCHBOARD_APP_NAMESPACE } from "@archboard/workbench/thread-tools";
import { ARCHBOARD_COORDINATOR_NAMESPACE } from "../../codex-coordinator-callbacks/index.js";

const CHECKOUT_ROOT = "/workspace/archboard";

describe("codex workhorse start profile", () => {
	test("emits the exact reviewed fields in authored order", () => {
		const params = createWorkhorseThreadStartParams(CHECKOUT_ROOT);

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
			serviceName: "archboard",
			developerInstructions: WORKHORSE_DEVELOPER_INSTRUCTIONS,
			ephemeral: false,
			historyMode: "paginated",
			sessionStartSource: "startup",
			threadSource: "archboard",
			dynamicTools: [ARCHBOARD_APP_NAMESPACE, ARCHBOARD_COORDINATOR_NAMESPACE],
			experimentalRawEvents: false,
		});
		expect(params.dynamicTools?.[0]).toBe(ARCHBOARD_APP_NAMESPACE);
	});

	test("does not silently turn inherited policy into explicit request fields", () => {
		const params = createWorkhorseThreadStartParams(CHECKOUT_ROOT);
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

	test("keeps the reviewed instruction hash at the module boundary", () => {
		expect(WORKHORSE_INSTRUCTION_HASH).toBe(WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256);
	});
});
