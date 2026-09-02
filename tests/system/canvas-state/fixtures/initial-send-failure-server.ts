import { appendFileSync } from "node:fs";
import { WebSocketServer, type WebSocket } from "ws";

type SendCallback = (error?: Error) => void;
interface SendOptions {
	binary?: boolean;
	compress?: boolean;
	fin?: boolean;
	mask?: boolean;
}
type Send = (
	data: WebSocket.Data,
	options?: SendOptions | SendCallback,
	callback?: SendCallback,
) => void;
type Emit = (this: WebSocketServer, event: string | symbol, ...args: unknown[]) => boolean;

let initialSendCount = 0;
const logPath = process.env.ARCHBOARD_TEST_INITIAL_SEND_LOG;
if (!logPath) throw new Error("ARCHBOARD_TEST_INITIAL_SEND_LOG is required.");

const originalEmit = WebSocketServer.prototype.emit as Emit;
(WebSocketServer.prototype as unknown as { emit: Emit }).emit = function (event, ...args): boolean {
	if (event === "connection") {
		const socket = args[0] as WebSocket;
		const originalSend = socket.send.bind(socket) as Send;
		(socket as unknown as { send: Send }).send = function (data, options, callback): void {
			const sendCallback = typeof options === "function" ? options : callback;
			if (typeof data === "string") {
				try {
					const message = JSON.parse(data) as { type?: unknown };
					if (message.type === "initial_elements") {
						initialSendCount += 1;
						appendFileSync(
							logPath,
							`${JSON.stringify({ count: initialSendCount, callback: Boolean(sendCallback) })}\n`,
						);
						if (initialSendCount === 2) {
							queueMicrotask(() => sendCallback?.(new Error("injected initial send failure")));
							return;
						}
					}
				} catch {
					// Non-JSON WebSocket data follows the real transport path.
				}
			}
			if (typeof options === "function") originalSend(data, options);
			else originalSend(data, options, callback);
		};
	}
	return originalEmit.call(this, event, ...args);
};

const server = await import("../../../../src/server.ts");
await server.startServer();
