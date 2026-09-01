import { afterEach, expect, test } from "bun:test";

import { createBrowserWorkbenchMediaOwner } from "../../canvas/codex-workbench-media-owner.js";
import { FakeBrowser, restoreFakeBrowsers } from "./support/media-session-fakes.js";

class FakeSocket extends EventTarget {
	readonly sent: unknown[] = [];
	readyState: number = WebSocket.OPEN;
	constructor(readonly respond: (request: Record<string, unknown>) => unknown) {
		super();
	}
	send(raw: string): void {
		const request = JSON.parse(raw) as Record<string, unknown>;
		this.sent.push(request);
		const response = this.respond(request);
		this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(response) }));
	}
	close(): void {
		this.readyState = WebSocket.CLOSED;
		this.dispatchEvent(new Event("close"));
	}
}

class FakeAudioElement {
	autoplay = false;
	hidden = false;
	srcObject: MediaProvider | null = null;
	removed = false;
	pauseCount = 0;
	play(): Promise<void> {
		return Promise.resolve();
	}
	pause(): void {
		this.pauseCount += 1;
	}
	load(): void {}
	setAttribute(): void {}
	removeAttribute(): void {}
	remove(): void {
		this.removed = true;
	}
}

function unavailableResponse(request: Record<string, unknown>) {
	return {
		type: "codex_workbench_result",
		requestId: request.requestId,
		action: request.action,
		ok: true,
		value: { kind: "snapshot", sequence: 1, snapshot: { voice: { state: "unavailable" } } },
	};
}

afterEach(restoreFakeBrowsers);

test("the browser workbench media owner negotiates and cleans one socket-bound local session", async () => {
	const environment = new FakeBrowser();
	const audio: FakeAudioElement[] = [];
	const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			createElement: () => {
				const element = new FakeAudioElement();
				audio.push(element);
				return element;
			},
			body: { append: () => undefined },
		},
	});
	const snapshot = {
		threadLink: {
			state: "executable",
			threadId: "thread-media",
		},
		voice: { state: "ready" },
	};
	let leaseNumber = 0;
	const commands: Record<string, unknown>[] = [];
	const socket = new FakeSocket((request) => {
		const action = String(request.action);
		let value: unknown;
		if (action === "connect" || action === "subscribe")
			value = { kind: "snapshot", sequence: 1, snapshot };
		else if (action === "claimLease") {
			leaseNumber += 1;
			value = {
				kind: "command_lease",
				commandId: `media-lease-${leaseNumber}`,
				paneId: "pane-media",
				childId: "child-media",
				epoch: "epoch-media",
				state: "active",
				expiresAtMs: 999_999,
			};
		} else if (action === "command") {
			const command = request.command as Record<string, unknown>;
			commands.push(command);
			value = {
				kind: "command_result",
				outcome: "delivered",
				snapshot,
				...(command.command === "realtimeStart"
					? {
							realtimeSessionHandle: command.commandId,
							realtimeAnswer: {
								sessionId: command.commandId,
								correlationId: command.commandId,
								sdp: "v=0\r\na=answer",
							},
						}
					: {}),
			};
		} else throw new Error(`unexpected action: ${action}`);
		return {
			type: "codex_workbench_result",
			requestId: request.requestId,
			action,
			ok: true,
			value,
		};
	});
	const owner = createBrowserWorkbenchMediaOwner();
	try {
		await owner.attach(socket as unknown as WebSocket);
		const started = await owner.start();
		expect(started.state).toMatchObject({ phase: "listening" });
		await owner.appendText("continue the same voice turn");
		const stopped = await owner.stop();
		expect(stopped.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(commands.map((command) => command.command)).toEqual([
			"realtimeStart",
			"realtimeAppendText",
			"realtimeStop",
		]);
		expect(commands[1]?.realtimeSessionHandle).toBe(commands[0]?.commandId);
		expect(commands[2]?.realtimeSessionHandle).toBe(commands[0]?.commandId);
		expect(audio).toHaveLength(1);
		expect(audio[0]).toMatchObject({ removed: true, srcObject: null });
		environment.assertReleased();
	} finally {
		await owner.dispose();
		if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
		else Reflect.deleteProperty(globalThis, "document");
	}
});

test("socket replacement disposes browser media before adopting the new socket", async () => {
	const owner = createBrowserWorkbenchMediaOwner();
	const first = new FakeSocket(unavailableResponse);
	const second = new FakeSocket(unavailableResponse);
	await owner.attach(first as unknown as WebSocket);
	await owner.attach(second as unknown as WebSocket);
	await owner.detach(first as unknown as WebSocket);
	expect(second.sent.map((request) => (request as { action: string }).action)).toEqual([
		"connect",
		"subscribe",
	]);
	await owner.dispose();
});

test("a failed socket subscription leaves no run and a later socket can recover", async () => {
	const owner = createBrowserWorkbenchMediaOwner();
	const failed = new FakeSocket((request) =>
		request.action === "connect"
			? unavailableResponse(request)
			: {
					type: "codex_workbench_result",
					requestId: request.requestId,
					action: request.action,
					ok: false,
					error: "subscription refused",
				},
	);
	expect(owner.attach(failed as unknown as WebSocket)).rejects.toThrow("subscription refused");
	expect(owner.snapshot()).toBeNull();

	const recovered = new FakeSocket(unavailableResponse);
	await owner.attach(recovered as unknown as WebSocket);
	expect(recovered.sent.map((request) => (request as { action: string }).action)).toEqual([
		"connect",
		"subscribe",
	]);
	await owner.dispose();
});
