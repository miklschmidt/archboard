import { CODEX_PROTOCOL_VERSION } from "@archboard/codex-app-server/protocol";
import { describe, expect, test } from "bun:test";

import {
	WORKHORSE_TOOL_NAMES,
	assertCanonicalManifest,
} from "#runtime/protocol/coordinator-tool-contract/manifest.ts";
import { createVoiceToolset } from "#runtime/rules/host/toolset.ts";
import {
	CODEX_QUEUE_OPERATION_CONTRACTS,
	CODEX_QUEUE_PARAMETER_SCHEMAS,
	CODEX_QUEUE_PROTOCOL,
} from "#runtime/protocol/coordinator-tool-contract/queue-operations.ts";
import {
	COORDINATOR_IDENTITY,
	CoordinatorIdentitySchema,
} from "#runtime/protocol/coordinator-tool-contract/contracts.ts";
import {
	InspectWorkhorseResultSchema,
	DelegateToWorkhorseResultSchema,
	ManageWorkhorseQueueResultSchema,
	ResolveSpokenApprovalResultSchema,
	SteerWorkhorseResultSchema,
	StopWorkhorsesResultSchema,
	parseCoordinatorToolResult,
} from "#runtime/protocol/coordinator-tool-contract/tool-results.ts";
import {
	ManageWorkhorseQueueInputSchema,
	QueueAddInputSchema,
	QueueDeleteInputSchema,
	QueueListInputSchema,
	QueueReorderInputSchema,
	QueueStartInputSchema,
	QueueUpdateInputSchema,
	parseCoordinatorToolInput,
	VOICE_TOOL_INPUT_SCHEMAS,
	WORKHORSE_TOOL_INPUT_SCHEMAS,
} from "#runtime/protocol/coordinator-tool-contract/tool-inputs.ts";
import {
	ThreadQueueAddParamsSchema,
	ThreadQueueDeleteParamsSchema,
	ThreadQueueListParamsSchema,
	ThreadQueueReorderParamsSchema,
	ThreadQueueStartParamsSchema,
	ThreadQueueUpdateParamsSchema,
} from "@archboard/codex-app-server/session";

import {
	QUEUE_OPERATION_SNAPSHOT,
	VOICE_MANIFEST_SNAPSHOT,
	WORKHORSE_MANIFEST_SNAPSHOT,
} from "#tests/runtime/protocol/coordinator-tool-contract/fixtures.ts";

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

describe("coordinator namespace manifests", () => {
	test("fills each role's reviewed template with the host's names, byte for byte", () => {
		expect(WORKHORSE_TOOL_NAMESPACE).toEqual(WORKHORSE_MANIFEST_SNAPSHOT);
		expect(VOICE_TOOL_NAMESPACE).toEqual(VOICE_MANIFEST_SNAPSHOT);
		expect(JSON.parse(NAMED.workhorse.text)).toEqual(WORKHORSE_MANIFEST_SNAPSHOT);
		expect(JSON.parse(VOICE_TOOLS_MANIFEST_JSON)).toEqual(VOICE_MANIFEST_SNAPSHOT);
		expect([NAMED.workhorse.sha256, NAMED.voice.sha256, NAMED.coordinator.sha256]).toEqual([
			"07dc953628a28401b856d1092412116fd3b876dcc9ffd26d1c77c80d47e2415a",
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

	test("keeps the exact coordinator identity and eager tool order", () => {
		expect(CoordinatorIdentitySchema.parse(COORDINATOR_IDENTITY)).toEqual(
			JSON.parse(JSON.stringify(COORDINATOR_IDENTITY)),
		);
		expect(COORDINATOR_IDENTITY.dynamicTools).toEqual(["workhorse", "voice"]);
		expect(WORKHORSE_TOOL_NAMESPACE.tools.map((tool) => tool.name)).toEqual([
			...WORKHORSE_TOOL_NAMES,
		]);
		expect(VOICE_TOOL_NAMESPACE.tools.map((tool) => tool.name)).toEqual([
			"resolve_spoken_approval",
		]);
	});

	test("rejects missing, extra, reordered, and ambiguous manifest mutations", () => {
		const missing = structuredClone(WORKHORSE_TOOL_NAMESPACE) as unknown as {
			tools: unknown[];
		};
		missing.tools.pop();
		expect(() => assertCanonicalManifest(NAMED.workhorse, missing)).toThrow();

		const extra = structuredClone(WORKHORSE_TOOL_NAMESPACE) as unknown as {
			tools: unknown[];
		};
		extra.tools.push(structuredClone(extra.tools[0]!));
		expect(() => assertCanonicalManifest(NAMED.workhorse, extra)).toThrow();

		const reordered = structuredClone(WORKHORSE_TOOL_NAMESPACE) as unknown as {
			tools: unknown[];
		};
		reordered.tools.reverse();
		expect(() => assertCanonicalManifest(NAMED.workhorse, reordered)).toThrow();

		const vague = structuredClone(VOICE_TOOL_NAMESPACE) as unknown as {
			tools: Array<{ description: string }>;
		};
		vague.tools[0]!.description = "Do the thing.";
		expect(() => assertCanonicalManifest(NAMED.voice, vague)).toThrow();

		const byteMutation = VOICE_TOOLS_MANIFEST_JSON.replace(
			"resolve_spoken_approval",
			"resolve_spoken_approval_changed",
		);
		expect(() => assertCanonicalManifest(NAMED.voice, byteMutation)).toThrow();
	});
});

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
			expect(ManageWorkhorseQueueInputSchema.parse(input)).toEqual(
				JSON.parse(JSON.stringify(input)),
			);
		}
		expect(() =>
			ManageWorkhorseQueueInputSchema.parse({ checkout: "/work/payments", operation: "pause" }),
		).toThrow();
		expect(() =>
			ManageWorkhorseQueueInputSchema.parse({
				checkout: "/work/payments",
				operation: "list",
				prompt: "x",
			}),
		).toThrow();
		expect(() =>
			ManageWorkhorseQueueInputSchema.parse({
				checkout: "/work/payments",
				operation: "reorder",
				orderedSubmissionIds: ["x", "x"],
			}),
		).toThrow();
		expect(() =>
			ManageWorkhorseQueueInputSchema.parse({
				checkout: "/work/payments",
				operation: "list",
				revision: 1,
			}),
		).toThrow();
		expect(QueueListInputSchema.parse({ checkout: "/work/payments", operation: "list" })).toEqual({
			checkout: "/work/payments",
			operation: "list",
		});
		expect(
			QueueAddInputSchema.parse({ checkout: "/work/payments", operation: "add", prompt: "x" }),
		).toEqual({
			checkout: "/work/payments",
			operation: "add",
			prompt: "x",
		});
		expect(
			QueueUpdateInputSchema.parse({
				checkout: "/work/payments",
				operation: "update",
				submissionId: "q",
				prompt: "x",
			}),
		).toEqual({ checkout: "/work/payments", operation: "update", submissionId: "q", prompt: "x" });
		expect(
			QueueDeleteInputSchema.parse({
				checkout: "/work/payments",
				operation: "delete",
				submissionId: "q",
			}),
		).toEqual({
			checkout: "/work/payments",
			operation: "delete",
			submissionId: "q",
		});
		expect(
			QueueReorderInputSchema.parse({
				checkout: "/work/payments",
				operation: "reorder",
				orderedSubmissionIds: ["q"],
			}),
		).toEqual({ checkout: "/work/payments", operation: "reorder", orderedSubmissionIds: ["q"] });
		expect(
			QueueStartInputSchema.parse({
				checkout: "/work/payments",
				operation: "start",
				submissionId: "q",
			}),
		).toEqual({
			checkout: "/work/payments",
			operation: "start",
			submissionId: "q",
		});
	});

	test("mirrors the pinned Codex queue parameter fields", () => {
		const textInput = { type: "text" as const, text: "queue prompt", text_elements: [] };
		expect(
			ThreadQueueAddParamsSchema.parse({
				threadId: "thread-1",
				input: [textInput],
				clientUserMessageId: "client-1",
			}),
		).toEqual(
			JSON.parse(
				JSON.stringify({
					threadId: "thread-1",
					input: [textInput],
					clientUserMessageId: "client-1",
				}),
			),
		);
		expect(
			ThreadQueueListParamsSchema.parse({ threadId: "thread-1", cursor: null, limit: null }),
		).toEqual({ threadId: "thread-1", cursor: null, limit: null });
		expect(
			ThreadQueueUpdateParamsSchema.parse({
				threadId: "thread-1",
				queuedSubmissionId: "q",
				input: [textInput],
			}),
		).toEqual({ threadId: "thread-1", queuedSubmissionId: "q", input: [textInput] });
		expect(
			ThreadQueueDeleteParamsSchema.parse({ threadId: "thread-1", queuedSubmissionId: "q" }),
		).toEqual({ threadId: "thread-1", queuedSubmissionId: "q" });
		expect(
			ThreadQueueReorderParamsSchema.parse({
				threadId: "thread-1",
				queuedSubmissionIds: ["q-2", "q-1"],
			}),
		).toEqual({ threadId: "thread-1", queuedSubmissionIds: ["q-2", "q-1"] });
		expect(
			ThreadQueueStartParamsSchema.parse({ threadId: "thread-1", queuedSubmissionId: null }),
		).toEqual({ threadId: "thread-1", queuedSubmissionId: null });
		for (const schema of Object.values(CODEX_QUEUE_PARAMETER_SCHEMAS)) {
			expect(() => schema.parse({ threadId: "thread-1", revision: 1 })).toThrow();
		}
		expect(CODEX_QUEUE_OPERATION_CONTRACTS.map(({ operation }) => operation)).toEqual([
			...QUEUE_OPERATION_SNAPSHOT,
		]);
		expect(CODEX_QUEUE_PROTOCOL).toEqual({
			protocol: "codex-app-server",
			version: CODEX_PROTOCOL_VERSION,
			operations: [...QUEUE_OPERATION_SNAPSHOT],
		});
	});

	test("validates only the declared tool inputs and closed results", () => {
		expect(
			parseCoordinatorToolInput("workhorse", "inspect_workhorse", {
				checkout: "/work/payments",
			}),
		).toEqual({ checkout: "/work/payments" });
		// Every workhorse tool names the checkout whose workhorse it works with.
		expect(() => parseCoordinatorToolInput("workhorse", "inspect_workhorse", {})).toThrow();
		expect(
			parseCoordinatorToolInput("workhorse", "delegate_to_workhorse", {
				checkout: "/work/payments",
				input: "inspect",
				transcriptDelta: "heard",
			}),
		).toEqual({ checkout: "/work/payments", input: "inspect", transcriptDelta: "heard" });
		expect(
			parseCoordinatorToolInput("voice", "resolve_spoken_approval", {
				verdict: "accept",
			}),
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
		expect(parseCoordinatorToolInput("workhorse", "stop_workhorses", {})).toEqual({});
		expect(() =>
			parseCoordinatorToolInput("workhorse", "stop_workhorses", {
				checkout: "/work/payments",
			}),
		).toThrow();
		expect(Object.keys(WORKHORSE_TOOL_INPUT_SCHEMAS)).toEqual([
			"inspect_workhorse",
			"delegate_to_workhorse",
			"manage_workhorse_queue",
			"steer_workhorse",
			"stop_workhorses",
		]);
		expect(Object.keys(VOICE_TOOL_INPUT_SCHEMAS)).toEqual(["resolve_spoken_approval"]);

		const values = [
			[
				InspectWorkhorseResultSchema,
				{ threadId: "thread-1", status: "idle", activeTurnId: null, queuedSubmissionIds: [] },
			],
			[
				DelegateToWorkhorseResultSchema,
				{
					mode: "queued",
					clientUserMessageId: "client-1",
					queuedSubmissionId: "q-1",
					turnId: null,
				},
			],
			[ManageWorkhorseQueueResultSchema, { operation: "list", queuedSubmissionIds: [] }],
			[SteerWorkhorseResultSchema, { turnId: "turn-1", delivery: "delivered" }],
			[
				StopWorkhorsesResultSchema,
				{
					stopped: [
						{ checkout: "/work/payments", outcome: "interrupt_sent" },
						{ checkout: "/work/billing", outcome: "idle" },
					],
				},
			],
			[ResolveSpokenApprovalResultSchema, { verdict: "decline", settlement: "not_delivered" }],
		] as const;
		for (const [schema, value] of values) {
			expect(schema.parse(value)).toEqual(JSON.parse(JSON.stringify(value)));
		}
		expect(() =>
			parseCoordinatorToolResult("inspect_workhorse", {
				threadId: "thread-1",
				status: "idle",
				activeTurnId: null,
				queuedSubmissionIds: [],
				extra: true,
			}),
		).toThrow();
	});
});
