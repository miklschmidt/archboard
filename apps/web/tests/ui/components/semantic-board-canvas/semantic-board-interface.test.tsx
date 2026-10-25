// What picking a container tells a person about its interface (ADR 0044): the
// entry points, how many parts are hidden and who calls it, read off the
// variant the pane shows, and an entry point chosen from the list picked out on
// the picture. Nothing here writes: the interface is derived, never stored.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	mountStage,
	openSidebarTab,
	server,
	settle,
	surface,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";
import { pick } from "#tests/ui/support/semantic-board-canvas/wiring-fixture.tsx";

/** One node as the board file spells it, as far as these tests need. */
interface Node {
	readonly id: string;
	readonly name: string;
	readonly kind: string;
	readonly parent?: string;
}

// Orders holds a handler, a relay and a queue; Shipping holds a worker nobody
// outside calls. On the current variant the gateway calls the handler only.
const CURRENT_NODES: readonly Node[] = [
	{ id: "orders", name: "Orders", kind: "service" },
	{ id: "h", name: "Handler", kind: "route", parent: "orders" },
	{ id: "q", name: "Queue", kind: "queue", parent: "orders" },
	{ id: "g", name: "Gateway", kind: "route" },
];
const CURRENT_EDGES = [
	{ id: "e1", from: "g", to: "h", kind: "http" },
	{ id: "e2", from: "h", to: "q", kind: "queue" },
];

// The draft the pane shows: the gateway also reaches a relay, which passes the
// same kind of call on to the ledger, and an admin depends on Orders as a whole.
const DRAFT_NODES: readonly Node[] = [
	...CURRENT_NODES,
	{ id: "r", name: "Relay", kind: "route", parent: "orders" },
	{ id: "a", name: "Admin", kind: "route" },
	{ id: "l", name: "Ledger", kind: "datastore" },
	{ id: "shipping", name: "Shipping", kind: "service" },
	{ id: "w", name: "Worker", kind: "job", parent: "shipping" },
];
const DRAFT_EDGES = [
	...CURRENT_EDGES,
	{ id: "e3", from: "g", to: "r", kind: "http" },
	{ id: "e4", from: "r", to: "l", kind: "http" },
	{ id: "e5", from: "a", to: "orders", kind: "call" },
	{ id: "e6", from: "w", to: "l", kind: "data" },
];

/**
 * The board document: the current variant and the draft the pane shows.
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
		createdAt: "2026-10-06T00:00:00.000Z",
		updatedAt: "2026-10-06T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "as it is",
				lifecycle: "current",
				content: { nodes: CURRENT_NODES, edges: CURRENT_EDGES },
			},
			{
				id: "v2",
				name: "relayed",
				lifecycle: "draft",
				parent: "v1",
				content: { nodes: DRAFT_NODES, edges: DRAFT_EDGES },
			},
		],
	};
}

/**
 * One drawn subject of the picture.
 * @param kind What it is.
 * @param id Its id.
 * @returns The markup.
 */
function drawn(kind: string, id: string): string {
	return `<g data-semantic-kind="${kind}" data-semantic-id="${id}"><path class="ab-halo"></path><rect width="10" height="10"></rect></g>`;
}

/** Where every drawn subject sits: one box, since nothing here measures. */
const BOX = { x: 0, y: 0, width: 10, height: 10 };

/**
 * Where some subjects sit.
 * @param ids The subjects.
 * @returns The atlas entries.
 */
function atlas(ids: readonly string[]): Record<string, typeof BOX> {
	return Object.fromEntries(ids.map((id) => [id, BOX]));
}

/**
 * A picture of the draft.
 * @returns The render route's success body.
 */
function picture(): Record<string, unknown> {
	const containers = ["orders", "shipping"];
	const cards = DRAFT_NODES.map((node) => node.id).filter((id) => !containers.includes(id));
	const edges = DRAFT_EDGES.map((edge) => edge.id);
	const svg = [
		...containers.map((id) => drawn("region", id)),
		...cards.map((id) => drawn("node", id)),
		...edges.map((id) => drawn("edge", id)),
	].join("");
	return {
		success: true,
		board: "pipeline",
		version: 1,
		variant: { id: "v2", name: "relayed", lifecycle: "draft" },
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
		atlas: { nodes: atlas(cards), edges: atlas(edges), regions: atlas(containers) },
	};
}

/** Put the draft in front of a pane whose selection is held above it, and let it arrive. */
async function served(): Promise<void> {
	server.documents["pipeline"] = boardOf();
	server.reply = { status: 200, body: picture() };
	mountStage(null, { live: true, variant: "v2" });
	await settle();
	await settle();
}

/**
 * Pick a part out of the picture and read it in the selection tab.
 * @param id The part.
 */
async function inspect(id: string): Promise<void> {
	await pick(id);
	openSidebarTab("selection");
	await settle();
}

/** One row of a measure: the part it names, and whether it adds a line under the name. */
interface MeasureRow {
	readonly part: string | null;
	readonly noted: boolean;
}

/**
 * One measure of the interface on screen.
 * @param name Which one, by the slot it is drawn in.
 * @returns Its count, and the rows that name the parts behind it.
 */
function measure(name: "entry-points" | "hidden-parts" | "callers"): {
	readonly count: number;
	readonly rows: readonly MeasureRow[];
} {
	const section = document.querySelector(`[data-slot='semantic-inspector-${name}']`);
	if (section === null) throw new Error(`The selection tab shows no ${name}.`);
	const rows = [...section.querySelectorAll("[data-part]")].map((row) => ({
		part: row.getAttribute("data-part"),
		noted: row.querySelector("[data-slot='sidebar-label'] > span") !== null,
	}));
	return { count: Number(section.getAttribute("data-count")), rows };
}

/**
 * The picture's selection.
 * @returns The ids of the subjects drawn as selected.
 */
function selectedInPicture(): string[] {
	return [...surface().querySelectorAll(".is-selected")].map(
		(group) => group.getAttribute("data-semantic-id") ?? "",
	);
}

test("a picked container shows the interface of the variant on screen, and an entry point chosen from it is picked on the picture", async () => {
	await served();
	await inspect("orders");

	// The draft's interface, not the current variant's: the relay is an entry
	// point only on the draft, and it passes the call on, which its row says.
	const entries = measure("entry-points");
	expect(entries.count).toBe(2);
	expect(entries.rows).toEqual([
		{ part: "h", noted: false },
		{ part: "r", noted: true },
	]);
	expect(measure("hidden-parts")).toEqual({ count: 1, rows: [] });
	// The admin reaches Orders itself, and so is a caller that reaches no entry point.
	const callers = measure("callers");
	expect(callers.count).toBe(2);
	expect(callers.rows.map((row) => row.part)).toEqual(["g", "a"]);

	const relay = document.querySelector<HTMLElement>(
		"[data-slot='semantic-inspector-entry-point'][data-part='r']",
	);
	await act(async () => {
		fireEvent.click(relay!);
	});
	await settle();
	expect(selectedInPicture()).toEqual(["r"]);
	expect(document.querySelector("[data-slot='semantic-inspector'] h2")?.textContent).toBe("Relay");
	// A part that holds nothing has no interface to show.
	expect(document.querySelector("[data-slot='semantic-inspector-interface']")).toBeNull();
});

test("a container nothing outside reaches hides every part and says that nothing calls it", async () => {
	await served();
	await inspect("shipping");

	expect(measure("entry-points")).toEqual({ count: 0, rows: [] });
	expect(measure("hidden-parts")).toEqual({ count: 1, rows: [] });
	const callers = document.querySelector("[data-slot='semantic-inspector-callers']");
	expect(callers?.getAttribute("data-count")).toBe("0");
	expect(callers?.querySelector("p")).not.toBeNull();
});
