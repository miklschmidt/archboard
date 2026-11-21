// A voice client over a gateway double: sockets that open, are refused or close, a media owner
// that records its calls, the commands the gateway received and the timers the client asked for.

import { expect } from "bun:test";

import type {
	BrowserWorkbenchMediaOwner,
	BrowserWorkbenchMediaState,
} from "#ui/media/clients/media-state.ts";
import type { RealtimeMediaSnapshot } from "#ui/realtime/clients/media-session.ts";
import { createBrowserWorkbenchTransport } from "#ui/transport/clients/transport.ts";
import { openVoiceClient } from "#ui/voice-client/clients/open-voice-client.ts";
import { INITIAL_REALTIME_STATE } from "#shared/rules/realtime-state.ts";
import {
	FakeSocket,
	record,
	type Answerer,
	type FakeSocketRequest,
} from "#tests/ui/support/transport/fake-socket.ts";
import {
	accountResult,
	commandResult,
	lease,
	snapshot,
	snapshotMessage,
} from "#tests/ui/support/transport/fixtures.ts";

/** A chat socket that opens on the next task and can be closed. */
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

/** A chat socket that the server refuses: it closes without opening. */
class RefusedSocket extends FakeSocket {
	/** Close the socket on the next task. */
	constructor() {
		super();
		queueMicrotask(() => this.dispatchEvent(new Event("close")));
	}
}

/** A chat socket that opens and that the server closes, with a reason, before its first answer. */
class ClosedSocket extends FakeSocket {
	/** Open the socket, then close it on its first request. */
	constructor() {
		super();
		queueMicrotask(() => this.dispatchEvent(new Event("open")));
		/** Close the socket as the server does, with its reason. */
		this.onRequest = () => {
			this.readyState = 3;
			this.dispatchEvent(new CloseEvent("close", { code: 1011, reason: SERVER_REASON }));
		};
	}
}

const SERVER_REASON = "server-reason";

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
 * An answerer that handles one action itself and hands every other request on.
 * @param action The gateway action it handles.
 * @param handle What it does with that action's request.
 * @param answer How every other request is answered.
 * @returns The answerer.
 */
function intercept(action: string, handle: Answerer, answer: Answerer): Answerer {
	return (request, socket) => {
		if (request["action"] === action) handle(request, socket);
		else answer(request, socket);
	};
}

/**
 * Answer with a value that is no snapshot this browser can read.
 * @param request The request.
 * @param socket The socket it came on.
 */
function replyUnreadable(request: FakeSocketRequest, socket: FakeSocket): void {
	socket.reply(request, { unreadable: true });
}

/**
 * Lose the socket instead of answering.
 * @param _request The request.
 * @param socket The socket it came on.
 */
function closeSocket(_request: FakeSocketRequest, socket: FakeSocket): void {
	socket.close();
}

/** How the gateway double answers; each socket is counted from 0 in the order it opens. */
interface GatewayBehaviour {
	/** What each command result says about delivery. */
	readonly outcome?: "delivered" | "outcome_unknown";
	/** The sockets the server refuses: they close without opening. */
	readonly refused?: readonly number[];
	/** The sockets whose subscribe answer this browser cannot read. */
	readonly unreadable?: readonly number[];
	/** The sockets that are lost when a command arrives on them, before it is answered. */
	readonly lostOnCommand?: readonly number[];
	/** The sockets the server closes before its first answer. */
	readonly closed?: readonly number[];
	/** The approvals each snapshot carries. */
	readonly approvals?: readonly unknown[];
}

/** A gateway double that delivers every command and loses, refuses and closes no socket. */
const PLAIN_GATEWAY: Required<GatewayBehaviour> = {
	outcome: "delivered",
	refused: [],
	unreadable: [],
	lostOnCommand: [],
	closed: [],
	approvals: [],
};

/**
 * A client over a gateway double that answers every command with one outcome.
 * @param behaviour How the double answers, where it differs from {@link PLAIN_GATEWAY}.
 * @returns The client, the opened sockets, the media calls, the commands sent and the timers.
 */
function gateway(behaviour: GatewayBehaviour = {}) {
	const { outcome, refused, unreadable, lostOnCommand, closed, approvals } = {
		...PLAIN_GATEWAY,
		...behaviour,
	};
	const page = new EventTarget();
	const sockets: FakeSocket[] = [];
	const urls: string[] = [];
	const timers: Timer[] = [];
	const commands: string[] = [];
	const { media, calls } = recordingMedia();
	let current = snapshot({ linkState: "executable", approvals });
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
	/**
	 * How one socket is answered.
	 * @param index The socket, counted from 0.
	 * @returns The answerer.
	 */
	const answererOf = (index: number): Answerer => {
		if (unreadable.includes(index)) return intercept("subscribe", replyUnreadable, answer);
		if (lostOnCommand.includes(index)) return intercept("command", closeSocket, answer);
		return answer;
	};
	const client = openVoiceClient(
		{ url: "/api/voice", chatId: "chat-a" },
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
				if (refused.includes(sockets.length) || closed.includes(sockets.length)) {
					const socket = refused.includes(sockets.length)
						? new RefusedSocket()
						: new ClosedSocket();
					sockets.push(socket);
					return socket;
				}
				const socket = new OpeningSocket(url);
				socket.onRequest = answererOf(sockets.length);
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
			page,
		},
	);
	return { client, sockets, urls, calls, commands, timers, page };
}

/**
 * Wait until the client's state passes a check, as the page sees its publications.
 * @param client The client.
 * @param check The check.
 * @param turns How many more turns of the event loop it waits.
 */
async function until(
	client: ReturnType<typeof gateway>["client"],
	check: (state: ReturnType<typeof client.snapshot>) => boolean,
	turns = 100,
): Promise<void> {
	if (turns === 0 || check(client.snapshot())) {
		expect(check(client.snapshot())).toBe(true);
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, 0));
	await until(client, check, turns - 1);
}

/**
 * Wait until the client is connected and idle.
 * @param client The client.
 */
async function connected(client: ReturnType<typeof gateway>["client"]): Promise<void> {
	await until(client, (state) => state.connection === "connected" && !state.busy);
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

export { OpeningSocket, SERVER_REASON, connected, fire, gateway, until };
