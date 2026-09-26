// A card stands its frame's inset from the wall, and its routing box reached
// exactly that far. Graphviz keeps a card outside the frame only the same
// margin from it, so the passage between the two was the wall itself, and a
// line into the outside card ran down the wall into its side, where the frame
// edge took the line's colour (Board viewer's "semantic read routes").

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { bodyShift, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import frameWall from "./frame-wall.json";

/** Half a lane: the distance a line keeps off a frame wall. */
const WALL_CLEARANCE = 8;

/** A run shorter than a lane is a jog, not a line along a wall. */
const LANE = 16;

test("a line out of a frame to a card beside it runs clear of the frame's wall", async () => {
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
			{ vertical: false, at: bottom, from: left, to: right },
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
						Math.abs(at - wall.at) < WALL_CLEARANCE &&
						Math.min(Math.max(one, other), wall.to) - Math.max(Math.min(one, other), wall.from) >
							LANE,
				)
				.map((wall) => `${edge} ${wall.at}`);
		}),
	);
	expect(hugs).toEqual([]);
});
