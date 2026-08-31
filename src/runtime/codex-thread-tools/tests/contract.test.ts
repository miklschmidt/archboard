import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
	ARCHBOARD_APP_DYNAMIC_TOOLS,
	ARCHBOARD_APP_MANIFEST,
	ARCHBOARD_APP_MANIFEST_BYTES,
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
	ARCHBOARD_APP_TOOL_BINDING,
	ARCHBOARD_APP_TOOL_NAMES,
	DynamicToolCallResponseSchema,
	WAIT_THREADS_TIMEOUT_MAX_MS,
	archboardAppDynamicToolsFor,
	archboardAppToolBindingFor,
	assertCanonicalArchboardAppManifest,
	parseArchboardAppManifest,
	parseDynamicToolCallResponse,
	parseToolArguments,
	parseToolResultEnvelope,
} from "../index.js";
import { CODEX_BROWSER_COMMAND_LEASE_MS } from "../../../shared/timing/timing.js";
import {
	APPROVAL_REQUIRED_ENVELOPE,
	OUTCOME_UNKNOWN_ENVELOPE,
	REFUSED_ENVELOPE,
	VALID_ARGUMENTS,
	VALID_OK_VALUES,
	dynamicResponse,
	okEnvelope,
} from "./fixtures.js";

const MANIFEST_PATH = new URL("../archboard-app-manifest.json", import.meta.url);
const EXPECTED_MANIFEST_SHA256 = "df0fc2b1b33d985a7b84e54431162d6c00a3da0f8cecd98a18730e55bc7b272e";
const EXPECTED_WORKHORSE_SHA256 =
	"257b4ab944737418ee0713b4a748405446f8bc009d0dfc4557b099cd2c1038e6";

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function expectDeepFrozen(value: unknown): void {
	if (typeof value !== "object" || value === null) return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value as Record<string, unknown>)) expectDeepFrozen(child);
}

function expectRejected(action: () => unknown): void {
	expect(action).toThrow(TypeError);
}

describe("archboard_app manifest", () => {
	test("keeps the tracked bytes and independent digest stable", () => {
		const bytes = readFileSync(MANIFEST_PATH);
		expect(sha256(bytes)).toBe(EXPECTED_MANIFEST_SHA256);
		expect(ARCHBOARD_APP_MANIFEST_SHA256).toBe(EXPECTED_MANIFEST_SHA256);
		expect(ARCHBOARD_APP_MANIFEST_BYTES).toBe(bytes.toString("utf8"));
		expect(ARCHBOARD_APP_TOOL_NAMES).toEqual([
			"create_thread",
			"fork_thread",
			"list_threads",
			"read_thread",
			"send_message_to_thread",
			"wait_threads",
		]);
		expect(ARCHBOARD_APP_MANIFEST).toBe(ARCHBOARD_APP_NAMESPACE);
		expect(ARCHBOARD_APP_DYNAMIC_TOOLS).toEqual([ARCHBOARD_APP_NAMESPACE]);
		expectDeepFrozen(ARCHBOARD_APP_MANIFEST);
		expectDeepFrozen(ARCHBOARD_APP_DYNAMIC_TOOLS);
	});

	test("rejects mutations to reviewed prose, order, schema limits, and eager loading", () => {
		const proseMutation = ARCHBOARD_APP_MANIFEST_BYTES.replace(
			"Create one persistent Archboard Codex thread",
			"Create two persistent Archboard Codex threads",
		);
		const orderMutation = ARCHBOARD_APP_MANIFEST_BYTES.replace(
			'"name": "create_thread"',
			'"name": "__first_tool__"',
		)
			.replace('"name": "fork_thread"', '"name": "create_thread"')
			.replace('"name": "__first_tool__"', '"name": "fork_thread"');
		const limitMutation = ARCHBOARD_APP_MANIFEST_BYTES.replace(
			'"maxLength": 16384',
			'"maxLength": 16383',
		);
		const eagerMutation = ARCHBOARD_APP_MANIFEST_BYTES.replace(
			'"deferLoading": false',
			'"deferLoading": true',
		);
		for (const candidate of [proseMutation, orderMutation, limitMutation, eagerMutation])
			expectRejected(() => assertCanonicalArchboardAppManifest(candidate));
		expect(parseArchboardAppManifest(ARCHBOARD_APP_MANIFEST_BYTES)).toEqual(ARCHBOARD_APP_MANIFEST);
	});
});

describe("strict six-tool argument boundary", () => {
	test("accepts every reviewed argument shape and freezes parsed values", () => {
		for (const { name, value } of VALID_ARGUMENTS) {
			const parsed = parseToolArguments(name, value);
			expect(parsed as unknown).toEqual(value);
			expectDeepFrozen(parsed);
		}
	});

	test("rejects unknown fields, missing required fields, bad numbers, duplicates, and non-JSON values", () => {
		expectRejected(() => parseToolArguments("create_thread", { prompt: "go", extra: true }));
		expectRejected(() => parseToolArguments("create_thread", {}));
		expectRejected(() => parseToolArguments("fork_thread", { threadId: "thread-1", prompt: 1 }));
		expectRejected(() => parseToolArguments("list_threads", { limit: 101 }));
		expectRejected(() =>
			parseToolArguments("read_thread", { threadId: "thread-1", turnLimit: 21 }),
		);
		expectRejected(() => parseToolArguments("send_message_to_thread", { threadId: "thread-1" }));
		expectRejected(() =>
			parseToolArguments("wait_threads", { threadIds: ["thread-1", "thread-1"] }),
		);
		expectRejected(() => parseToolArguments("wait_threads", { threadIds: [] }));
		expectRejected(() =>
			parseToolArguments("wait_threads", { threadIds: ["thread-1"], timeoutMs: -1 }),
		);
		expectRejected(() =>
			parseToolArguments("wait_threads", { threadIds: ["thread-1"], timeoutMs: 120_001 }),
		);
		expectRejected(() => parseToolArguments("unknown_tool", {}));
		expectRejected(() => parseToolArguments("list_threads", undefined));
	});

	test("enforces code-point boundaries for manifest fields without a hidden byte cap", () => {
		expect(parseToolArguments("create_thread", { prompt: "p".repeat(16_384) })).toBeTruthy();
		expectRejected(() => parseToolArguments("create_thread", { prompt: "p".repeat(16_385) }));
		expect(parseToolArguments("list_threads", { cursor: "c".repeat(1_024) })).toBeTruthy();
		expectRejected(() => parseToolArguments("list_threads", { cursor: "c".repeat(1_025) }));
		expect(parseToolArguments("fork_thread", { threadId: "i".repeat(128) })).toBeTruthy();
		expectRejected(() => parseToolArguments("fork_thread", { threadId: "i".repeat(129) }));

		const exactUnicodePrompt = "😀".repeat(16_384);
		expect(Array.from(exactUnicodePrompt)).toHaveLength(16_384);
		expect(Buffer.byteLength(exactUnicodePrompt, "utf8")).toBe(65_536);
		expect(parseToolArguments("create_thread", { prompt: exactUnicodePrompt })).toBeTruthy();
		expectRejected(() =>
			parseToolArguments("create_thread", { prompt: `${exactUnicodePrompt}😀` }),
		);
		const exactMultibytePrompt = "é".repeat(16_384);
		expect(parseToolArguments("create_thread", { prompt: exactMultibytePrompt })).toBeTruthy();
		expectRejected(() =>
			parseToolArguments("create_thread", { prompt: `${exactMultibytePrompt}é` }),
		);
		expectRejected(() => parseToolArguments("create_thread", { prompt: "\ud800" }));
		expect(parseToolArguments("create_thread", { prompt: "a\0b" })).toEqual({ prompt: "a\0b" });
	});

	test("keeps explicit UTF-8 result fields bounded independently", () => {
		const listValue = VALID_OK_VALUES.list_threads as Record<string, unknown>;
		const exactCursor = "é".repeat(512);
		const value = { ...listValue, nextCursor: exactCursor };
		const envelope = JSON.stringify({ tag: "ok", operationId: "operation-1", value });
		expect(parseToolResultEnvelope("list_threads", envelope)).toMatchObject({
			tag: "ok",
			value: { nextCursor: exactCursor },
		});
		const tooLong = { ...listValue, nextCursor: `${exactCursor}é` };
		expectRejected(() =>
			parseToolResultEnvelope(
				"list_threads",
				JSON.stringify({ tag: "ok", operationId: "operation-1", value: tooLong }),
			),
		);
	});

	test("keeps wait timeout and target count at the reviewed boundaries", () => {
		expect(WAIT_THREADS_TIMEOUT_MAX_MS).toBe(120_000);
		expect(WAIT_THREADS_TIMEOUT_MAX_MS).toBeLessThan(CODEX_BROWSER_COMMAND_LEASE_MS);
		expect(parseToolArguments("wait_threads", { threadIds: ["t"], timeoutMs: 0 })).toBeTruthy();
		expect(
			parseToolArguments("wait_threads", {
				threadIds: ["1", "2", "3", "4", "5", "6", "7", "8"],
				timeoutMs: WAIT_THREADS_TIMEOUT_MAX_MS,
			}),
		).toBeTruthy();
		expectRejected(() =>
			parseToolArguments("wait_threads", {
				threadIds: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
			}),
		);
	});
});

describe("strict dynamic-tool result boundary", () => {
	test("accepts the closed ok value for each invoked tool", () => {
		for (const name of ARCHBOARD_APP_TOOL_NAMES) {
			const response = parseDynamicToolCallResponse(name, dynamicResponse(okEnvelope(name)));
			expect(response.success).toBe(true);
			expect(response.envelope).toEqual({
				tag: "ok",
				operationId: "operation-1",
				value: VALID_OK_VALUES[name],
			});
			expectDeepFrozen(response);
		}
	});

	test("correlates initial-turn delivery with identity fields and thread state", () => {
		const createVariants = [
			{
				threadId: "thread-1",
				state: "executable",
				initialTurn: {
					delivery: "delivered",
					turnId: "turn-1",
					operationId: "operation-2",
					reason: null,
				},
			},
			{
				threadId: "thread-1",
				state: "executable",
				initialTurn: {
					delivery: "not_delivered",
					turnId: null,
					operationId: "operation-2",
					reason: "The initial turn was refused before effect.",
				},
			},
			{
				threadId: "thread-1",
				state: "inspect_only",
				initialTurn: {
					delivery: "outcome_unknown",
					turnId: null,
					operationId: "operation-2",
					reason: "The initial turn settlement was lost.",
				},
			},
		];
		for (const value of createVariants)
			expect(
				parseToolResultEnvelope(
					"create_thread",
					JSON.stringify({ tag: "ok", operationId: "operation-1", value }),
				),
			).toMatchObject({ tag: "ok", value });

		const forkVariants = [
			{
				threadId: "thread-2",
				state: "executable",
				initialTurn: { delivery: "not_requested", turnId: null, operationId: null, reason: null },
			},
			...createVariants,
		];
		for (const value of forkVariants)
			expect(
				parseToolResultEnvelope(
					"fork_thread",
					JSON.stringify({ tag: "ok", operationId: "operation-1", value }),
				),
			).toMatchObject({ tag: "ok", value });

		const invalidCreateVariants = [
			{ state: "executable", initialTurn: createVariants[2]!.initialTurn },
			{ state: "inspect_only", initialTurn: createVariants[0]!.initialTurn },
			{
				state: "executable",
				initialTurn: {
					delivery: "delivered",
					turnId: null,
					operationId: "operation-2",
					reason: null,
				},
			},
			{
				state: "inspect_only",
				initialTurn: {
					delivery: "outcome_unknown",
					turnId: null,
					operationId: null,
					reason: "The initial turn settlement was lost.",
				},
			},
		];
		for (const value of invalidCreateVariants)
			expectRejected(() =>
				parseToolResultEnvelope(
					"create_thread",
					JSON.stringify({
						tag: "ok",
						operationId: "operation-1",
						value: { threadId: "thread-1", ...value },
					}),
				),
			);
		const invalidFork = {
			state: "inspect_only",
			initialTurn: { delivery: "not_requested", turnId: null, operationId: null, reason: null },
		};
		expectRejected(() =>
			parseToolResultEnvelope(
				"fork_thread",
				JSON.stringify({
					tag: "ok",
					operationId: "operation-1",
					value: { threadId: "thread-2", ...invalidFork },
				}),
			),
		);
	});

	test("accepts refused, approval-required, and uncertainty envelopes as successful calls", () => {
		const texts = [REFUSED_ENVELOPE, APPROVAL_REQUIRED_ENVELOPE, OUTCOME_UNKNOWN_ENVELOPE];
		for (const text of texts) {
			const parsed = parseDynamicToolCallResponse("send_message_to_thread", dynamicResponse(text));
			expect(parsed.success).toBe(true);
			expect(parsed.envelope.tag).not.toBe("ok");
		}
	});

	test("requires the invoked tool's value and rejects open or partial results", () => {
		const createThreadValue = VALID_OK_VALUES.create_thread as Record<string, unknown>;
		expectRejected(() => parseToolResultEnvelope("create_thread", okEnvelope("list_threads")));
		expectRejected(() =>
			parseToolResultEnvelope(
				"create_thread",
				JSON.stringify({
					tag: "ok",
					operationId: "operation-1",
					value: { ...createThreadValue, extra: true },
				}),
			),
		);
		expectRejected(() =>
			parseToolResultEnvelope(
				"create_thread",
				JSON.stringify({
					tag: "ok",
					operationId: "operation-1",
					value: {
						...createThreadValue,
						initialTurn: { delivery: "delivered", turnId: "turn-1", operationId: null },
					},
				}),
			),
		);
		expectRejected(() => parseToolResultEnvelope("not_a_tool", okEnvelope("list_threads")));
	});

	test("requires one canonical inputText response and matches the outer success flag", () => {
		const valid = dynamicResponse(okEnvelope("list_threads"));
		expect(DynamicToolCallResponseSchema.safeParse(valid).success).toBe(true);
		expectRejected(() =>
			parseDynamicToolCallResponse("list_threads", {
				contentItems: [
					{ type: "inputText", text: okEnvelope("list_threads") },
					{ type: "inputText", text: okEnvelope("list_threads") },
				],
				success: true,
			}),
		);
		expectRejected(() =>
			parseDynamicToolCallResponse("list_threads", {
				contentItems: [{ type: "inputImage", data: "image" }],
				success: true,
			}),
		);
		expectRejected(() =>
			parseDynamicToolCallResponse("list_threads", {
				contentItems: [{ type: "inputText", text: okEnvelope("list_threads"), extra: true }],
				success: true,
			}),
		);
		expectRejected(() =>
			parseDynamicToolCallResponse(
				"list_threads",
				dynamicResponse(okEnvelope("list_threads"), false),
			),
		);
		const refused = JSON.stringify({
			tag: "refused",
			reason: "invalid_call",
			message: "The call is invalid; correct the arguments and try again.",
		});
		expect(
			parseDynamicToolCallResponse("list_threads", dynamicResponse(refused, false)).success,
		).toBe(false);
	});

	test("rejects noncanonical, duplicate-key, and altered uncertainty JSON", () => {
		expectRejected(() => parseToolResultEnvelope("list_threads", ` ${okEnvelope("list_threads")}`));
		expectRejected(() =>
			parseToolResultEnvelope(
				"list_threads",
				'{"tag":"ok","tag":"ok","operationId":"operation-1","value":{"threads":[],"nextCursor":null}}',
			),
		);
		expectRejected(() =>
			parseToolResultEnvelope(
				"list_threads",
				JSON.stringify({
					tag: "outcome_unknown",
					operationId: "operation-3",
					message: "The request may have taken effect.",
				}),
			),
		);
	});
});

describe("fresh workhorse tool binding", () => {
	test("binds exact identity and reviewed workhorse bytes", () => {
		expect(ARCHBOARD_APP_TOOL_BINDING).toMatchObject({
			namespace: "archboard_app",
			manifestHash: EXPECTED_MANIFEST_SHA256,
			workhorseInstructionsSha256: EXPECTED_WORKHORSE_SHA256,
		});
		expect(ARCHBOARD_APP_TOOL_BINDING.dynamicTools).toBe(ARCHBOARD_APP_DYNAMIC_TOOLS);
		expectDeepFrozen(ARCHBOARD_APP_TOOL_BINDING);
	});

	test("installs tools only on a fresh Archboard-created workhorse start", () => {
		const eligible = {
			lifecycle: "fresh_workhorse_start",
			provenance: "archboard_created",
		} as const;
		expect(archboardAppToolBindingFor(eligible)).toBe(ARCHBOARD_APP_TOOL_BINDING);
		expect(archboardAppDynamicToolsFor(eligible)).toBe(ARCHBOARD_APP_DYNAMIC_TOOLS);
		for (const lifecycle of ["attach", "reconnect"] as const)
			for (const provenance of ["archboard_created", "attached", "foreign", "unknown"] as const) {
				const request = { lifecycle, provenance };
				expect(archboardAppToolBindingFor(request)).toBeNull();
				expect(archboardAppDynamicToolsFor(request)).toEqual([]);
			}
		for (const provenance of ["attached", "foreign", "unknown"] as const) {
			const request = { lifecycle: "fresh_workhorse_start" as const, provenance };
			expect(archboardAppToolBindingFor(request)).toBeNull();
		}
	});

	test("does not accept caller-supplied identity, manifest, or tool data", () => {
		expectRejected(() =>
			archboardAppToolBindingFor({
				lifecycle: "fresh_workhorse_start",
				provenance: "archboard_created",
				manifestHash: EXPECTED_MANIFEST_SHA256,
			}),
		);
		expectRejected(() =>
			archboardAppDynamicToolsFor({
				lifecycle: "fresh_workhorse_start",
				provenance: "archboard_created",
				dynamicTools: ARCHBOARD_APP_DYNAMIC_TOOLS,
			}),
		);
		expectRejected(() =>
			archboardAppToolBindingFor({ lifecycle: "fresh_start", provenance: "foreign" }),
		);
	});
});
