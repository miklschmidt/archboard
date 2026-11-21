import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { serveBunBrowserSockets } from "#server/agent/services/bun-serve.ts";
import type { VoiceConnection, VoiceSocket } from "#server/agent/services/connect.ts";
import { createVoiceAgent } from "#server/agent/services/voice-agent.ts";

type Connect = Parameters<typeof serveBunBrowserSockets>[0];

const SURFACE = "?tabSessionId=tab-one&chatId=main";

/**
 * A `connect` that answers each voice request on its socket and records what it was handed.
 * @param answer How it answers one request on the socket.
 * @returns The connect, the routes it received, the frames handed over and the releases.
 */
function recordingConnect(
	answer: (socket: VoiceSocket, frame: unknown) => Promise<void> = async (socket, frame) =>
		socket.send(JSON.stringify({ answered: frame })),
) {
	const routes: unknown[] = [];
	const received: unknown[] = [];
	let closed = 0;
	const connect: Connect = (socket, route) => {
		routes.push(route);
		const connection: VoiceConnection = {
			receive: (frame) => {
				if ((frame as { type?: unknown } | null)?.type !== "codex_workbench_request") return false;
				received.push(frame);
				return answer(socket, frame);
			},
			close: async () => {
				closed += 1;
			},
		};
		return connection;
	};
	return { connect, routes, received, closed: () => closed };
}

/**
 * Serve the adapter on a loopback Bun.serve server at port 0, with a host route of its own.
 * @param connect The connect the adapter hands its sockets to.
 * @param websocket The host's own socket handlers.
 * @returns The server's origin and socket URL, and a disposal that stops the server.
 */
function serve(connect: Connect, websocket?: Bun.WebSocketHandler<undefined>) {
	const handlers = serveBunBrowserSockets(connect, new Set(), {
		path: "/voice",
		checkout: "/work/checkout",
		fetch: () => new Response("host", { status: 418 }),
		...(websocket === undefined ? {} : { websocket }),
	});
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, ...handlers });
	const origin = server.url.origin;
	return {
		origin,
		socketUrl: `${origin.replace("http:", "ws:")}/voice${SURFACE}`,
		[Symbol.asyncDispose]: () => server.stop(true),
	};
}

/**
 * Open a socket and wait until it is open, or for the status its upgrade was refused with.
 * @param url The socket URL.
 * @param headers Extra request headers.
 * @returns The open socket, or the refusal status.
 */
function open(url: string, headers: Record<string, string> = {}) {
	return new Promise<WebSocket | number>((resolve, reject) => {
		const socket = new WebSocket(url, { headers });
		socket.once("open", () => resolve(socket));
		socket.once("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
		socket.once("error", reject);
	});
}

/**
 * Require an open socket.
 * @param socket The socket, or the status its upgrade was refused with.
 * @returns The socket.
 */
function opened(socket: WebSocket | number): WebSocket {
	if (typeof socket === "number") throw new Error(`The upgrade was refused with ${socket}.`);
	return socket;
}

/**
 * Wait for a socket's close code.
 * @param socket The socket.
 * @returns The close code.
 */
function closeCode(socket: WebSocket) {
	return new Promise<number>((resolve) => socket.once("close", resolve));
}

test("Bun.serve hands a socket on the path to connect with its request, and every other request to the host", async () => {
	const recorded = recordingConnect();
	await using host = serve(recorded.connect);
	const socket = opened(await open(host.socketUrl, { Origin: host.origin }));
	const answer = new Promise<unknown>((resolve) =>
		socket.once("message", (raw: Buffer) => resolve(JSON.parse(raw.toString()))),
	);
	socket.send(JSON.stringify({ type: "codex_workbench_request", requestId: "probe" }));
	expect(await answer).toEqual({
		answered: { type: "codex_workbench_request", requestId: "probe" },
	});
	expect(recorded.routes).toEqual([
		{
			request: { url: `${host.origin}/voice${SURFACE}`, headers: expect.any(Headers) },
			checkout: "/work/checkout",
		},
	]);
	expect((await fetch(`${host.origin}/voice${SURFACE}`)).status).toBe(418);
	expect((await fetch(`${host.origin}/other`)).status).toBe(418);
	const code = closeCode(socket);
	socket.close();
	await code;
	await Bun.sleep(10);
	expect(recorded.closed()).toBe(1);
});

test("Bun.serve gives a socket the host upgrades itself to the host's own handlers", async () => {
	const recorded = recordingConnect();
	const handlers = serveBunBrowserSockets<{ readonly room: string }>(recorded.connect, new Set(), {
		path: "/voice",
		checkout: "/work/checkout",
		fetch: (request, server) =>
			server.upgrade(request, { data: { room: "lobby" } })
				? undefined
				: new Response(null, { status: 400 }),
		websocket: {
			message: (ws, message) => {
				ws.send(`${ws.data.room}:${String(message)}`);
			},
		},
	});
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, ...handlers });
	try {
		const socket = opened(await open(`${server.url.origin.replace("http:", "ws:")}/chat`));
		const echo = new Promise<string>((resolve) =>
			socket.once("message", (raw: Buffer) => resolve(raw.toString())),
		);
		socket.send("hello");
		expect(await echo).toBe("lobby:hello");
		expect(recorded.routes).toEqual([]);
		socket.close();
	} finally {
		await server.stop(true);
	}
});

test("Bun.serve refuses a foreign origin with 403 and a missing tab session with 400 before it upgrades", async () => {
	const recorded = recordingConnect();
	await using host = serve(recorded.connect);
	expect(await open(host.socketUrl, { Origin: "https://other.example" })).toBe(403);
	expect(await open(`${host.origin.replace("http:", "ws:")}/voice?chatId=main`)).toBe(400);
	expect(recorded.routes).toEqual([]);
});

test("Bun.serve closes a socket that sends anything but a voice request with 1003", async () => {
	const recorded = recordingConnect();
	await using host = serve(recorded.connect);
	for (const frame of ["not json", JSON.stringify({ type: "pane_place" })]) {
		const socket = opened(await open(host.socketUrl));
		const code = closeCode(socket);
		socket.send(frame);
		expect(await code).toBe(1003);
	}
	expect(recorded.received).toEqual([]);
});

test("Bun.serve ends a socket whose frame it dropped over the backpressure limit", async () => {
	let dropped: unknown = null;
	const recorded = recordingConnect(async (socket) => {
		// The first frame outgrows the socket buffers and is queued; Bun drops the next one.
		await socket.send(JSON.stringify({ filler: "x".repeat(16 << 20) }));
		try {
			await socket.send(JSON.stringify({ after: true }));
		} catch (error) {
			dropped = error;
		}
	});
	const handlers = serveBunBrowserSockets(recorded.connect, new Set(), {
		path: "/voice",
		checkout: "/work/checkout",
		websocket: { backpressureLimit: 1, message: () => undefined },
	});
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, ...handlers });
	try {
		const socket = opened(
			await open(`${server.url.origin.replace("http:", "ws:")}/voice${SURFACE}`),
		);
		const code = closeCode(socket);
		socket.send(JSON.stringify({ type: "codex_workbench_request" }));
		expect(await code).not.toBe(1000);
		expect(dropped).toBeInstanceOf(Error);
	} finally {
		await server.stop(true);
	}
});

test("an agent's Bun handlers keep a socket that arrives before start, close it at shutdown, and admit the next", async () => {
	await using directory = new AsyncDisposableStack();
	const state = mkdtempSync(join(tmpdir(), "voice-bun-serve-"));
	directory.defer(() => rmSync(state, { recursive: true, force: true }));
	const agent = createVoiceAgent({
		directory: join(state, "private"),
		codex: { executablePath: "/nonexistent/codex" },
		checkouts: [state],
	});
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		...agent.bunHandlers({ path: "/voice" }),
	});
	directory.defer(() => server.stop(true));
	const url = `${server.url.origin.replace("http:", "ws:")}/voice${SURFACE}`;
	const early = opened(await open(url));
	const refusal = new Promise<unknown>((resolve) =>
		early.once("message", (raw: Buffer) => resolve(JSON.parse(raw.toString()))),
	);
	early.send(
		JSON.stringify({ type: "codex_workbench_request", requestId: "r", action: "connect" }),
	);
	expect(await refusal).toEqual({
		type: "codex_workbench_result",
		requestId: "r",
		action: "connect",
		ok: false,
		error: "The Codex workbench is unavailable.",
	});
	const code = closeCode(early);
	await agent.shutdown();
	expect(await code).toBe(1001);
	expect((await fetch(`${server.url.origin}/page`)).status).toBe(404);
	const later = opened(await open(url));
	later.close();
});

test("an agent's Bun handlers refuse a path that could never admit a socket, and a checkout it does not admit", () => {
	const state = mkdtempSync(join(tmpdir(), "voice-bun-paths-"));
	try {
		const agent = createVoiceAgent({
			directory: join(state, "private"),
			codex: { executablePath: "/nonexistent/codex" },
			checkouts: [state],
		});
		expect(() => agent.bunHandlers({ path: "voice" })).toThrow(TypeError);
		expect(() => agent.bunHandlers({ path: "/voice", checkout: "/elsewhere" })).toThrow(TypeError);
	} finally {
		rmSync(state, { recursive: true, force: true });
	}
});
