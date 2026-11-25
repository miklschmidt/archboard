import { describe, expect, test } from "bun:test";

import { createVoiceToolset } from "#runtime/host/toolset/rules/toolset.ts";
import { canonicalToolResult } from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/tool-results.ts";
import { parseCoordinatorToolInput } from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/tool-inputs.ts";

import {
	VOICE_MANIFEST_SNAPSHOT,
	WORKHORSE_MANIFEST_SNAPSHOT,
} from "#tests/runtime/voice/coordinator/tools-and-work/tool-contract/protocol/fixtures.ts";

// A host that keeps its names keeps its threads: Codex reuses a retained thread only while the
// bytes of its tools are unchanged, so the digests pin the reviewed templates filled with one
// host's names.
const NAMED = createVoiceToolset({
	productName: "Example",
	toolNamespaces: {
		workhorse: "example_workhorse",
		voice: "example_voice",
		coordinator: "example_coordinator",
	},
});
const WORKHORSE_TOOL_NAMESPACE = NAMED.workhorse.namespace;
const VOICE_TOOL_NAMESPACE = NAMED.voice.namespace;
const VOICE_TOOLS_MANIFEST_JSON = NAMED.voice.text;

/**
 * Verify that a host cannot mutate a reviewed toolset after its digest is computed.
 * @param value The aggregate or one of its entries.
 */
function expectDeepFrozen(value: unknown): void {
	if (typeof value !== "object" || value === null) return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) expectDeepFrozen(child);
}

describe("coordinator namespace manifests", () => {
	test("freezes the host toolset including its nested input schemas", () => {
		expectDeepFrozen(NAMED);
	});

	test("fills each role's reviewed template with the host's names, byte for byte", () => {
		expect(WORKHORSE_TOOL_NAMESPACE).toEqual(WORKHORSE_MANIFEST_SNAPSHOT);
		expect(VOICE_TOOL_NAMESPACE).toEqual(VOICE_MANIFEST_SNAPSHOT);
		expect(JSON.parse(NAMED.workhorse.text)).toEqual(WORKHORSE_MANIFEST_SNAPSHOT);
		expect(JSON.parse(VOICE_TOOLS_MANIFEST_JSON)).toEqual(VOICE_MANIFEST_SNAPSHOT);
		expect([NAMED.workhorse.sha256, NAMED.voice.sha256, NAMED.coordinator.sha256]).toEqual([
			"f369e65c258f7508c8ed1b608531a519c4f7d14aa0c9572517c1344c734a19ad",
			"92416eb7c07865e66fde019bb9a43f6422a1ba9d4b0993db2fa9dd8240bf8eea",
			"884f263d14421f061facdc23bf42c3fd4d956c36d6c74a2a229c793428080c15",
		]);
		const other = createVoiceToolset({
			productName: "Payments",
			toolNamespaces: { workhorse: "pay_work", voice: "pay_voice", coordinator: "pay_desk" },
		});
		expect(JSON.stringify(other).toLowerCase()).not.toContain("example");
		expect(other.coordinator.namespace.description).toContain("talk with Payments by voice");
		for (const namespace of [WORKHORSE_TOOL_NAMESPACE, VOICE_TOOL_NAMESPACE]) {
			expect(namespace.type).toBe("namespace");
			expect(namespace.tools.every((tool) => tool.type === "function")).toBe(true);
			expect(namespace.tools.every((tool) => !tool.deferLoading)).toBe(true);
			expect(
				namespace.tools.every((tool) => tool.inputSchema["additionalProperties"] === false),
			).toBe(true);
		}
	});

	test("keeps the eager tool order of each namespace", () => {
		expect(WORKHORSE_TOOL_NAMESPACE.tools.map((tool) => tool.name)).toEqual([
			"inspect_workhorse",
			"delegate_to_workhorse",
			"manage_workhorse_queue",
			"steer_workhorse",
			"stop_workhorses",
		]);
		expect(VOICE_TOOL_NAMESPACE.tools.map((tool) => tool.name)).toEqual([
			"resolve_spoken_approval",
		]);
	});
});

function queueInput(input: unknown): unknown {
	return parseCoordinatorToolInput("workhorse", "manage_workhorse_queue", input).input;
}

describe("dynamic tool schemas and queue protocol", () => {
	test("validates every operation-dependent queue input and rejects invented fields", () => {
		const valid = [
			{ checkout: "/work/payments", operation: "list" },
			{ checkout: "/work/payments", operation: "add", prompt: "Build the selected component." },
			{
				checkout: "/work/payments",
				operation: "update",
				submissionId: "queue-1",
				prompt: "Revise the component.",
			},
			{ checkout: "/work/payments", operation: "delete", submissionId: "queue-1" },
			{
				checkout: "/work/payments",
				operation: "reorder",
				orderedSubmissionIds: ["queue-2", "queue-1"],
			},
			{ checkout: "/work/payments", operation: "start", submissionId: "queue-1" },
		] as const;
		for (const input of valid) {
			expect(queueInput(input)).toEqual(JSON.parse(JSON.stringify(input)));
		}
		expect(() => queueInput({ checkout: "/work/payments", operation: "pause" })).toThrow();
		expect(() =>
			queueInput({ checkout: "/work/payments", operation: "list", prompt: "x" }),
		).toThrow();
		expect(() =>
			queueInput({
				checkout: "/work/payments",
				operation: "reorder",
				orderedSubmissionIds: ["x", "x"],
			}),
		).toThrow();
		expect(() =>
			queueInput({ checkout: "/work/payments", operation: "list", revision: 1 }),
		).toThrow();
	});

	test("validates only the declared tool inputs and closed results", () => {
		expect(
			parseCoordinatorToolInput("workhorse", "inspect_workhorse", { checkout: "/work/payments" }),
		).toEqual({ tool: "inspect_workhorse", input: { checkout: "/work/payments" } });
		// Every workhorse tool names the checkout whose workhorse it works with.
		expect(() => parseCoordinatorToolInput("workhorse", "inspect_workhorse", {})).toThrow();
		expect(
			parseCoordinatorToolInput("workhorse", "delegate_to_workhorse", {
				checkout: "/work/payments",
				input: "inspect",
				transcriptDelta: "heard",
			}).input,
		).toEqual({ checkout: "/work/payments", input: "inspect", transcriptDelta: "heard" });
		expect(
			parseCoordinatorToolInput("voice", "resolve_spoken_approval", { verdict: "accept" }).input,
		).toEqual({ verdict: "accept" });
		expect(() =>
			parseCoordinatorToolInput("workhorse", "inspect_workhorse", {
				checkout: "/work/payments",
				target: "other",
			}),
		).toThrow();
		expect(() =>
			parseCoordinatorToolInput("voice", "resolve_spoken_approval", { verdict: "maybe" }),
		).toThrow();
		expect(parseCoordinatorToolInput("workhorse", "stop_workhorses", {}).input).toEqual({});
		expect(() =>
			parseCoordinatorToolInput("workhorse", "stop_workhorses", { checkout: "/work/payments" }),
		).toThrow();
		// A namespace refuses a tool that only the other namespace declares.
		expect(() => parseCoordinatorToolInput("voice", "stop_workhorses", {})).toThrow();
		expect(() =>
			parseCoordinatorToolInput("workhorse", "resolve_spoken_approval", { verdict: "accept" }),
		).toThrow();

		const values = [
			[
				"inspect_workhorse",
				{
					threadId: "thread-1",
					status: "active",
					activeTurnId: "turn-1",
					request: "Rename the queue owner",
					recentProgress: ["Reading the queue module."],
					subAgents: [{ threadId: "thread-2", status: "active" }],
					queuedSubmissionIds: [],
					unavailable: ["queue"],
					lastStop: { outcome: "partial", remaining: [{ threadId: "thread-2", state: "running" }] },
				},
			],
			[
				"delegate_to_workhorse",
				{
					mode: "queued",
					clientUserMessageId: "client-1",
					queuedSubmissionId: "q-1",
					turnId: null,
				},
			],
			["manage_workhorse_queue", { operation: "list", queuedSubmissionIds: [] }],
			["steer_workhorse", { turnId: "turn-1", delivery: "delivered" }],
			[
				"stop_workhorses",
				{
					stopped: [
						{
							checkout: "/work/payments",
							outcome: "unconfirmed",
							remaining: [{ threadId: "thread-2", state: "unread" }],
							recovery: ["inspect_workhorse", "stop_workhorses"],
						},
						{ checkout: "/work/billing", outcome: "idle", remaining: [], recovery: [] },
					],
				},
			],
			["resolve_spoken_approval", { verdict: "decline", settlement: "not_delivered" }],
		] as const;
		for (const [tool, value] of values) {
			expect(canonicalToolResult(tool, value)).toEqual(JSON.parse(JSON.stringify(value)));
		}
		// A result keeps exactly its declared fields, and refuses one that lacks a declared field.
		const inspected = {
			threadId: "thread-1",
			status: "idle",
			activeTurnId: null,
			request: null,
			recentProgress: [],
			subAgents: [],
			queuedSubmissionIds: [],
			unavailable: [],
			lastStop: null,
		};
		expect(canonicalToolResult("inspect_workhorse", { ...inspected, extra: true })).toEqual(
			inspected,
		);
		expect(() =>
			canonicalToolResult("inspect_workhorse", {
				threadId: "thread-1",
				status: "idle",
				activeTurnId: null,
				queuedSubmissionIds: [],
			}),
		).toThrow();
	});
});
