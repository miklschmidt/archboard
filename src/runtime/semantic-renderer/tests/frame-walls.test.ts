// A card stands its frame's inset from the wall, and its routing box reached
// exactly that far. Graphviz keeps a card outside the frame only the same
// margin from it, so the passage between the two was the wall itself, and a
// line out of the frame ran down the wall, where the frame edge took the
// line's colour (a view of a work board, its words scrambled). Kept half a
// lane off, it still traced the frame's outline; where the passage has room
// it keeps a whole lane. Below this frame the passage is too narrow for one.
// A card standing further inside than the inset reaches that much further, so
// its routing box still ends a lane beyond the wall.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { wallOf, wallReach } from "@/runtime/semantic-renderer/layout";
import { bodyShift, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import frameWall from "./frame-wall.json";

/** The distance a line keeps off a frame wall where the passage has room, and the length of a run that is not a jog. */
const LANE = 16;

test("a line out of a frame to a card beside it keeps a lane from the frame's side walls", async () => {
	const { svg } = await renderArchitecture({
		content: orderedFixture(frameWall),
		theme: "light",
		layout: "graphviz",
	});
	const shift = bodyShift(svg);
	const frames =
		/<g data-semantic-kind="region"[^>]*data-depiction="container"[^>]*>\s*(?:<rect class="ab-halo"[^>]*>\s*)?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/gu;
	const walls = [...svg.matchAll(frames)].flatMap(([, x, y, width, height]) => {
		const [left, top] = [Number(x) + shift.x, Number(y) + shift.y];
		const [right, bottom] = [left + Number(width), top + Number(height)];
		return [
			{ vertical: true, at: left, from: top, to: bottom },
			{ vertical: true, at: right, from: top, to: bottom },
		];
	});
	const hugs = [...routePoints(svg)].flatMap(([edge, points]) =>
		points.slice(1).flatMap((point, index) => {
			const previous = points[index]!;
			const vertical = Math.abs(point.x - previous.x) < 0.01;
			const [at, one, other] = vertical
				? [point.x, previous.y, point.y]
				: [point.y, previous.x, point.x];
			return walls
				.filter(
					(wall) =>
						wall.vertical === vertical &&
						Math.abs(at - wall.at) < LANE - 0.5 &&
						Math.min(Math.max(one, other), wall.to) - Math.max(Math.min(one, other), wall.from) >
							LANE,
				)
				.map((wall) => `${edge} ${wall.at}`);
		}),
	);
	expect(hugs).toEqual([]);
});

test("a card inside a frame reaches a lane past a wall to clear, however far in it stands", () => {
	/** How far a card's routing box reaches past it. */
	const routingBox = 20;
	const ends = [0, 4, 8, 12].map((inside) => {
		const card = { id: "card", x: 100 + routingBox + inside, y: 200, width: 200, height: 80 };
		const frame = { id: "frame", x: 100, y: 100, width: 600, height: 400, children: [card] };
		const reach = wallReach({ id: "root", children: [frame] }, [wallOf("frame", "WEST")]);
		return card.x - routingBox - (reach.get("card")?.WEST ?? 0) - frame.x;
	});
	expect(ends.every((end) => end <= -LANE + 0.01)).toBe(true);
});

/**
 * How far a card on a frame's west inset reaches past the wall, with a card outside in front of it.
 * @param passage The free passage between their routing boxes.
 * @returns The reach.
 */
function reachAcross(passage: number): number {
	const card = { id: "card", x: 120, y: 200, width: 200, height: 80 };
	const frame = { id: "frame", x: 100, y: 100, width: 600, height: 400, children: [card] };
	const outside = { id: "outside", x: 40 - passage, y: 180, width: 40, height: 120 };
	const graph = { id: "root", children: [outside, frame] };
	return wallReach(graph, [wallOf("frame", "WEST")]).get("card")?.WEST ?? 0;
}

test("a card reaches past a wall within half the passage in front, and across one too narrow for a line", () => {
	expect(reachAcross(100)).toBeCloseTo(LANE, 5);
	expect(reachAcross(20)).toBeCloseTo((20 - 2) / 2, 5);
	expect(reachAcross(6)).toBeCloseTo(6, 5);
});
