import { createServer, type Server } from "node:http";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { WebSocket, WebSocketServer } from "ws";

export interface InjectionMessage {
	id?: number;
	method?: string;
	params?: Record<string, unknown>;
	jsonrpc?: unknown;
}

export interface InjectionDaemon {
	home: string;
	received: InjectionMessage[];
	dispose(): Promise<void>;
}

export async function startInjectionDaemon(): Promise<InjectionDaemon> {
	const home = mkdtempSync(join(tmpdir(), "ab-"));
	const socketDir = join(home, "app-server-control");
	mkdirSync(socketDir, { recursive: true, mode: 0o700 });
	const socketPath = join(socketDir, "app-server-control.sock");
	const received: InjectionMessage[] = [];
	const server: Server = createServer();
	const sockets = new WebSocketServer({ server });
	const clients = new Set<WebSocket>();
	const notificationTimers = new Set<ReturnType<typeof setTimeout>>();
	sockets.on("connection", (socket) => {
		clients.add(socket);
		socket.once("close", () => clients.delete(socket));
		let initialized = false;
		socket.on("message", (raw) => {
			const message = JSON.parse(raw.toString()) as InjectionMessage;
			if (message.method === "initialize") {
				initialized = true;
				socket.send(JSON.stringify({ id: message.id, result: { userAgent: "stub/0" } }));
				const timer = setTimeout(() => {
					notificationTimers.delete(timer);
					if (socket.readyState !== WebSocket.OPEN) return;
					socket.send(
						JSON.stringify({ method: "thread/started", params: { threadId: "thread-idle" } }),
					);
					socket.send(
						JSON.stringify({
							method: "turn/started",
							params: {
								threadId: "thread-live",
								turn: { id: "turn-1", status: "inProgress", items: [] },
							},
						}),
					);
				}, 20);
				notificationTimers.add(timer);
				return;
			}
			received.push(message);
			if (message.id === undefined) return;
			if (!initialized) {
				socket.send(
					JSON.stringify({ id: message.id, error: { code: -32600, message: "Not initialized" } }),
				);
			} else if (message.method === "thread/inject_items") {
				socket.send(JSON.stringify({ id: message.id, result: {} }));
			} else if (message.method === "turn/steer") {
				const params = message.params as { expectedTurnId?: string } | undefined;
				socket.send(
					params?.expectedTurnId === "turn-1"
						? JSON.stringify({ id: message.id, result: { turnId: "turn-1" } })
						: JSON.stringify({
								id: message.id,
								error: { code: -32602, message: "expectedTurnId does not match" },
							}),
				);
			} else {
				socket.send(
					JSON.stringify({ id: message.id, error: { code: -32601, message: "method not found" } }),
				);
			}
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, resolve);
	});
	chmodSync(socketPath, 0o600);
	let disposePromise: Promise<void> | undefined;
	return {
		home,
		received,
		dispose() {
			disposePromise ??= (async () => {
				for (const timer of notificationTimers) clearTimeout(timer);
				notificationTimers.clear();
				for (const client of clients) client.terminate();
				clients.clear();

				const closes = await Promise.allSettled([
					new Promise<void>((resolve, reject) => {
						sockets.close((error) => (error ? reject(error) : resolve()));
					}),
					new Promise<void>((resolve, reject) => {
						server.close((error) => (error ? reject(error) : resolve()));
					}),
				]);
				rmSync(home, { recursive: true, force: true });
				const failure = closes.find((result) => result.status === "rejected");
				if (failure?.status === "rejected") throw failure.reason;
			})();
			return disposePromise;
		},
	};
}
