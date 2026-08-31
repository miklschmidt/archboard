import { describe, expect, test } from "bun:test";
import path from "node:path";

import {
	ArchboardContextSchema,
	AdditionalContextSchema,
	ThreadForkParamsSchema,
	ThreadInjectItemsParamsSchema,
	TurnStartParamsSchema,
	TurnSteerParamsSchema,
	createAdditionalContext,
	createSelfThreadForkParams,
	createTextUserInput,
	createThreadForkParams,
	createThreadInjectItemsParams,
	createTurnStartParams,
	createTurnSteerParams,
	encodeCanonicalContext,
	type ArchboardContext,
} from "../index.js";
import { contextFixture } from "./fixtures.js";

const CANONICAL_CWD = path.sep === "/" ? "/repo/archboard" : "C:\\repo\\archboard";

const CONTEXT_KEY_ORACLE = {
	root: [
		"schema",
		"paneId",
		"board",
		"threadLink",
		"child",
		"workhorse",
		"coordinator",
		"semantic",
		"focus",
		"selection",
		"claim",
		"ambiguity",
		"operation",
	],
	board: ["note", "version", "cursor"],
	threadLink: ["state", "reason"],
	child: ["id", "epoch"],
	workhorse: ["threadId", "turnId"],
	coordinator: ["threadId", "realtimeSessionId"],
	semantic: ["brief", "capturedAtMs", "freshUntilMs", "truncated"],
	focus: ["paneId", "capturedAtMs"],
	selection: ["elementIds", "capturedAtMs"],
	claim: ["holder", "doing"],
	operation: ["id", "kind", "rpc", "outcome"],
} as const;

const CONTEXT_DOMAIN_ORACLE = {
	schema: [1],
	threadLinkState: ["unbound", "executable", "inspect_only"],
	claimHolder: ["human", "agent", "none"],
	operationOutcome: ["delivered", "not_delivered", "outcome_unknown", null],
} as const;

function contextCopy(): ArchboardContext {
	return JSON.parse(encodeCanonicalContext(contextFixture)) as ArchboardContext;
}

function expectDeepFrozen(value: unknown): void {
	if (typeof value !== "object" || value === null) return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value as Record<string, unknown>)) expectDeepFrozen(child);
}

function startInput(overrides: Partial<Parameters<typeof createTurnStartParams>[0]> = {}) {
	return {
		threadId: "thread-1",
		clientUserMessageId: "message-1",
		prompt: "Inspect the selected node.",
		context: contextFixture,
		...overrides,
	};
}

function steerInput(overrides: Partial<Parameters<typeof createTurnSteerParams>[0]> = {}) {
	return {
		...startInput(),
		expectedTurnId: "turn-1",
		...overrides,
	};
}

describe("independent context contract oracle", () => {
	test("pins every context key in the reviewed order", () => {
		const context = JSON.parse(encodeCanonicalContext(contextFixture)) as Record<string, unknown>;
		expect(Object.keys(context)).toEqual([...CONTEXT_KEY_ORACLE.root]);
		for (const [key, expected] of Object.entries(CONTEXT_KEY_ORACLE).slice(1))
			expect(Object.keys(context[key] as Record<string, unknown>)).toEqual([...expected]);
	});

	test("pins every known closed domain without inventing pending members", () => {
		const base = contextCopy();
		expect(base.schema).toBe(CONTEXT_DOMAIN_ORACLE.schema[0]);
		for (const state of CONTEXT_DOMAIN_ORACLE.threadLinkState) {
			const candidate = contextCopy();
			candidate.threadLink.state = state;
			candidate.threadLink.reason = state === "inspect_only" ? "stale_child" : null;
			expect(ArchboardContextSchema.safeParse(candidate).success).toBe(true);
		}
		for (const holder of CONTEXT_DOMAIN_ORACLE.claimHolder) {
			const candidate = contextCopy();
			candidate.claim.holder = holder;
			expect(ArchboardContextSchema.safeParse(candidate).success).toBe(true);
		}
		const unknownState = contextCopy();
		unknownState.threadLink.state = "future" as never;
		expect(ArchboardContextSchema.safeParse(unknownState).success).toBe(false);
		const unknownHolder = contextCopy();
		unknownHolder.claim.holder = "future" as never;
		expect(ArchboardContextSchema.safeParse(unknownHolder).success).toBe(false);
		const unknownOutcome = contextCopy();
		unknownOutcome.operation.outcome = "future" as never;
		expect(ArchboardContextSchema.safeParse(unknownOutcome).success).toBe(false);

		const pendingReason = contextCopy();
		pendingReason.threadLink.reason = "review-pending-reason" as never;
		expect(ArchboardContextSchema.safeParse(pendingReason).success).toBe(false);
		const pendingKind = contextCopy();
		pendingKind.operation.kind = "review-pending-kind" as never;
		expect(ArchboardContextSchema.safeParse(pendingKind).success).toBe(false);
		const pendingRpc = contextCopy();
		pendingRpc.operation.rpc = "review-pending-rpc" as never;
		expect(ArchboardContextSchema.safeParse(pendingRpc).success).toBe(false);
	});
});

describe("closed thread-link and operation tuples", () => {
	test("requires the reviewed reason nullability pairing", () => {
		for (const state of ["unbound", "executable"] as const) {
			const withReason = contextCopy();
			withReason.threadLink.state = state;
			withReason.threadLink.reason = "stale_child";
			expect(ArchboardContextSchema.safeParse(withReason).success).toBe(false);
		}
		const withoutReason = contextCopy();
		withoutReason.threadLink.state = "inspect_only";
		withoutReason.threadLink.reason = null;
		expect(ArchboardContextSchema.safeParse(withoutReason).success).toBe(false);
		const validInspectOnly = contextCopy();
		validInspectOnly.threadLink.state = "inspect_only";
		validInspectOnly.threadLink.reason = "thread_list_ambiguous";
		expect(ArchboardContextSchema.safeParse(validInspectOnly).success).toBe(true);
	});

	test("accepts only the five reviewed operation tuple states", () => {
		const valid = [
			{ id: null, kind: null, rpc: null, outcome: null },
			{ id: "operation-1", kind: "composer_message", rpc: "turn/start", outcome: null },
			{
				id: "operation-1",
				kind: "composer_message",
				rpc: "turn/start",
				outcome: "delivered",
			},
			{
				id: "operation-1",
				kind: "composer_message",
				rpc: "turn/start",
				outcome: "not_delivered",
			},
			{
				id: "operation-1",
				kind: "composer_message",
				rpc: "turn/start",
				outcome: "outcome_unknown",
			},
		] as const;
		for (const operation of valid)
			expect(ArchboardContextSchema.safeParse({ ...contextFixture, operation }).success).toBe(true);
		expect(CONTEXT_DOMAIN_ORACLE.operationOutcome).toEqual([
			"delivered",
			"not_delivered",
			"outcome_unknown",
			null,
		]);

		const invalid = [
			{ id: null, kind: null, rpc: null, outcome: "delivered" },
			{ id: "operation-1", kind: null, rpc: "turn/start", outcome: "delivered" },
			{ id: "operation-1", kind: "composer_message", rpc: null, outcome: "delivered" },
			{ id: null, kind: "composer_message", rpc: "turn/start", outcome: null },
			{ id: "operation-1", kind: "composer_message", rpc: "turn/start", outcome: "future" },
		] as const;
		for (const operation of invalid)
			expect(ArchboardContextSchema.safeParse({ ...contextFixture, operation }).success).toBe(
				false,
			);
	});

	test("closes the operation RPC domain and rejects omitted or extra fields", () => {
		const delivered = {
			...contextFixture,
			operation: {
				id: "operation-1",
				kind: "composer_message",
				rpc: "turn/start",
				outcome: "delivered",
			},
		};
		expect(ArchboardContextSchema.safeParse(delivered).success).toBe(true);
		expect(
			ArchboardContextSchema.safeParse({
				...delivered,
				operation: { ...delivered.operation, rpc: "turn/other" },
			}).success,
		).toBe(false);
		expect(
			ArchboardContextSchema.safeParse({
				...delivered,
				operation: {
					id: delivered.operation.id,
					kind: delivered.operation.kind,
					outcome: delivered.operation.outcome,
				},
			}).success,
		).toBe(false);
		expect(
			ArchboardContextSchema.safeParse({
				...delivered,
				operation: { ...delivered.operation, extra: true },
			}).success,
		).toBe(false);
	});
});

describe("lower bounds", () => {
	test("rejects an empty standalone UserInput", () => {
		expect(() => createTextUserInput("")).toThrow();
	});

	test.each([
		["threadId", { threadId: "" }],
		["clientUserMessageId", { clientUserMessageId: "" }],
		["prompt", { prompt: "" }],
	] as const)("rejects empty turn/start %s", (_field, override) => {
		expect(() => createTurnStartParams(startInput(override))).toThrow();
	});

	test.each([
		["threadId", { threadId: "" }],
		["clientUserMessageId", { clientUserMessageId: "" }],
		["prompt", { prompt: "" }],
		["expectedTurnId", { expectedTurnId: "" }],
	] as const)("rejects empty turn/steer %s", (_field, override) => {
		expect(() => createTurnSteerParams(steerInput(override))).toThrow();
	});

	test("rejects empty identities in direct public turn schemas", () => {
		const start = createTurnStartParams(startInput());
		const steer = createTurnSteerParams(steerInput());
		for (const field of ["threadId", "clientUserMessageId"] as const) {
			expect(TurnStartParamsSchema.safeParse({ ...start, [field]: "" }).success).toBe(false);
			expect(TurnSteerParamsSchema.safeParse({ ...steer, [field]: "" }).success).toBe(false);
		}
		expect(
			TurnStartParamsSchema.safeParse({
				...start,
				input: [{ type: "text", text: "", text_elements: [] }],
			}).success,
		).toBe(false);
		expect(
			TurnSteerParamsSchema.safeParse({
				...steer,
				input: [{ type: "text", text: "", text_elements: [] }],
			}).success,
		).toBe(false);
		expect(TurnSteerParamsSchema.safeParse({ ...steer, expectedTurnId: "" }).success).toBe(false);
	});

	test("rejects an empty thread/inject_items identity", () => {
		const injection = createThreadInjectItemsParams({
			threadId: "thread-1",
			context: contextFixture,
		});
		expect(ThreadInjectItemsParamsSchema.safeParse({ ...injection, threadId: "" }).success).toBe(
			false,
		);
		expect(() =>
			createThreadInjectItemsParams({ threadId: "", context: contextFixture }),
		).toThrow();
	});

	test.each([
		["threadId", { threadId: "" }],
		["beforeTurnId", { beforeTurnId: "" }],
		["cwd", { cwd: "" }],
	] as const)("rejects empty thread/fork %s", (_field, override) => {
		expect(() =>
			createThreadForkParams({ threadId: "thread-1", cwd: CANONICAL_CWD, ...override }),
		).toThrow();
	});

	test("rejects empty identities in the direct public fork schema", () => {
		const fork = createThreadForkParams({ threadId: "thread-1", cwd: CANONICAL_CWD });
		expect(ThreadForkParamsSchema.safeParse({ ...fork, threadId: "" }).success).toBe(false);
		expect(ThreadForkParamsSchema.safeParse({ ...fork, beforeTurnId: "" }).success).toBe(false);
		expect(
			ThreadForkParamsSchema.safeParse({ ...fork, cwd: "", runtimeWorkspaceRoots: [""] }).success,
		).toBe(false);
	});

	test("rejects an empty self-fork executing turn identity", () => {
		expect(() =>
			createSelfThreadForkParams({
				threadId: "thread-1",
				cwd: CANONICAL_CWD,
				executingTurnId: "",
			}),
		).toThrow();
	});

	test.each([
		[
			"paneId",
			(candidate: ArchboardContext): void => {
				candidate.paneId = "";
			},
		],
		[
			"board.note",
			(candidate: ArchboardContext): void => {
				candidate.board.note = "";
			},
		],
		[
			"board.cursor",
			(candidate: ArchboardContext): void => {
				candidate.board.cursor = "";
			},
		],
		[
			"child.id",
			(candidate: ArchboardContext): void => {
				candidate.child.id = "";
			},
		],
		[
			"child.epoch",
			(candidate: ArchboardContext): void => {
				candidate.child.epoch = "";
			},
		],
		[
			"workhorse.threadId",
			(candidate: ArchboardContext): void => {
				candidate.workhorse.threadId = "";
			},
		],
		[
			"workhorse.turnId",
			(candidate: ArchboardContext): void => {
				candidate.workhorse.turnId = "";
			},
		],
		[
			"coordinator.threadId",
			(candidate: ArchboardContext): void => {
				candidate.coordinator.threadId = "";
			},
		],
		[
			"coordinator.realtimeSessionId",
			(candidate: ArchboardContext): void => {
				candidate.coordinator.realtimeSessionId = "";
			},
		],
		[
			"focus.paneId",
			(candidate: ArchboardContext): void => {
				candidate.focus.paneId = "";
			},
		],
		[
			"selection.elementIds[0]",
			(candidate: ArchboardContext): void => {
				candidate.selection.elementIds[0] = "";
			},
		],
		[
			"operation.id",
			(candidate: ArchboardContext): void => {
				candidate.operation.id = "";
			},
		],
	] as const)("rejects empty context identity %s", (_field, mutate) => {
		const candidate = contextCopy();
		mutate(candidate);
		expect(ArchboardContextSchema.safeParse(candidate).success).toBe(false);
	});
});

describe("public parsed-value immutability", () => {
	test("freezes every parsed body deeply and does not reuse parsed objects", () => {
		const context = ArchboardContextSchema.parse(contextFixture);
		const additional = AdditionalContextSchema.parse(createAdditionalContext(contextFixture));
		const start = TurnStartParamsSchema.parse(createTurnStartParams(startInput()));
		const steer = TurnSteerParamsSchema.parse(createTurnSteerParams(steerInput()));
		const injection = ThreadInjectItemsParamsSchema.parse(
			createThreadInjectItemsParams({ threadId: "thread-1", context: contextFixture }),
		);
		const fork = ThreadForkParamsSchema.parse(
			createThreadForkParams({ threadId: "thread-1", cwd: CANONICAL_CWD }),
		);
		const standalone = createTextUserInput("standalone");

		for (const value of [context, additional, start, steer, injection, fork, standalone])
			expectDeepFrozen(value);
		expect(context).not.toBe(contextFixture);
		expect(context.board).not.toBe(contextFixture.board);
		const secondContext = ArchboardContextSchema.parse(contextFixture);
		expect(secondContext).not.toBe(context);
		expect(secondContext.board).not.toBe(context.board);
		const secondStart = TurnStartParamsSchema.parse(start);
		expect(secondStart).not.toBe(start);
		expect(secondStart.input).not.toBe(start.input);
		expect(secondStart.additionalContext).not.toBe(start.additionalContext);
	});
});

describe("platform-native canonical fork roots", () => {
	test("rejects a foreign platform root", () => {
		const foreignRoot = path.sep === "/" ? "C:\\repo" : "/repo";
		const fork = createThreadForkParams({ threadId: "thread-1", cwd: CANONICAL_CWD });
		expect(() => createThreadForkParams({ threadId: "thread-1", cwd: foreignRoot })).toThrow(
			/canonical/,
		);
		expect(
			ThreadForkParamsSchema.safeParse({
				...fork,
				cwd: foreignRoot,
				runtimeWorkspaceRoots: [foreignRoot],
			}).success,
		).toBe(false);
	});

	test.each(
		path.sep === "/"
			? (["/repo/../other", "/repo//nested", "/repo/archboard/"] as const)
			: (["C:\\repo\\..\\other", "C:\\repo\\\\nested", "C:\\repo\\archboard\\"] as const),
	)("rejects a lexically noncanonical root %s", (cwd) => {
		const fork = createThreadForkParams({ threadId: "thread-1", cwd: CANONICAL_CWD });
		expect(() => createThreadForkParams({ threadId: "thread-1", cwd })).toThrow(/canonical/);
		expect(
			ThreadForkParamsSchema.safeParse({ ...fork, cwd, runtimeWorkspaceRoots: [cwd] }).success,
		).toBe(false);
	});

	test("requires the workspace root to equal cwd exactly", () => {
		const fork = createThreadForkParams({ threadId: "thread-1", cwd: CANONICAL_CWD });
		expect(
			ThreadForkParamsSchema.safeParse({ ...fork, runtimeWorkspaceRoots: ["/repo"] }).success,
		).toBe(false);
	});
});
