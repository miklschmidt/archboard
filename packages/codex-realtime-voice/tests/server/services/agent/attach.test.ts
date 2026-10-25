import { expect, test } from "bun:test";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";

import { attachBrowserSockets } from "#server/services/agent/attach.ts";

type BrowserPort = Parameters<typeof attachBrowserSockets>[1];

/**
 * A browser port that records what attach hands it.
 * @returns The port, the requests it received and the sockets it closed.
 */
function recordingPort() {
	const handled: unknown[] = [];
	const closed: object[] = [];
	const port: BrowserPort = {
		accept: () => undefined,
		handle: async (_instance, _browserId, input) => {
			handled.push(input);
		},
		close: async (instance) => {
			closed.push(instance);
		},
		drain: async () => undefined,
	};
	return { port, handled, closed };
}

/**
 * Listen on a loopback port.
 * @returns The server and its origin.
 */
async function listen(): Promise<{ server: Server; origin: string }> {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

/**
 * Send one upgrade request and read the status it is answered with.
 * @param origin The listener's origin.
 * @param path The request path.
 * @param headers Extra request headers.
 * @returns The response status.
 */
function upgradeStatus(origin: string, path: string, headers: Record<string, string> = {}) {
	return new Promise<number | undefined>((resolve, reject) => {
		const upgrade = request(origin, {
			path,
			headers: { Connection: "Upgrade", Upgrade: "websocket", ...headers },
		});
		upgrade.once("response", (response) => {
			response.resume();
			resolve(response.statusCode);
		});
		upgrade.once("error", reject);
		upgrade.end();
	});
}

const SURFACE = "?tabSessionId=tab-one&chatId=main";

test("attach refuses a foreign origin on its path and leaves other paths to other listeners", async () => {
	const { server, origin } = await listen();
	const detach = attachBrowserSockets(server, recordingPort().port, {
		path: "/voice",
		origin,
		checkout: "/work/checkout",
	});
	// The other listener answers only its own path, as a server's listeners each do.
	server.on("upgrade", (incoming, socket) => {
		if (incoming.url?.startsWith("/other"))
			socket.end("HTTP/1.1 418 I'm a teapot\r\nConnection: close\r\n\r\n");
	});
	try {
		expect(
			await upgradeStatus(origin, `/voice${SURFACE}`, { Origin: "https://other.example" }),
		).toBe(403);
		expect(await upgradeStatus(origin, `/voice?chatId=main`)).toBe(400);
		expect(await upgradeStatus(origin, `/other${SURFACE}`)).toBe(418);
		// A target that is no URL is refused, never thrown out of the server's upgrade listener.
		expect(await upgradeStatus(origin, "http://[")).toBe(400);
	} finally {
		await detach();
		server.close();
	}
});

test("attach forwards JSON frames and closes a socket that sends anything else with 1003", async () => {
	const { server, origin } = await listen();
	const { port, handled } = recordingPort();
	const detach = attachBrowserSockets(server, port, {
		path: "/voice",
		origin,
		checkout: "/work/checkout",
	});
	try {
		const socket = new WebSocket(`${origin.replace("http:", "ws:")}/voice${SURFACE}`, { origin });
		await new Promise((resolve, reject) => {
			socket.once("open", resolve);
			socket.once("error", reject);
		});
		socket.send(JSON.stringify({ type: "probe" }));
		socket.send("not json");
		const code = await new Promise<number>((resolve) => socket.once("close", resolve));
		expect(handled).toEqual([{ type: "probe" }]);
		expect(code).toBe(1003);
	} finally {
		await detach();
		server.close();
	}
});

test("attach detach closes the open socket and releases it in the port once", async () => {
	const { server, origin } = await listen();
	const { port, closed } = recordingPort();
	const detach = attachBrowserSockets(server, port, {
		path: "/voice",
		origin,
		checkout: "/work/checkout",
	});
	try {
		const socket = new WebSocket(`${origin.replace("http:", "ws:")}/voice${SURFACE}`, { origin });
		await new Promise((resolve, reject) => {
			socket.once("open", resolve);
			socket.once("error", reject);
		});
		const code = new Promise<number>((resolve) => socket.once("close", resolve));
		await detach();
		expect(await code).not.toBe(1000);
		expect(closed).toHaveLength(1);
		expect(server.listenerCount("upgrade")).toBe(0);
	} finally {
		server.close();
	}
});

test("attach refuses a path or origin that could never admit a socket", () => {
	const server = createServer();
	const { port } = recordingPort();
	const attach = (path: string, origin: string) => () =>
		attachBrowserSockets(server, port, { path, origin, checkout: "/work/checkout" });
	expect(attach("voice", "http://127.0.0.1:4100")).toThrow(TypeError);
	for (const origin of ["http://127.0.0.1:4100/", "127.0.0.1:4100", "ws://127.0.0.1:4100"]) {
		expect(attach("/voice", origin)).toThrow(TypeError);
	}
	expect(server.listenerCount("upgrade")).toBe(0);
});
