import { expect, test } from "bun:test";

import { createBrowserWorkbenchMediaOwner } from "../../codex-workbench-media/index.js";
import { createBrowserWorkbenchTransport, type BrowserWorkbenchSocket } from "../index.js";

type Request = Record<string, unknown>;

class SharedSocket extends EventTarget implements BrowserWorkbenchSocket {
	readonly sent: Request[] = [];
	closeCalls = 0;
	readyState = 1;
	onRequest: ((request: Request, socket: SharedSocket) => void) | null = null;

	send(raw: string): void {
		const request = JSON.parse(raw) as Request;
		this.sent.push(request);
		this.onRequest?.(request, this);
	}

	reply(request: Request, value: unknown): void {
		this.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({
					type: "codex_workbench_result",
					requestId: request.requestId,
					action: request.action,
					ok: true,
					value,
				}),
			}),
		);
	}

	event(message: unknown): void {
		this.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({ type: "codex_workbench_event", message }),
			}),
		);
	}

	close(): void {
		this.closeCalls += 1;
		this.readyState = 3;
		this.dispatchEvent(new Event("close"));
	}
}

function snapshot(): Record<string, unknown> {
	return {
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: "child-a",
			epoch: "epoch-a",
			threadId: "thread-a",
			sourcePresentation: "standard",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		timeline: { kind: "timeline", threadId: "thread-a", turns: [], nextCursor: null },
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "unbound",
			threadId: null,
			activeTurnId: null,
			configuredModel: null,
			configuredEffort: null,
			model: null,
			effort: null,
			serviceTier: null,
			reason: null,
		},
		voice: {
			kind: "voice",
			state: "ready",
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: null,
		},
		lease: null,
		operation: null,
	};
}

test("transport and media owner share one pane socket and both receive gateway events", async () => {
	const socket = new SharedSocket();
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
				snapshot: snapshot(),
			});
	};

	try {
		await transport.attach(socket);
		await media.attach(transport);
		expect(socket.sent.filter((request) => request.action === "connect")).toHaveLength(0);
		expect(socket.sent.filter((request) => request.action === "subscribe")).toHaveLength(1);

		sequence = 3;
		const currentVoice = snapshot().voice as Record<string, unknown>;
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
