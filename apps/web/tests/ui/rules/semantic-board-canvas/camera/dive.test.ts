// Where a board sits inside the card that opens it, and where the camera has to
// be to see it there.
//
// What these catch: an inset that overflows its card or is not centred in it,
// a flight that ends somewhere other than where the board itself stands, which
// would show as a jump the moment the board takes over, and a flight that takes
// a camera something else moved for one that arrived.

import { describe, expect, test } from "bun:test";

import {
	cameraAtInset,
	insetOf,
	legInto,
	legOut,
	reached,
} from "#ui/rules/semantic-board-canvas/camera/dive.ts";

const CARD = { x: 400, y: 300, width: 260, height: 80 };
const CHILD = { width: 1400, height: 900 };

describe("the board inside its card", () => {
	test("is centred in the card, fits it with the card's frame showing, and keeps the board's shape", () => {
		const inset = insetOf(CARD, CHILD);
		expect(inset.width / inset.height).toBeCloseTo(CHILD.width / CHILD.height, 9);
		expect(inset.x + inset.width / 2).toBeCloseTo(CARD.x + CARD.width / 2, 9);
		expect(inset.y + inset.height / 2).toBeCloseTo(CARD.y + CARD.height / 2, 9);
		expect(inset.height).toBeLessThan(CARD.height);
		expect(inset.width).toBeLessThan(CARD.width);
		// The card is wide and short, so its height decides.
		expect(inset.height).toBeCloseTo(CARD.height * 0.86, 9);
	});

	test("is limited by the card's width when the board is wider than the card", () => {
		const inset = insetOf({ x: 0, y: 0, width: 100, height: 400 }, CHILD);
		expect(inset.width).toBeCloseTo(86, 9);
	});
});

/** Where a camera looks: the picture point at the pane's top left, and the zoom. */
interface Look {
	readonly x: number;
	readonly y: number;
	readonly scale: number;
}

/**
 * Where a point of a picture is on screen.
 * @param camera The camera.
 * @param x Across, in the picture's units.
 * @param y Down.
 * @returns The point on screen.
 */
function onScreen(camera: Look, x: number, y: number): { x: number; y: number } {
	return { x: camera.x + x * camera.scale, y: camera.y + y * camera.scale };
}

describe("the camera at the inset", () => {
	test("puts the inset where the board stands when it is seen through its own camera", () => {
		const own = { x: 120, y: 60, scale: 0.9 };
		const inset = insetOf(CARD, CHILD);
		const over = cameraAtInset(inset, CHILD, own);
		// The corners of the inset, over the parent, land on the corners of the board.
		const insetCorner = onScreen(over, inset.x, inset.y);
		const insetFar = onScreen(over, inset.x + inset.width, inset.y + inset.height);
		const boardCorner = onScreen(own, 0, 0);
		const boardFar = onScreen(own, CHILD.width, CHILD.height);
		expect(insetCorner.x).toBeCloseTo(boardCorner.x, 6);
		expect(insetCorner.y).toBeCloseTo(boardCorner.y, 6);
		expect(insetFar.x).toBeCloseTo(boardFar.x, 6);
		expect(insetFar.y).toBeCloseTo(boardFar.y, 6);
	});

	test("zooms in by as much as the board is larger than its inset", () => {
		const own = { x: 0, y: 0, scale: 1 };
		const inset = insetOf(CARD, CHILD);
		const over = cameraAtInset(inset, CHILD, own);
		expect(over.scale).toBeCloseTo(CHILD.width / inset.width, 9);
		expect(over.scale).toBeGreaterThan(5);
	});
});

describe("the flight between a board and its card", () => {
	const PARENT = {
		width: 800,
		height: 600,
		atlas: {
			nodes: { card: CARD },
			edges: {},
			regions: {},
		},
	};
	const ROOM = { width: 1200, height: 800 };
	const FIT = { x: 100, y: 50, scale: 0.8 };

	test("goes into the card, to where the board stands once it is opened and fitted", () => {
		const leg = legInto(PARENT, "card", { ...CHILD, atlas: PARENT.atlas }, ROOM);
		expect(leg).not.toBeNull();
		// Seen through the camera the leg ends at, the board is where its own fit puts it.
		const inset = leg!.inset;
		const end = leg!.to;
		const corner = onScreen(end, inset.x, inset.y);
		const own = onScreen(leg!.through, 0, 0);
		expect(corner.x).toBeCloseTo(own.x, 6);
		expect(corner.y).toBeCloseTo(own.y, 6);
		expect(leg!.from).toBeNull();
	});

	test("goes back out from where the board was left, to the whole board above", () => {
		const leg = legOut(PARENT, "card", { ...CHILD, atlas: PARENT.atlas }, ROOM, FIT);
		expect(leg).not.toBeNull();
		const start = onScreen(leg!.from!, leg!.inset.x, leg!.inset.y);
		const left = onScreen(FIT, 0, 0);
		expect(start.x).toBeCloseTo(left.x, 6);
		expect(start.y).toBeCloseTo(left.y, 6);
		expect(leg!.through).toEqual(FIT);
	});

	test("goes nowhere for a card the picture does not draw", () => {
		expect(legInto(PARENT, "missing", { ...CHILD, atlas: PARENT.atlas }, ROOM)).toBeNull();
		expect(legOut(PARENT, "missing", { ...CHILD, atlas: PARENT.atlas }, ROOM, FIT)).toBeNull();
	});
});

describe("the end of a flight", () => {
	const END = { x: -10953, y: -8192.5, scale: 12.554 };

	test("is reached by a camera that is there, give or take a pixel", () => {
		expect(reached(END, END)).toBe(true);
		expect(reached({ ...END, x: END.x + 0.4, y: END.y - 0.4 }, END)).toBe(true);
	});

	test("is not reached by a camera something else sent elsewhere", () => {
		expect(reached({ ...END, x: END.x + 5 }, END)).toBe(false);
		expect(reached({ ...END, scale: END.scale * 0.9 }, END)).toBe(false);
	});
});
