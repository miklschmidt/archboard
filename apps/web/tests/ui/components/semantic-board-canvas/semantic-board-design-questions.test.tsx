// What the Board tab asks of the variant on screen (TASK-537): the entry points
// that only pass one call on, by their container, each one shown on the picture
// when chosen, and the deletion question put to the agent of the pane's
// checkout. The question names the subjects by id, so that the agent reads the
// part the person chose.
//
// Choosing the question lights its answer on the picture (ADR 0057): the
// entry points and the containers that hold them, with an entry point the view
// does not draw standing through its container.
//
// What these catch: a region that counts or lists a part that passes nothing on,
// a result that picks the wrong part, a question that names another board,
// variant or part, a control that sends where the page has no agent, a region
// drawn on a board with nothing to ask, an answer lit without its containers or
// through no container, a count of hidden subjects that disagrees with the
// picture, a pick that does not take the light or does not give it back, and a
// question that outlives a group or a walkthrough, or a pick or group that
// outlives the question.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	PANE_VAULT,
	type Mounted,
	mountStage,
	openSidebarTab,
	pickablePicture,
	server,
	settle,
	surface,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";

// Real ids are eight random characters, so a message that names one names that part.
const CHECKOUT = "Pm3ZtY9a";
const PLACE_ORDER = "Kq7rLx2p";
const SHIPPING = "Vd8nWq4c";
const TRACK = "Hs2kJm6t";

// Place order and Track parcel each pass one call of the kind they receive on;
// Basket stores the basket as well as pricing it, so it passes nothing on.
// Basket and Payments are the Money group's.
const NODES = [
	{ id: "sf", name: "Storefront", kind: "route" },
	{ id: CHECKOUT, name: "Checkout", kind: "service" },
	{ id: PLACE_ORDER, name: "Place order", kind: "route", parent: CHECKOUT },
	{ id: "bsk", name: "Basket", kind: "route", parent: CHECKOUT, groups: ["money"] },
	{ id: SHIPPING, name: "Shipping", kind: "service" },
	{ id: TRACK, name: "Track parcel", kind: "route", parent: SHIPPING },
	{ id: "pay", name: "Payments", kind: "service", groups: ["money"] },
	{ id: "db", name: "Orders DB", kind: "datastore" },
	{ id: "car", name: "Carrier", kind: "service" },
];
const EDGES = [
	{ id: "e1", from: "sf", to: PLACE_ORDER, kind: "http" },
	{ id: "e2", from: PLACE_ORDER, to: "pay", kind: "http" },
	{ id: "e3", from: "sf", to: "bsk", kind: "http" },
	{ id: "e4", from: "bsk", to: "db", kind: "data" },
	{ id: "e5", from: "bsk", to: "pay", kind: "http" },
	{ id: "e6", from: "sf", to: TRACK, kind: "http" },
	{ id: "e7", from: TRACK, to: "car", kind: "http" },
];

/** The one explanation the variant gives of itself. */
const TOUR = {
	id: "tour",
	name: "An order",
	beats: [
		{ id: "b1", heading: "First", body: "The storefront takes the order.", subjects: ["sf"] },
	],
};

/**
 * The board document, with one current variant.
 * @param edges The relationships it draws.
 * @returns The document.
 */
function boardOf(edges: readonly unknown[]): Record<string, unknown> {
	return {
		schemaVersion: "2.2.0",
		kind: "semantic-board",
		id: "bd",
		name: "pipeline",
		level: "system",
		version: 1,
		createdAt: "2026-10-25T00:00:00.000Z",
		updatedAt: "2026-10-25T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "as built",
				lifecycle: "current",
				content: { nodes: NODES, edges, walkthroughs: [TOUR] },
			},
		],
	};
}

/** What every picture here is of. */
const DRAWN_VARIANT = {
	variant: { id: "v1", name: "as built", lifecycle: "current" },
	changes: null,
};

/** The picture of the variant, whose subjects can be picked. */
const PICTURE = pickablePicture(
	{
		regions: [CHECKOUT, SHIPPING],
		nodes: NODES.map((node) => node.id).filter((id) => id !== CHECKOUT && id !== SHIPPING),
		edges: EDGES.map((edge) => edge.id),
	},
	DRAWN_VARIANT,
);

/** A view that draws Shipping closed, so Track parcel is not drawn. */
const SHIPPING_CLOSED = pickablePicture(
	{
		regions: [CHECKOUT],
		nodes: NODES.map((node) => node.id).filter((id) => id !== CHECKOUT && id !== TRACK),
		edges: EDGES.map((edge) => edge.id),
	},
	DRAWN_VARIANT,
);

/**
 * Put the board in front of a pane whose selection is held above it, and open its Board tab.
 * @param ask What the pane can ask the agent, if the page has one.
 * @param edges The relationships the board draws.
 * @param picture The picture the render route answers with.
 * @returns The mounted stage, with the picks it reported.
 */
async function served(
	ask?: (text: string) => void,
	edges: readonly unknown[] = EDGES,
	picture: Record<string, unknown> = PICTURE,
): Promise<Mounted> {
	server.documents["pipeline"] = boardOf(edges);
	server.reply = { status: 200, body: picture };
	const mounted = mountStage(null, { live: true, ask });
	await settle();
	await settle();
	openSidebarTab("board");
	await settle();
	return mounted;
}

/**
 * The results of the one question, as the rows name them.
 * @returns The question's count, and each row's part and container.
 */
function results(): { readonly count: number; readonly rows: readonly (readonly string[])[] } {
	const question = document.querySelector("[data-slot='semantic-board-question']");
	if (question === null) throw new Error("The Board tab asks no design question.");
	const rows = [...question.querySelectorAll("[data-slot='semantic-board-question-result']")];
	return {
		count: Number(question.getAttribute("data-count")),
		rows: rows.map((row) => [
			row.getAttribute("data-part") ?? "",
			row.getAttribute("data-container") ?? "",
		]),
	};
}

/**
 * One result's row.
 * @param part The entry point it names.
 * @returns The row.
 */
function result(part: string): HTMLElement {
	const row = document.querySelector<HTMLElement>(
		`[data-slot='semantic-board-question-result'][data-part='${part}']`,
	);
	if (row === null) throw new Error(`No result names ${part}.`);
	return row;
}

test("the Board tab lists each entry point that passes one call on by its container, and a chosen one is picked on the picture", async () => {
	await served();
	expect(results()).toEqual({
		count: 2,
		rows: [
			[PLACE_ORDER, CHECKOUT],
			[TRACK, SHIPPING],
		],
	});
	// A page with no agent offers no question to send.
	expect(document.querySelector("[data-slot='semantic-board-question-ask']")).toBeNull();

	await act(async () => {
		fireEvent.click(result(TRACK));
	});
	await settle();
	const selected = [...surface().querySelectorAll(".is-selected")];
	expect(selected.map((group) => group.getAttribute("data-semantic-id"))).toEqual([TRACK]);
});

test("asking the agent about a result sends one question that names the vault, the board, the variant and the part", async () => {
	const asked: string[] = [];
	await served((text) => asked.push(text));
	const ask = result(PLACE_ORDER).parentElement?.querySelector<HTMLElement>(
		"[data-slot='semantic-board-question-ask']",
	);
	await act(async () => {
		fireEvent.click(ask!);
	});
	expect(asked).toHaveLength(1);
	const [question] = asked;
	for (const named of [`-C '${PANE_VAULT}'`, `"pipeline"`, "v1", PLACE_ORDER, CHECKOUT]) {
		expect(question).toContain(named);
	}
	expect(question).not.toContain(TRACK);
});

test("a board whose entry points pass nothing on draws no design questions", async () => {
	await served(undefined, [
		...EDGES.filter((edge) => edge.id !== "e7"),
		{ id: "e8", from: TRACK, to: "car", kind: "data" },
		{ id: "e9", from: PLACE_ORDER, to: "db", kind: "data" },
	]);
	expect(document.querySelector("[data-slot='semantic-board-design-questions']")).toBeNull();
	expect(document.querySelector("[data-slot='semantic-board-panel-questions']")).toBeNull();
});

/**
 * The choice that lights the question's answer.
 * @returns The choice.
 */
function lightChoice(): HTMLElement {
	const choice = document.querySelector<HTMLElement>(
		"[data-slot='semantic-board-question-choice']",
	);
	if (choice === null) throw new Error("The question offers no light.");
	return choice;
}

/**
 * Click a control the way a person does, and let the stage settle.
 * @param control The control.
 */
async function click(control: HTMLElement): Promise<void> {
	await act(async () => {
		fireEvent.click(control);
	});
	await settle();
}

/** Press Escape on the picture, and let the stage settle. */
async function escape(): Promise<void> {
	act(() => {
		fireEvent.keyDown(document.querySelector("[data-slot='semantic-board-viewport']")!, {
			key: "Escape",
		});
	});
	await settle();
}

/**
 * The subjects the light leaves standing.
 * @returns Their ids, sorted, or none while nothing is lit.
 */
function lit(): string[] {
	if (!surface().classList.contains("is-probing")) return [];
	return [...surface().querySelectorAll("[data-semantic-id].is-lit")]
		.map((group) => group.getAttribute("data-semantic-id") ?? "")
		.toSorted();
}

/**
 * The Money group's choice in the group list.
 * @returns The choice.
 */
function money(): HTMLElement {
	return document.querySelector<HTMLElement>(
		"[data-slot='semantic-group-choice'][data-group='money']",
	)!;
}

/**
 * The pane's stage, which names the group it has selected.
 * @returns The stage.
 */
function stage(): HTMLElement {
	return document.querySelector<HTMLElement>("[data-slot='semantic-board-stage']")!;
}

/** What the answer lights on the full picture: both entry points, and their containers. */
const ANSWER_LIT = [CHECKOUT, PLACE_ORDER, SHIPPING, TRACK].toSorted();

test("choosing the question lights its entry points and their containers, and choosing it again lets it go", async () => {
	await served();
	expect(lit()).toEqual([]);
	await click(lightChoice());
	expect(lightChoice().getAttribute("aria-pressed")).toBe("true");
	expect(lit()).toEqual(ANSWER_LIT);
	expect(lightChoice().getAttribute("data-hidden")).toBe("0");
	await click(lightChoice());
	expect(lightChoice().getAttribute("aria-pressed")).toBe("false");
	expect(lit()).toEqual([]);
});

test("an entry point the view does not draw stands through the container drawn closed, and the region counts it", async () => {
	await served(undefined, EDGES, SHIPPING_CLOSED);
	await click(lightChoice());
	expect(lit()).toEqual([CHECKOUT, PLACE_ORDER, SHIPPING].toSorted());
	expect(lightChoice().getAttribute("data-hidden")).toBe("1");
});

test("a pick shows its own light, letting go brings the answer's back, and letting go again lets the question go", async () => {
	const { picks } = await served();
	await click(lightChoice());
	await click(result(TRACK));
	expect(picks.at(-1)).toBe(TRACK);
	// Track parcel's own light: its relationships and what is at their other ends.
	expect(lit()).toEqual(["car", "e6", "e7", "sf", SHIPPING, TRACK].toSorted());

	await escape();
	expect(picks.at(-1)).toBeNull();
	expect(lit()).toEqual(ANSWER_LIT);

	await escape();
	expect(lit()).toEqual([]);
	openSidebarTab("board");
	expect(lightChoice().getAttribute("aria-pressed")).toBe("false");
});

test("a group or a walkthrough lets the question go, and the question lets the pick and the group go", async () => {
	const { picks } = await served();
	await click(result(PLACE_ORDER));
	openSidebarTab("board");
	await click(lightChoice());
	expect(picks.at(-1)).toBeNull();
	expect(lit()).toEqual(ANSWER_LIT);

	await click(money());
	expect(stage().getAttribute("data-group")).toBe("money");
	expect(lightChoice().getAttribute("aria-pressed")).toBe("false");
	expect(lit()).toEqual([]);

	await click(lightChoice());
	expect(stage().hasAttribute("data-group")).toBe(false);
	expect(lit()).toEqual(ANSWER_LIT);

	await click(document.querySelector<HTMLElement>("[data-slot='semantic-walkthrough-choice']")!);
	await click(document.querySelector<HTMLElement>("[data-slot='semantic-walkthrough-choice']")!);
	openSidebarTab("board");
	expect(lightChoice().getAttribute("aria-pressed")).toBe("false");
	expect(lit()).toEqual([]);
});
