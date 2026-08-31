import { describe, expect, test } from "bun:test";

import {
	ARCHBOARD_VOICE_MANIFEST_JSON,
	ARCHBOARD_VOICE_NAMESPACE,
	ARCHBOARD_WORKHORSE_MANIFEST_JSON,
	ARCHBOARD_WORKHORSE_NAMESPACE,
	ARCHBOARD_WORKHORSE_TOOL_NAMES,
	CODEX_QUEUE_OPERATION_CONTRACTS,
	CODEX_QUEUE_PARAMETER_SCHEMAS,
	CODEX_QUEUE_PROTOCOL,
	COORDINATOR_IDENTITY,
	CoordinatorIdentitySchema,
	DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE,
	DynamicToolEnvelopeSchema,
	DynamicToolResponseSchema,
	InspectWorkhorseResultSchema,
	DelegateToWorkhorseResultSchema,
	ManageWorkhorseQueueInputSchema,
	ManageWorkhorseQueueResultSchema,
	QueueAddInputSchema,
	QueueDeleteInputSchema,
	QueueListInputSchema,
	QueueReorderInputSchema,
	QueueStartInputSchema,
	QueueUpdateInputSchema,
	ResolveSpokenApprovalResultSchema,
	SteerWorkhorseResultSchema,
	ThreadQueueAddParamsSchema,
	ThreadQueueDeleteParamsSchema,
	ThreadQueueListParamsSchema,
	ThreadQueueReorderParamsSchema,
	ThreadQueueStartParamsSchema,
	ThreadQueueUpdateParamsSchema,
	assertCanonicalManifest,
	parseCoordinatorToolInput,
	parseCoordinatorToolResult,
	verifyCoordinatorManifestIntegrity,
	VOICE_TOOL_INPUT_SCHEMAS,
	WORKHORSE_TOOL_INPUT_SCHEMAS,
} from "../index.js";
import {
	QUEUE_OPERATION_SNAPSHOT,
	VOICE_MANIFEST_SNAPSHOT,
	WORKHORSE_MANIFEST_SNAPSHOT,
} from "./fixtures.js";

describe("coordinator namespace manifests", () => {
	test("matches independent reviewed snapshots and fixed bytes", () => {
		expect(ARCHBOARD_WORKHORSE_NAMESPACE).toEqual(WORKHORSE_MANIFEST_SNAPSHOT);
		expect(ARCHBOARD_VOICE_NAMESPACE).toEqual(VOICE_MANIFEST_SNAPSHOT);
		expect(JSON.parse(ARCHBOARD_WORKHORSE_MANIFEST_JSON)).toEqual(WORKHORSE_MANIFEST_SNAPSHOT);
		expect(JSON.parse(ARCHBOARD_VOICE_MANIFEST_JSON)).toEqual(VOICE_MANIFEST_SNAPSHOT);
		expect(verifyCoordinatorManifestIntegrity()).toEqual({
			workhorseSha256: "fe8dd9bfaf91b37cbae31136ccdfc4eb1106728b40d2bc3ea01036606d6f748f",
			voiceSha256: "792d6ec96edc2fbffc8400ce0d1304a56662bee5436e95914505cb848356c393",
		});
		for (const namespace of [ARCHBOARD_WORKHORSE_NAMESPACE, ARCHBOARD_VOICE_NAMESPACE]) {
			expect(namespace.type).toBe("namespace");
			expect(namespace.tools.every((tool) => tool.type === "function")).toBe(true);
			expect(namespace.tools.every((tool) => !tool.deferLoading)).toBe(true);
			expect(namespace.tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(
				true,
			);
		}
	});

	test("keeps the exact coordinator identity and eager tool order", () => {
		expect(CoordinatorIdentitySchema.parse(COORDINATOR_IDENTITY)).toEqual(
			JSON.parse(JSON.stringify(COORDINATOR_IDENTITY)),
		);
		expect(COORDINATOR_IDENTITY.dynamicTools).toEqual(["archboard_workhorse", "archboard_voice"]);
		expect(ARCHBOARD_WORKHORSE_NAMESPACE.tools.map((tool) => tool.name)).toEqual([
			...ARCHBOARD_WORKHORSE_TOOL_NAMES,
		]);
		expect(ARCHBOARD_VOICE_NAMESPACE.tools.map((tool) => tool.name)).toEqual([
			"resolve_spoken_approval",
		]);
	});

	test("rejects missing, extra, reordered, and ambiguous manifest mutations", () => {
		const missing = structuredClone(ARCHBOARD_WORKHORSE_NAMESPACE) as unknown as {
			tools: unknown[];
		};
		missing.tools.pop();
		expect(() => assertCanonicalManifest("archboard_workhorse", missing)).toThrow();

		const extra = structuredClone(ARCHBOARD_WORKHORSE_NAMESPACE) as unknown as {
			tools: unknown[];
		};
		extra.tools.push(structuredClone(extra.tools[0]!));
		expect(() => assertCanonicalManifest("archboard_workhorse", extra)).toThrow();

		const reordered = structuredClone(ARCHBOARD_WORKHORSE_NAMESPACE) as unknown as {
			tools: unknown[];
		};
		reordered.tools.reverse();
		expect(() => assertCanonicalManifest("archboard_workhorse", reordered)).toThrow();

		const vague = structuredClone(ARCHBOARD_VOICE_NAMESPACE) as unknown as {
			tools: Array<{ description: string }>;
		};
		vague.tools[0]!.description = "Do the thing.";
		expect(() => assertCanonicalManifest("archboard_voice", vague)).toThrow();

		const byteMutation = ARCHBOARD_VOICE_MANIFEST_JSON.replace(
			"resolve_spoken_approval",
			"resolve_spoken_approval_changed",
		);
		expect(() => assertCanonicalManifest("archboard_voice", byteMutation)).toThrow();
	});
});

describe("dynamic tool schemas and queue protocol", () => {
	test("validates every operation-dependent queue input and rejects invented fields", () => {
		const valid = [
			{ operation: "list" },
			{ operation: "add", prompt: "Build the selected component." },
			{ operation: "update", submissionId: "queue-1", prompt: "Revise the component." },
			{ operation: "delete", submissionId: "queue-1" },
			{ operation: "reorder", orderedSubmissionIds: ["queue-2", "queue-1"] },
			{ operation: "start", submissionId: "queue-1" },
		] as const;
		for (const input of valid)
			expect(ManageWorkhorseQueueInputSchema.parse(input)).toEqual(
				JSON.parse(JSON.stringify(input)),
			);
		expect(() => ManageWorkhorseQueueInputSchema.parse({ operation: "pause" })).toThrow();
		expect(() =>
			ManageWorkhorseQueueInputSchema.parse({ operation: "list", prompt: "x" }),
		).toThrow();
		expect(() =>
			ManageWorkhorseQueueInputSchema.parse({
				operation: "reorder",
				orderedSubmissionIds: ["x", "x"],
			}),
		).toThrow();
		expect(() =>
			ManageWorkhorseQueueInputSchema.parse({ operation: "list", revision: 1 }),
		).toThrow();
		expect(QueueListInputSchema.parse({ operation: "list" })).toEqual({ operation: "list" });
		expect(QueueAddInputSchema.parse({ operation: "add", prompt: "x" })).toEqual({
			operation: "add",
			prompt: "x",
		});
		expect(
			QueueUpdateInputSchema.parse({ operation: "update", submissionId: "q", prompt: "x" }),
		).toEqual({ operation: "update", submissionId: "q", prompt: "x" });
		expect(QueueDeleteInputSchema.parse({ operation: "delete", submissionId: "q" })).toEqual({
			operation: "delete",
			submissionId: "q",
		});
		expect(
			QueueReorderInputSchema.parse({ operation: "reorder", orderedSubmissionIds: ["q"] }),
		).toEqual({ operation: "reorder", orderedSubmissionIds: ["q"] });
		expect(QueueStartInputSchema.parse({ operation: "start", submissionId: "q" })).toEqual({
			operation: "start",
			submissionId: "q",
		});
	});

	test("mirrors the exact 0.151.0 queue parameter fields", () => {
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
		for (const schema of Object.values(CODEX_QUEUE_PARAMETER_SCHEMAS))
			expect(() => schema.parse({ threadId: "thread-1", revision: 1 })).toThrow();
		expect(CODEX_QUEUE_OPERATION_CONTRACTS.map(({ operation }) => operation)).toEqual([
			...QUEUE_OPERATION_SNAPSHOT,
		]);
		expect(CODEX_QUEUE_PROTOCOL).toEqual({
			protocol: "codex-app-server",
			version: "0.151.0",
			operations: [...QUEUE_OPERATION_SNAPSHOT],
		});
	});

	test("validates only the declared tool inputs and closed results", () => {
		expect(parseCoordinatorToolInput("archboard_workhorse", "inspect_workhorse", {})).toEqual({});
		expect(
			parseCoordinatorToolInput("archboard_workhorse", "delegate_to_workhorse", {
				input: "inspect",
				transcriptDelta: "heard",
			}),
		).toEqual({ input: "inspect", transcriptDelta: "heard" });
		expect(
			parseCoordinatorToolInput("archboard_voice", "resolve_spoken_approval", {
				verdict: "accept",
			}),
		).toEqual({ verdict: "accept" });
		expect(() =>
			parseCoordinatorToolInput("archboard_workhorse", "inspect_workhorse", { target: "other" }),
		).toThrow();
		expect(() =>
			parseCoordinatorToolInput("archboard_voice", "resolve_spoken_approval", { verdict: "maybe" }),
		).toThrow();
		expect(Object.keys(WORKHORSE_TOOL_INPUT_SCHEMAS)).toEqual([
			"inspect_workhorse",
			"delegate_to_workhorse",
			"manage_workhorse_queue",
			"steer_workhorse",
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
			[ResolveSpokenApprovalResultSchema, { verdict: "decline", settlement: "not_delivered" }],
		] as const;
		for (const [schema, value] of values)
			expect(schema.parse(value)).toEqual(JSON.parse(JSON.stringify(value)));
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
});
