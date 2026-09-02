import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

import type {
	BrowserConnectionInstance,
	BrowserGatewayMessage,
	BrowserWorkbenchConnection,
	CodexWorkbenchGateway,
} from "../../codex-workbench/index.js";
import { createCanvasCodexBrowserSocketOwner } from "../codex-workbench-browser.js";

test("socket acceptance transfers gateway ownership before the retired socket closes", async () => {
	let current: BrowserConnectionInstance | null = null;
	const connection = (instance: BrowserConnectionInstance): BrowserWorkbenchConnection => ({
		browserId: "browser-reconnect",
		paneId: "pane-reconnect",
		instance,
		snapshot: () => ({ kind: "snapshot", sequence: 1, snapshot: {} }) as never,
		claimLease: () => {
			if (current !== instance) throw new Error("The stale socket cannot claim authority.");
			return { kind: "command_lease", commandId: "replacement-command" } as never;
		},
		renewLease: () => ({}) as never,
		releaseLease: () => null,
		setMediaReady: () => ({}) as never,
		accountRead: async () => ({}) as never,
		command: async () => ({}) as never,
		subscribe: () => () => undefined,
		close: async () => {
			if (current === instance) current = null;
		},
	});
	const gateway = {
		connect: (_browserId: string, _paneId: string, instance: BrowserConnectionInstance) => {
			current = instance;
			return connection(instance);
		},
		closeConnection: async (
			_browserId: string,
			_paneId: string,
			instance: BrowserConnectionInstance,
		) => {
			if (current === instance) current = null;
		},
	} as unknown as CodexWorkbenchGateway;
	const owner = createCanvasCodexBrowserSocketOwner({
		gateway,
		paneForBrowser: () => "pane-reconnect",
	});
	const first = Object.freeze({ socket: "first" });
	const replacement = Object.freeze({ socket: "replacement" });
	const messages: unknown[] = [];
	try {
		await owner.handle(
			first,
			"browser-reconnect",
			{ type: "codex_workbench_request", requestId: "first", action: "connect" },
			{ send: (message) => messages.push(message) },
		);
		owner.accept(replacement, "browser-reconnect");
		expect(current === replacement).toBeTrue();

		await owner.close(first, "browser-reconnect");
		expect(current === replacement).toBeTrue();
		await owner.handle(
			replacement,
			"browser-reconnect",
			{ type: "codex_workbench_request", requestId: "replacement", action: "claimLease" },
			{ send: (message) => messages.push(message) },
		);
		expect(messages).toContainEqual(
			expect.objectContaining({
				type: "codex_workbench_result",
				requestId: "replacement",
				ok: true,
			}),
		);
	} finally {
		owner.dispose();
	}
});

test("normal browser close and teardown share one delayed close owner", async () => {
	const instance = Object.freeze({ socket: "delayed-close" });
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let closeCalls = 0;
	const connection = {
		browserId: "browser-delayed",
		paneId: "pane-delayed",
		instance,
		close: async () => {
			closeCalls += 1;
			await gate;
		},
	} as unknown as BrowserWorkbenchConnection;
	const gateway = {
		connect: () => connection,
		closeConnection: async () => {
			closeCalls += 1;
			await gate;
		},
	} as unknown as CodexWorkbenchGateway;
	const owner = createCanvasCodexBrowserSocketOwner({
		gateway,
		paneForBrowser: () => "pane-delayed",
	});
	owner.accept(instance, "browser-delayed");
	const normalClose = owner.close(instance, "browser-delayed");
	const repeatedClose = owner.close(instance, "browser-delayed");
	expect(repeatedClose).toBe(normalClose);
	let drained = false;
	const stopping = owner.drain().then(() => {
		drained = true;
		return undefined;
	});
	await Bun.sleep(0);
	expect(closeCalls).toBe(1);
	expect(drained).toBeFalse();
	release();
	await Promise.all([normalClose, repeatedClose, stopping]);
	expect(closeCalls).toBe(1);
	expect(drained).toBeTrue();
	owner.dispose();
});

test("the public socket owner routes the complete gateway workflow through server-owned identity", async () => {
	const calls: string[] = [];
	const messages: unknown[] = [];
	const instance = Object.freeze({});
	const listener: { current: ((message: BrowserGatewayMessage) => void) | null } = {
		current: null,
	};
	const connection: BrowserWorkbenchConnection = {
		browserId: "browser-1",
		paneId: "pane-authoritative",
		instance,
		snapshot: () => {
			calls.push("snapshot");
			return { kind: "snapshot", sequence: 1, snapshot: {} } as never;
		},
		claimLease: () => {
			calls.push("claim");
			return { kind: "command_lease", commandId: "command-1" } as never;
		},
		renewLease: () => {
			calls.push("renew");
			return { kind: "command_lease", commandId: "command-1" } as never;
		},
		releaseLease: () => {
			calls.push("release");
			return null;
		},
		setMediaReady: (ready) => {
			calls.push(`media:${String(ready)}`);
			return { kind: "snapshot", sequence: 2, snapshot: {} } as never;
		},
		accountRead: async () => {
			calls.push("account");
			return { kind: "account_read" } as never;
		},
		command: async (command) => {
			calls.push(`command:${JSON.stringify(command)}`);
			return { kind: "command_result" } as never;
		},
		subscribe: (next) => {
			calls.push("subscribe");
			listener.current = next;
			return () => {
				calls.push("unsubscribe");
				listener.current = null;
			};
		},
		close: async () => {
			calls.push("connection-close");
		},
	};
	const gateway: CodexWorkbenchGateway = {
		connect: (browserId, paneId) => {
			calls.push(`connect:${browserId}:${paneId}`);
			return connection;
		},
		snapshot: () => connection.snapshot(),
		claimLease: () => connection.claimLease(),
		renewLease: () => connection.renewLease(),
		releaseLease: () => connection.releaseLease(),
		accountRead: () => connection.accountRead(),
		command: (_browserId, command) => connection.command(command),
		subscribe: (_browserId, _paneId, next) => connection.subscribe(next),
		closeConnection: async (browserId, paneId, closingInstance) =>
			void calls.push(`close:${browserId}:${paneId}:${String(closingInstance === instance)}`),
		childExit: async () => undefined,
		dispose: async () => undefined,
	};
	const owner = createCanvasCodexBrowserSocketOwner({
		gateway,
		paneForBrowser: (browserId) => (browserId === "browser-1" ? "pane-authoritative" : null),
	});
	const send = { send: (message: unknown) => messages.push(message) };
	for (const [requestId, action, extra] of [
		["1", "connect", {}],
		["2", "subscribe", {}],
		["3", "snapshot", {}],
		["4", "claimLease", {}],
		["5", "renewLease", {}],
		["6", "accountRead", {}],
		["7", "command", { command: { command: "approvalRespond" } }],
		["8", "mediaReady", { ready: true }],
		["9", "releaseLease", {}],
	] as const) {
		await owner.handle(
			instance,
			"browser-1",
			{ type: "codex_workbench_request", requestId, action, ...extra },
			send,
		);
	}
	listener.current?.({ kind: "delta", sequence: 2, delta: {} } as never);
	await owner.handle(
		instance,
		"browser-1",
		{ type: "codex_workbench_request", requestId: "10", action: "close" },
		send,
	);
	owner.dispose();
	const replacementOwner = createCanvasCodexBrowserSocketOwner({
		gateway,
		paneForBrowser: () => "pane-authoritative",
	});
	await replacementOwner.close(instance, "browser-1");

	expect(calls).toEqual([
		"connect:browser-1:pane-authoritative",
		"snapshot",
		"subscribe",
		"snapshot",
		"snapshot",
		"claim",
		"renew",
		"account",
		'command:{"command":"approvalRespond"}',
		"media:true",
		"release",
		"unsubscribe",
		"connection-close",
		"close:browser-1:pane-authoritative:true",
	]);
	expect(messages).toContainEqual({
		type: "codex_workbench_event",
		message: { kind: "delta", sequence: 2, delta: {} },
	});
	expect(messages).toContainEqual({
		type: "codex_workbench_result",
		requestId: "7",
		action: "command",
		ok: true,
		value: { kind: "command_result" },
	});
});

test("the socket owner refuses missing pane authority and disposal only removes subscriptions", async () => {
	const calls: string[] = [];
	const gateway: CodexWorkbenchGateway = {
		connect: () => {
			throw new Error("must not connect");
		},
		snapshot: () => {
			throw new Error("must not snapshot");
		},
		claimLease: () => {
			throw new Error("must not claim");
		},
		renewLease: () => {
			throw new Error("must not renew");
		},
		releaseLease: () => {
			throw new Error("must not release");
		},
		accountRead: async () => {
			throw new Error("must not read account");
		},
		command: async () => {
			throw new Error("must not command");
		},
		subscribe: () => {
			throw new Error("must not subscribe");
		},
		closeConnection: async (browserId: string) => void calls.push(browserId),
		childExit: async () => undefined,
		dispose: async () => undefined,
	};
	const owner = createCanvasCodexBrowserSocketOwner({ gateway, paneForBrowser: () => null });
	const messages: unknown[] = [];
	await owner.handle(
		Object.freeze({}),
		"browser-1",
		{ type: "codex_workbench_request", requestId: "missing", action: "connect" },
		{ send: (message) => messages.push(message) },
	);
	owner.dispose();
	expect(messages).toContainEqual({
		type: "codex_workbench_result",
		requestId: "missing",
		action: "connect",
		ok: false,
		error: "The browser has not registered an authoritative canvas pane.",
	});
	expect(calls).toEqual([]);
});

test("the public request crosses a real WebSocket transport and returns the gateway snapshot", async () => {
	const instance = Object.freeze({});
	const connection: BrowserWorkbenchConnection = {
		browserId: "browser-live",
		paneId: "pane-live",
		instance,
		snapshot: () =>
			({ kind: "snapshot", sequence: 3, snapshot: { kind: "browser_snapshot" } }) as never,
		claimLease: () => ({}) as never,
		renewLease: () => ({}) as never,
		releaseLease: () => null,
		setMediaReady: () => connection.snapshot(),
		accountRead: async () => ({}) as never,
		command: async () => ({}) as never,
		subscribe: () => () => undefined,
		close: async () => undefined,
	};
	const gateway: CodexWorkbenchGateway = {
		connect: () => connection,
		snapshot: () => connection.snapshot(),
		claimLease: () => connection.claimLease(),
		renewLease: () => connection.renewLease(),
		releaseLease: () => connection.releaseLease(),
		accountRead: () => connection.accountRead(),
		command: (_browserId, command) => connection.command(command),
		subscribe: (_browserId, _paneId, listener) => connection.subscribe(listener),
		closeConnection: async () => undefined,
		childExit: async () => undefined,
		dispose: async () => undefined,
	};
	const owner = createCanvasCodexBrowserSocketOwner({
		gateway,
		paneForBrowser: () => "pane-live",
	});
	const server = createServer();
	const sockets = new WebSocketServer({ server });
	sockets.on("connection", (socket) => {
		socket.on("message", (raw) => {
			void owner.handle(instance, "browser-live", JSON.parse(raw.toString()), {
				send: (message) => socket.send(JSON.stringify(message)),
			});
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("missing live test port");
	const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
	await new Promise<void>((resolve, reject) => {
		client.once("open", resolve);
		client.once("error", reject);
	});
	const response = new Promise<unknown>((resolve) => {
		client.once("message", (raw) => resolve(JSON.parse(raw.toString())));
	});
	client.send(
		JSON.stringify({
			type: "codex_workbench_request",
			requestId: "live-1",
			action: "connect",
		}),
	);
	expect(await response).toEqual({
		type: "codex_workbench_result",
		requestId: "live-1",
		action: "connect",
		ok: true,
		value: { kind: "snapshot", sequence: 3, snapshot: { kind: "browser_snapshot" } },
	});
	client.close();
	await new Promise<void>((resolve) => sockets.close(() => resolve()));
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
});
