// A pane's search for a part picks the part out on its own board. A part on the
// board on screen is picked where it is. A part on another board is picked once
// the server has pointed the pane at that board, and that holds after a
// drill-down too: the board on screen is then not the board the pane was opened
// on, and pointing the pane back at the board it was opened on leaves the
// drill-down. A part whose board did not open is not picked when that board is
// shown later for some other reason.
//
// What the pane reports to the server is what is checked: the board it reads
// and what is picked on it, which is what an agent is told (ADR 0023).

import { afterEach, expect, test } from "bun:test";
import { z } from "zod";

import { SemanticPaneContextSchema } from "@archboard/board/pane-context";
import {
	SERVED,
	FakeSocket,
	act,
	answer,
	fireEvent,
	notFaked,
	paneShowing,
	server,
	settle,
	settleUntil,
} from "#tests/ui/support/application/application-page.ts";

type SemanticPaneContext = z.infer<typeof SemanticPaneContextSchema>;

/** One board of the vault: its one part, and the board that part drills down to. */
interface Board {
	readonly part: { readonly id: string; readonly name: string };
	readonly drillsTo?: string;
}

/** The vault: a board whose part drills down into a second, and a third board beside them. */
const BOARDS: Readonly<Record<string, Board>> = {
	pipeline: { part: { id: "n1", name: "board-io" }, drillsTo: "engine" },
	engine: { part: { id: "m1", name: "atomic-write" } },
	ledger: { part: { id: "k1", name: "journal" } },
};

/**
 * One board as the vault lists it.
 * @param name The board.
 * @returns The listed board.
 */
function listed(name: string): Record<string, unknown> {
	return {
		name,
		key: name,
		level: "system",
		opens: "v1",
		links: [],
		description: null,
		variants: [{ id: "v1", name: "as it is", lifecycle: "current", parentId: null }],
	};
}

/**
 * One board's document: its one part, with its link down when it has one.
 * @param name The board.
 * @returns The document.
 */
function documentOf(name: string): Record<string, unknown> {
	const { part, drillsTo } = BOARDS[name]!;
	const down =
		drillsTo === undefined ? {} : { drillDown: { board: drillsTo, variant: { kind: "current" } } };
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: `b${name.slice(0, 3)}`,
		name,
		level: "system",
		version: 1,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-01T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "as it is",
				lifecycle: "current",
				content: {
					nodes: [{ id: part.id, name: part.name, kind: "module", order: 1000, ...down }],
					edges: [],
				},
			},
		],
	};
}

/**
 * One board's picture: its part as one card.
 * @param name The board.
 * @returns The render route's answer.
 */
function drawingOf(name: string): Record<string, unknown> {
	const { id } = BOARDS[name]!.part;
	return {
		success: true,
		board: name,
		version: 1,
		variant: { id: "v1", name: "as it is", lifecycle: "current" },
		view: null,
		views: [],
		changes: null,
		waiting: null,
		width: 400,
		height: 300,
		svg:
			`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">` +
			`<g data-semantic-kind="node" data-semantic-id="${id}"><rect id="card" width="80" height="40"></rect></g>` +
			`</svg>`,
		drawn: { nodes: [], edges: [], flows: [], steps: [] },
		appearances: [],
		key: null,
		atlas: { nodes: { [id]: { x: 0, y: 0, width: 80, height: 40 } }, edges: {}, regions: {} },
	};
}

/** What the page asked of the server, and the boards it refuses to show. */
const asked: {
	shows: string[];
	readings: SemanticPaneContext[];
	refused: Set<string>;
	pane: FakeSocket | null;
} = { shows: [], readings: [], refused: new Set(), pane: null };

afterEach(() => {
	Object.assign(asked, { shows: [], readings: [], refused: new Set(), pane: null });
});

/**
 * Point the pane at a board, as the server does when it shows one there.
 * @param board The board.
 */
function point(board: string): void {
	act(() => {
		asked.pane?.say({
			type: "pane_board",
			board,
			identity: { board, variant: "current" },
			...SERVED,
		});
	});
}

/** One request, as a faked route reads it. */
interface Asked {
	/** The board its query names, or an empty string. */
	readonly board: string;
	/** Its JSON body, or undefined without one. */
	readonly body: unknown;
	readonly method: string;
}

/** What a show asks for: which board. */
const ShowSchema = z.object({ board: z.string() });

/**
 * The panes route: a pane's report registers it, and a read is the inventory.
 * @param request The request.
 * @returns The answer.
 */
function panesRoute(request: Asked): Promise<Response> {
	return request.method === "POST"
		? answer({ success: true, registered: true, paneCount: 1 })
		: answer({ success: true, panes: [] });
}

/**
 * Show a board in the pane, as the server's show route does: it tells the pane, then answers.
 * @param request The request, naming the board.
 * @returns The answer.
 */
function showRoute(request: Asked): Promise<Response> {
	const { board } = ShowSchema.parse(request.body);
	asked.shows.push(board);
	if (asked.refused.has(board)) {
		return answer({ success: false, code: "BOARD_MISSING", error: `no board "${board}"` }, 404);
	}
	point(board);
	return answer({ success: true, board, identity: { board, variant: "current" }, paneId: "A" });
}

/**
 * Hear what the pane reports reading.
 * @param request The request, carrying the reading.
 * @returns The answer.
 */
function readingRoute(request: Asked): Promise<Response> {
	asked.readings.push(SemanticPaneContextSchema.parse(request.body));
	return answer({ success: true });
}

/**
 * Every board of the vault, as it lists them.
 * @returns The answer.
 */
function listingRoute(): Promise<Response> {
	return answer({ success: true, levels: ["system"], boards: Object.keys(BOARDS).map(listed) });
}

/**
 * One board's document.
 * @param request The request, naming the board.
 * @returns The answer.
 */
function documentRoute(request: Asked): Promise<Response> {
	return answer({ success: true, board: documentOf(request.board) });
}

/**
 * One board's picture.
 * @param request The request, naming the board.
 * @returns The answer.
 */
function renderRoute(request: Asked): Promise<Response> {
	return answer(drawingOf(request.board));
}

/** The routes the server is faked on, by path. */
const ROUTES: Readonly<Record<string, (request: Asked) => Promise<Response>>> = {
	"/api/panes": panesRoute,
	"/api/panes/show": showRoute,
	"/api/panes/semantic-context": readingRoute,
	"/api/semantic-boards": listingRoute,
	"/api/semantic-boards/board": documentRoute,
	"/api/semantic-boards/render": renderRoute,
};

/**
 * A request's JSON body.
 * @param init How the page asked.
 * @returns The body, or undefined without one.
 */
function bodyOf(init: RequestInit | undefined): unknown {
	return typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
}

/**
 * The server, faked at fetch.
 * @param url What the page asked for.
 * @param init How it asked.
 * @returns The answer.
 */
server.answering = function answering(url, init) {
	const route = ROUTES[url.pathname] ?? notFaked;
	const board = url.searchParams.get("board") ?? "";
	return route({ board, body: bodyOf(init), method: init?.method ?? "GET" });
};

/**
 * The board the pane's picture is of.
 * @returns Its name, or null while nothing is drawn.
 */
function onScreen(): string | null {
	return (
		document.querySelector("[data-slot='semantic-board-stage']")?.getAttribute("data-board") ?? null
	);
}

/**
 * What the pane last reported reading.
 * @returns The board's name and the ids picked on it, or null before any report.
 */
function lastReported(): { board: string | null; picked: string[] } | null {
	const last = asked.readings.at(-1);
	return last === undefined
		? null
		: { board: last.board?.name ?? null, picked: last.selection.map((subject) => subject.id) };
}

/**
 * Follow the card's drill-down, as a double-click on it does.
 * @param board The board it leads to.
 */
async function drillInto(board: string): Promise<void> {
	act(() => {
		fireEvent.doubleClick(document.querySelector("#card")!);
	});
	await settleUntil(() => onScreen() === board);
}

/**
 * Find a part by its name in the pane's search and choose the first result.
 * @param name The part's name.
 */
async function choosePart(name: string): Promise<void> {
	const field = document.querySelector<HTMLInputElement>("[data-slot='part-search'] input")!;
	act(() => {
		fireEvent.focus(field);
		fireEvent.change(field, { target: { value: name } });
	});
	await settleUntil(
		() => document.querySelector("[data-slot='part-search'] [role='option'] button") !== null,
	);
	act(() => {
		fireEvent.keyDown(field, { key: "Enter" });
	});
	await settle();
}

/**
 * Let the pane report what it reads now, past the debounce of a report.
 * @param board The board the report is about.
 */
async function reportedOn(board: string): Promise<void> {
	await settleUntil(() => lastReported()?.board === board);
	await settleUntil(() => false, 10);
}

test("a part found on the board a drill-down came from is picked there, with that board back on screen", async () => {
	asked.pane = await paneShowing("pipeline");
	await drillInto("engine");
	expect(onScreen()).toBe("engine");

	await choosePart("board-io");
	await settleUntil(() => onScreen() === "pipeline");
	await reportedOn("pipeline");

	expect(asked.shows).toEqual(["pipeline"]);
	expect(onScreen()).toBe("pipeline");
	expect(lastReported()).toEqual({ board: "pipeline", picked: ["n1"] });
});

test("a part whose board did not open is not picked when that board is shown later", async () => {
	asked.refused.add("engine");
	asked.pane = await paneShowing("pipeline");
	await choosePart("atomic-write");
	expect(asked.shows).toEqual(["engine"]);

	// Something else moves the pane, and only later to the board that did not open.
	point("ledger");
	await settleUntil(() => onScreen() === "ledger");
	point("engine");
	await settleUntil(() => onScreen() === "engine");
	await reportedOn("engine");

	expect(lastReported()).toEqual({ board: "engine", picked: [] });
});
