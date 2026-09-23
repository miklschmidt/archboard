import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import type { BrowserActionContext } from "../../codex-workbench/index.js";
import { createCanvasRealtimeActions } from "../codex-workbench-adapters.js";

function fixture() {
	const identity = createIdentityAuthorities();
	const threadId = identity.identity.decoder.adoptThreadId("realtime-workhorse");
	const coordinatorThreadId = identity.identity.decoder.adoptThreadId("realtime-coordinator");
	const calls: Array<{ readonly name: string; readonly value: unknown }> = [];
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
		coordinator: {
			snapshot: () => ({
				state: "ready",
				threadId: coordinatorThreadId,
				childId: identity.identity.validator.childId,
				epoch: identity.identity.validator.epoch,
			}),
		},
		workhorse: {
			snapshot: () => ({ state: "ready", threadId }),
		},
	};
	const connection = Object.freeze({ socket: "one" });
	const context: BrowserActionContext = {
		browserId: "browser-1",
		connection,
		paneId: "pane-1",
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
	return { calls, components, context, identity, threadId };
}

test("one stable realtime handle spans start, append, and stop", async () => {
	const value = fixture();
	const actions = createCanvasRealtimeActions(value.components as never);
	const startId = value.identity.identity.issuer.mintBrowserCommandId();
	const started = await actions.start(
		{
			kind: "browser_command",
			command: "realtimeStart",
			commandId: startId,
			paneId: value.context.paneId,
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
			paneId: value.context.paneId,
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
			paneId: value.context.paneId,
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
	const actions = createCanvasRealtimeActions(value.components as never);
	const startId = value.identity.identity.issuer.mintBrowserCommandId();
	await actions.start(
		{
			kind: "browser_command",
			command: "realtimeStart",
			commandId: startId,
			paneId: value.context.paneId,
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
				paneId: context.paneId,
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

test("another pane of the canvas can stop voice on the same link but cannot speak into it", async () => {
	const value = fixture();
	const actions = createCanvasRealtimeActions(value.components as never);
	const startId = value.identity.identity.issuer.mintBrowserCommandId();
	await actions.start(
		{
			kind: "browser_command",
			command: "realtimeStart",
			commandId: startId,
			paneId: value.context.paneId,
			childId: value.context.childId,
			epoch: value.context.epoch,
			threadId: value.threadId,
			sdp: "v=0",
		},
		value.context,
	);
	const otherPane: BrowserActionContext = {
		...value.context,
		browserId: "browser-2",
		paneId: "pane-2",
		connection: Object.freeze({ socket: "two" }),
		commandId: value.identity.identity.issuer.mintBrowserCommandId(),
	};
	const base = (context: BrowserActionContext) =>
		({
			kind: "browser_command",
			commandId: value.identity.identity.issuer.mintBrowserCommandId(),
			paneId: context.paneId,
			childId: context.childId,
			epoch: context.epoch,
			threadId: value.threadId,
			realtimeSessionHandle: startId,
		}) as const;
	await expect(
		actions.appendText(
			{ ...base(otherPane), command: "realtimeAppendText", text: "not this socket's media" },
			otherPane,
		),
	).rejects.toThrow();
	const linked = value.context.link;
	if (linked.state !== "executable") throw new Error("The fixture link must be executable.");
	const elsewhere: BrowserActionContext = {
		...otherPane,
		link: { ...linked, threadId: value.identity.identity.decoder.adoptThreadId("another-thread") },
	};
	await expect(
		actions.stop({ ...base(elsewhere), command: "realtimeStop" }, elsewhere),
	).rejects.toThrow();
	expect(value.calls.map((call) => call.name)).toEqual(["start"]);

	expect(await actions.stop({ ...base(otherPane), command: "realtimeStop" }, otherPane)).toEqual({
		outcome: "delivered",
	});
	expect(value.calls.map((call) => call.name)).toEqual(["start", "stop"]);
});
