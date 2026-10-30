import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { type BrowserActionContext } from "#server/protocol/gateway/contract.ts";
import { createServerRealtimeActions } from "#server/services/voice/realtime-actions.ts";

/** The checkout of the fixture's chat. */
const CHECKOUT = "/work/payments";

function fixture() {
	const identity = createIdentityAuthorities();
	const threadId = identity.identity.decoder.adoptThreadId("realtime-workhorse");
	let coordinatorThreadId = identity.identity.decoder.adoptThreadId("realtime-coordinator");
	const calls: Array<{ readonly name: string; readonly value: unknown }> = [];
	// Each replacement the coordinator was asked for, and the failure the next one meets.
	const replacements: string[] = [];
	let replaceFailure: Error | null = null;
	const realtime = {
		createOffer: async (value: { sessionId: string; correlationId: string; sdp: string }) => {
			calls.push({ name: "start", value });
			return { ...value, sdp: "v=0\r\na=answer" };
		},
		appendText: async (value: unknown) => void calls.push({ name: "append", value }),
		stop: async (value: unknown) => void calls.push({ name: "stop", value }),
		onSemanticEvent: () => () => undefined,
	};
	const components = {
		realtime,
		identity,
		coordinator: {
			snapshot: () => ({
				state: "ready",
				threadId: coordinatorThreadId,
				childId: identity.identity.validator.childId,
				epoch: identity.identity.validator.epoch,
			}),
			replace: async ({ operationId }: { operationId: string }) => {
				replacements.push(operationId);
				if (replaceFailure !== null) {
					throw replaceFailure;
				}
				coordinatorThreadId = identity.identity.decoder.adoptThreadId(
					`realtime-coordinator-${replacements.length}`,
				);
			},
		},
	};
	// The tab's one workhorse, in the checkout of the fixture's chat; its threads are not looked at.
	const workhorse = { snapshot: () => ({ state: "ready", threadId }) };
	const scope = {
		claimThread: () => undefined,
		releaseThread: () => undefined,
		workhorses: () => [{ checkout: CHECKOUT, components: { workhorse } }],
		state: { voiceCheckout: null as string | null },
	};
	const connection = Object.freeze({ socket: "one" });
	const context: BrowserActionContext = {
		browserId: "browser-1",
		connection,
		chatId: "chat-1",
		tabSessionId: parseTabSessionId("tab-one")!,
		checkout: CHECKOUT,
		commandId: identity.identity.issuer.mintBrowserCommandId(),
		childId: identity.identity.validator.childId,
		epoch: identity.identity.validator.epoch,
		linkRevision: 1,
		link: {
			kind: "thread_link",
			state: "executable",
			childId: identity.identity.validator.childId,
			epoch: identity.identity.validator.epoch,
			threadId,
			source: "appServer",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
	};
	return {
		calls,
		components,
		scope,
		context,
		identity,
		threadId,
		replacements,
		failReplace: (error: Error | null) => {
			replaceFailure = error;
		},
	};
}

type Fixture = ReturnType<typeof fixture>;

type Actions = ReturnType<typeof createServerRealtimeActions>;

/**
 * Start voice on the fixture's chat.
 * @param actions The realtime actions.
 * @param value The fixture.
 * @returns The handle the chat holds the session by.
 */
async function startVoice(
	actions: Actions,
	value: Fixture,
	narrative?: { topic: string },
	commandId = value.identity.identity.issuer.mintBrowserCommandId(),
) {
	await actions.start(
		{
			kind: "browser_command",
			command: "realtimeStart",
			commandId,
			chatId: value.context.chatId,
			childId: value.context.childId,
			epoch: value.context.epoch,
			threadId: value.threadId,
			sdp: "v=0\r\na=offer",
			...(narrative === undefined ? {} : { narrative }),
		},
		value.context,
	);
	return commandId;
}

/**
 * Act on a running session from the fixture's chat.
 * @param actions The realtime actions.
 * @param value The fixture.
 * @param handle The session's handle.
 * @param command Stop it, or say something into it.
 */
async function onSession(
	actions: Actions,
	value: Fixture,
	handle: Awaited<ReturnType<typeof startVoice>>,
	command: "stop" | "append",
): Promise<void> {
	const common = {
		kind: "browser_command",
		commandId: value.identity.identity.issuer.mintBrowserCommandId(),
		chatId: value.context.chatId,
		childId: value.context.childId,
		epoch: value.context.epoch,
		threadId: value.threadId,
		realtimeSessionHandle: handle,
	} as const;
	if (command === "stop") {
		await actions.stop({ ...common, command: "realtimeStop" }, value.context);
	} else {
		await actions.appendText(
			{ ...common, command: "realtimeAppendText", text: "still here" },
			value.context,
		);
	}
}

test("a voice start after a finished session runs on a fresh coordinator", async () => {
	const value = fixture();
	const actions = createServerRealtimeActions(value.components as never, value.scope as never);
	const first = await startVoice(actions, value);
	expect(value.replacements).toHaveLength(0);
	// Voice is bound to the workhorse of the checkout of the chat it started from.
	expect(value.scope.state.voiceCheckout).toBe(CHECKOUT);
	await onSession(actions, value, first, "stop");

	const second = await startVoice(actions, value);

	expect(value.replacements).toHaveLength(1);
	// The session belongs to the fresh coordinator, so the chat can speak into it.
	await onSession(actions, value, second, "append");
	expect(value.calls.map((call) => call.name)).toEqual(["start", "stop", "start", "append"]);
});

test("a start whose fresh coordinator does not come up is refused, and the next start tries again", async () => {
	const value = fixture();
	const actions = createServerRealtimeActions(value.components as never, value.scope as never);
	await onSession(actions, value, await startVoice(actions, value), "stop");
	const voiced = value.components.coordinator.snapshot().threadId;
	value.failReplace(new Error("thread/start was not delivered"));

	await expect(startVoice(actions, value)).rejects.toThrow("fresh coordinator");

	expect(value.components.coordinator.snapshot().threadId).toBe(voiced);
	expect(value.calls.map((call) => call.name)).toEqual(["start", "stop"]);
	value.failReplace(null);
	await startVoice(actions, value);
	expect(value.replacements).toHaveLength(2);
	expect(value.calls.map((call) => call.name)).toEqual(["start", "stop", "start"]);
});

test("one stable realtime handle spans start, append, and stop", async () => {
	const value = fixture();
	const actions = createServerRealtimeActions(value.components as never, value.scope as never);
	const startId = value.identity.identity.issuer.mintBrowserCommandId();
	const started = await actions.start(
		{
			kind: "browser_command",
			command: "realtimeStart",
			commandId: startId,
			chatId: value.context.chatId,
			childId: value.context.childId,
			epoch: value.context.epoch,
			threadId: value.threadId,
			sdp: "v=0\r\na=offer",
		},
		value.context,
	);
	expect(started).toMatchObject({
		outcome: "delivered",
		realtimeSessionHandle: String(startId),
	});
	await actions.appendText(
		{
			kind: "browser_command",
			command: "realtimeAppendText",
			commandId: value.identity.identity.issuer.mintBrowserCommandId(),
			chatId: value.context.chatId,
			childId: value.context.childId,
			epoch: value.context.epoch,
			threadId: value.threadId,
			realtimeSessionHandle: startId,
			text: "continue the same session",
		},
		value.context,
	);
	await actions.stop(
		{
			kind: "browser_command",
			command: "realtimeStop",
			commandId: value.identity.identity.issuer.mintBrowserCommandId(),
			chatId: value.context.chatId,
			childId: value.context.childId,
			epoch: value.context.epoch,
			threadId: value.threadId,
			realtimeSessionHandle: startId,
		},
		value.context,
	);

	expect(value.calls.map((call) => call.name)).toEqual(["start", "append", "stop"]);
	expect(value.calls[1]?.value).toMatchObject({
		sessionId: String(startId),
		correlationId: String(startId),
	});
	expect(value.calls[2]?.value).toMatchObject({
		sessionId: String(startId),
		correlationId: String(startId),
	});
});

test("stale handles and replacement sockets cannot append to the active realtime session", async () => {
	const value = fixture();
	const actions = createServerRealtimeActions(value.components as never, value.scope as never);
	const startId = value.identity.identity.issuer.mintBrowserCommandId();
	await actions.start(
		{
			kind: "browser_command",
			command: "realtimeStart",
			commandId: startId,
			chatId: value.context.chatId,
			childId: value.context.childId,
			epoch: value.context.epoch,
			threadId: value.threadId,
			sdp: "v=0",
		},
		value.context,
	);
	const append = (realtimeSessionHandle: typeof startId, context = value.context) =>
		actions.appendText(
			{
				kind: "browser_command",
				command: "realtimeAppendText",
				commandId: value.identity.identity.issuer.mintBrowserCommandId(),
				chatId: context.chatId,
				childId: context.childId,
				epoch: context.epoch,
				threadId: value.threadId,
				realtimeSessionHandle,
				text: "must be exact",
			},
			context,
		);
	await expect(append(value.identity.identity.issuer.mintBrowserCommandId())).rejects.toThrow(
		"handle is stale",
	);
	await expect(
		append(startId, { ...value.context, connection: Object.freeze({ socket: "replacement" }) }),
	).rejects.toThrow("handle is stale");
	expect(value.calls.map((call) => call.name)).toEqual(["start"]);

	await actions.onBrowserDisconnect?.(value.context, "browser_disconnected");
	expect(value.calls.map((call) => call.name)).toEqual(["start", "stop"]);
});

test("another chat of the tab can stop voice, whichever checkout it shows, but cannot speak into it", async () => {
	const value = fixture();
	const actions = createServerRealtimeActions(value.components as never, value.scope as never);
	const startId = value.identity.identity.issuer.mintBrowserCommandId();
	await actions.start(
		{
			kind: "browser_command",
			command: "realtimeStart",
			commandId: startId,
			chatId: value.context.chatId,
			childId: value.context.childId,
			epoch: value.context.epoch,
			threadId: value.threadId,
			sdp: "v=0",
		},
		value.context,
	);
	const otherChat: BrowserActionContext = {
		...value.context,
		browserId: "browser-2",
		chatId: "chat-2",
		connection: Object.freeze({ socket: "two" }),
		tabSessionId: parseTabSessionId("tab-one")!,
		commandId: value.identity.identity.issuer.mintBrowserCommandId(),
	};
	const base = (context: BrowserActionContext) =>
		({
			kind: "browser_command",
			commandId: value.identity.identity.issuer.mintBrowserCommandId(),
			chatId: context.chatId,
			childId: context.childId,
			epoch: context.epoch,
			threadId: value.threadId,
			realtimeSessionHandle: startId,
		}) as const;
	await expect(
		actions.appendText(
			{ ...base(otherChat), command: "realtimeAppendText", text: "not this socket's media" },
			otherChat,
		),
	).rejects.toThrow();
	const linked = value.context.link;
	if (linked.state !== "executable") throw new Error("The fixture link must be executable.");
	// A chat of another checkout shows another workhorse's link; voice is the whole tab's.
	const elsewhere: BrowserActionContext = {
		...otherChat,
		checkout: "/work/shop",
		link: { ...linked, threadId: value.identity.identity.decoder.adoptThreadId("another-thread") },
	};
	expect(value.calls.map((call) => call.name)).toEqual(["start"]);
	expect(await actions.stop({ ...base(elsewhere), command: "realtimeStop" }, elsewhere)).toEqual({
		outcome: "delivered",
	});
	expect(value.calls.map((call) => call.name)).toEqual(["start", "stop"]);
});

test("a refused host narrative leaves live voice and its coordinator unchanged", async () => {
	const value = fixture();
	let prepared = 0;
	const actions = createServerRealtimeActions(
		value.components as never,
		value.scope as never,
		undefined,
		{
			validate: () => {
				throw new TypeError("invalid_host_narrative");
			},
			prepare: () => {
				prepared++;
				return { topic: "valid" };
			},
		},
	);
	const handle = await startVoice(actions, value);
	const coordinator = value.components.coordinator.snapshot().threadId;
	await expect(
		actions.start(
			{
				kind: "browser_command",
				command: "realtimeStart",
				commandId: value.identity.identity.issuer.mintBrowserCommandId(),
				chatId: value.context.chatId,
				childId: value.context.childId,
				epoch: value.context.epoch,
				threadId: value.threadId,
				sdp: "v=0",
				narrative: { topic: 42 },
			},
			value.context,
		),
	).rejects.toThrow("invalid_host_narrative");
	expect(prepared).toBe(0);
	expect(value.replacements).toHaveLength(0);
	expect(value.components.coordinator.snapshot().threadId).toBe(coordinator);
	expect(value.calls.map((call) => call.name)).toEqual(["start"]);
	await onSession(actions, value, handle, "append");
	expect(value.calls.map((call) => call.name)).toEqual(["start", "append"]);
});

test.each(["disconnect", "stop"] as const)(
	"%s during asynchronous narrative preparation prevents a late voice offer",
	async (cancel) => {
		const value = fixture();
		const entered = Promise.withResolvers<void>();
		const prepared = Promise.withResolvers<{ topic: string }>();
		let forgotten = 0;
		const actions = createServerRealtimeActions(
			value.components as never,
			value.scope as never,
			undefined,
			{
				prepare: () => {
					entered.resolve();
					return prepared.promise;
				},
				forget: () => {
					forgotten++;
				},
			},
		);
		const handle = value.identity.identity.issuer.mintBrowserCommandId();
		const starting = startVoice(actions, value, { topic: "capture" }, handle);
		const result = starting.catch((error: unknown) => error);
		await entered.promise;
		const disconnected =
			cancel === "disconnect"
				? actions.onBrowserDisconnect?.(value.context, "browser_disconnected")
				: onSession(actions, value, handle, "stop");
		prepared.resolve({ topic: "captured" });
		expect(await result).toBeInstanceOf(Error);
		await disconnected;
		expect(value.calls).toEqual([]);
		expect(forgotten).toBe(1);
	},
);

test("a replacement start discards asynchronous preparation before creating any old offer", async () => {
	const value = fixture();
	const entered = Promise.withResolvers<void>();
	const prepared = Promise.withResolvers<{ topic: string }>();
	const actions = createServerRealtimeActions(
		value.components as never,
		value.scope as never,
		undefined,
		{
			prepare: () => {
				entered.resolve();
				return prepared.promise;
			},
		},
	);
	const first = startVoice(actions, value, { topic: "capture" }).catch((error: unknown) => error);
	await entered.promise;
	const second = startVoice(actions, value);
	prepared.resolve({ topic: "old capture" });
	expect(await first).toBeInstanceOf(Error);
	const handle = await second;
	expect(value.calls).toHaveLength(1);
	expect(value.calls[0]?.value).toMatchObject({ sessionId: String(handle) });
	expect(value.replacements).toHaveLength(0);
});
