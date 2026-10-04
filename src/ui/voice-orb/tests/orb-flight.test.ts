// How the orb crosses the page between its homes.
//
// What is guarded: a flight leaves exactly where the orb was and arrives exactly on its home,
// whatever the easing does between them, so the orb never lands beside its socket; it never goes
// past its home on the way, which would make it back up into it; and it rises above the straight
// line, so it is carried over the picture and not slid across it.

import { expect, test } from "bun:test";

import { flightAt, type Spot } from "@/ui/voice-orb/flight";

/** From the dock's circle, low on the left, to the voice box, low in the middle. */
const FROM: Spot = { x: 140, y: 1000, scale: 1 };
const TO: Spot = { x: 960, y: 1017, scale: 1 };

/**
 * The moments to sample a flight at.
 * @returns Fifty of them, from the first to the last.
 */
function moments(): number[] {
	return Array.from({ length: 51 }, (_, index) => index / 50);
}

test("a flight leaves exactly where the orb was and arrives exactly on its home", () => {
	expect(flightAt(FROM, TO, 0)).toEqual(FROM);
	expect(flightAt(FROM, TO, 1)).toEqual(TO);
	// A frame that comes late still lands on the home, wherever the home has moved to.
	expect(flightAt(FROM, { ...TO, x: 1000 }, 1.4)).toEqual({ ...TO, x: 1000 });
});

test("the orb never goes past its home on the way, in either direction", () => {
	for (const [from, to] of [
		[FROM, TO],
		[TO, FROM],
	] as const) {
		const low = Math.min(from.x, to.x);
		const high = Math.max(from.x, to.x);
		const path = moments().map((progress) => flightAt(from, to, progress).x);
		for (const x of path) {
			expect(x).toBeGreaterThanOrEqual(low);
			expect(x).toBeLessThanOrEqual(high);
		}
		// It only ever moves toward its home.
		const heading = Math.sign(to.x - from.x);
		for (let index = 1; index < path.length; index += 1) {
			expect(((path[index] ?? 0) - (path[index - 1] ?? 0)) * heading).toBeGreaterThanOrEqual(0);
		}
	}
});

test("the orb is carried above the straight line between its homes and is drawn larger at the top", () => {
	const middle = flightAt(FROM, TO, 0.5);
	const line = FROM.y + ((TO.y - FROM.y) * (middle.x - FROM.x)) / (TO.x - FROM.x);
	expect(middle.y).toBeLessThan(line);
	expect(middle.scale).toBeGreaterThan(1);
	expect(flightAt(FROM, TO, 0.99).scale).toBeCloseTo(1, 2);
});

test("an orb that is not going anywhere is not lifted", () => {
	for (const progress of moments()) {
		expect(flightAt(FROM, FROM, progress).y).toBe(FROM.y);
	}
});

test("a flight turned round starts from where the orb is, and settles at its new home", () => {
	const seen = flightAt(FROM, TO, 0.4);
	const back = flightAt(seen, FROM, 0);
	expect(back).toEqual(seen);
	expect(flightAt(seen, FROM, 1)).toEqual(FROM);
});
