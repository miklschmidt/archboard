// One small architecture, and the helpers that put it in front of a pane and
// poke it, for the tests of what the picture does when a part is poked.

import { act, fireEvent } from "@testing-library/react";

import {
	mountStage,
	server,
	settle,
	surface,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";

/** One node as the board file spells it, as far as these tests need. */
interface Node {
	readonly id: string;
	readonly name: string;
	readonly kind: string;
	readonly parent?: string;
}

// Orders holds a handler and a queue; Shipping holds a worker. The gateway calls
// the handler, the handler fills the queue, the queue feeds the worker, and the
// worker writes the ledger.
const NODES: readonly Node[] = [
	{ id: "orders", name: "Orders", kind: "service" },
	{ id: "shipping", name: "Shipping", kind: "service" },
	{ id: "h", name: "Handler", kind: "route", parent: "orders" },
	{ id: "q", name: "Queue", kind: "queue", parent: "orders" },
	{ id: "w", name: "Worker", kind: "job", parent: "shipping" },
	{ id: "l", name: "Ledger", kind: "datastore" },
	{ id: "g", name: "Gateway", kind: "route" },
];
const EDGES = [
	{ id: "e1", from: "g", to: "h", kind: "http" },
	{ id: "e2", from: "h", to: "q", kind: "queue" },
	{ id: "e3", from: "q", to: "w", kind: "queue" },
	{ id: "e4", from: "w", to: "l", kind: "data" },
];
const WIRING = { nodes: NODES, edges: EDGES };

/** A box in the diagram. */
interface Place {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** Where a drawn subject sits unless a test says: the same box, since nothing here measures. */
const BOX: Place = { x: 0, y: 0, width: 10, height: 10 };

/**
 * One drawn subject of the picture.
 * @param kind What it is.
 * @param id Its id.
 * @param masked Whether the picture masks a line, as it does one that shares a lane.
 * @returns The markup.
 */
function drawn(kind: string, id: string, masked = false): string {
	// A line is drawn as the renderer draws it: a halo under the route, which ends in an arrowhead.
	const route = kind === "edge" ? `<path d="M0 0 L10 10" marker-end="url(#head)"></path>` : "";
	const mask = masked ? ` mask="url(#cut-${id})"` : "";
	return `<g data-semantic-kind="${kind}" data-semantic-id="${id}"${mask}><path class="ab-halo"></path><rect width="10" height="10"></rect>${route}</g>`;
}

/**
 * The mask the picture gives a route that shares a lane: the stretch another
 * route draws cut away with butt ends, and the gap under a line that crosses
 * over it with round ones.
 * @param id The route's relationship.
 * @returns The mask.
 */
function trunkMask(id: string): string {
	const cut = `fill="none" stroke="black"`;
	return (
		`<mask id="cut-${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="300">` +
		`<rect x="0" y="0" width="400" height="300" fill="white"></rect>` +
		`<path d="M0 0 L4 4" ${cut} stroke-width="18" stroke-linecap="butt"></path>` +
		`<path d="M6 6 L8 8" ${cut} stroke-width="6" stroke-linecap="round" stroke-linejoin="round"></path>` +
		`</mask>`
	);
}

/**
 * One board document, as its route answers with it.
 * @returns The document.
 */
function boardOf(): Record<string, unknown> {
	return {
		schemaVersion: "2.2.0",
		kind: "semantic-board",
		id: "bd",
		name: "pipeline",
		level: "system",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "as it is",
				lifecycle: "current",
				content: { nodes: NODES, edges: EDGES },
			},
		],
	};
}

/**
 * Where some subjects sit.
 * @param ids The subjects.
 * @param places Where some of them sit, when not in the one box.
 * @returns The atlas entries.
 */
function placed(
	ids: readonly string[],
	places: Readonly<Record<string, Place>>,
): Record<string, Place> {
	return Object.fromEntries(ids.map((id) => [id, places[id] ?? BOX]));
}

/** What a test may say about the picture. */
interface PictureOptions {
	/** Subjects this picture does not draw, as a view that hides them does. */
	readonly hidden?: readonly string[];
	/** Where some subjects sit. */
	readonly places?: Readonly<Record<string, Place>>;
	/** Relationships whose line shares a lane, so the picture masks the stretch another route draws. */
	readonly trunks?: readonly string[];
	/** Whether the picture casts each card's shadow under the lines, as the renderer does. */
	readonly shadows?: boolean;
}

/**
 * A picture of the board, drawing every subject except those named.
 * @param options What the picture hides, and where some subjects sit.
 * @returns The render route's success body.
 */
function picture(options: PictureOptions = {}): Record<string, unknown> {
	const hidden = options.hidden ?? [];
	const places = options.places ?? {};
	const containers = NODES.filter((node) => NODES.some((child) => child.parent === node.id));
	const cards = NODES.filter((node) => !hidden.includes(node.id) && !containers.includes(node));
	const wires = EDGES.filter((edge) => !hidden.includes(edge.id));
	const trunks = options.trunks ?? [];
	const svg = [
		`<defs>${trunks.map(trunkMask).join("")}</defs>`,
		...containers.map((node) => drawn("region", node.id)),
		...(options.shadows === true
			? cards.map((node) => `<g class="ab-shadow" data-members="${node.id}"><rect></rect></g>`)
			: []),
		...cards.map((node) => drawn("node", node.id)),
		...wires.map((edge) => drawn("edge", edge.id, trunks.includes(edge.id))),
	].join("");
	return {
		success: true,
		board: "pipeline",
		version: 1,
		variant: { id: "v1", name: "as it is", lifecycle: "current" },
		view: null,
		views: [],
		changes: null,
		waiting: null,
		width: 400,
		height: 300,
		svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">${svg}</svg>`,
		drawn: { nodes: [], edges: [], flows: [], steps: [] },
		appearances: [],
		key: null,
		atlas: {
			nodes: placed(
				cards.map((node) => node.id),
				places,
			),
			edges: placed(
				wires.map((edge) => edge.id),
				places,
			),
			regions: placed(
				containers.map((node) => node.id),
				places,
			),
		},
	};
}

/** What a test may say about how the pane is served. */
interface ServedOptions extends PictureOptions {
	/** Whether the person asked for reduced motion. */
	readonly reducedMotion?: boolean;
	/** The board document, when it is not the one variant this file draws. */
	readonly document?: Record<string, unknown>;
}

/**
 * Put the board and a picture of it in front of a pane, and let it arrive.
 * @param options What the picture hides and where subjects sit, and the person's preference for motion.
 */
async function served(options: ServedOptions = {}): Promise<void> {
	server.documents["pipeline"] = options.document ?? boardOf();
	server.reply = { status: 200, body: picture(options) };
	mountStage(null, { live: true, reducedMotion: options.reducedMotion });
	await settle();
	await settle();
}

/**
 * The drawn group of a subject.
 * @param id The subject.
 * @returns The group.
 */
function group(id: string): Element {
	const found = surface().querySelector(`[data-semantic-id='${id}']`);
	if (found === null) throw new Error(`The picture draws no ${id}.`);
	return found;
}

/**
 * Pick a subject out, the way a person does.
 * @param id The subject.
 */
async function pick(id: string): Promise<void> {
	const at = { pointerId: 1, button: 0, clientX: 5, clientY: 5 };
	await act(async () => {
		fireEvent.pointerDown(group(id), at);
		fireEvent.pointerUp(group(id), at);
		fireEvent.click(group(id), at);
	});
	await settle();
}

/**
 * Rest the pointer over a subject, or over nothing.
 * @param id The subject, or null for the empty picture.
 */
function pointAt(id: string | null): void {
	const target = id === null ? surface() : group(id);
	act(() => {
		fireEvent.pointerMove(target, { pointerId: 2, buttons: 0, clientX: 5, clientY: 5 });
	});
}

/**
 * The subjects the picture marks lit.
 * @returns Their ids, sorted.
 */
function lit(): string[] {
	return [...surface().querySelectorAll(".is-lit")]
		.map((one) => one.getAttribute("data-semantic-id") ?? "")
		.toSorted();
}

/**
 * What the surface says about how it lights.
 * @returns "pick", "hover", or null for no lighting.
 */
function lighting(): "pick" | "hover" | null {
	if (!surface().classList.contains("is-probing")) return null;
	return surface().classList.contains("is-probing-light") ? "hover" : "pick";
}

/**
 * Which subjects the picture grades as reached by a trace, with the class that grades each.
 * @returns "id:is-reach-N" for each, sorted.
 */
function graded(): string[] {
	return [...surface().querySelectorAll("[class*='is-reach-']")]
		.map(
			(one) =>
				`${one.getAttribute("data-semantic-id")}:${[...one.classList].find((name) => name.startsWith("is-reach-"))}`,
		)
		.toSorted();
}

export { EDGES, NODES, WIRING, graded, group, lighting, lit, pick, pointAt, served, type Place };
