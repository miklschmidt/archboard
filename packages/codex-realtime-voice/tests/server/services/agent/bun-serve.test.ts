import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { serveBunBrowserSockets } from "#server/services/agent/bun-serve.ts";
import { createVoiceAgent } from "#server/services/agent/voice-agent.ts";

type BrowserPort = Parameters<typeof serveBunBrowserSockets>[0];

/**
 * A browser port that records what the adapter hands it and answers each request.
 * @returns The port, the requests it received and the sockets it closed.
 */
function recordingPort() {
	const handled: unknown[] = [];
	const closed: object[] = [];
	const port: BrowserPort = {
		accept: () => undefined,
		handle: async (_instance, _browserId, input, transport) => {
			handled.push(input);
			await transport.send({ answered: input });
		},
		close: async (instance) => {
			closed.push(instance);
		},
		drain: async () => undefined,
	};
	return { port, handled, closed };
}

/**
 * Serve the adapter on a loopback Bun.serve server at port 0, with a host route of its own.
 * @param port The browser port.
 * @returns The server's origin, its detach, and a disposal that stops the server.
 */
function serve(port: BrowserPort) {
	const { handlers, detach } = serveBunBrowserSockets(port, {
		path: "/voice",
		checkout: "/work/checkout",
		fetch: () => new Response("host", { status: 418 }),
	});
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, ...handlers });
	const origin = server.url.origin;
	return {
		origin,
		socketUrl: `${origin.replace("http:", "ws:")}/voice${SURFACE}`,
		detach,
		[Symbol.asyncDispose]: async () => {
			await detach();
			await server.stop(true);
		},
	};
}

/**
 * Open a socket and wait until it is open, or for the status its upgrade was refused with.
 * @param url The socket URL.
 * @param headers Extra request headers.
 * @returns The open socket, or the refusal status.
 */
function connect(url: string, headers: Record<string, string> = {}) {
	return new Promise<WebSocket | number>((resolve, reject) => {
		const socket = new WebSocket(url, { headers });
		socket.once("open", () => resolve(socket));
		socket.once("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
		socket.once("error", reject);
	});
}

/**
 * Wait for a socket's close code.
 * @param socket The socket.
 * @returns The close code.
 */
function closeCode(socket: WebSocket) {
	return new Promise<number>((resolve) => socket.once("close", resolve));
}

const SURFACE = "?tabSessionId=tab-one&chatId=main";

test("Bun.serve sockets on the path are answered, and every other request reaches the host", async () => {
	const { port, handled } = recordingPort();
	await using host = serve(port);
	const socket = await connect(host.socketUrl, { Origin: host.origin });
	if (typeof socket === "number") throw new Error(`The upgrade was refused with ${socket}.`);
	const answer = new Promise<unknown>((resolve) =>
		socket.once("message", (raw: Buffer) => resolve(JSON.parse(raw.toString()))),
	);
	socket.send(JSON.stringify({ type: "probe" }));
	expect(await answer).toEqual({ answered: { type: "probe" } });
	expect(handled).toEqual([{ type: "probe" }]);
	expect((await fetch(`${host.origin}/voice${SURFACE}`)).status).toBe(418);
	expect((await fetch(`${host.origin}/other`)).status).toBe(418);
	socket.close();
});

test("Bun.serve gives a socket the host upgrades itself to the host's own handlers", async () => {
	const { port, handled } = recordingPort();
	const { handlers, detach } = serveBunBrowserSockets<{ readonly room: string }>(port, {
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
		const socket = await connect(`${server.url.origin.replace("http:", "ws:")}/chat`);
		if (typeof socket === "number") throw new Error(`The upgrade was refused with ${socket}.`);
		const echo = new Promise<string>((resolve) =>
			socket.once("message", (raw: Buffer) => resolve(raw.toString())),
		);
		socket.send("hello");
		expect(await echo).toBe("lobby:hello");
		expect(handled).toEqual([]);
		socket.close();
	} finally {
		await detach();
		await server.stop(true);
	}
});

test("Bun.serve refuses a foreign origin with 403 and a missing tab session with 400", async () => {
	await using host = serve(recordingPort().port);
	expect(await connect(host.socketUrl, { Origin: "https://other.example" })).toBe(403);
	expect(await connect(`${host.origin.replace("http:", "ws:")}/voice?chatId=main`)).toBe(400);
});

test("Bun.serve closes a socket that sends a non-JSON frame with 1003", async () => {
	const { port, handled } = recordingPort();
	await using host = serve(port);
	const socket = await connect(host.socketUrl);
	if (typeof socket === "number") throw new Error(`The upgrade was refused with ${socket}.`);
	const code = closeCode(socket);
	socket.send("not json");
	expect(await code).toBe(1003);
	expect(handled).toEqual([]);
});

test("Bun.serve ends a socket whose frame it dropped over the backpressure limit", async () => {
	const closed: object[] = [];
	let dropped: unknown = null;
	const port: BrowserPort = {
		accept: () => undefined,
		handle: async (_instance, _browserId, _input, transport) => {
			// The first frame outgrows the socket buffers and is queued; Bun drops the next one.
			await transport.send({ filler: "x".repeat(16 << 20) });
			await transport.send({ after: true }).catch((error: unknown) => (dropped = error));
		},
		close: async (instance) => {
			closed.push(instance);
		},
		drain: async () => undefined,
	};
	const { handlers, detach } = serveBunBrowserSockets(port, {
		path: "/voice",
		checkout: "/work/checkout",
		websocket: { backpressureLimit: 1, message: () => undefined },
	});
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, ...handlers });
	try {
		const socket = await connect(`${server.url.origin.replace("http:", "ws:")}/voice${SURFACE}`);
		if (typeof socket === "number") throw new Error(`The upgrade was refused with ${socket}.`);
		const code = closeCode(socket);
		socket.send(JSON.stringify({ type: "probe" }));
		expect(await code).not.toBe(1000);
		expect(dropped).toBeInstanceOf(Error);
		expect(closed).toHaveLength(1);
	} finally {
		await detach();
		await server.stop(true);
	}
});

test("Bun.serve detach closes the open socket in the port and refuses the next", async () => {
	const { port, closed } = recordingPort();
	await using host = serve(port);
	const socket = await connect(host.socketUrl);
	if (typeof socket === "number") throw new Error(`The upgrade was refused with ${socket}.`);
	const code = closeCode(socket);
	await host.detach();
	expect(await code).not.toBe(1000);
	expect(closed).toHaveLength(1);
	expect(await connect(host.socketUrl)).toBe(503);
});

test("an agent's Bun handlers close a socket with 1011 before start, refuse sockets after shutdown, and new handlers serve again", async () => {
	await using directory = new AsyncDisposableStack();
	const state = mkdtempSync(join(tmpdir(), "voice-bun-serve-"));
	directory.defer(() => rmSync(state, { recursive: true, force: true }));
	const agent = createVoiceAgent({
		storage: { directory: join(state, "private") },
		codex: { executablePath: "/nonexistent/codex" },
		checkouts: [state],
		instructions: { coordinator: "Coordinate.", workhorse: "Work." },
		/** This agent never starts, so it cannot fail. */
		onFatal: () => undefined,
	});
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		...agent.bunHandlers({ path: "/voice" }),
	});
	directory.defer(() => server.stop(true));
	const url = `${server.url.origin.replace("http:", "ws:")}/voice${SURFACE}`;
	const early = await connect(url);
	if (typeof early === "number") throw new Error(`The upgrade was refused with ${early}.`);
	expect(await closeCode(early)).toBe(1011);
	await agent.shutdown();
	expect(await connect(url)).toBe(503);
	expect((await fetch(`${server.url.origin}/page`)).status).toBe(404);
	server.reload({ ...agent.bunHandlers({ path: "/voice" }) });
	const rearmed = await connect(url);
	if (typeof rearmed === "number") throw new Error(`The upgrade was refused with ${rearmed}.`);
	expect(await closeCode(rearmed)).toBe(1011);
});

test("Bun.serve refuses a path or a named origin that could never admit a socket", () => {
	const { port } = recordingPort();
	const serveOn = (path: string, origin?: string) => () =>
		serveBunBrowserSockets(port, {
			path,
			checkout: "/work/checkout",
			...(origin === undefined ? {} : { origin }),
		});
	expect(serveOn("voice")).toThrow(TypeError);
	expect(serveOn("/voice", "http://127.0.0.1:4100/")).toThrow(TypeError);
});
