// Two panes on one board are linked (TASK-538.02): a part picked in one is
// picked in the other, and letting go clears both. Only the pane the person
// picked in says that the person changed it (ADR 0034). A drill-down ends the
// link, and the pane it leaves behind keeps its pick. A pane whose variant lacks
// the part names the variant beside that holds it.
//
// What the panes report to the server is what is checked, because that is what
// an agent is told each pane reads (ADR 0023).

import { afterEach, expect, test } from "bun:test";

import { SemanticPaneContextSchema, type SemanticPaneContext } from "@archboard/board/pane-context";
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

/** One part of the shop. */
interface Part {
	readonly id: string;
	readonly name: string;
}

/** The shop's parts, by variant: the proposal adds Refunds. */
const PARTS: Readonly<Record<string, readonly Part[]>> = {
	v1: [
		{ id: "ord", name: "Orders" },
		{ id: "pay", name: "Payments" },
	],
	v2: [
		{ id: "ord", name: "Orders" },
		{ id: "pay", name: "Payments" },
		{ id: "ref", name: "Refunds" },
	],
};

/** Each variant of the shop, as the board lists it. */
const VARIANTS = [
	{ id: "v1", name: "as built", lifecycle: "current", parentId: null },
	{ id: "v2", name: "Returns desk", lifecycle: "draft", parentId: "v1" },
] as const;

/**
 * One variant of the shop: Orders drills down to the orders board.
 * @param id The variant.
 * @returns The variant as the document holds it.
 */
function variantOf(id: string): Record<string, unknown> {
	const entry = VARIANTS.find((one) => one.id === id)!;
	const nodes = PARTS[id]!.map((part, index) => ({
		...part,
		kind: "module",
		order: (index + 1) * 1000,
		...(part.id === "ord" ? { drillDown: { board: "orders", variant: { kind: "current" } } } : {}),
	}));
	return {
		id,
		name: entry.name,
		lifecycle: entry.lifecycle,
		...(entry.parentId === null ? {} : { parent: entry.parentId }),
		content: { nodes, edges: [] },
	};
}

/**
 * One board's document.
 * @param name The board: the shop, or the orders board its Orders drills down to.
 * @returns The document.
 */
function documentOf(name: string): Record<string, unknown> {
	const variants =
		name === "shop"
			? VARIANTS.map((one) => variantOf(one.id))
			: [
					{
						id: "o1",
						name: "as built",
						lifecycle: "current",
						content: {
							nodes: [{ id: "cart", name: "Cart", kind: "module", order: 1000 }],
							edges: [],
						},
					},
				];
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: `b${name}`,
		name,
		level: "system",
		version: 1,
		createdAt: "2026-10-25T00:00:00.000Z",
		updatedAt: "2026-10-25T00:00:00.000Z",
		views: [],
		current: name === "shop" ? "v1" : "o1",
		variants,
	};
}

/** What each picture draws, by the key of the board and variant it is of. */
const PICTURED: Readonly<
	Record<
		string,
		{
			readonly variant: { readonly id: string; readonly name: string; readonly lifecycle: string };
			readonly parts: readonly Part[];
		}
	>
> = {
	shop: { variant: VARIANTS[0], parts: PARTS["v1"]! },
	"shop@v2": { variant: VARIANTS[1], parts: PARTS["v2"]! },
	orders: {
		variant: { id: "o1", name: "as built", lifecycle: "current" },
		parts: [{ id: "cart", name: "Cart" }],
	},
};

/**
 * One board's picture: each part of the variant as one card.
 * @param board The board.
 * @param variant The variant asked for, or none for the current one.
 * @returns The render route's answer.
 */
function drawingOf(board: string, variant: string | null): Record<string, unknown> {
	const { variant: drawn, parts } = PICTURED[`${board}@${variant}`] ?? PICTURED[board]!;
	const cards = parts.map(
		(part, index) =>
			`<g data-semantic-kind="node" data-semantic-id="${part.id}"><rect x="${index * 100}" width="80" height="40"></rect></g>`,
	);
	return {
		success: true,
		board,
		version: 1,
		variant: { id: drawn.id, name: drawn.name, lifecycle: drawn.lifecycle },
		view: null,
		views: [],
		changes: null,
		waiting: null,
		width: 400,
		height: 300,
		svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">${cards.join("")}</svg>`,
		drawn: { nodes: [], edges: [], flows: [], steps: [] },
		atlas: {
			nodes: Object.fromEntries(
				parts.map((part, index) => [part.id, { x: index * 100, y: 0, width: 80, height: 40 }]),
			),
			edges: {},
			regions: {},
		},
	};
}

/** What the panes reported reading, in order. */
const readings: SemanticPaneContext[] = [];

afterEach(() => {
	readings.length = 0;
	// Two panes write themselves into the address, which would open the next page on both.
	window.history.replaceState(null, "", "/");
});

/** One request, as a faked route reads it. */
interface Asked {
	readonly url: URL;
	/** Its JSON body, or undefined without one. */
	readonly body: unknown;
	readonly method: string;
}

/**
 * The panes route: a pane's report registers it, and a read is the inventory.
 * @param request The request.
 * @returns The answer.
 */
function panesRoute(request: Asked): Promise<Response> {
	return request.method === "POST"
		? answer({ success: true, registered: true, paneCount: 2 })
		: answer({ success: true, panes: [] });
}

/**
 * Hear what a pane reports reading.
 * @param request The request, carrying the reading.
 * @returns The answer.
 */
function readingRoute(request: Asked): Promise<Response> {
	readings.push(SemanticPaneContextSchema.parse(request.body));
	return answer({ success: true });
}

/**
 * One board as the vault lists it.
 * @param name The board.
 * @param variants Its variants, the one its name opens first.
 * @returns The listed board.
 */
function listed(
	name: string,
	variants: readonly Record<string, unknown>[],
): Record<string, unknown> {
	return {
		name,
		key: name,
		level: "system",
		opens: variants[0]?.["id"],
		links: [],
		description: null,
		variants,
	};
}

/**
 * Every board of the vault, as it lists them.
 * @returns The answer.
 */
function listingRoute(): Promise<Response> {
	return answer({
		success: true,
		levels: ["system"],
		boards: [listed("shop", VARIANTS), listed("orders", [{ ...VARIANTS[0], id: "o1" }])],
	});
}

/**
 * One board's document.
 * @param request The request, naming the board.
 * @returns The answer.
 */
function documentRoute(request: Asked): Promise<Response> {
	return answer({ success: true, board: documentOf(request.url.searchParams.get("board") ?? "") });
}

/**
 * One board's picture.
 * @param request The request, naming the board and maybe a variant.
 * @returns The answer.
 */
function renderRoute(request: Asked): Promise<Response> {
	const { searchParams } = request.url;
	return answer(drawingOf(searchParams.get("board") ?? "", searchParams.get("variant")));
}

/** The routes the server is faked on, by path. */
const ROUTES: Readonly<Record<string, (request: Asked) => Promise<Response>>> = {
	"/api/panes": panesRoute,
	"/api/panes/semantic-context": readingRoute,
	"/api/semantic-boards": listingRoute,
	"/api/semantic-boards/board": documentRoute,
	"/api/semantic-boards/render": renderRoute,
};

/**
 * The server, faked at fetch.
 * @param url What the page asked for.
 * @param init How it asked.
 * @returns The answer.
 */
server.answering = function answering(url, init) {
	const route = ROUTES[url.pathname] ?? notFaked;
	const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
	return route({ url, body, method: init?.method ?? "GET" });
};

/**
 * Point one pane's socket at the shop, at one of its variants.
 * @param socket The pane's socket.
 * @param variant The variant, or null for the current one.
 */
function pointAt(socket: FakeSocket, variant: string | null): void {
	const board = variant === null ? "shop" : `shop@${variant}`;
	act(() => {
		socket.say({
			type: "pane_board",
			board,
			identity: { board: "shop", variant: variant ?? "current" },
			...SERVED,
		});
	});
}

/**
 * One pane's element.
 * @param paneId The pane.
 * @returns The element, or null while the pane is not there.
 */
function pane(paneId: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-slot='pane-stage'][data-pane='${paneId}']`);
}

/**
 * The board one pane's picture is of.
 * @param paneId The pane.
 * @returns Its name, or null while nothing is drawn.
 */
function onScreen(paneId: string): string | null {
	return (
		pane(paneId)?.querySelector("[data-slot='semantic-board-stage']")?.getAttribute("data-board") ??
		null
	);
}

/**
 * Two panes on the shop: pane A on what is built, pane B on the proposal.
 * @returns Each pane's socket.
 */
async function twoPanes(): Promise<{ a: FakeSocket; b: FakeSocket }> {
	const a = await paneShowing("shop");
	const made = FakeSocket.made.length;
	act(() => a.say({ type: "pane_open" }));
	await settleUntil(() => FakeSocket.made.length > made);
	const b = FakeSocket.made.at(-1)!;
	act(() => b.open());
	await settle();
	pointAt(b, "v2");
	await settleUntil(() => pane("B")?.querySelector("[data-semantic-id='ref']") != null);
	return { a, b };
}

/**
 * Pick a part out in one pane, the way a person does.
 * @param paneId The pane.
 * @param id The part.
 */
async function pickIn(paneId: string, id: string): Promise<void> {
	const card = pane(paneId)?.querySelector(`[data-semantic-id='${id}']`);
	if (card == null) throw new Error(`Pane ${paneId} draws no ${id}.`);
	const at = { pointerId: 1, button: 0, clientX: 5, clientY: 5 };
	await act(async () => {
		fireEvent.pointerDown(card, at);
		fireEvent.pointerUp(card, at);
		fireEvent.click(card, at);
	});
	await settle();
}

/**
 * What one pane last reported, once its reports have settled.
 * @param paneId The pane.
 * @returns What it picked and whether the person's hand changed that, or null before any report.
 */
async function reported(paneId: string): Promise<{ picked: string[]; byHand: boolean } | null> {
	await settleUntil(() => false, 12);
	const last = readings.findLast((one) => one.paneId === paneId);
	return last === undefined
		? null
		: {
				picked: last.selection.map((subject) => subject.id),
				byHand: last.byUser?.includes("selection") ?? false,
			};
}

test("a part picked in one linked pane is picked in the other, only the picking pane says the person did it, and letting go clears both", async () => {
	await twoPanes();
	await pickIn("A", "pay");
	expect(await reported("A")).toEqual({ picked: ["pay"], byHand: true });
	expect(await reported("B")).toEqual({ picked: ["pay"], byHand: false });

	act(() => {
		fireEvent.keyDown(pane("B")!.querySelector("[data-slot='semantic-board-viewport']")!, {
			key: "Escape",
		});
	});
	expect(await reported("B")).toEqual({ picked: [], byHand: true });
	expect(await reported("A")).toEqual({ picked: [], byHand: false });
});

test("a drill-down ends the link, and the pane left behind keeps its pick", async () => {
	await twoPanes();
	await pickIn("A", "ord");
	act(() => {
		fireEvent.doubleClick(pane("A")!.querySelector("[data-semantic-id='ord'] rect")!);
	});
	await settleUntil(() => onScreen("A") === "orders");
	expect((await reported("B"))?.picked).toEqual(["ord"]);

	await pickIn("B", "pay");
	expect((await reported("B"))?.picked).toEqual(["pay"]);
	expect((await reported("A"))?.picked).toEqual([]);
});

test("a pane whose variant lacks the part picked beside it names the variant that holds it", async () => {
	await twoPanes();
	await pickIn("B", "ref");
	expect((await reported("A"))?.picked).toEqual(["ref"]);
	const inspector = pane("A")?.querySelector("[data-slot='semantic-inspector']");
	expect(inspector?.getAttribute("data-subject")).toBe("unknown");
	expect(inspector?.textContent).toContain("Returns desk");
});
