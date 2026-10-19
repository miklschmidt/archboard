// The application mounted through its entrypoint, as the page mounts it, over a
// server faked at the network: fetch, which each test file answers, and a socket
// the test opens and speaks on.
//
// Importing this registers the page's globals for the test file before React is
// loaded, and puts them away after the file's last test. A test file loads React
// and the application through this, and never before it.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll } from "bun:test";

GlobalRegistrator.register({ url: "http://127.0.0.1:3000/" });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

// React's renderer is loaded once the page's globals are there.
const { act, cleanup, fireEvent, render, within } = await import("@testing-library/react");
const { createElement } = await import("react");
const { Application } = await import("@/ui/application");
const { createBoardRoutingHost } = await import("@/ui/board-routing");
const { learnServedVault } = await import("@archboard/server-requests");

/** The vault the faked server was started with, and the repository it is the chosen checkout of. */
const SERVED = Object.freeze({
	vault: "/work/pipeline/.archboard/vault",
	repository: "github.com/acme/pipeline",
});

/** The repositories the faked server lists: the served vault's, ready. */
const REPOSITORIES = Object.freeze({
	success: true,
	served: SERVED.vault,
	repositories: [
		{
			name: SERVED.repository,
			untracked: false,
			vault: SERVED.vault,
			state: "ready",
			checkouts: [{ root: "/work/pipeline", chosen: true, exists: true, hasVault: true }],
		},
	],
});

/** A socket the test opens and speaks on, in place of the server's. */
class FakeSocket extends EventTarget {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	static readonly made: FakeSocket[] = [];
	readyState = FakeSocket.CONNECTING;
	readonly sent: string[] = [];

	/**
	 * A socket dialled by the page.
	 * @param url Where it dialled.
	 */
	constructor(readonly url: string) {
		super();
		FakeSocket.made.push(this);
	}

	/** The server accepts the connection. */
	open(): void {
		this.readyState = FakeSocket.OPEN;
		this.dispatchEvent(new Event("open"));
	}

	/**
	 * The server says something.
	 * @param message What it says.
	 */
	say(message: Record<string, unknown>): void {
		this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
	}

	/**
	 * The page sends something.
	 * @param data What it sends.
	 */
	send(data: string): void {
		this.sent.push(data);
	}

	/** The page closes the socket. */
	close(): void {
		this.readyState = FakeSocket.CLOSED;
		this.dispatchEvent(new CloseEvent("close", { code: 1000 }));
	}
}

/**
 * A JSON answer.
 * @param body The body.
 * @param status The status.
 * @returns The response.
 */
function answer(body: unknown, status = 200): Promise<Response> {
	return Promise.resolve(
		new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
	);
}

/**
 * The answer to whatever a test file does not fake.
 * @returns A refusal.
 */
function notFaked(): Promise<Response> {
	return answer({ success: false, error: "not faked" }, 404);
}

/**
 * How the faked server answers one request.
 * @param url What the page asked for.
 * @param init How it asked.
 * @returns The answer.
 */
type Answering = (url: URL, init: RequestInit | undefined) => Promise<Response>;

/** The faked server: each test file says how it answers. */
const server: { answering: Answering } = { answering: notFaked };

/**
 * The page's fetch, answered by the faked server.
 * @param input What the page asked for.
 * @param init How it asked.
 * @returns The answer.
 */
function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
	const asked = new URL(url, "http://127.0.0.1:3000/");
	// Every page asks which vault the server serves and which repositories it
	// lists before it shows a board; a test file fakes only what it is about.
	if (asked.pathname === "/api/served-vault") return answer({ vault: SERVED.vault });
	if (asked.pathname === "/api/repositories") return answer(REPOSITORIES);
	return server.answering(asked, init);
}

const realFetch = globalThis.fetch;
const realSocket = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");

beforeAll(() => {
	globalThis.fetch = Object.assign(fakeFetch, { preconnect: realFetch.preconnect });
	Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: FakeSocket });
});

afterEach(() => {
	cleanup();
});

afterAll(async () => {
	globalThis.fetch = realFetch;
	if (realSocket !== undefined) Object.defineProperty(globalThis, "WebSocket", realSocket);
	await GlobalRegistrator.unregister();
});

/** Let the page's promises and timers that are due run. */
async function settle(): Promise<void> {
	await act(async () => {
		await new Promise<void>((resolve) => setTimeout(resolve, 20));
	});
}

/**
 * Let the page run until something is so, a bounded number of times.
 * @param done Whether it is so.
 * @param rounds How many more times to let the page run.
 */
async function settleUntil(done: () => boolean, rounds = 20): Promise<void> {
	await settle();
	if (!done() && rounds > 1) await settleUntil(done, rounds - 1);
}

/**
 * The state the board stage of one pane is in.
 * @returns Its `data-state`, or null while no stage is drawn.
 */
function stageState(): string | null {
	return (
		document.querySelector("[data-slot='semantic-board-stage']")?.getAttribute("data-state") ?? null
	);
}

/** Mount the application as the page does: once it has learned the vault the server serves. */
async function mountPage(): Promise<void> {
	await learnServedVault();
	render(createElement(createBoardRoutingHost(Application)));
}

/**
 * Mount the application, register its pane and point it at a board.
 * @param board The board the server points the pane at.
 * @returns The pane's socket, once the board is drawn.
 */
async function paneShowing(board: string): Promise<FakeSocket> {
	await mountPage();
	await settle();
	const socket = FakeSocket.made.at(-1)!;
	act(() => socket.open());
	await settle();
	await settle();
	act(() =>
		socket.say({
			type: "pane_board",
			board,
			identity: { board, variant: "current" },
			...SERVED,
		}),
	);
	await settleUntil(() => stageState() === "drawn");
	return socket;
}

export {
	SERVED,
	FakeSocket,
	act,
	answer,
	fireEvent,
	mountPage,
	notFaked,
	paneShowing,
	server,
	settle,
	settleUntil,
	stageState,
	within,
};
