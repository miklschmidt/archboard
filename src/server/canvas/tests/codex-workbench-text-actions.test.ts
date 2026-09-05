import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { ArchboardContextSchema } from "../../../runtime/codex-instructions/index.js";
import { createCanvasCanonicalTextActions } from "../codex-workbench-adapters.js";

test("browser start and steer emit canonical authored bodies from lease-bound context", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("thread-1");
	const turnId = authorities.identity.decoder.adoptTurnId("turn-current");
	const starts: unknown[] = [];
	const steers: unknown[] = [];
	const contexts: unknown[] = [];
	// Both mutations read the authoritative thread first, so the fake reports the
	// thread the host would actually see: idle for the start, running for the steer.
	let activeTurns: readonly { readonly id: unknown; readonly status: string }[] = [];
	const session = {
		turnStart: async (params: unknown) => {
			starts.push(params);
			return { turn: { id: turnId } } as never;
		},
		threadRead: async (params: { includeTurns?: boolean }) => {
			if (params.includeTurns) throw new Error("list_turns is not supported yet");
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
	const actions = createCanvasCanonicalTextActions({
		identity: authorities,
		session,
		contextForOperation: (action, operation) => {
			contexts.push({ paneId: action.paneId, operation });
			return ArchboardContextSchema.parse({
				schema: 1,
				paneId: action.paneId,
				board: { note: "board.excalidraw.md", version: 7, cursor: "feed:3" },
				threadLink: { state: "executable", reason: null },
				child: { id: action.childId, epoch: action.epoch },
				workhorse: { threadId: action.link.threadId, turnId: null },
				coordinator: { threadId: null, realtimeSessionId: null },
				semantic: {
					brief: "selected service",
					capturedAtMs: 10,
					freshUntilMs: 20,
					truncated: false,
				},
				focus: { paneId: action.paneId, capturedAtMs: 10 },
				selection: { elementIds: ["node-1"], capturedAtMs: 10 },
				claim: { holder: "human", doing: "steering current work" },
				ambiguity: [],
				operation: { ...operation, outcome: null },
			});
		},
	});
	const context = {
		browserId: "browser-1",
		connection: Object.freeze({}),
		paneId: "pane-exact",
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
		turnTrigger: "archboard",
		input: [{ type: "text", text: "Start from the selected service.", text_elements: [] }],
		additionalContext: { archboard: { kind: "application" } },
	});
	expect(steers).toHaveLength(1);
	expect(steers[0]).toMatchObject({
		threadId,
		expectedTurnId: turnId,
		input: [{ type: "text", text: "Keep the same target.", text_elements: [] }],
		additionalContext: { archboard: { kind: "application" } },
	});
	const startBody = starts[0] as {
		clientUserMessageId: unknown;
		additionalContext: { archboard: { value: unknown } };
	};
	const steerBody = steers[0] as typeof startBody;
	expect(typeof startBody.clientUserMessageId).toBe("string");
	expect(typeof startBody.additionalContext.archboard.value).toBe("string");
	expect(typeof steerBody.clientUserMessageId).toBe("string");
	expect(typeof steerBody.additionalContext.archboard.value).toBe("string");
	expect(contexts).toEqual([
		{ paneId: "pane-exact", operation: expect.objectContaining({ rpc: "turn/start" }) },
		{ paneId: "pane-exact", operation: expect.objectContaining({ rpc: "turn/steer" }) },
	]);
});

test("browser start requires the exact authoritative idle thread without hydrating history", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("thread-busy");
	let startCalls = 0;
	let observedThreadId = threadId;
	let observedStatus = "active";
	const actions = createCanvasCanonicalTextActions({
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
	const actions = createCanvasCanonicalTextActions({
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
			ArchboardContextSchema.parse({
				schema: 1,
				paneId: "pane-1",
				board: { note: "board.excalidraw.md", version: 7, cursor: "feed:3" },
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
				focus: { paneId: "pane-1", capturedAtMs: 10 },
				selection: { elementIds: [], capturedAtMs: 10 },
				claim: { holder: "human", doing: "steering current work" },
				ambiguity: [],
				operation: { ...operation, outcome: null },
			}),
	});
	const staleTurnId = authorities.identity.decoder.adoptTurnId("turn-stale");
	const commandId = authorities.identity.issuer.mintBrowserCommandId();
	const context = {
		browserId: "browser-1",
		connection: Object.freeze({}),
		paneId: "pane-1",
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
