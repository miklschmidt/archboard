// A route whose sideways jog is shorter than its two fixed bends can only be
// drawn running backward, and the Graphviz engine refused the whole board for
// it; the settled route is straightened instead.
import { expect, test } from "bun:test";
import {
	curveClearanceIssue,
	curveThrough,
	straightenedCurve,
} from "@/transformers/semantic-renderer/layout";

test("a route's S-jog shorter than two bend radii straightens instead of failing its checks", () => {
	// Down, across, down, a 7-unit jog back, down again: the jog's two bends need 16.
	const route = curveThrough([
		{ x: 600, y: 0 },
		{ x: 600, y: 100 },
		{ x: 728, y: 100 },
		{ x: 728, y: 300 },
		{ x: 721, y: 300 },
		{ x: 721, y: 500 },
		{ x: 800, y: 500 },
		{ x: 800, y: 600 },
	]);
	expect(curveClearanceIssue(route)).toBeDefined();
	const straightened = straightenedCurve(route);
	expect(curveClearanceIssue(straightened)).toBeUndefined();
	expect(straightened.from).toEqual(route.from);
	expect(straightened.segments.at(-1)!.to).toEqual(route.segments.at(-1)!.to);
});
