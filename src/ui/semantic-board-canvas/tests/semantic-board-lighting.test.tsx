// What the picture lights when a part is poked: the part, what it is wired to,
// and the parts at the other ends, with the rest receding. Nothing here writes:
// the light is attention, like the camera and the selection.

import { act, cleanup, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import { litBy } from "@/ui/semantic-board-canvas/lighting";
import { takeFrames } from "@/ui/semantic-board-canvas/tests/camera-probes";
import {
	mountStage,
	server,
	settle,
	surface,
	viewport,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

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

/**
 * Which ids a poke lights, in a stable order.
 * @param id The part or relationship poked.
 * @returns The ids, sorted, or null.
 */
function litFor(id: string): string[] | null {
	const standing = litBy(WIRING, id);
	return standing === null ? null : [...standing].toSorted();
}

test("a part lights itself, its relationships and the parts at their other ends", () => {
	// The queue is wired to the handler before it and the worker after it, and
	// the containers that hold those are lit with them, so none is seen in a
	// frame that has receded.
	expect(litFor("q")).toEqual(["e2", "e3", "h", "orders", "q", "shipping", "w"]);
	expect(litFor("l")).toEqual(["e4", "l", "shipping", "w"]);
});

test("a container lights what it holds and the relationships that cross its edge", () => {
	// The relationship between its own two parts is its content, and is lit with it.
	expect(litFor("orders")).toEqual(["e1", "e2", "e3", "g", "h", "orders", "q", "shipping", "w"]);
});

test("a relationship lights itself and its two ends", () => {
	expect(litFor("e3")).toEqual(["e3", "orders", "q", "shipping", "w"]);
});

test("something that is no part and no relationship lights nothing", () => {
	expect(litFor("nobody")).toBeNull();
});

/**
 * One drawn subject of the picture.
 * @param kind What it is.
 * @param id Its id.
 * @returns The markup.
 */
function drawn(kind: string, id: string): string {
	// A line is drawn as the renderer draws it: a halo under the route, which ends in an arrowhead.
	const route = kind === "edge" ? `<path d="M0 0 L10 10" marker-end="url(#head)"></path>` : "";
	return `<g data-semantic-kind="${kind}" data-semantic-id="${id}"><path class="ab-halo"></path><rect width="10" height="10"></rect>${route}</g>`;
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

/** Where every drawn subject of these pictures sits: the same box, since nothing here measures. */
const BOX = { x: 0, y: 0, width: 10, height: 10 };

/**
 * A picture of the board, drawing every subject except those named.
 * @param hidden Subjects this picture does not draw, as a view that hides them does.
 * @returns The render route's success body.
 */
function picture(hidden: readonly string[] = []): Record<string, unknown> {
	/**
	 * Whether this picture draws a subject.
	 * @param id The subject.
	 * @returns True when it does.
	 */
	const shown = (id: string): boolean => !hidden.includes(id);
	const containers = NODES.filter((node) => NODES.some((child) => child.parent === node.id));
	const cards = NODES.filter((node) => shown(node.id) && !containers.includes(node));
	const wires = EDGES.filter((edge) => shown(edge.id));
	const svg = [
		...containers.map((node) => drawn("region", node.id)),
		...cards.map((node) => drawn("node", node.id)),
		...wires.map((edge) => drawn("edge", edge.id)),
	].join("");
	/**
	 * Where some subjects sit, all in the one box.
	 * @param ids The subjects.
	 * @returns The atlas entries.
	 */
	const placed = (ids: readonly string[]): Record<string, typeof BOX> =>
		Object.fromEntries(ids.map((id) => [id, BOX]));
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
		atlas: {
			nodes: placed(cards.map((node) => node.id)),
			edges: placed(wires.map((edge) => edge.id)),
			regions: placed(containers.map((node) => node.id)),
		},
	};
}

/**
 * Put the board and a picture of it in front of a pane, and let it arrive.
 * @param hidden Subjects the picture does not draw.
 */
async function served(
	hidden: readonly string[] = [],
	options: { readonly reducedMotion?: boolean } = {},
): Promise<void> {
	server.documents["pipeline"] = boardOf();
	server.reply = { status: 200, body: picture(hidden) };
	mountStage(null, { live: true, ...options });
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

test("picking a part lights what it is wired to, and letting go puts the picture back", async () => {
	await served();
	expect(lighting()).toBeNull();
	await pick("q");
	expect(lighting()).toBe("pick");
	expect(lit()).toEqual(["e2", "e3", "h", "orders", "q", "w", "shipping"].toSorted());
	await act(async () => {
		fireEvent.keyDown(viewport(), { key: "Escape" });
	});
	await settle();
	expect(lighting()).toBeNull();
	expect(lit()).toEqual([]);
});

test("a part wired to nothing the picture draws lights nothing", async () => {
	// A view that hides the ledger's one relationship leaves it nothing to light.
	await served(["e4"]);
	await pick("l");
	expect(lighting()).toBeNull();
	expect(lit()).toEqual([]);
});

test("resting the pointer on a part lights it lightly, after a moment, and leaving takes the light after a grace", async () => {
	await served();
	const frames = takeFrames();
	try {
		pointAt("q");
		frames.run(60);
		expect(lighting()).toBeNull();
		frames.run(80);
		expect(lighting()).toBe("hover");
		expect(lit()).toEqual(["e2", "e3", "h", "orders", "q", "shipping", "w"].toSorted());

		// Crossing to another part while something is lit lights that at once.
		pointAt("l");
		expect(lit()).toEqual(["e4", "l", "shipping", "w"]);

		// Crossing the gap between two parts keeps the light, and leaving for good takes it.
		pointAt(null);
		frames.run(80);
		expect(lighting()).toBe("hover");
		frames.run(120);
		expect(lighting()).toBeNull();
	} finally {
		frames.restore();
	}
});

test("a part picked out keeps its light while the pointer visits another, and has it back after", async () => {
	await served();
	await pick("q");
	const frames = takeFrames();
	try {
		pointAt("l");
		frames.run(140);
		expect(lighting()).toBe("hover");
		expect(lit()).toEqual(["e4", "l", "shipping", "w"]);
		pointAt(null);
		frames.run(240);
		expect(lighting()).toBe("pick");
		expect(lit()).toEqual(["e2", "e3", "h", "orders", "q", "shipping", "w"].toSorted());
	} finally {
		frames.restore();
	}
});

/**
 * The routes that are being drawn on over the picture.
 * @returns How many there are.
 */
function sweeping(): number {
	return surface().querySelectorAll(".ab-sweep path").length;
}

test("the relationships that light are drawn on once, and not for a reader who asked for no motion", async () => {
	await served();
	await pick("q");
	// The queue is wired to two relationships, and each is drawn on over the picture.
	expect(sweeping()).toBe(2);
	cleanup();

	await served([], { reducedMotion: true });
	await pick("q");
	expect(lighting()).toBe("pick");
	expect(sweeping()).toBe(0);
});
