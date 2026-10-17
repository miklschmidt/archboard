// Whether an x stands clear of a band's stretches, once a search has asked
// often enough that they are merged and sorted (TASK-377).
// What this catches: a merged test that answers otherwise than the stretches
// one by one, which moves a lane and so a drawing: two stretches that only
// touch merged into one, so the point between them is kept out; an empty
// stretch keeping an x out; or an x at a stretch's end taken as inside it.

import { expect, test } from "bun:test";
import { clearOf } from "@/transformers/semantic-renderer/layout";

/**
 * A small deterministic generator, so a failure names the same stretches every run.
 * @param seed Where it starts.
 * @returns The next number in [0, 1).
 */
function random(seed: number): () => number {
	let state = seed;
	return () => {
		state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
		return state / 2 ** 32;
	};
}

/**
 * The rule the test stands for: clear of each stretch, at or beyond one of its ends.
 * @param stretches The stretches.
 * @param x The x.
 * @returns True when x is clear.
 */
function clearOfEach(stretches: readonly (readonly [number, number])[], x: number): boolean {
	return stretches.every(([low, high]) => x <= low || x >= high);
}

test("a lane test answers as the stretches one by one, before and after it merges them", () => {
	const next = random(377);
	/**
	 * An end on a coarse grid, so many stretches touch, overlap, nest, repeat or are empty.
	 * @returns The end.
	 */
	const at = (): number => Math.floor(next() * 40) * 4;
	for (let round = 0; round < 200; round += 1) {
		const stretches = Array.from({ length: 1 + Math.floor(next() * 12) }, (): [number, number] => [
			at(),
			at(),
		]);
		if (round % 10 === 0) stretches.push([-Infinity, at()], [at(), Infinity]);
		const clear = clearOf(stretches);
		for (let x = -4; x <= 164; x += 2) expect(clear(x)).toBe(clearOfEach(stretches, x));
	}
});

test("a stretch with an end that is no number keeps every x out, merged or not", () => {
	const clear = clearOf([
		[0, 10],
		[Number.NaN, 20],
	]);
	for (let x = -20; x <= 40; x += 1) expect(clear(x)).toBe(false);
});
