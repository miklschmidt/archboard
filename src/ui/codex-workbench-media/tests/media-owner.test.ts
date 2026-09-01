import { afterEach, expect, test } from "bun:test";

import { createBrowserWorkbenchMediaOwner } from "../index.js";
import { FakeBrowser, restoreFakeBrowsers } from "./support/browser-media-fake.js";

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

function mediaSocket() {
	const mediaReady: boolean[] = [];
	let lease = 0;
	const snapshot = {
		threadLink: { state: "executable", threadId: "thread-media" },
		voice: { state: "ready" },
	};
	const socket = new FakeSocket((request) => {
		const action = String(request.action);
		let value: unknown;
		if (action === "connect" || action === "subscribe")
			value = { kind: "snapshot", sequence: 1, snapshot };
		else if (action === "mediaReady") {
			mediaReady.push(request.ready === true);
			value = { kind: "snapshot", sequence: mediaReady.length + 1, snapshot };
		} else if (action === "claimLease") {
			lease += 1;
			value = {
				kind: "command_lease",
				commandId: `media-state-${lease}`,
				paneId: "pane-media",
				childId: "child-media",
				epoch: "epoch-media",
				state: "active",
				expiresAtMs: 999_999,
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
	return { socket, mediaReady };
}

async function waitForSent(socket: FakeSocket, action: string): Promise<Record<string, unknown>> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		const request = socket.sent.find(
			(candidate) => (candidate as Record<string, unknown>).action === action,
		) as Record<string, unknown> | undefined;
		if (request !== undefined) return request;
		await Bun.sleep(1);
	}
	throw new Error(`The socket did not send ${action}.`);
}

function reply(
	socket: FakeSocket,
	request: Record<string, unknown>,
	input: { readonly ok: boolean; readonly value?: unknown; readonly error?: string },
): void {
	socket.dispatchEvent(
		new MessageEvent("message", {
			data: JSON.stringify({
				type: "codex_workbench_result",
				requestId: request.requestId,
				action: request.action,
				...input,
			}),
		}),
	);
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
		if (action === "connect" || action === "subscribe" || action === "mediaReady")
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
		expect(owner.state()).toEqual({ state: "ready" });
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
		"mediaReady",
	]);
	await owner.dispose();
});

test("overlapping attach ignores the replaced run's late success and rejection", async () => {
	for (const late of [
		{ ok: true, value: { kind: "snapshot", sequence: 1, snapshot: {} } },
		{ ok: false, error: "late refusal" },
	] as const) {
		const owner = createBrowserWorkbenchMediaOwner();
		const first = new FakeSocket(() => undefined);
		const replacement = new FakeSocket(unavailableResponse);
		try {
			const firstAttach = owner.attach(first as unknown as WebSocket);
			const firstConnect = await waitForSent(first, "connect");
			const replacementAttach = owner.attach(replacement as unknown as WebSocket);
			reply(first, firstConnect, late);
			await Promise.all([firstAttach, replacementAttach]);
			expect(owner.state()).toMatchObject({
				state: "unavailable",
				reason: "media_api_unavailable",
			});
		} finally {
			await owner.dispose();
		}
	}
});

test("an overlapping start cannot overwrite the replacement socket state", async () => {
	const environment = new FakeBrowser();
	const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			createElement: () => new FakeAudioElement(),
			body: { append: () => undefined },
		},
	});
	const snapshot = {
		threadLink: { state: "executable", threadId: "thread-overlap" },
		voice: { state: "ready" },
	};
	let lease = 0;
	const first = new FakeSocket((request) => {
		if (request.action === "command") return undefined;
		if (request.action === "claimLease") {
			lease += 1;
			return {
				type: "codex_workbench_result",
				requestId: request.requestId,
				action: request.action,
				ok: true,
				value: {
					kind: "command_lease",
					commandId: `overlap-${lease}`,
					paneId: "pane-overlap",
					childId: "child-overlap",
					epoch: "epoch-overlap",
					state: "active",
					expiresAtMs: 999_999,
				},
			};
		}
		return {
			type: "codex_workbench_result",
			requestId: request.requestId,
			action: request.action,
			ok: true,
			value: { kind: "snapshot", sequence: 1, snapshot },
		};
	});
	const replacement = new FakeSocket(unavailableResponse);
	const owner = createBrowserWorkbenchMediaOwner();
	try {
		await owner.attach(first as unknown as WebSocket);
		const starting = owner.start();
		const command = await waitForSent(first, "command");
		await owner.attach(replacement as unknown as WebSocket);
		reply(first, command, {
			ok: true,
			value: {
				kind: "command_result",
				outcome: "delivered",
				snapshot,
				realtimeSessionHandle: "overlap-1",
				realtimeAnswer: {
					sessionId: "overlap-1",
					correlationId: "overlap-1",
					sdp: "v=0\r\na=late-answer",
				},
			},
		});
		const startFailure = await starting.then(
			() => null,
			(error: unknown) => error,
		);
		expect(startFailure).toBeInstanceOf(Error);
		expect(owner.state()).toEqual({ state: "ready" });
	} finally {
		await owner.dispose();
		environment.restore();
		if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
		else Reflect.deleteProperty(globalThis, "document");
	}
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
	expect(await owner.attach(failed as unknown as WebSocket)).toEqual({
		state: "unavailable",
		reason: "attach_failed",
		message: "subscription refused",
	});
	expect(owner.snapshot()).toBeNull();

	const recovered = new FakeSocket(unavailableResponse);
	await owner.attach(recovered as unknown as WebSocket);
	expect(recovered.sent.map((request) => (request as { action: string }).action)).toEqual([
		"connect",
		"subscribe",
		"mediaReady",
	]);
	await owner.dispose();
});

test("missing browser media APIs publish an explicit unavailable socket state", async () => {
	const owner = createBrowserWorkbenchMediaOwner();
	const { socket, mediaReady } = mediaSocket();
	expect(await owner.attach(socket as unknown as WebSocket)).toEqual({
		state: "unavailable",
		reason: "media_api_unavailable",
		message: "This browser cannot install realtime microphone and audio support.",
	});
	expect(mediaReady).toEqual([false]);
	await owner.dispose();
});

test("permission and SDP failures revoke voice readiness before returning", async () => {
	for (const failure of ["permission", "sdp"] as const) {
		const environment = new FakeBrowser();
		const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {
				createElement: () => new FakeAudioElement(),
				body: { append: () => undefined },
			},
		});
		if (failure === "permission")
			Object.defineProperty(environment, "getUserMedia", {
				configurable: true,
				value: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
			});
		else environment.fail = "createOffer";
		const owner = createBrowserWorkbenchMediaOwner();
		const { socket, mediaReady } = mediaSocket();
		try {
			await owner.attach(socket as unknown as WebSocket);
			const snapshot = await owner.start();
			expect(snapshot.state.phase).toMatch(/error/);
			expect(owner.state()).toMatchObject({
				state: "unavailable",
				reason: failure === "permission" ? "permission_denied" : "negotiation_failed",
			});
			expect(mediaReady).toEqual([true, true, false]);
		} finally {
			await owner.dispose();
			environment.restore();
			if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
			else Reflect.deleteProperty(globalThis, "document");
		}
	}
});
