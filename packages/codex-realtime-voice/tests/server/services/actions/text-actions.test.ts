import {
	TEST_CONTEXT_CODEC,
	TEST_CONTEXT_SCHEMA,
	testContextFixture,
} from "#tests/runtime/support/host.ts";
import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { createServerCanonicalTextActions } from "#server/services/actions/text-actions.ts";

test("browser start requires the exact authoritative idle thread without hydrating history", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("thread-busy");
	let startCalls = 0;
	let observedThreadId = threadId;
	let observedStatus = "active";
	const actions = createServerCanonicalTextActions({
		contextCodec: TEST_CONTEXT_CODEC,
		identity: authorities,
		session: {
			turnStart: async () => {
				startCalls += 1;
				return {} as never;
			},
			threadRead: async (params) => {
				expect(params).toEqual({ threadId, includeTurns: false });
				return {
					thread: { id: observedThreadId, status: { type: observedStatus }, turns: [] },
				} as never;
			},
			turnSteer: async () => ({}) as never,
			turnInterrupt: async () => ({}) as never,
		},
		contextForOperation: () => {
			throw new Error("a refused start must fail before context capture");
		},
	});
	const commandId = authorities.identity.issuer.mintBrowserCommandId();
	const context = {
		browserId: "browser-1",
		connection: Object.freeze({}),
		paneId: "pane-busy",
		tabSessionId: parseTabSessionId("tab-one")!,
		checkout: "/work/payments",
		commandId,
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		linkRevision: 1,
		link: {
			kind: "thread_link",
			state: "executable",
			childId: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			threadId,
			source: "appServer",
			status: "active",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
	} as const;
	const command = {
		kind: "browser_command",
		command: "start",
		commandId,
		paneId: "pane-busy",
		childId: context.childId,
		epoch: context.epoch,
		threadId,
		prompt: "start anyway",
	} as const;
	// A browser whose bounded timeline no longer shows the running turn would
	// otherwise race a second turn onto one thread.
	// Definitive and actionable on the wire, not the gateway's opaque
	// `command_failed`: nothing was started and the person may steer instead.
	for (const status of ["active", "notLoaded", "systemError"]) {
		observedStatus = status;
		await expect(actions.start(command, context)).rejects.toMatchObject({
			code: "invalid_command",
			outcome: "not_delivered",
		});
	}
	observedStatus = "idle";
	observedThreadId = authorities.identity.decoder.adoptThreadId("thread-other");
	await expect(actions.start(command, context)).rejects.toMatchObject({
		code: "invalid_command",
		outcome: "not_delivered",
	});
	expect(startCalls).toBe(0);
});

test("browser steering preserves the server's atomic expected-turn refusal without history", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("thread-1");
	const currentTurnId = authorities.identity.decoder.adoptTurnId("turn-current");
	let steerCalls = 0;
	const actions = createServerCanonicalTextActions({
		contextCodec: TEST_CONTEXT_CODEC,
		identity: authorities,
		session: {
			turnStart: async () => ({}) as never,
			threadRead: async (params) => {
				expect(params).toEqual({ threadId, includeTurns: false });
				return { thread: { id: threadId, status: { type: "active" }, turns: [] } } as never;
			},
			turnSteer: async (params) => {
				steerCalls += 1;
				expect(params.expectedTurnId).toBe(staleTurnId);
				if (params.expectedTurnId !== currentTurnId)
					throw new Error("expectedTurnId does not match the current active turn");
				return { turnId: currentTurnId } as never;
			},
			turnInterrupt: async () => ({}) as never,
		},
		contextForOperation: (_context, operation) =>
			TEST_CONTEXT_SCHEMA.parse({
				paneId: "pane-1",
				threadLink: { state: "executable", reason: null },
				child: {
					id: authorities.identity.validator.childId,
					epoch: authorities.identity.validator.epoch,
				},
				workhorse: { threadId, turnId: currentTurnId },
				coordinator: { threadId: null, realtimeSessionId: null },
				semantic: {
					brief: "selected service",
					capturedAtMs: 10,
					freshUntilMs: 20,
					truncated: false,
				},
				operation: { ...operation, outcome: null },
			}),
	});
	const staleTurnId = authorities.identity.decoder.adoptTurnId("turn-stale");
	const commandId = authorities.identity.issuer.mintBrowserCommandId();
	const context = {
		browserId: "browser-1",
		connection: Object.freeze({}),
		paneId: "pane-1",
		tabSessionId: parseTabSessionId("tab-one")!,
		checkout: "/work/payments",
		commandId,
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		linkRevision: 1,
		link: {
			kind: "thread_link",
			state: "executable",
			childId: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			threadId,
			source: "appServer",
			status: "active",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
	} as const;
	await expect(
		actions.steer(
			{
				kind: "browser_command",
				command: "steer",
				commandId,
				paneId: "pane-1",
				childId: context.childId,
				epoch: context.epoch,
				threadId,
				turnId: staleTurnId,
				prompt: "stale",
			},
			context,
		),
	).rejects.toThrow("expectedTurnId does not match the current active turn");
	expect(steerCalls).toBe(1);
});

test("browser start and steer emit canonical authored bodies from lease-bound context", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("thread-1");
	const turnId = authorities.identity.decoder.adoptTurnId("turn-current");
	const starts: unknown[] = [];
	const steers: unknown[] = [];
	const contexts: unknown[] = [];
	// Both mutations read the authoritative thread first, so the fake reports the
	// thread the server would actually see: idle for the start, running for the steer.
	let activeTurns: readonly { readonly id: unknown; readonly status: string }[] = [];
	const session = {
		turnStart: async (params: unknown) => {
			starts.push(params);
			return { turn: { id: turnId } } as never;
		},
		threadRead: async (params: unknown) => {
			if (
				typeof params === "object" &&
				params !== null &&
				"includeTurns" in params &&
				params.includeTurns
			)
				throw new Error("list_turns is not supported yet");
			return {
				thread: {
					id: threadId,
					status: { type: activeTurns.length === 0 ? "idle" : "active" },
					turns: activeTurns,
				},
			} as never;
		},
		turnSteer: async (params: unknown) => {
			steers.push(params);
			return { turnId } as never;
		},
		turnInterrupt: async () => ({}) as never,
	};
	const actions = createServerCanonicalTextActions({
		contextCodec: TEST_CONTEXT_CODEC,
		identity: authorities,
		session,
		contextForOperation: (action, operation) => {
			contexts.push({ paneId: action.paneId, operation });
			return TEST_CONTEXT_SCHEMA.parse({
				...testContextFixture,
				paneId: action.paneId,
				child: { id: action.childId, epoch: action.epoch },
				workhorse: { threadId: action.link.threadId, turnId: null },
				operation: { ...operation, outcome: null },
			});
		},
	});
	const context = {
		browserId: "browser-1",
		connection: Object.freeze({}),
		paneId: "pane-exact",
		tabSessionId: parseTabSessionId("tab-one")!,
		checkout: "/work/payments",
		commandId: authorities.identity.issuer.mintBrowserCommandId(),
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		linkRevision: 3,
		link: {
			kind: "thread_link",
			state: "executable",
			childId: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			threadId,
			source: "appServer",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
	} as const;
	await actions.start(
		{
			kind: "browser_command",
			command: "start",
			commandId: context.commandId,
			paneId: context.paneId,
			childId: context.childId,
			epoch: context.epoch,
			threadId,
			prompt: "Start from the selected service.",
		},
		context,
	);
	activeTurns = [{ id: turnId, status: "inProgress" }];
	await actions.steer(
		{
			kind: "browser_command",
			command: "steer",
			commandId: context.commandId,
			paneId: context.paneId,
			childId: context.childId,
			epoch: context.epoch,
			threadId,
			turnId,
			prompt: "Keep the same target.",
		},
		context,
	);

	expect(starts).toHaveLength(1);
	expect(starts[0]).toMatchObject({
		threadId,
		turnTrigger: TEST_CONTEXT_CODEC.turnTrigger,
		input: [{ type: "text", text: "Start from the selected service.", text_elements: [] }],
		additionalContext: { [TEST_CONTEXT_CODEC.key]: { kind: "application" } },
	});
	expect(steers).toHaveLength(1);
	expect(steers[0]).toMatchObject({
		threadId,
		expectedTurnId: turnId,
		input: [{ type: "text", text: "Keep the same target.", text_elements: [] }],
		additionalContext: { [TEST_CONTEXT_CODEC.key]: { kind: "application" } },
	});
	const startBody = starts[0] as {
		clientUserMessageId: unknown;
		additionalContext: Record<string, { value: unknown }>;
	};
	const steerBody = steers[0] as typeof startBody;
	expect(typeof startBody.clientUserMessageId).toBe("string");
	expect(typeof startBody.additionalContext[TEST_CONTEXT_CODEC.key]?.value).toBe("string");
	expect(typeof steerBody.clientUserMessageId).toBe("string");
	expect(typeof steerBody.additionalContext[TEST_CONTEXT_CODEC.key]?.value).toBe("string");
	expect(contexts).toEqual([
		{ paneId: "pane-exact", operation: expect.objectContaining({ rpc: "turn/start" }) },
		{ paneId: "pane-exact", operation: expect.objectContaining({ rpc: "turn/steer" }) },
	]);
});
