import { TEST_TOOLS } from "#tests/runtime/support/toolset.ts";
import { TEST_INSTRUCTIONS } from "#tests/runtime/support/host.ts";
import { describe, expect, test } from "bun:test";

import type { SessionParams, SessionResponse } from "@archboard/codex-app-server/session";
import {
	COORDINATOR_EFFORT,
	COORDINATOR_MODEL,
	createCoordinatorSettingsUpdateParams,
	createCoordinatorThreadStartParams,
	listCoordinatorModels,
	selectCoordinatorModel,
} from "#runtime/services/coordinator/model.ts";
import { type CoordinatorModel } from "#runtime/protocol/coordinator/contract.ts";
import { type CodexCoordinatorError } from "#runtime/protocol/coordinator/contract.ts";
import { createIdentityAuthority } from "@archboard/codex-app-server/identity";

const WORKING_DIRECTORY = "/state/codex-workbench/coordinator";

async function expectCoordinatorCode(
	promise: Promise<unknown>,
	code: CodexCoordinatorError["code"],
): Promise<void> {
	try {
		await promise;
		throw new Error("expected coordinator operation to fail");
	} catch (error) {
		expect(error).toMatchObject({ code });
	}
}

function model(overrides: Partial<CoordinatorModel> = {}): CoordinatorModel {
	return {
		id: COORDINATOR_MODEL,
		model: COORDINATOR_MODEL,
		upgrade: null,
		upgradeInfo: null,
		availabilityNux: null,
		displayName: "Luna",
		description: "coordinator fixture",
		modelSpecialty: null,
		hidden: false,
		supportedReasoningEfforts: [{ reasoningEffort: COORDINATOR_EFFORT, description: "fixture" }],
		defaultReasoningEffort: COORDINATOR_EFFORT,
		inputModalities: ["text"],
		supportsPersonality: false,
		multiAgentVersion: null,
		additionalSpeedTiers: [],
		serviceTiers: [],
		defaultServiceTier: null,
		availableAccessPrograms: null,
		isDefault: true,
		...overrides,
	};
}

class ModelPort {
	readonly requests: Array<SessionParams<"model/list"> | undefined> = [];

	constructor(private readonly pages: ReadonlyMap<string | null, SessionResponse<"model/list">>) {}

	async modelList(params?: SessionParams<"model/list">): Promise<SessionResponse<"model/list">> {
		this.requests.push(params);
		const page = this.pages.get(params?.cursor ?? null);
		if (page === undefined) {
			throw new Error(`no page for ${params?.cursor ?? null}`);
		}
		return page;
	}
}

describe("coordinator model and literal profile", () => {
	test("exhausts every model/list page and selects advertised priority", async () => {
		const port = new ModelPort(
			new Map([
				[
					null,
					{ data: [model({ model: "other-model", id: "other-model" })], nextCursor: "page-2" },
				],
				[
					"page-2",
					{
						data: [
							model({ serviceTiers: [{ id: "priority", name: "Priority", description: "" }] }),
						],
						nextCursor: null,
					},
				],
			]),
		);

		const models = await listCoordinatorModels(port);
		const selection = selectCoordinatorModel(models);

		expect(port.requests).toEqual([
			{ cursor: null, limit: 100 },
			{ cursor: "page-2", limit: 100 },
		]);
		expect(models).toHaveLength(2);
		expect(selection.model.model).toBe(COORDINATOR_MODEL);
		expect(selection.configuredServiceTier).toBe("priority");
	});

	test("refuses absent, ambiguous, and effort-incompatible coordinator models", () => {
		expect(() => selectCoordinatorModel([])).toThrowError(
			expect.objectContaining({ code: "model_unavailable" }),
		);
		expect(() => selectCoordinatorModel([model(), model()])).toThrowError(
			expect.objectContaining({ code: "model_ambiguous" }),
		);
		expect(() =>
			selectCoordinatorModel([
				model({
					supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "fixture" }],
				}),
			]),
		).toThrowError(expect.objectContaining({ code: "unsupported_effort" }));
	});

	test("fails closed on a repeated model/list cursor", async () => {
		const port = new ModelPort(
			new Map([
				[null, { data: [model()], nextCursor: "same" }],
				["same", { data: [], nextCursor: "same" }],
			]),
		);

		await expectCoordinatorCode(listCoordinatorModels(port), "repeated_cursor");
	});

	test("omits serviceTier when priority is not advertised", () => {
		const params = createCoordinatorThreadStartParams(
			WORKING_DIRECTORY,
			null,
			TEST_INSTRUCTIONS.coordinator,
		);

		expect(JSON.stringify(params)).toBe(
			JSON.stringify({
				model: COORDINATOR_MODEL,
				allowProviderModelFallback: false,
				cwd: WORKING_DIRECTORY,
				runtimeWorkspaceRoots: [WORKING_DIRECTORY],
				// Project docs are off: AGENTS.md is for the workhorse, never the coordinator.
				config: { features: { realtime_conversation: true }, project_doc_max_bytes: 0 },
				serviceName: "test-host",
				developerInstructions: TEST_INSTRUCTIONS.coordinator.instructions.text,
				ephemeral: false,
				historyMode: "paginated",
				sessionStartSource: "startup",
				threadSource: "test-host",
				dynamicTools: [TEST_TOOLS.workhorse.namespace, TEST_TOOLS.voice.namespace],
				experimentalRawEvents: false,
			}),
		);
		expect(Object.hasOwn(params, "serviceTier")).toBe(false);
		for (const key of [
			"modelProvider",
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
		]) {
			expect(Object.hasOwn(params, key)).toBe(false);
		}
	});

	test("includes only the advertised priority tier and sends the exact one-update body", () => {
		const priority = createCoordinatorThreadStartParams(
			WORKING_DIRECTORY,
			"priority",
			TEST_INSTRUCTIONS.coordinator,
		);
		expect(priority.serviceTier).toBe("priority");
		expect(Object.keys(priority)).toEqual([
			"model",
			"allowProviderModelFallback",
			"serviceTier",
			"cwd",
			"runtimeWorkspaceRoots",
			"config",
			"serviceName",
			"developerInstructions",
			"ephemeral",
			"historyMode",
			"sessionStartSource",
			"threadSource",
			"dynamicTools",
			"experimentalRawEvents",
		]);

		const threadId = createIdentityAuthority().decoder.adoptThreadId("coordinator-thread");
		expect(createCoordinatorSettingsUpdateParams(threadId, "priority")).toEqual({
			threadId,
			model: COORDINATOR_MODEL,
			serviceTier: "priority",
			effort: COORDINATOR_EFFORT,
		});
		expect(createCoordinatorSettingsUpdateParams(threadId, null)).toEqual({
			threadId,
			model: COORDINATOR_MODEL,
			effort: COORDINATOR_EFFORT,
		});
	});
});
