import { ARCHBOARD_CONTEXT_CODEC } from "#runtime/services/host/archboard.ts";
import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { parseTabSessionId } from "@archboard/agent-workbench/server";
import { ArchboardContextSchema } from "#runtime/rules/instructions/context.ts";
import { createServerCanonicalTextActions } from "@archboard/agent-workbench/server";

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
		contextCodec: ARCHBOARD_CONTEXT_CODEC,
		identity: authorities,
		session,
		contextForOperation: (action, operation) => {
			contexts.push({ paneId: action.paneId, operation });
			return ArchboardContextSchema.parse({
				schema: 1,
				paneId: action.paneId,
				board: { name: "Board", key: "board", version: 7, cursor: "feed:3" },
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
				variant: null,
				view: null,
				selection: {
					count: 1,
					subjects: [{ kind: "node", id: "node-1", name: "Gateway" }],
					capturedAtMs: 10,
				},
				reconciliation: { required: false, count: 0, blockedBy: null, issues: [] },
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
