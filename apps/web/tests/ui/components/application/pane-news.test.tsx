// What a pane's news draws again (TASK-385.05): who holds a board, what an agent
// says it is doing and where agents work land in the pane records at the
// application's root, and the shell shows them. The board stage shows none of
// it, so it is not drawn again for any of it. Where agents work is shown in the
// navigator alone, so the pane's header is not drawn again for it either. A pane
// on no board has no stage, and its header still shows its news and its controls.

import { afterEach, expect, jest, test } from "bun:test";

import { PANE_MS } from "@archboard/timing";

import {
	FakeSocket,
	SERVED,
	act,
	answer,
	notFaked,
	paneShowing,
	server,
	settle,
	settleUntil,
	stageState,
	within,
} from "#tests/ui/support/application/application-page.ts";

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
	drawn: { nodes: [], edges: [], flows: [], steps: [] },
	appearances: [],
	key: null,
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

/** What the server says every live pane holds, across every tab: what the navigator marks. */
const inventory: { panes: Record<string, unknown>[]; reads: number } = { panes: [], reads: 0 };

/**
 * The panes route: a pane's report registers it, and a read is the inventory.
 * @param init How the page asked.
 * @returns The answer.
 */
function panesRoute(init: RequestInit | undefined): Promise<Response> {
	if (init?.method === "POST") return answer({ success: true, registered: true, paneCount: 1 });
	inventory.reads += 1;
	return answer({ success: true, panes: inventory.panes });
}

/**
 * The board the vault lists.
 * @returns The answer.
 */
function listingRoute(): Promise<Response> {
	return answer({ success: true, levels: ["system"], boards: [LISTED] });
}

/**
 * The board's picture.
 * @returns The answer.
 */
function renderRoute(): Promise<Response> {
	return answer(DRAWING);
}

/** The routes the server is faked on, by path. */
const ROUTES: Readonly<Record<string, (init: RequestInit | undefined) => Promise<Response>>> = {
	"/api/panes": panesRoute,
	"/api/semantic-boards": listingRoute,
	"/api/semantic-boards/render": renderRoute,
};

/**
 * The server, faked at fetch.
 * @param url What the page asked for.
 * @param init How it asked.
 * @returns The answer.
 */
server.answering = function answering(url, init) {
	return (ROUTES[url.pathname] ?? notFaked)(init);
};

afterEach(() => {
	inventory.panes = [];
});

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

test("a claim, an agent's doing, its activity and a pane status reach the shell and draw no board stage again", async () => {
	const socket = await paneShowing("pipeline");
	expect(stageState()).toBe("drawn");
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
			vault: SERVED.vault,
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
			...SERVED,
		}),
	);
	await settle();

	expect(drawingOf("semantic-board-stage")).toBe(drawn);
});

test("another pane moving, or an agent writing another board, draws no board stage again", async () => {
	const socket = await paneShowing("pipeline");
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

/**
 * One pane's element, while it is there.
 * @param paneId The pane.
 * @returns The element, or null.
 */
function paneElement(paneId: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-slot='pane-stage'][data-pane='${paneId}']`);
}

test("a pane on no board says its socket is down and can be closed", async () => {
	await paneShowing("pipeline");
	act(() =>
		within(paneElement("A")!)
			.getByRole("button", { name: /second pane/i })
			.click(),
	);
	await settleUntil(() => paneElement("B") !== null);

	// Its socket is never answered, so the server never points it at a board.
	const pane = paneElement("B")!;
	expect(pane.querySelector("[data-slot='semantic-board-stage']")).toBeNull();
	expect(pane.querySelector("[data-slot='pane-header'] output")).not.toBeNull();
	act(() => within(pane).getByRole("button", { name: /close/i }).click());
	await settleUntil(() => paneElement("B") === null);

	expect(paneElement("B")).toBeNull();
});

test("a socket that comes back forgets the agent work it heard, since the server lists only vaults where an agent is at work", async () => {
	const socket = await paneShowing("pipeline");
	act(() =>
		socket.say({
			type: "agent_activity",
			vault: SERVED.vault,
			activity: [{ board: "pipeline", claim: CLAIM, doing: DOING }],
		}),
	);
	await settle();
	expect(document.querySelector("[data-slot='working-now']")).not.toBeNull();

	// The socket drops, and the agent lets go while it is down. The server forgets
	// a vault whose list is empty, so the socket that comes back hears nothing of it.
	jest.useFakeTimers();
	try {
		act(() => {
			socket.readyState = FakeSocket.CLOSED;
			socket.dispatchEvent(new CloseEvent("close", { code: 1006 }));
		});
		act(() => {
			jest.advanceTimersByTime(PANE_MS.socketReconnect);
		});
	} finally {
		jest.useRealTimers();
	}
	const returned = FakeSocket.made.at(-1)!;
	expect(returned).not.toBe(socket);
	act(() => returned.open());
	await settle();
	expect(document.querySelector("[data-slot='working-now']")).toBeNull();

	// What the socket that came back hears is kept.
	act(() =>
		returned.say({
			type: "agent_activity",
			vault: SERVED.vault,
			activity: [{ board: "pipeline", claim: CLAIM, doing: DOING }],
		}),
	);
	await settle();
	expect(document.querySelector("[data-slot='working-now']")).not.toBeNull();
});
