// Label boxes that share one stretch of a band are placed together. A port
// settled after Graphviz ranked its block can stand one label's line on the
// far side of another's; kept in Graphviz's order, the two lines cross
// between their labels and their ends.
import { expect, test } from "bun:test";
import { placeRun, type Slider } from "#shared/rules/track/labels/label-runs.ts";

/**
 * A label box on a line that runs straight through one x above and below it.
 * @param x Where Graphviz stood the box's left edge.
 * @param end The x its line leaves the station above and enters the one below.
 * @returns The box.
 */
function slider(x: number, end: number): Slider {
	return {
		item: { box: { x, y: 0, width: 100, height: 20 }, band: 0 },
		wanted: end,
		reaches: [
			[end, end],
			[end, end],
		],
		ends: [end, end],
	};
}

test("labels whose lines Graphviz's order would cross stand in the order of their lines", () => {
	const [left, right] = [slider(0, 500), slider(200, 100)];
	placeRun([left, right], 0, 800);
	expect(right.item.box.x).toBeLessThan(left.item.box.x);
});
