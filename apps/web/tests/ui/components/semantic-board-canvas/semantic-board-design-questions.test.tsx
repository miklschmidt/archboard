// What the Board tab asks of the variant on screen (TASK-537): the entry points
// that only pass one call on, by their container, and the deletion question put
// to the agent of the pane's checkout. The question names the subjects by id, so
// that the agent reads the part the person chose.
//
// Each result is a step through the answer (ADR 0059): it lights every entry
// point and the containers that hold them, with what the result calls and what
// calls it, rings the result while nothing is picked, and the camera brings that
// in. The Board tab stays open for the next step.
//
// What these catch: a region that counts or lists a part that passes nothing on,
// a question that names another board, variant or part, a control that sends
// where the page has no agent, a region drawn on a board with nothing to ask, a
// step that picks or leaves the Board tab, a step lit without the rest of the
// answer, its containers or its own connections, a ring on the wrong subject or
// beside a pick's, a camera that frames the entry
// point without what is around it, a pick that does not take the light or does
// not give it back, and a question that outlives a group or a walkthrough, or a
// pick or group that outlives the question.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import { cameraNow } from "#tests/ui/support/semantic-board-canvas/camera-probes.ts";
import {
	PANE_VAULT,
	VIEWPORT,
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

/**
 * A box of the picture, 40 by 20, at a corner.
 * @param x Its left edge.
 * @param y Its top edge.
 * @returns The box.
 */
function boxAt(x: number, y: number): Record<string, number> {
	return { x, y, width: 40, height: 20 };
}

/**
 * The picture with its subjects spread out along the top edge: the Storefront
 * that calls Track parcel at the left, Track parcel beside it, and the Carrier
 * it calls at the right. Everything else is at the bottom right.
 */
const SPREAD = {
	...PICTURE,
	atlas: {
		nodes: {
			...Object.fromEntries(NODES.map((node) => [node.id, boxAt(340, 260)])),
			sf: boxAt(0, 0),
			[TRACK]: boxAt(60, 0),
			car: boxAt(360, 0),
		},
		edges: Object.fromEntries(EDGES.map((edge) => [edge.id, boxAt(340, 260)])),
		regions: {},
	},
};

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
	const mounted = mountStage(null, { live: true, ask, reducedMotion: true });
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

test("the Board tab lists each entry point that passes one call on by its container", async () => {
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
 * Click a control the way a person does, and let the stage settle.
 * @param control The control.
 */
async function click(control: HTMLElement): Promise<void> {
	await act(async () => {
		fireEvent.click(control);
	});
	await settle();
}

/**
 * Pick a subject out on the picture, the way a person does, and let the stage settle.
 * @param id The subject.
 */
async function pickOn(id: string): Promise<void> {
	const drawn = surface().querySelector(`[data-semantic-id='${id}']`)!;
	const at = { pointerId: 1, button: 0, clientX: 5, clientY: 5 };
	await act(async () => {
		fireEvent.pointerDown(drawn, at);
		fireEvent.pointerUp(drawn, at);
		fireEvent.click(drawn, at);
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

/**
 * The results whose rows are pressed: the step the person is at.
 * @returns Their parts.
 */
function pressed(): string[] {
	return [...document.querySelectorAll("[data-slot='semantic-board-question-result']")]
		.filter((row) => row.getAttribute("aria-pressed") === "true")
		.map((row) => row.getAttribute("data-part") ?? "");
}

/**
 * The subjects the picture rings as attended.
 * @returns Their ids.
 */
function ringed(): string[] {
	return [...surface().querySelectorAll(".is-selected")].map(
		(group) => group.getAttribute("data-semantic-id") ?? "",
	);
}

/**
 * Whether the sidebar's Board tab is the open one.
 * @returns True when it is.
 */
function boardTabOpen(): boolean {
	return (
		document
			.querySelector("[data-slot='semantic-sidebar-tab'][data-tab='board']")
			?.getAttribute("aria-selected") === "true"
	);
}

/** Every entry point of the answer, and their containers. */
const ANSWER = [CHECKOUT, PLACE_ORDER, SHIPPING, TRACK];

/** What a step to Track parcel lights: the answer, and Track parcel's relationships with their other ends. */
const AT_TRACK = [...ANSWER, "e6", "e7", "sf", "car"].toSorted();

/** What a step to Place order lights: the answer, and Place order's relationships with their other ends. */
const AT_PLACE_ORDER = [...ANSWER, "e1", "e2", "sf", "pay"].toSorted();

test("a result is a step: it lights the answer with its own connections, rings the result, picks nothing, keeps the Board tab open, and lets go when chosen again", async () => {
	const { picks } = await served();
	expect(lit()).toEqual([]);
	await click(result(TRACK));
	expect(pressed()).toEqual([TRACK]);
	expect(lit()).toEqual(AT_TRACK);
	expect(picks.at(-1) ?? null).toBeNull();
	expect(ringed()).toEqual([TRACK]);
	expect(boardTabOpen()).toBe(true);

	await click(result(PLACE_ORDER));
	expect(pressed()).toEqual([PLACE_ORDER]);
	expect(lit()).toEqual(AT_PLACE_ORDER);
	expect(ringed()).toEqual([PLACE_ORDER]);

	await click(result(PLACE_ORDER));
	expect(pressed()).toEqual([]);
	expect(lit()).toEqual([]);
});

test("a step brings its entry point in with what calls it and what it calls", async () => {
	await served(undefined, EDGES, SPREAD);
	await click(result(TRACK));
	// Storefront, Track parcel and Carrier span the top edge, 0 to 400 across and
	// 0 to 20 down, so the camera centres that strip, and not Track parcel alone at 80.
	const { x, y, scale } = cameraNow();
	const middle = { x: (VIEWPORT.width / 2 - x) / scale, y: (VIEWPORT.height / 2 - y) / scale };
	expect(middle.x).toBeCloseTo(200, 0);
	expect(middle.y).toBeCloseTo(10, 0);
	expect(400 * scale).toBeLessThanOrEqual(VIEWPORT.width);
});

test("a pick shows its own light, letting go brings the step's back, and letting go again lets the question go", async () => {
	const { picks } = await served();
	await click(result(TRACK));
	await pickOn("pay");
	expect(picks.at(-1)).toBe("pay");
	expect(ringed()).toEqual(["pay"]);
	// Payments' own light: its relationships and what is at their other ends.
	expect(lit()).toEqual(["bsk", "e2", "e5", "pay", CHECKOUT, PLACE_ORDER].toSorted());

	await escape();
	expect(picks.at(-1)).toBeNull();
	expect(lit()).toEqual(AT_TRACK);
	expect(ringed()).toEqual([TRACK]);

	await escape();
	expect(lit()).toEqual([]);
	openSidebarTab("board");
	expect(pressed()).toEqual([]);
});

test("a group or a walkthrough lets the question go, and the question lets the pick and the group go", async () => {
	const { picks } = await served();
	await pickOn("pay");
	openSidebarTab("board");
	await click(result(TRACK));
	expect(picks.at(-1)).toBeNull();
	expect(lit()).toEqual(AT_TRACK);

	await click(money());
	expect(stage().getAttribute("data-group")).toBe("money");
	expect(pressed()).toEqual([]);
	expect(lit()).toEqual([]);

	await click(result(TRACK));
	expect(stage().hasAttribute("data-group")).toBe(false);
	expect(lit()).toEqual(AT_TRACK);

	await click(document.querySelector<HTMLElement>("[data-slot='semantic-walkthrough-choice']")!);
	await click(document.querySelector<HTMLElement>("[data-slot='semantic-walkthrough-choice']")!);
	openSidebarTab("board");
	expect(pressed()).toEqual([]);
	expect(lit()).toEqual([]);
});
