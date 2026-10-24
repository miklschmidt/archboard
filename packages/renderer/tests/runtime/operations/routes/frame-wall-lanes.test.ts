// A line out of a frame once ran down the frame's wall, where the frame edge
// took the line's colour (a view of a work board, its words scrambled). Kept
// half a lane off, it still traced the frame's outline; where the passage
// beside the wall has room, a line keeps a whole lane from it.

import { expect, test } from "bun:test";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { bodyShift, routePoints } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import frameWall from "#tests/runtime/support/fixtures/frame-wall.json";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** The distance a line keeps off a frame wall where the passage has room, and the length of a run that is not a jog. */
const LANE = 16;

test.each(LayoutEngineSchema.options)(
	"a line out of a frame to a card beside it keeps a lane from the frame's side walls (%s)",
	async (layout) => {
		const { svg } = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: orderedFixture(frameWall),
			theme: "light",
			layout,
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
	},
);
