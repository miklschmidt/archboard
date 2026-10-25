import { ARCHBOARD_INSTRUCTIONS } from "#runtime/services/host/archboard.ts";
import { describe, expect, test } from "bun:test";

import { WORKHORSE_DEVELOPER_INSTRUCTIONS } from "#runtime/rules/instructions/authored.ts";
import { createWorkhorseThreadStartParams } from "@archboard/codex-realtime-voice/runtime";
import { ARCHBOARD_APP_NAMESPACE } from "#runtime/protocol/thread-tools/manifest.ts";
import { ARCHBOARD_COORDINATOR_NAMESPACE } from "@archboard/codex-realtime-voice/runtime";

const CHECKOUT_ROOT = "/workspace/archboard";

describe("codex workhorse start profile", () => {
	test("emits the exact reviewed fields in authored order", () => {
		const params = createWorkhorseThreadStartParams(
			CHECKOUT_ROOT,
			ARCHBOARD_INSTRUCTIONS.workhorse,
		);

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
			developerInstructions: ARCHBOARD_INSTRUCTIONS.workhorse.instructions.text,
			ephemeral: false,
			historyMode: "paginated",
			sessionStartSource: "startup",
			threadSource: "archboard",
			dynamicTools: [ARCHBOARD_APP_NAMESPACE, ARCHBOARD_COORDINATOR_NAMESPACE],
			experimentalRawEvents: false,
		});
		expect(params.dynamicTools?.[0]).toEqual(ARCHBOARD_APP_NAMESPACE);
	});

	test("does not silently turn inherited policy into explicit request fields", () => {
		const params = createWorkhorseThreadStartParams(
			CHECKOUT_ROOT,
			ARCHBOARD_INSTRUCTIONS.workhorse,
		);
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
		expect(ARCHBOARD_INSTRUCTIONS.workhorse.instructions.text).toEndWith(
			WORKHORSE_DEVELOPER_INSTRUCTIONS,
		);
	});
});
