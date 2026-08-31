import { describe, expect, test } from "bun:test";

import {
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
} from "../../codex-instructions/index.js";
import {
	WORKHORSE_INSTRUCTION_HASH,
	WORKHORSE_MANIFEST_HASH,
	createWorkhorseThreadStartParams,
} from "../index.js";
import { ARCHBOARD_APP_NAMESPACE } from "../../codex-thread-tools/index.js";
import { ARCHBOARD_APP_MANIFEST_SHA256 } from "../../codex-thread-tools/index.js";

const CHECKOUT_ROOT = "/workspace/archboard";

describe("codex workhorse start profile", () => {
	test("emits the exact reviewed fields in authored order", () => {
		const params = createWorkhorseThreadStartParams(CHECKOUT_ROOT);

		expect(Object.keys(params)).toEqual([
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
			cwd: CHECKOUT_ROOT,
			runtimeWorkspaceRoots: [CHECKOUT_ROOT],
			serviceName: "archboard",
			developerInstructions: WORKHORSE_DEVELOPER_INSTRUCTIONS,
			ephemeral: false,
			historyMode: "paginated",
			sessionStartSource: "startup",
			threadSource: "archboard",
			dynamicTools: [ARCHBOARD_APP_NAMESPACE],
			experimentalRawEvents: false,
		});
		expect(params.dynamicTools?.[0]).toBe(ARCHBOARD_APP_NAMESPACE);
	});

	test("does not silently turn inherited policy into explicit request fields", () => {
		const params = createWorkhorseThreadStartParams(CHECKOUT_ROOT);
		const intentionallyOmitted = [
			"model",
			"modelProvider",
			"allowProviderModelFallback",
			"serviceTier",
			"approvalPolicy",
			"approvalsReviewer",
			"sandbox",
			"permissions",
			"config",
			"baseInstructions",
			"personality",
			"multiAgentMode",
			"projectId",
			"environments",
			"selectedCapabilityRoots",
			"mockExperimentalField",
		];
		for (const field of intentionallyOmitted) expect(Object.hasOwn(params, field)).toBe(false);
	});

	test("keeps the reviewed instruction and catalogue hashes at the module boundary", () => {
		expect(WORKHORSE_INSTRUCTION_HASH).toBe(WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256);
		expect(WORKHORSE_MANIFEST_HASH).toBe(ARCHBOARD_APP_MANIFEST_SHA256);
	});
});
