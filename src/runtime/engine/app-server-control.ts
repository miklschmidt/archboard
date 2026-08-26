// A client for the Codex app-server control socket.
//
// This is the only channel by which archboard can tell a *running* Codex
// thread that something happened. CLI responses are pull-only: once a command
// exits, they cannot report a later human board change (ADR 0005). Push
// therefore uses this socket.
//
// Everything below was read out of the Codex source rather than guessed, and
// the surprising parts are worth stating because they will otherwise look like
// bugs:
//
//   · The socket is a Unix socket carrying an ordinary RFC6455 WebSocket
//     upgrade. The request path is never inspected; `ws` reaches it with
//     `{ socketPath }`.
//   · It is NOT JSON-RPC 2.0. There is no `jsonrpc` field, in either
//     direction, and sending one is not part of the protocol
//     (`app-server-protocol/src/rpc.rs` says so in as many words). Messages are
//     discriminated structurally: {id,method} request, {method} notification,
//     {id,result} response, {id,error} error.
//   · `initialize` is mandatory once per connection; everything else answers
//     -32600 "Not initialized" until it lands. `initialized` is sent after,
//     and is ignored by the server, and is sent anyway because every in-tree
//     client sends it.
//   · `params` is required, even when empty. Omit it and the request fails to
//     deserialize.
//   · The server starts pushing notifications immediately — before the
//     initialize response — so the reader must buffer rather than assume the
//     first frame is the answer.
//   · Every initialized connection is auto-subscribed to threads the daemon
//     creates or resumes *after* it connects. We therefore never resume or
//     start anything: this client only ever listens and injects.
//
// Access control is the filesystem and nothing else: the directory is 0700 and
// the socket 0600, so reaching it means running as the same user. That is also
// why this client refuses a socket it does not own — see connect().

import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import WebSocket from "ws";
import logger from "./logger.js";

export const CONTROL_SOCKET_DIR = "app-server-control";
export const CONTROL_SOCKET_FILE = "app-server-control.sock";

export function codexHome(): string {
	const fromEnv = process.env.CODEX_HOME;
	if (fromEnv?.trim()) return path.resolve(fromEnv.trim());
	return path.join(os.homedir(), ".codex");
}

export function controlSocketPath(home = codexHome()): string {
	return path.join(home, CONTROL_SOCKET_DIR, CONTROL_SOCKET_FILE);
}

export interface SocketCheck {
	path: string;
	exists: boolean;
	isSocket: boolean;
	ownedByUs: boolean;
	mode?: string;
	problem?: string;
}

/**
 * What can be known about the socket without connecting.
 *
 * Ownership is checked, not just existence: a socket at that path belonging to
 * another uid is not our daemon, and handing it board changes would be talking
 * to a stranger's agent.
 */
export function checkSocket(socketPath = controlSocketPath()): SocketCheck {
	try {
		const stat = fs.statSync(socketPath);
		const uid = typeof process.getuid === "function" ? process.getuid() : stat.uid;
		const ownedByUs = stat.uid === uid;
		return {
			path: socketPath,
			exists: true,
			isSocket: stat.isSocket(),
			ownedByUs,
			mode: (stat.mode & 0o777).toString(8),
			...(stat.isSocket() ? {} : { problem: "that path exists but is not a socket" }),
			...(ownedByUs
				? {}
				: { problem: `the socket belongs to uid ${stat.uid}, not to this process` }),
		};
	} catch {
		return {
			path: socketPath,
			exists: false,
			isSocket: false,
			ownedByUs: false,
			problem:
				"no app-server control socket — the Codex app-server daemon is not running (or CODEX_HOME points elsewhere)",
		};
	}
}

export interface ControlNotification {
	method: string;
	params: any;
}

export interface AppServerControlOptions {
	socketPath?: string;
	/**
	 * Becomes the daemon's request originator unless it is one of Codex's
	 * non-originating names, so this is deliberately conservative: archboard is
	 * a bystander on this socket, not the thing driving the session.
	 */
	clientName?: string;
	clientVersion?: string;
	requestTimeoutMs?: number;
}

interface Pending {
	resolve: (value: any) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
}

export class AppServerControl extends EventEmitter {
	readonly socketPath: string;
	private ws: WebSocket | null = null;
	private ready: Promise<void> | null = null;
	private pending = new Map<number, Pending>();
	private nextId = 1;
	private closed = false;
	private readonly clientName: string;
	private readonly clientVersion: string;
	private readonly requestTimeoutMs: number;
	lastError: string | null = null;
	initializedAt: string | null = null;

	constructor(options: AppServerControlOptions = {}) {
		super();
		this.socketPath = options.socketPath ?? controlSocketPath();
		this.clientName = options.clientName ?? "archboard";
		this.clientVersion = options.clientVersion ?? "0.1.0";
		this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
	}

	get connected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN && this.initializedAt !== null;
	}

	/** Connect and initialize. Repeat calls share one in-flight attempt. */
	connect(): Promise<void> {
		if (this.connected) return Promise.resolve();
		if (this.ready) return this.ready;

		const check = checkSocket(this.socketPath);
		if (!check.exists || !check.isSocket || !check.ownedByUs) {
			this.lastError = check.problem ?? "the control socket is not usable";
			return Promise.reject(new Error(this.lastError));
		}

		this.closed = false;
		this.ready = new Promise<void>((resolve, reject) => {
			// `ws+unix://<socket>:<path>` is how `ws` dials a Unix socket; passing
			// `socketPath` alongside an ordinary ws:// URL is silently ignored and
			// the client goes looking for localhost:80 instead. The request path is
			// never inspected by the daemon.
			const ws = new WebSocket(`ws+unix://${this.socketPath}:/rpc`);
			this.ws = ws;
			let settled = false;
			const fail = (error: Error) => {
				if (settled) return;
				settled = true;
				this.lastError = error.message;
				this.ready = null;
				reject(error);
			};

			const timer = setTimeout(() => {
				fail(
					new Error(`the app-server did not answer initialize within ${this.requestTimeoutMs}ms`),
				);
				ws.terminate();
			}, this.requestTimeoutMs);
			timer.unref?.();

			ws.on("open", () => {
				ws.send(
					JSON.stringify({
						id: "initialize",
						method: "initialize",
						params: {
							clientInfo: {
								name: this.clientName,
								title: "archboard canvas",
								version: this.clientVersion,
							},
							capabilities: { experimentalApi: false },
						},
					}),
				);
			});

			ws.on("message", (raw) => {
				let message: any;
				try {
					message = JSON.parse(raw.toString());
				} catch {
					return; // a frame we cannot read is the daemon's business, not ours
				}

				if (message.id === "initialize") {
					clearTimeout(timer);
					if (message.error) {
						fail(
							new Error(
								`initialize was refused: ${message.error.message ?? JSON.stringify(message.error)}`,
							),
						);
						return;
					}
					// Ignored by the server, sent by every in-tree client.
					ws.send(JSON.stringify({ method: "initialized" }));
					this.initializedAt = new Date().toISOString();
					this.lastError = null;
					settled = true;
					this.emit("ready", message.result);
					resolve();
					return;
				}

				this.handle(message);
			});

			ws.on("error", (error) => {
				// A connect failure arrives as an AggregateError with an empty
				// message, which is the least useful thing to log, so the code is
				// pulled out when there is nothing else to say.
				const reason = (error as Error).message || (error as any).code || String(error);
				logger.warn(`app-server control socket error: ${reason}`);
				fail(new Error(String(reason)));
			});

			ws.on("close", () => {
				this.initializedAt = null;
				this.ready = null;
				for (const [id, entry] of this.pending) {
					clearTimeout(entry.timer);
					entry.reject(new Error("the app-server connection closed before the call was answered"));
					this.pending.delete(id);
				}
				fail(new Error("the app-server connection closed during initialize"));
				if (!this.closed) this.emit("disconnected");
			});
		});

		return this.ready;
	}

	private handle(message: any): void {
		if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
			const entry = typeof message.id === "number" ? this.pending.get(message.id) : undefined;
			if (!entry) return;
			clearTimeout(entry.timer);
			this.pending.delete(message.id);
			if (message.error) {
				const error = new Error(message.error.message ?? "the app-server refused the call");
				(error as any).code = message.error.code;
				(error as any).data = message.error.data;
				entry.reject(error);
			} else {
				entry.resolve(message.result);
			}
			return;
		}

		if (message.method && message.id !== undefined) {
			// A server→client request — an approval prompt, typically, aimed at
			// whichever client owns the turn. archboard owns nothing here and must
			// never answer one on the human's behalf, so it declines the way Codex's
			// own client declines methods it does not implement. Silence would be
			// worse: a turn waiting on a reply that never comes is a hung session.
			logger.info(
				`app-server asked archboard to handle "${message.method}"; declining — archboard is a listener on this socket`,
			);
			this.ws?.send(
				JSON.stringify({
					id: message.id,
					error: {
						code: -32601,
						message: "archboard does not implement app-server client requests",
					},
				}),
			);
			return;
		}

		if (message.method) {
			this.emit("notification", {
				method: message.method,
				params: message.params,
			} as ControlNotification);
		}
	}

	/** One JSON-RPC call. `params` is always sent, even when empty. */
	async call<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
		await this.connect();
		const ws = this.ws;
		if (!ws || ws.readyState !== WebSocket.OPEN)
			throw new Error("the app-server connection is not open");
		const id = this.nextId++;
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(
					new Error(`the app-server did not answer ${method} within ${this.requestTimeoutMs}ms`),
				);
			}, this.requestTimeoutMs);
			timer.unref?.();
			this.pending.set(id, { resolve, reject, timer });
			ws.send(JSON.stringify({ id, method, params }));
		});
	}

	close(): void {
		this.closed = true;
		this.ready = null;
		this.initializedAt = null;
		try {
			this.ws?.close();
		} catch {
			/* closing a socket that is already gone is not news */
		}
		this.ws = null;
	}

	// ---- the two verbs archboard uses ---------------------------------------

	/**
	 * Append items to a thread's history WITHOUT starting a turn — the quiet
	 * channel. The agent sees them next time it speaks. Raw response items skip
	 * `UserPromptSubmit`, so an archboard injection cannot trigger archboard's
	 * own hook: no feedback loop, by construction.
	 */
	injectItems(threadId: string, text: string): Promise<Record<string, never>> {
		return this.call("thread/inject_items", {
			threadId,
			items: [{ type: "message", role: "developer", content: [{ type: "input_text", text }] }],
		});
	}

	/**
	 * Interrupt a running turn — the loud channel. Requires the id of the turn
	 * that is actually running; a mismatch is refused rather than applied to
	 * whatever is current, which is the whole point of the precondition.
	 */
	steerTurn(threadId: string, expectedTurnId: string, text: string): Promise<{ turnId: string }> {
		return this.call("turn/steer", {
			threadId,
			expectedTurnId,
			input: [{ type: "text", text }],
		});
	}
}
