// How traffic keeps time (ADR 0027).
//
// What is guarded: lines that keep the same time hand their pulses on through
// the card between them, a line's pulses lie behind its feeder's by the line
// and the way round the card, and where the time differs nothing is handed on.
// Every line carries a pulse at every moment, and no two are closer than a blur.

import { describe, expect, test } from "bun:test";
import { relayRhythms, rimRoute, type Lane } from "@/transformers/semantic-renderer/layout";

const SAME = { speed: 40, volume: 0.5 };

/**
 * A line that carries traffic, ending where its feeder's pulses go.
 * @param id The relationship's id.
 * @param from The card it leaves.
 * @param to The card it reaches.
 * @param over What differs from an ordinary line.
 * @returns The lane.
 */
function lane(id: string, from: string, to: string, over: Partial<Lane> = {}): Lane {
	return {
		id,
		from,
		to,
		traffic: SAME,
		start: { x: 0, y: 0 },
		end: { x: 0, y: 100 },
		length: 100,
		ride: 90,
		...over,
	};
}

/**
 * The way round a card, as the painter would draw it: a fixed distance, drawn.
 * @param length How far round it is.
 * @returns How a pulse crosses any card.
 */
function round(length: number) {
	return () => ({ length, path: "M0,0 L1,1" });
}

/**
 * A number held to a period.
 * @param value The number.
 * @param period The period.
 * @returns The number within one period.
 */
function within(value: number, period: number): number {
	return ((value % period) + period) % period;
}

describe("a pulse is handed on through a card", () => {
	test("the line out lies the line in and the way round behind it", () => {
		const { rhythms, crossings } = relayRhythms(
			[lane("ab", "a", "b"), lane("bc", "b", "c")],
			round(50),
		);
		const [ab, bc] = [rhythms.get("ab")!, rhythms.get("bc")!];
		expect(bc.spacing).toBe(ab.spacing);
		expect(bc.speed).toBe(ab.speed);
		const crossing = crossings.find(({ onto }) => onto === "bc")!;
		// The pulse is a line's length behind where it began when it reaches the card,
		// and the way round behind that when it leaves.
		expect(crossing.rhythm.phase).toBeCloseTo(within(ab.phase - 100, ab.spacing), 6);
		expect(bc.phase).toBeCloseTo(within(ab.phase - 100 - 50, ab.spacing), 6);
		expect(crossing.card).toBe("b");
		expect(crossing.length).toBe(50);
	});

	test("every line out of the card that keeps the time takes the pulse, and the others do not", () => {
		const { rhythms, crossings } = relayRhythms(
			[
				lane("ab", "a", "b"),
				lane("bc", "b", "c"),
				lane("bd", "b", "d"),
				lane("be", "b", "e", { traffic: { speed: 40, volume: 2 } }),
			],
			round(50),
		);
		expect(crossings.map(({ onto }) => onto).toSorted()).toEqual(["bc", "bd"]);
		expect(rhythms.get("bc")!.phase).toBeCloseTo(rhythms.get("bd")!.phase, 6);
		// The line at another volume keeps a rhythm of its own.
		expect(rhythms.get("be")!.spacing).not.toBe(rhythms.get("ab")!.spacing);
	});

	test("lines that differ in speed or in volume hand nothing on", () => {
		for (const out of [
			{ speed: 80, volume: 0.5 },
			{ speed: 40, volume: 1 },
		]) {
			const { crossings } = relayRhythms(
				[lane("ab", "a", "b"), lane("bc", "b", "c", { traffic: out })],
				round(50),
			);
			expect(crossings).toHaveLength(0);
		}
	});

	test("a line that nothing feeds starts with the others that leave its card, and apart from other cards", () => {
		const { rhythms } = relayRhythms(
			[lane("xy", "x", "y"), lane("xz", "x", "z"), lane("uv", "u", "v")],
			round(50),
		);
		expect(rhythms.get("xy")!.phase).toBe(rhythms.get("xz")!.phase);
		expect(rhythms.get("uv")!.phase).not.toBe(rhythms.get("xy")!.phase);
	});

	test("a line that two others feed follows the first in the order the lines are drawn", () => {
		const { rhythms } = relayRhythms(
			[lane("pc", "p", "c"), lane("qc", "q", "c"), lane("cd", "c", "d")],
			round(50),
		);
		expect(rhythms.get("cd")!.phase).toBeCloseTo(
			within(rhythms.get("pc")!.phase - 100 - 50, rhythms.get("pc")!.spacing),
			6,
		);
	});

	test("a chain that closes on itself still gives every line a place", () => {
		const { rhythms } = relayRhythms([lane("ab", "a", "b"), lane("ba", "b", "a")], round(50));
		for (const id of ["ab", "ba"]) expect(Number.isFinite(rhythms.get(id)!.phase)).toBe(true);
	});

	test("a way round too short to draw is handed on without a crossing", () => {
		const { rhythms, crossings } = relayRhythms(
			[lane("ab", "a", "b"), lane("bc", "b", "c")],
			round(2),
		);
		expect(crossings).toHaveLength(0);
		expect(rhythms.get("bc")!.phase).toBeCloseTo(
			within(rhythms.get("ab")!.phase - 100 - 2, rhythms.get("ab")!.spacing),
			6,
		);
	});

	test("the same lines keep the same time every time", () => {
		const lanes = [lane("ab", "a", "b"), lane("bc", "b", "c"), lane("bd", "b", "d")];
		expect(relayRhythms(lanes, round(50))).toEqual(relayRhythms(lanes, round(50)));
	});
});

describe("every line carries a pulse at every moment", () => {
	test("pulses are as far apart as the authored speed over volume says", () => {
		const { rhythms } = relayRhythms([lane("ab", "a", "b", { ride: 500 })], round(0));
		expect(rhythms.get("ab")!.spacing).toBe(80);
		expect(rhythms.get("ab")!.speed).toBe(40);
	});

	test("but never further apart than the shortest line of their chain is long", () => {
		const { rhythms } = relayRhythms(
			[
				lane("ab", "a", "b", { traffic: { speed: 40, volume: 0.01 }, ride: 300 }),
				lane("bc", "b", "c", { traffic: { speed: 40, volume: 0.01 }, ride: 70 }),
			],
			round(0),
		);
		for (const id of ["ab", "bc"]) expect(rhythms.get(id)!.spacing).toBe(70);
	});

	test("and never closer than a blur", () => {
		const { rhythms } = relayRhythms(
			[lane("ab", "a", "b", { traffic: { speed: 10, volume: 5 }, ride: 500 })],
			round(0),
		);
		expect(rhythms.get("ab")!.spacing).toBe(36);
	});

	test("however extreme the speed, a pulse flies at a speed a browser keeps", () => {
		for (const speed of [Number.MIN_VALUE, 1e-9, 1e12, Number.MAX_VALUE]) {
			const { rhythms } = relayRhythms(
				[lane("ab", "a", "b", { traffic: { speed, volume: 1 } })],
				round(0),
			);
			const { speed: flown, spacing } = rhythms.get("ab")!;
			expect(flown).toBeGreaterThanOrEqual(8);
			expect(flown).toBeLessThanOrEqual(600);
			expect(spacing / flown).toBeGreaterThan(0.05);
		}
	});
});

const CARD = { x: 0, y: 0, width: 200, height: 80 };

/** Half the way round a 200 by 80 card with 6 unit corners, as the ring of short pieces walks it. */
const HALF = (2 * (200 - 12) + 2 * (80 - 12) + 2 * Math.PI * 6) / 2;

/**
 * How far a place is from the outline of the card.
 * @param place Where it is.
 * @param place.x How far across.
 * @param place.y How far down.
 * @returns The distance to the nearest of its four sides.
 */
function fromOutline(place: { x: number; y: number }): number {
	return Math.min(
		Math.abs(place.x - CARD.x),
		Math.abs(place.x - (CARD.x + CARD.width)),
		Math.abs(place.y - CARD.y),
		Math.abs(place.y - (CARD.y + CARD.height)),
	);
}

/**
 * The points a path of straight pieces passes through.
 * @param d The path data.
 * @returns The points.
 */
function pointsOf(d: string): { x: number; y: number }[] {
	const numbers = d.match(/-?[\d.]+/gu)!.map(Number);
	return Array.from({ length: numbers.length / 2 }, (_, index) => ({
		x: numbers[index * 2]!,
		y: numbers[index * 2 + 1]!,
	}));
}

describe("a pulse runs the edge of a card", () => {
	test("it takes the shorter way round, whichever side it is on", () => {
		const along = rimRoute(CARD, { x: 100, y: 0 }, { x: 150, y: 0 });
		expect(along.length).toBeCloseTo(50, 1);
		expect(pointsOf(along.path)[0]).toEqual({ x: 100, y: 0 });
		expect(pointsOf(along.path).at(-1)).toEqual({ x: 150, y: 0 });
		const back = rimRoute(CARD, { x: 150, y: 0 }, { x: 100, y: 0 });
		expect(back.length).toBeCloseTo(50, 1);
		expect(pointsOf(back.path)[0]).toEqual({ x: 150, y: 0 });
		expect(pointsOf(back.path).at(-1)).toEqual({ x: 100, y: 0 });
	});

	test("it is never more than halfway round, and halfway is the far side", () => {
		const far = rimRoute(CARD, { x: 100, y: 0 }, { x: 100, y: 80 });
		expect(far.length).toBeCloseTo(HALF, 0);
		for (const [from, to] of [
			[
				{ x: 20, y: 0 },
				{ x: 200, y: 60 },
			],
			[
				{ x: 0, y: 40 },
				{ x: 200, y: 40 },
			],
			[
				{ x: 190, y: 80 },
				{ x: 5, y: 80 },
			],
		] as const) {
			expect(rimRoute(CARD, from, to).length).toBeLessThanOrEqual(HALF + 0.01);
		}
	});

	test("it never leaves the outline, round a corner too", () => {
		for (const [from, to] of [
			[
				{ x: 100, y: 0 },
				{ x: 200, y: 40 },
			],
			[
				{ x: 100, y: 0 },
				{ x: 0, y: 40 },
			],
			[
				{ x: 100, y: 80 },
				{ x: 200, y: 20 },
			],
		] as const) {
			const { path } = rimRoute(CARD, from, to);
			// A few short pieces stand for a rounded corner: as near as its arc is.
			for (const point of pointsOf(path)) expect(fromOutline(point)).toBeLessThan(2);
		}
	});

	test("a pulse that leaves where it came in goes nowhere", () => {
		expect(rimRoute(CARD, { x: 100, y: 0 }, { x: 100, y: 0 }).length).toBeCloseTo(0, 6);
	});

	test("a place off the outline is taken to the nearest place on it", () => {
		const near = rimRoute(CARD, { x: 100, y: -3 }, { x: 150, y: 3 });
		expect(near.length).toBeCloseTo(50, 1);
	});
});
