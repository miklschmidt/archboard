import { expect, test } from "bun:test";

import { createBrowserWorkbenchMediaOwner } from "../../codex-workbench-media/index.js";
import { createBrowserWorkbenchTransport } from "../index.js";
import { FakeSocket, snapshot } from "./fake-socket.js";

test("transport and media owner share one pane socket and both receive gateway events", async () => {
	const socket = new FakeSocket();
	let sequence = 2;
	let stopCount = 0;
	let disposedCount = 0;
	const media = createBrowserWorkbenchMediaOwner({
		createMediaSession: () =>
			({
				getSnapshot: () =>
					({
						correlation: null,
						state: { phase: "listening", reason: "negotiation_succeeded" },
						inputLevel: 0,
					}) as never,
				subscribe: () => () => undefined,
				start: async () => ({}) as never,
				appendText: async () => ({}) as never,
				stop: async () => {
					stopCount += 1;
					return {} as never;
				},
				dispose: async () => {
					disposedCount += 1;
				},
			}) as never,
	});
	const transport = createBrowserWorkbenchTransport();
	socket.onRequest = (request, activeSocket) => {
		if (
			request.action === "connect" ||
			request.action === "subscribe" ||
			request.action === "mediaReady" ||
			request.action === "snapshot"
		)
			activeSocket.reply(request, {
				kind: "snapshot",
				sequence,
				snapshot: snapshot({ voiceState: "ready" }),
			});
	};

	try {
		await transport.attach(socket);
		await media.attach(transport);
		expect(socket.sent.filter((request) => request.action === "connect")).toHaveLength(0);
		expect(socket.sent.filter((request) => request.action === "subscribe")).toHaveLength(1);

		sequence = 3;
		const currentVoice = snapshot({ voiceState: "ready" }).voice as Record<string, unknown>;
		socket.event({
			kind: "delta",
			sequence,
			delta: { voice: { ...currentVoice, state: "unavailable" } },
		});
		await Bun.sleep(0);
		expect(transport.sequence()).toBe(3);
		expect(stopCount).toBe(1);
		expect(socket.closeCalls).toBe(0);
		socket.close();
		await Bun.sleep(0);
		expect(disposedCount).toBe(1);
		expect(socket.closeCalls).toBe(1);
	} finally {
		await media.detach(transport);
		await transport.dispose();
	}
});
