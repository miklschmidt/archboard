// What a pane's news draws again (TASK-385.05): who holds a board, what an agent
// says it is doing and where agents work land in the pane records at the
// application's root, and the shell shows them. The board stage shows none of
// it, so it is not drawn again for any of it. Where agents work is shown in the
// navigator alone, so the pane's header is not drawn again for it either. A pane
// on no board has no stage, and its header still shows its news and its controls.
//
// The application is mounted through its entrypoint, as the page mounts it, over
// a server faked at the network: fetch, and a socket the test opens and speaks on.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";

GlobalRegistrator.register({ url: "http://127.0.0.1:3000/" });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

// React's renderer is loaded once the page's globals are there.
const { act, render, cleanup, within } = await import("@testing-library/react");
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

/** The board as the vault lists it. */
const LISTED = {
	name: "pipeline",
	key: "pipeline",
	level: "system",
	opens: "v1",
	links: [],
	description: null,
	variants: [{ id: "v1", name: "current", lifecycle: "current", parentId: null }],
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

/** What the server says every live pane holds, across every tab: what the navigator marks. */
const inventory: { panes: Record<string, unknown>[]; reads: number } = { panes: [], reads: 0 };

/**
 * The server, faked at fetch.
 * @param input What the page asked for.
 * @param init How it asked.
 * @returns The answer.
 */
function fakeServer(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
	const path = new URL(url, "http://127.0.0.1:3000/").pathname;
	if (path === "/api/panes" && (init?.method ?? "GET") === "GET") {
		inventory.reads += 1;
		return answer({ success: true, panes: inventory.panes });
	}
	if (path === "/api/panes") return answer({ success: true, registered: true, paneCount: 1 });
	if (path === "/api/semantic-boards")
		return answer({ success: true, levels: ["system"], boards: [LISTED] });
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
	inventory.panes = [];
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
 * The props one element of the pane was last drawn with. React replaces them
 * only when it draws the element again, so the same object means it was left as it was.
 * @param slot The element's slot: the board stage, or the pane's header.
 * @returns The props, or undefined while there is no such element.
 */
function drawingOf(slot: string): unknown {
	const element = document.querySelector(`[data-slot='${slot}']`);
	const key =
		element === null
			? undefined
			: Object.keys(element).find((name) => name.startsWith("__reactProps$"));
	return element === null || key === undefined ? undefined : Reflect.get(element, key);
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

test("a claim, an agent's doing, its activity and a pane status reach the shell and draw no board stage again", async () => {
	const socket = await paneShowingTheBoard();
	expect(
		document.querySelector("[data-slot='semantic-board-stage']")?.getAttribute("data-state"),
	).toBe("drawn");
	const drawn = drawingOf("semantic-board-stage");
	expect(drawn).toBeDefined();

	act(() => socket.say({ type: "board_lock", board: "pipeline", held: true, holder: CLAIM }));
	await settle();
	expect(document.querySelector("[data-slot='claim-banner']")).not.toBeNull();
	act(() => socket.say({ type: "board_doing", board: "pipeline", recent: [DOING] }));
	await settle();
	const header = drawingOf("pane-header");
	act(() =>
		socket.say({
			type: "agent_activity",
			activity: [{ board: "pipeline", claim: CLAIM, doing: DOING }],
		}),
	);
	await settle();
	expect(document.querySelector("[data-slot='working-now']")).not.toBeNull();
	expect(drawingOf("pane-header")).toBe(header);
	act(() => socket.say({ type: "board_lock", board: "pipeline", held: false, holder: null }));
	await settle();
	expect(document.querySelector("[data-slot='claim-banner']")).toBeNull();
	// The pane reports its status again, as it does with every change of its own.
	act(() =>
		socket.say({
			type: "pane_board",
			board: "pipeline",
			identity: { board: "pipeline", variant: "current" },
		}),
	);
	await settle();

	expect(drawingOf("semantic-board-stage")).toBe(drawn);
});

test("another pane moving, or an agent writing another board, draws no board stage again", async () => {
	const socket = await paneShowingTheBoard();
	const drawn = drawingOf("semantic-board-stage");
	expect(drawn).toBeDefined();
	const reads = inventory.reads;

	// A pane in another tab moves to another board, and an agent writes that board:
	// the listing is read again, and only its pane half says anything new.
	inventory.panes = [
		{
			paneId: "B",
			place: "right",
			board: "engine",
			identity: { board: "engine", variant: "current" },
		},
	];
	act(() => socket.say({ type: "board_note", semantic: true, board: "engine", version: 2 }));
	await settleUntil(() => inventory.reads > reads);
	await settle();

	expect(inventory.reads).toBeGreaterThan(reads);
	expect(drawingOf("semantic-board-stage")).toBe(drawn);
});

test("a pane on no board says its socket is down and can be closed", async () => {
	await paneShowingTheBoard();
	/**
	 * The second pane's element, while it is there.
	 * @returns The element, or null.
	 */
	const second = (): HTMLElement | null =>
		document.querySelector<HTMLElement>("[data-slot='pane-stage'][data-pane='B']");
	const first = document.querySelector<HTMLElement>("[data-slot='pane-stage'][data-pane='A']")!;
	act(() =>
		within(first)
			.getByRole("button", { name: /second pane/i })
			.click(),
	);
	await settleUntil(() => second() !== null);

	// Its socket is never answered, so the server never points it at a board.
	const pane = second()!;
	expect(pane.querySelector("[data-slot='semantic-board-stage']")).toBeNull();
	expect(pane.querySelector("[data-slot='pane-header'] output")).not.toBeNull();
	act(() => within(pane).getByRole("button", { name: /close/i }).click());
	await settleUntil(() => second() === null);

	expect(second()).toBeNull();
});
