// What a pane's news draws again (TASK-385.05): who holds a board, what an agent
// says it is doing and where agents work land in the pane records at the
// application's root, and the shell shows them. The board stage shows none of
// it, so it is not drawn again for any of it.
//
// The application is mounted through its entrypoint, as the page mounts it, over
// a server faked at the network: fetch, and a socket the test opens and speaks on.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";

GlobalRegistrator.register({ url: "http://127.0.0.1:3000/" });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

// React's renderer is loaded once the page's globals are there.
const { act, render, cleanup } = await import("@testing-library/react");
const { createElement } = await import("react");
const { Application } = await import("@/ui/application");
const { createBoardRoutingHost } = await import("@/ui/board-routing");

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

/** The one board the server draws: a card, as the renderer would have drawn it. */
const DRAWING = {
	success: true,
	board: "pipeline",
	version: 1,
	variant: { id: "v1", name: "current", lifecycle: "current" },
	view: null,
	views: [],
	changes: null,
	waiting: null,
	width: 400,
	height: 300,
	svg:
		`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">` +
		`<g data-semantic-kind="node" data-semantic-id="n1"><rect width="80" height="40"></rect></g>` +
		`</svg>`,
	atlas: { nodes: { n1: { x: 0, y: 0, width: 80, height: 40 } }, edges: {}, regions: {} },
};

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
 * The server, faked at fetch.
 * @param input What the page asked for.
 * @returns The answer.
 */
function fakeServer(input: RequestInfo | URL): Promise<Response> {
	const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
	const path = new URL(url, "http://127.0.0.1:3000/").pathname;
	if (path === "/api/panes") return answer({ success: true, registered: true, paneCount: 1 });
	if (path === "/api/semantic-boards")
		return answer({ success: true, levels: ["system"], boards: [] });
	if (path === "/api/semantic-boards/render") return answer(DRAWING);
	return answer({ success: false, error: "not faked" }, 404);
}

const realFetch = globalThis.fetch;
const realSocket = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");

beforeAll(() => {
	globalThis.fetch = Object.assign(fakeServer, { preconnect: realFetch.preconnect });
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

/**
 * Let the page run until something is so, a bounded number of times.
 * @param done Whether it is so.
 * @param rounds How many more times to let the page run.
 */
async function settleUntil(done: () => boolean, rounds = 20): Promise<void> {
	await settle();
	if (!done() && rounds > 1) await settleUntil(done, rounds - 1);
}

/** Let the page's promises and timers that are due run. */
async function settle(): Promise<void> {
	await act(async () => {
		await new Promise<void>((resolve) => setTimeout(resolve, 20));
	});
}

/**
 * The props the board stage's element was last drawn with. React replaces them
 * only when it draws the stage again, so the same object means it was left as it was.
 * @returns The props, or undefined while there is no stage.
 */
function stageDrawing(): unknown {
	const stage = document.querySelector("[data-slot='semantic-board-stage']");
	const key =
		stage === null
			? undefined
			: Object.keys(stage).find((name) => name.startsWith("__reactProps$"));
	return stage === null || key === undefined ? undefined : Reflect.get(stage, key);
}

/** An agent's claim on the board, as the server announces it. */
const CLAIM = {
	id: "agent-1",
	kind: "agent",
	since: "2026-10-01T00:00:00.000Z",
	until: "2026-10-01T00:10:00.000Z",
	process: "1",
	reason: "drawing the pipeline",
	claimed: true,
};

/** What the agent says it is doing, as the server announces it. */
const DOING = {
	doing: "adding a queue",
	at: "2026-10-01T00:00:05.000Z",
	by: "agent-1",
	kind: "agent",
	claimed: true,
};

/**
 * Mount the application, register its pane and put the board in it.
 * @returns The pane's socket.
 */
async function paneShowingTheBoard(): Promise<FakeSocket> {
	render(createElement(createBoardRoutingHost(Application)));
	await settle();
	const socket = FakeSocket.made.at(-1)!;
	act(() => socket.open());
	await settle();
	await settle();
	act(() =>
		socket.say({
			type: "pane_board",
			board: "pipeline",
			identity: { board: "pipeline", variant: "current" },
		}),
	);
	await settleUntil(
		() =>
			document.querySelector("[data-slot='semantic-board-stage']")?.getAttribute("data-state") ===
			"drawn",
	);
	return socket;
}

test("a claim, an agent's doing and its activity reach the shell and draw no board stage again", async () => {
	const socket = await paneShowingTheBoard();
	expect(
		document.querySelector("[data-slot='semantic-board-stage']")?.getAttribute("data-state"),
	).toBe("drawn");
	const drawn = stageDrawing();
	expect(drawn).toBeDefined();

	act(() => socket.say({ type: "board_lock", board: "pipeline", held: true, holder: CLAIM }));
	await settle();
	expect(document.querySelector("[data-slot='claim-banner']")).not.toBeNull();
	act(() => socket.say({ type: "board_doing", board: "pipeline", recent: [DOING] }));
	act(() =>
		socket.say({
			type: "agent_activity",
			activity: [{ board: "pipeline", claim: CLAIM, doing: DOING }],
		}),
	);
	await settle();
	expect(document.querySelector("[data-slot='working-now']")).not.toBeNull();
	act(() => socket.say({ type: "board_lock", board: "pipeline", held: false, holder: null }));
	await settle();
	expect(document.querySelector("[data-slot='claim-banner']")).toBeNull();

	expect(stageDrawing()).toBe(drawn);
});
