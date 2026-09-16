// A route's leg into a card is straight, not stepped.
//
// The engine places a route's lane between two rows and its port on the card
// separately, so a leg used to step sideways by less than a badge's width
// right before its card (17, 21 and 28 units on the 2026-09-16 "Semantic
// renderer" proposal; 31 on this board). A port anywhere on a face means the
// same thing, so the port slides onto the lane instead.

import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { corridorPoints } from "@/runtime/semantic-renderer/tests/drawn-routes";

/** A step narrower than a badge at a card reads as a stumble, not a turn. */
const JOG = 32;

/** A point on the page. */
interface At {
	readonly x: number;
	readonly y: number;
}

/**
 * The corners of a drawn route, with the rounding folded back into them.
 * A rounded corner is drawn as an arc between its two legs; putting the corner
 * back where the legs meet and merging every collinear run recovers the
 * polyline the route was planned as.
 * @param points The drawn path's points.
 * @returns The corners.
 */
function cornersOf(points: readonly At[]): At[] {
	const corners: At[] = [];
	for (const [index, point] of points.entries()) {
		const previous = points[index - 1];
		if (previous !== undefined && !axisAligned(previous, point)) {
			const before = points[index - 2];
			const vertical = before === undefined ? false : Math.abs(before.x - previous.x) < 0.02;
			push(corners, vertical ? { x: previous.x, y: point.y } : { x: point.x, y: previous.y });
		}
		push(corners, point);
	}
	return corners;
}

/**
 * Append a corner, folding it into the last run when it continues it.
 * @param corners The corners so far.
 * @param point The next one.
 */
function push(corners: At[], point: At): void {
	const [a, b] = [corners.at(-2), corners.at(-1)];
	if (a !== undefined && b !== undefined && collinear(a, b, point))
		corners[corners.length - 1] = point;
	else corners.push(point);
}

/**
 * Whether two points share a vertical or horizontal line.
 * @param a The first.
 * @param b The second.
 * @returns True on one axis-aligned line.
 */
function axisAligned(a: At, b: At): boolean {
	return Math.abs(a.x - b.x) < 0.02 || Math.abs(a.y - b.y) < 0.02;
}

/**
 * Whether three points share a vertical or horizontal line.
 * @param a The first.
 * @param b The second.
 * @param c The third.
 * @returns True on one axis-aligned line.
 */
function collinear(a: At, b: At, c: At): boolean {
	const sameX = Math.abs(a.x - b.x) < 0.02 && Math.abs(b.x - c.x) < 0.02;
	const sameY = Math.abs(a.y - b.y) < 0.02 && Math.abs(b.y - c.y) < 0.02;
	return sameX || sameY;
}

test("a route's last leg into a card does not step sideways by less than a badge", async () => {
	// The renderer's own pipeline as a board: one dispatcher fanning three
	// ways, two of which reach the painters by skipping rows, which is where a
	// lane and a port used to disagree by thirty-one units.
	const content = VariantContentSchema.parse({
		nodes: [
			["server", "Canvas server"],
			["dispatch", "View dispatcher"],
			["regions", "Region builder"],
			["theme", "Theme palette"],
			["flow", "Data-flow layout"],
			["layout", "Architecture layout"],
			["routing", "Edge routing"],
			["text", "Measured text"],
			["paint", "SVG painters"],
			["doc", "SVG document"],
		].map(([id, name]) => ({ id, name, kind: "module" })),
		edges: [
			["a", "server", "dispatch", "render selected view"],
			["b", "dispatch", "regions", "derive architecture regions"],
			["c", "dispatch", "theme", "resolve theme"],
			["d", "dispatch", "flow", "lay out exchange"],
			["e", "regions", "layout", "visible regions"],
			["f", "theme", "paint", "literal colors"],
			["g", "flow", "paint", "placed exchange"],
			["h", "layout", "routing", "route relationships"],
			["i", "layout", "text", "size cards"],
			["j", "layout", "paint", "placed architecture"],
			["k", "routing", "text", "fit labels"],
			["l", "routing", "paint", "routed edges"],
			["m", "paint", "doc", "marks and hit boxes"],
			["n", "doc", "server", "SVG and subject atlas"],
		].map(([id, from, to, label]) => ({ id, from, to, kind: "call", label })),
	});
	const drawing = await renderArchitecture({ content, theme: "light" });
	for (const [id, points] of corridorPoints(drawing.svg)) {
		const corners = cornersOf(points);
		const runs = corners.slice(1).map((to, index) => {
			const from = corners[index]!;
			return {
				length: Math.hypot(to.x - from.x, to.y - from.y),
				vertical: Math.abs(to.x - from.x) < 0.02,
			};
		});
		// The leg at either end: the run beside the first and the run beside the
		// last, when the runs on both sides of it are vertical.
		for (const at of [1, runs.length - 2]) {
			const [before, step, after] = [runs[at - 1], runs[at], runs[at + 1]];
			if (before === undefined || step === undefined || after === undefined) continue;
			if (!before.vertical || !after.vertical) continue;
			expect(step.length, `${id} steps ${step.length} sideways at its card`).toBeGreaterThanOrEqual(
				JOG,
			);
		}
	}
});
