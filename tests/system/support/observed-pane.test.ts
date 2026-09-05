import { expect, jest, test } from "bun:test";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

import { TEST_PANE_MESSAGE_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";
import { openObservedPane } from "./observed-pane.ts";

interface Event {
	type: string;
	board?: string;
	[key: string]: unknown;
}

async function startInitialPaneServer(): Promise<{
	base: string;
	closed: Promise<void>;
	dispose(): Promise<void>;
}> {
	const server = createServer();
	const sockets = new WebSocketServer({ server });
	let resolveClosed!: () => void;
	const closed = new Promise<void>((resolve) => (resolveClosed = resolve));
	sockets.on("connection", (socket) => {
		socket.once("close", resolveClosed);
		socket.send(JSON.stringify({ type: "initial_elements", board: "scratch" }));
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("Pane server did not bind.");
	}
	return {
		base: `http://127.0.0.1:${address.port}`,
		closed,
		async dispose() {
			for (const socket of sockets.clients) {
				socket.terminate();
			}
			await new Promise<void>((resolve) => sockets.close(() => resolve()));
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
		},
	};
}

test("registration timeout aborts the request and closes the accepted socket", async () => {
	const server = await startInitialPaneServer();
	try {
		jest.useFakeTimers();
		let resolveStarted!: () => void;
		const started = new Promise<void>((resolve) => (resolveStarted = resolve));
		let aborted = false;
		const opening = openObservedPane<Event>({
			base: server.base,
			clientId: "registration-timeout",
			register: (_board, signal) => {
				resolveStarted();
				return new Promise((_resolve, reject) => {
					signal.addEventListener(
						"abort",
						() => {
							aborted = true;
							reject(signal.reason);
						},
						{ once: true },
					);
				});
			},
			readPanes: async () => ({ status: 200, body: { success: true, panes: [] } }),
		});
		await started;
		jest.advanceTimersByTime(TEST_PANE_MESSAGE_TIMEOUT_MS);
		await expect(opening).rejects.toThrow("waiting for pane registration-timeout to register");
		expect(aborted).toBeTrue();
		await server.closed;
	} finally {
		jest.useRealTimers();
		await server.dispose();
	}
});

test("close timeout terminates the socket and does not consult stale registry state", async () => {
	const server = await startInitialPaneServer();
	try {
		let registryReads = 0;
		const pane = await openObservedPane<Event>({
			base: server.base,
			clientId: "close-timeout",
			register: async () => ({ status: 200, body: { success: true, registered: true } }),
			readPanes: async () => {
				registryReads += 1;
				return { status: 200, body: { success: true, panes: [] } };
			},
		});
		const terminate = pane.socket.terminate.bind(pane.socket);
		let terminated = false;
		pane.socket.close = () => undefined;
		pane.socket.terminate = () => {
			terminated = true;
			terminate();
		};
		jest.useFakeTimers();
		const closing = pane.close();
		jest.advanceTimersByTime(TEST_PANE_MESSAGE_TIMEOUT_MS);
		await expect(closing).rejects.toThrow("waiting for pane close-timeout to close its socket");
		expect(terminated).toBeTrue();
		expect(registryReads).toBe(0);
		expect(pane.socket.listenerCount("message")).toBe(0);
		await server.closed;
	} finally {
		jest.useRealTimers();
		await server.dispose();
	}
});

test("close rejects a malformed successful registry response with its body", async () => {
	const server = await startInitialPaneServer();
	try {
		const pane = await openObservedPane<Event>({
			base: server.base,
			clientId: "malformed-registry",
			register: async () => ({ status: 200, body: { success: true, registered: true } }),
			readPanes: async () => ({ status: 200, body: { success: true } }),
		});
		await expect(pane.close()).rejects.toThrow(
			'Pane malformed-registry could not verify registry cleanup: HTTP 200, {"success":true}.',
		);
		expect(pane.socket.listenerCount("message")).toBe(0);
		await server.closed;
	} finally {
		await server.dispose();
	}
});

test("close accepts a valid registry containing only another client id", async () => {
	const server = await startInitialPaneServer();
	try {
		let registryReads = 0;
		const pane = await openObservedPane<Event>({
			base: server.base,
			clientId: "closing-client",
			register: async () => ({ status: 200, body: { success: true, registered: true } }),
			readPanes: async () => {
				registryReads += 1;
				return {
					status: 200,
					body: { success: true, panes: [{ clientId: "remaining-client" }] },
				};
			},
		});
		await pane.close();
		expect(registryReads).toBe(1);
		expect(pane.socket.listenerCount("message")).toBe(0);
		await server.closed;
	} finally {
		await server.dispose();
	}
});
