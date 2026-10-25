import { expect, test } from "bun:test";

import type {
	BrowserWorkbenchMediaOwner,
	BrowserWorkbenchMediaState,
} from "#ui/clients/media/media-state.ts";
import type { RealtimeMediaSnapshot } from "#ui/clients/realtime/media-session.ts";
import { createBrowserWorkbenchTransport } from "#ui/clients/transport/transport.ts";
import { createVoiceClient, openVoiceClient } from "#ui/clients/voice-client/voice-client.ts";
import { INITIAL_REALTIME_STATE } from "#shared/rules/realtime-state.ts";
import {
	FakeSocket,
	record,
	type FakeSocketRequest,
} from "#tests/ui/support/transport/fake-socket.ts";
import {
	accountResult,
	commandResult,
	lease,
	snapshot,
	snapshotMessage,
} from "#tests/ui/support/transport/fixtures.ts";

/** A pane socket that opens on the next task and can be closed. */
class OpeningSocket extends FakeSocket {
	readonly url: string;

	/**
	 * Open the socket.
	 * @param url The URL it was opened with.
	 */
	constructor(url: string) {
		super();
		this.url = url;
		queueMicrotask(() => this.dispatchEvent(new Event("open")));
	}
}

/** A pane socket that the server refuses: it closes without opening. */
class RefusedSocket extends FakeSocket {
	/** Close the socket on the next task. */
	constructor() {
		super();
		queueMicrotask(() => this.dispatchEvent(new Event("close")));
	}
}

/** One delayed run the client asked for. */
interface Timer {
	readonly delayMs: number;
	readonly run: () => void;
	cancelled: boolean;
}

/** A ready media owner that records the calls the client makes. */
class RecordingMedia implements BrowserWorkbenchMediaOwner {
	readonly calls: string[] = [];
	readonly #idle: RealtimeMediaSnapshot = { correlation: null, state: INITIAL_REALTIME_STATE };

	/**
	 * Record one call.
	 * @param name The call.
	 * @returns The idle media snapshot.
	 */
	#call(name: string): Promise<RealtimeMediaSnapshot> {
		this.calls.push(name);
		return Promise.resolve(this.#idle);
	}

	/**
	 * Record an attach.
	 * @returns The ready state.
	 */
	attach(): Promise<BrowserWorkbenchMediaState> {
		this.calls.push("attach");
		return Promise.resolve({ state: "ready" });
	}

	/**
	 * Record a detach.
	 * @returns Its completion.
	 */
	detach(): Promise<void> {
		this.calls.push("detach");
		return Promise.resolve();
	}

	/**
	 * Record a start.
	 * @returns The idle snapshot.
	 */
	start(): Promise<RealtimeMediaSnapshot> {
		return this.#call("start");
	}

	/**
	 * The client never appends text.
	 * @returns Never.
	 */
	appendText(): Promise<never> {
		return Promise.reject(new Error("The client never appends text."));
	}

	/**
	 * Record a mute.
	 * @returns The idle snapshot.
	 */
	mute(): Promise<RealtimeMediaSnapshot> {
		return this.#call("mute");
	}

	/**
	 * Record an unmute.
	 * @returns The idle snapshot.
	 */
	unmute(): Promise<RealtimeMediaSnapshot> {
		return this.#call("unmute");
	}

	/**
	 * Record a stop.
	 * @returns The idle snapshot.
	 */
	stop(): Promise<RealtimeMediaSnapshot> {
		return this.#call("stop");
	}

	/**
	 * No run has started.
	 * @returns Null.
	 */
	snapshot(): null {
		return null;
	}

	/**
	 * Always ready.
	 * @returns The ready state.
	 */
	state(): BrowserWorkbenchMediaState {
		return { state: "ready" };
	}

	/**
	 * No output plays.
	 * @returns Null.
	 */
	outputLevel(): null {
		return null;
	}

	/**
	 * Nothing publishes.
	 * @returns The unsubscribe.
	 */
	subscribe(): () => void {
		return noop;
	}

	/**
	 * Record a dispose.
	 * @returns Its completion.
	 */
	dispose(): Promise<void> {
		this.calls.push("dispose");
		return Promise.resolve();
	}
}

/** Does nothing. */
function noop(): void {
	// Nothing to undo.
}

/**
 * A media owner that records the calls the client makes.
 * @returns The owner and its call log.
 */
function recordingMedia(): { media: BrowserWorkbenchMediaOwner; calls: string[] } {
	const media = new RecordingMedia();
	return { media, calls: media.calls };
}

/**
 * A client over a gateway double that answers every command with one outcome.
 * @param outcome What each command result says about delivery.
 * @param refused Which socket opens, counted from 0, the server refuses.
 * @returns The client, the opened sockets, the media calls, the commands sent and the timers.
 */
function gateway(
	outcome: "delivered" | "outcome_unknown" = "delivered",
	refused: readonly number[] = [],
) {
	const sockets: FakeSocket[] = [];
	const urls: string[] = [];
	const timers: Timer[] = [];
	const commands: string[] = [];
	const { media, calls } = recordingMedia();
	let current = snapshot({ linkState: "executable" });
	let sequence = 0;
	let claims = 0;
	/**
	 * Answer one request the way the gateway does.
	 * @param request The request.
	 * @param socket The socket it came on.
	 */
	const answer = (request: FakeSocketRequest, socket: FakeSocket) => {
		const action = request["action"];
		if (action === "subscribe" || action === "snapshot") {
			sequence += 1;
			socket.reply(request, snapshotMessage(sequence, current));
		} else if (action === "accountRead") {
			socket.reply(request, accountResult(current));
		} else if (action === "claimLease") {
			claims += 1;
			const fresh = lease(Date.now() + 60_000, `command-${claims}`);
			current = { ...current, lease: fresh };
			socket.reply(request, fresh);
		} else if (action === "command") {
			const sent = record(request["command"]);
			commands.push(String(sent["command"]));
			socket.reply(request, {
				...commandResult(current, String(sent["commandId"])),
				outcome,
			});
		}
	};
	const client = openVoiceClient(
		{ socketPath: "/api/voice", paneId: "pane-a" },
		{
			transport: createBrowserWorkbenchTransport(),
			media,
			/**
			 * Open a socket the gateway double answers.
			 * @param url The URL it was opened with.
			 * @returns The socket.
			 */
			openSocket: (url) => {
				urls.push(url);
				if (refused.includes(sockets.length)) {
					const socket = new RefusedSocket();
					sockets.push(socket);
					return socket;
				}
				const socket = new OpeningSocket(url);
				socket.onRequest = answer;
				sockets.push(socket);
				return socket;
			},
			/**
			 * A fixed tab.
			 * @returns Its id.
			 */
			tabSessionId: () => "tab-1",
			/**
			 * A secure page.
			 * @returns Its URL.
			 */
			pageUrl: () => "https://host.test/page",
			/**
			 * Keep the run for the test to fire.
			 * @param delayMs How long the client would wait.
			 * @param run What runs then.
			 * @returns How to cancel it.
			 */
			after: (delayMs, run) => {
				const timer: Timer = { delayMs, run, cancelled: false };
				timers.push(timer);
				return () => {
					timer.cancelled = true;
				};
			},
		},
	);
	return { client, sockets, urls, calls, commands, timers };
}

/**
 * Fire the one pending timer and let the reconnect it starts settle.
 * @param timers The timers the client asked for.
 */
async function fire(timers: Timer[]): Promise<void> {
	const pending = timers.filter((timer) => !timer.cancelled);
	expect(pending).toHaveLength(1);
	for (const timer of pending) {
		timer.cancelled = true;
		timer.run();
	}
	await new Promise((resolve) => setTimeout(resolve, 0));
}

test("connect opens the socket with the pane and tab identity and attaches voice", async () => {
	const { client, sockets, urls, calls } = gateway();
	expect(await client.connect()).toBe(true);
	const url = new URL(urls[0] ?? "");
	expect(url.protocol).toBe("wss:");
	expect(url.pathname).toBe("/api/voice");
	expect(url.searchParams.get("paneId")).toBe("pane-a");
	expect(url.searchParams.get("tabSessionId")).toBe("tab-1");
	expect(calls).toEqual(["attach"]);
	expect(client.snapshot().connection).toBe("connected");
	expect(client.snapshot().server?.account.state).toBe("ready");
	expect(await client.connect()).toBe(true);
	expect(sockets[0]?.closeCalls).toBe(1);
	expect(calls).toEqual(["attach", "detach", "attach"]);
	await client.dispose();
});

/**
 * Dispose a client while a connect runs.
 * @param reconnect Whether a socket is already open when the connect starts.
 * @returns What the connect resolved and whether every socket it opened is closed.
 */
async function disposeDuringConnect(reconnect: boolean) {
	const { client, sockets } = gateway();
	if (reconnect) await client.connect();
	const connecting = client.connect();
	await client.dispose();
	return {
		connected: await connecting,
		closed: sockets.every((socket) => socket.closeCalls > 0),
	};
}

test("a dispose during connect or reconnect leaves no socket open", async () => {
	expect(await disposeDuringConnect(false)).toEqual({ connected: false, closed: true });
	expect(await disposeDuringConnect(true)).toEqual({ connected: false, closed: true });
});

test("a lost socket opens again by itself, also after failed attempts", async () => {
	const { client, sockets, timers } = gateway("delivered", [1, 2]);
	expect(await client.connect()).toBe(true);
	expect(timers).toHaveLength(0);
	sockets[0]?.close();
	expect(client.snapshot().connection).toBe("reconnecting");
	await fire(timers);
	await fire(timers);
	expect(client.snapshot().connection).not.toBe("connected");
	await fire(timers);
	expect(sockets).toHaveLength(4);
	expect(client.snapshot().connection).toBe("connected");
	expect(timers.filter((timer) => !timer.cancelled)).toHaveLength(0);
	await client.dispose();
});

test("a dispose ends a reconnect that waits, and a first connect that fails is not retried", async () => {
	const lost = gateway();
	await lost.client.connect();
	lost.sockets[0]?.close();
	await lost.client.dispose();
	expect(lost.timers.map((timer) => timer.cancelled)).toEqual([true]);
	expect(lost.sockets).toHaveLength(1);
	const first = gateway("delivered", [0]);
	expect(await first.client.connect()).toBe(false);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(first.timers).toHaveLength(0);
	await first.client.dispose();
});

test("an uncertain delivery stays visible and is never sent again", async () => {
	const { client, commands } = gateway("outcome_unknown");
	await client.connect();
	expect(await client.send("Investigate the checkout")).toBe(false);
	expect(commands).toEqual(["start"]);
	expect(client.snapshot().failure?.uncertain).toBe(true);
	expect(await client.refresh()).toBe(true);
	expect(client.snapshot().failure).toBeNull();
	expect(commands).toEqual(["start"]);
	await client.dispose();
});

test("voice stops during another action and the workhorse keeps working", async () => {
	const { client, calls, commands } = gateway();
	await client.connect();
	const sending = client.send("Keep working");
	expect(client.snapshot().busy).toBe(true);
	expect(await client.startVoice()).toBe(false);
	expect(await client.stopVoice()).toBe(true);
	expect(await sending).toBe(true);
	expect(calls).toEqual(["attach", "stop"]);
	expect(commands).toEqual(["start"]);
	expect(client.snapshot().busy).toBe(false);
	await client.dispose();
});

/** One page load: a client that opens its socket and is disposed. */
async function loadPage(): Promise<void> {
	const client = createVoiceClient({ socketPath: "/api/voice" });
	const connecting = client.connect();
	await new Promise((resolve) => setTimeout(resolve, 0));
	await client.dispose();
	await connecting;
}

/**
 * The tab session id that each of two page loads of one tab names, over replaced page globals.
 * @param storage The tab's `sessionStorage`.
 * @returns The id each load named on its socket.
 */
async function tabSessionIds(storage: Pick<Storage, "getItem" | "setItem">): Promise<string[]> {
	const urls: string[] = [];
	const page: Record<string, unknown> = globalThis;
	const browserSocket = page["WebSocket"];
	page["WebSocket"] = class extends OpeningSocket {
		/**
		 * Record the URL the client opened.
		 * @param url The URL.
		 */
		constructor(url: string) {
			super(url);
			urls.push(url);
		}
	};
	page["sessionStorage"] = storage;
	page["location"] = { href: "https://host.test/page" };
	try {
		await loadPage();
		await loadPage();
	} finally {
		page["WebSocket"] = browserSocket;
		delete page["sessionStorage"];
		delete page["location"];
	}
	return urls.map((url) => new URL(url).searchParams.get("tabSessionId") ?? "");
}

/** Storage that a privacy setting turned off. */
function refuseStorage(): never {
	throw new DOMException("Storage is disabled.", "SecurityError");
}

test("every page load of a tab names one tab session, also when storage refuses", async () => {
	const stored = new Map<string, string>();
	const kept = await tabSessionIds({
		/**
		 * Read a stored value.
		 * @param key The key.
		 * @returns The value, or null.
		 */
		getItem: (key) => stored.get(key) ?? null,
		/**
		 * Store a value.
		 * @param key The key.
		 * @param value The value.
		 */
		setItem: (key, value) => {
			stored.set(key, value);
		},
	});
	expect(kept).toHaveLength(2);
	expect(kept[0]).not.toBe("");
	expect(kept[1]).toBe(kept[0]);
	const unstored = await tabSessionIds({ getItem: refuseStorage, setItem: refuseStorage });
	expect(unstored).toHaveLength(2);
	expect(unstored[0]).not.toBe("");
	expect(unstored[1]).toBe(unstored[0]);
});
