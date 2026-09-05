import { describe, expect, test } from "bun:test";
import path from "node:path";

import {
	ARCHBOARD_VOICE_NAMESPACE,
	ARCHBOARD_VOICE_TOOL_CONTRACTS,
	ARCHBOARD_WORKHORSE_NAMESPACE,
	ARCHBOARD_WORKHORSE_TOOL_CONTRACTS,
	COORDINATOR_IDENTITY,
	COORDINATOR_TOOL_CATALOGUE,
	COORDINATOR_TOOL_CONTRACTS,
	CoordinatorToolContractSchema,
	DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE,
	DYNAMIC_TOOL_REFUSAL_REASONS,
	DynamicToolEnvelopeSchema,
	DynamicToolResponseSchema,
	UnknownDynamicToolResponseSchema,
} from "../index.js";
import {
	definitionsOutsideOwner,
	hasJsonCatalogueDefinition,
	hasTypeScriptCatalogueDefinition,
	ownerOfDefinition,
	realCatalogueDefinitions,
} from "./catalogue-ownership.js";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const ownerRoot = path.join(repoRoot, "src/runtime/codex-coordinator-tool-contract");

function expectDeepFrozen(value: unknown): void {
	expect(Object.isFrozen(value)).toBe(true);
	if (typeof value !== "object" || value === null) {
		return;
	}
	for (const child of Object.values(value)) {
		expectDeepFrozen(child);
	}
}

function objectKeys(value: unknown): string[] {
	return typeof value === "object" && value !== null ? Object.keys(value) : [];
}

describe("dynamic wire envelopes and metadata", () => {
	test("accepts one canonical envelope and one inputText item", () => {
		const envelope = { tag: "ok", operationId: "op-1", value: { threadId: "thread-1" } } as const;
		expect(DynamicToolEnvelopeSchema.parse(envelope)).toEqual(envelope);
		expect(
			DynamicToolResponseSchema.parse({
				contentItems: [{ type: "inputText", text: JSON.stringify(envelope) }],
				success: true,
			}),
		).toEqual({
			contentItems: [{ type: "inputText", text: JSON.stringify(envelope) }],
			success: true,
		});
		expect(
			DynamicToolEnvelopeSchema.parse({
				tag: "refused",
				reason: "not_ready",
				message: "Inspect the linked workhorse first.",
			}),
		).toEqual({
			tag: "refused",
			reason: "not_ready",
			message: "Inspect the linked workhorse first.",
		});
		expect(
			DynamicToolEnvelopeSchema.parse({
				tag: "outcome_unknown",
				operationId: "op-2",
				message: DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE,
			}),
		).toEqual({
			tag: "outcome_unknown",
			operationId: "op-2",
			message: DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE,
		});
		expect(() => DynamicToolResponseSchema.parse({ contentItems: [], success: true })).toThrow();
		expect(() =>
			DynamicToolResponseSchema.parse({
				contentItems: [
					{ type: "inputText", text: "x" },
					{ type: "inputText", text: "y" },
				],
				success: true,
			}),
		).toThrow();
		expect(() =>
			DynamicToolEnvelopeSchema.parse({
				tag: "outcome_unknown",
				operationId: "op-2",
				message: "lost",
			}),
		).toThrow();
		expect(() =>
			DynamicToolResponseSchema.parse({
				contentItems: [{ type: "inputText", text: ` ${JSON.stringify(envelope)}` }],
				success: true,
			}),
		).toThrow();
		expect(
			UnknownDynamicToolResponseSchema.parse({
				contentItems: [
					{
						type: "inputText",
						text: JSON.stringify({
							tag: "refused",
							reason: "invalid_call",
							message: "The call was not understood.",
						}),
					},
				],
				success: false,
			}),
		).toMatchObject({ success: false });
		expect(() =>
			DynamicToolResponseSchema.parse({
				contentItems: [{ type: "inputText", text: JSON.stringify(envelope) }],
				success: false,
			}),
		).toThrow();
		expect(() =>
			DynamicToolResponseSchema.parse({
				contentItems: [
					{
						type: "inputText",
						text: JSON.stringify({
							tag: "refused",
							reason: "not_ready",
							message: "Inspect the linked workhorse first.",
						}),
					},
				],
				success: false,
			}),
		).toThrow();
	});

	test("keeps each entry's authority, links, result, and refusal set explicit", () => {
		expect(
			COORDINATOR_TOOL_CONTRACTS.map(
				({
					name,
					namespace,
					authorityTarget,
					callerRole,
					requiredLinks,
					successResult,
					refusalErrors,
				}) => ({
					name,
					namespace,
					authorityTarget,
					callerRole,
					requiredLinks,
					successFields: objectKeys(successResult.valueSchema["properties"]),
					refusalErrors,
				}),
			),
		).toEqual([
			{
				name: "inspect_workhorse",
				namespace: "archboard_workhorse",
				authorityTarget: "host_bound_workhorse",
				callerRole: "coordinator",
				requiredLinks: [
					"child",
					"epoch",
					"threadId",
					"turnId",
					"callId",
					"namespace",
					"tool",
					"manifestHash",
					"workhorseThreadId",
				],
				successFields: ["threadId", "status", "activeTurnId", "queuedSubmissionIds"],
				refusalErrors: [
					"invalid_call",
					"not_ready",
					"not_loaded",
					"system_error",
					"stale_child",
					"prior_epoch",
					"unknown_provenance",
				],
			},
			{
				name: "delegate_to_workhorse",
				namespace: "archboard_workhorse",
				authorityTarget: "host_bound_workhorse",
				callerRole: "coordinator",
				requiredLinks: [
					"child",
					"epoch",
					"threadId",
					"turnId",
					"callId",
					"namespace",
					"tool",
					"manifestHash",
					"workhorseThreadId",
				],
				successFields: ["mode", "clientUserMessageId", "queuedSubmissionId", "turnId"],
				refusalErrors: [
					"invalid_call",
					"not_ready",
					"not_loaded",
					"not_controllable",
					"system_error",
					"stale_child",
					"prior_epoch",
					"unknown_provenance",
					"approval_declined",
					"busy",
				],
			},
			{
				name: "manage_workhorse_queue",
				namespace: "archboard_workhorse",
				authorityTarget: "host_created_workhorse_queue",
				requiredLinks: [
					"child",
					"epoch",
					"threadId",
					"turnId",
					"callId",
					"namespace",
					"tool",
					"manifestHash",
					"workhorseThreadId",
					"queuedSubmissionIds",
				],
				callerRole: "coordinator",
				successFields: ["operation", "queuedSubmissionIds"],
				refusalErrors: [
					"invalid_call",
					"not_ready",
					"not_loaded",
					"not_controllable",
					"system_error",
					"stale_child",
					"prior_epoch",
					"unknown_provenance",
					"approval_declined",
					"busy",
					"expired",
					"unsupported",
				],
			},
			{
				name: "steer_workhorse",
				namespace: "archboard_workhorse",
				authorityTarget: "host_proven_workhorse_turn",
				callerRole: "coordinator",
				requiredLinks: [
					"child",
					"epoch",
					"threadId",
					"turnId",
					"callId",
					"namespace",
					"tool",
					"manifestHash",
					"workhorseThreadId",
					"expectedTurnId",
				],
				successFields: ["turnId", "delivery"],
				refusalErrors: [
					"invalid_call",
					"not_ready",
					"not_loaded",
					"not_controllable",
					"system_error",
					"stale_child",
					"prior_epoch",
					"unknown_provenance",
					"approval_declined",
					"busy",
				],
			},
			{
				name: "resolve_spoken_approval",
				namespace: "archboard_voice",
				authorityTarget: "host_validated_spoken_approval",
				callerRole: "coordinator",
				requiredLinks: [
					"child",
					"epoch",
					"threadId",
					"turnId",
					"callId",
					"namespace",
					"tool",
					"manifestHash",
					"realtimeSessionId",
					"classifierTurnId",
					"finalUserItemId",
					"finalUserSequence",
					"effectFingerprint",
					"expiry",
				],
				successFields: ["verdict", "settlement"],
				refusalErrors: [
					"invalid_call",
					"not_ready",
					"not_loaded",
					"system_error",
					"stale_child",
					"prior_epoch",
					"unknown_provenance",
					"approval_declined",
					"expired",
					"unsupported",
				],
			},
		]);
	});

	test("freezes canonical inputs, metadata, and catalogue aggregate", () => {
		for (const contract of COORDINATOR_TOOL_CONTRACTS) {
			expect(CoordinatorToolContractSchema.parse(contract)).toEqual<unknown>(contract);
		}
		for (const value of [
			ARCHBOARD_WORKHORSE_NAMESPACE,
			ARCHBOARD_VOICE_NAMESPACE,
			COORDINATOR_IDENTITY,
			ARCHBOARD_WORKHORSE_TOOL_CONTRACTS,
			ARCHBOARD_VOICE_TOOL_CONTRACTS,
			COORDINATOR_TOOL_CATALOGUE,
			DYNAMIC_TOOL_REFUSAL_REASONS,
		]) {
			expectDeepFrozen(value);
		}
	});
});

test("structurally detects outside-owner namespace definitions without prose false positives", () => {
	const fakeTypeScript = `const duplicate = { type: "namespace", name: "archboard_workhorse", tools: [] };`;
	const fakeCatalogue = `const duplicate = { namespace: "archboard_voice", tools: [] };`;
	const fakeJson = JSON.stringify({
		type: "namespace",
		name: "archboard_voice",
		description: "duplicate",
		tools: [],
	});
	const importOnly = `import { ARCHBOARD_WORKHORSE_NAMESPACE } from "./catalogue.js";`;
	const proseOnly = `const note = "archboard_workhorse is named here, not defined";`;

	expect(hasTypeScriptCatalogueDefinition(fakeTypeScript)).toBe(true);
	expect(hasTypeScriptCatalogueDefinition(fakeCatalogue)).toBe(true);
	expect(hasJsonCatalogueDefinition(fakeJson)).toBe(true);
	expect(hasTypeScriptCatalogueDefinition(importOnly)).toBe(false);
	expect(hasTypeScriptCatalogueDefinition(proseOnly)).toBe(false);
	expect(
		definitionsOutsideOwner(
			[
				{ fileName: path.join(repoRoot, "src/fake-catalogue.ts"), source: fakeTypeScript },
				{ fileName: path.join(repoRoot, "src/fake-manifest.json"), source: fakeJson },
				{ fileName: path.join(repoRoot, "src/prose.ts"), source: proseOnly },
			],
			ownerRoot,
		),
	).toEqual([
		path.join(repoRoot, "src/fake-catalogue.ts"),
		path.join(repoRoot, "src/fake-manifest.json"),
	]);
});

test("keeps real namespace definitions in one owner", () => {
	const definitions = realCatalogueDefinitions(path.join(repoRoot, "src"));
	expect(definitions.length).toBeGreaterThanOrEqual(2);
	expect(definitions.every((file) => file.startsWith(ownerRoot + path.sep))).toBe(true);
	expect(new Set(definitions.map((file) => ownerOfDefinition(file, ownerRoot)))).toEqual(
		new Set([ownerRoot]),
	);
	expect(definitions.filter((file) => path.extname(file) === ".json")).toHaveLength(2);
});
