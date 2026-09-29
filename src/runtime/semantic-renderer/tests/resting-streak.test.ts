// A still picture rests each line's streak where it reads as that line's
// traffic alone: off the stretch it shares with another line out of one card,
// and off a crossing's hop, whichever line carries the hop. Rested on either,
// it read as either line's traffic ("requestJson" in Command interface,
// "renderBoard on the core" in Semantic renderer). Keeping off a hop, on the
// line that carries it and on the line under it, is owned by
// comet-rest.test.ts, since no fixture's line carries one under every engine;
// this file owns the shared stretch and the junction on drawn boards.
// Where no place keeps a lane from both its label and the stretch it shares,
// its head keeps off the junction the stretch starts at and lets its tail
// run under its label ("requestJson" in Command interface's whole).
// What this catches: the painter judging a resting place against the labels
// alone, not against the places other lines meet its line, and a tail under
// a label counted as deep as a streak on a junction.

import { expect, test } from "bun:test";
import { LayoutEngineSchema, type LayoutEngineName } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { type DrawnPoint } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { headsOn, trafficLayers } from "@/runtime/semantic-renderer/tests/drawn-traffic";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import commandInterface from "./command-interface.json";
import readingABoard from "./reading-a-board.json";

/** The pitch of neighbouring parallel lines. */
const ROUTE_LANE = 16;

/**
 * The coordinates a path's data passes through, control points included.
 * @param d The path data.
 * @returns The points, in order.
 */
function pointsIn(d: string): DrawnPoint[] {
	const values = d.match(/-?[\d.]+/gu)!.map(Number);
	return values.flatMap((x, index) => (index % 2 === 0 ? [{ x, y: values[index + 1]! }] : []));
}

/**
 * A relationship's resting streak: its glow, the head's place along its ride, and the ride.
 * @param fixture The board.
 * @param id The relationship.
 * @param layout The engine that draws it.
 * @returns The streak, the ride's points and every route's path data.
 */
async function resting(
	fixture: Parameters<typeof orderedFixture>[0],
	id: string,
	layout: LayoutEngineName,
) {
	const { svg } = await renderArchitecture({
		content: orderedFixture(fixture),
		theme: "light",
		layout,
	});
	const layers = trafficLayers(svg, id);
	const glow = Math.max(...layers.map(({ width }) => width / 2));
	const head = headsOn(layers[0]!.still, layers[0]!.offset, 1e4)[0]!;
	const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]*)"[^>]*marker-end=/gu)].map(([, d]) => d!);
	return { glow, head, ride: pointsIn(layers[0]!.d), paths };
}

test.each(LayoutEngineSchema.options)(
	"a resting streak keeps a lane past where its line parts from one out of the same card (%s)",
	async (layout) => {
		// Two calls leave one card down one stroke until the first turns away.
		const { glow, head, ride, paths } = await resting(readingABoard, "e5", layout);
		const [start] = ride;
		const parts = paths
			.flatMap(pointsIn)
			.filter(({ x, y }) => Math.abs(x - start!.x) < 1 && y > start!.y + 1 && y < start!.y + 60);
		const parted = Math.max(...parts.map(({ y }) => y)) - start!.y;
		expect(head - parted).toBeGreaterThanOrEqual(glow + ROUTE_LANE);
	},
);

/**
 * The point a distance along a drawn line, its bends taken by their control points.
 * @param line The line's points.
 * @param distance How far along it.
 * @returns The point.
 */
function pointAlong(line: readonly DrawnPoint[], distance: number): DrawnPoint {
	let left = distance;
	for (const [index, next] of line.slice(1).entries()) {
		const from = line[index]!;
		const length = Math.hypot(next.x - from.x, next.y - from.y);
		if (left <= length && length > 0) {
			const t = left / length;
			return { x: from.x + (next.x - from.x) * t, y: from.y + (next.y - from.y) * t };
		}
		left -= length;
	}
	return line.at(-1)!;
}

test.each(LayoutEngineSchema.options)(
	"a resting streak with no lane's room lets its tail run under its label rather than rest on the junction it joins (%s)",
	async (layout) => {
		const { svg } = await renderArchitecture({
			content: orderedFixture(commandInterface),
			theme: "light",
			layout,
		});
		const layers = trafficLayers(svg, "EBy8Rjwh");
		const glow = Math.max(...layers.map(({ width }) => width / 2));
		const head = pointAlong(
			pointsIn(layers[0]!.d),
			headsOn(layers[0]!.still, layers[0]!.offset, 1e4)[0]!,
		);
		const marks = /<g class="ab-junctions"[^>]*>(.*?)<\/g>/su.exec(svg)![1]!;
		const dots = [...marks.matchAll(/cx="([\d.]+)" cy="([\d.]+)"/gu)].map(([, x, y]) => ({
			x: Number(x),
			y: Number(y),
		}));
		const nearest = Math.min(...dots.map(({ x, y }) => Math.hypot(x - head.x, y - head.y)));
		expect(nearest).toBeGreaterThanOrEqual(glow);
	},
	30_000,
);

// A presented step veils what it is not about, and a junction mark has no id of
// its own: it lists the relationships that meet at it, so the viewer can light
// it with them and let it recede with the rest.
test.each(LayoutEngineSchema.options)(
	"every junction mark lists the relationships that meet at it (%s)",
	async (layout) => {
		const content = orderedFixture(commandInterface);
		const { svg } = await renderArchitecture({ content, theme: "light", layout });
		const marks = /<g class="ab-junctions"[^>]*>(.*?)<\/g>/su.exec(svg)![1]!;
		const listed = [...marks.matchAll(/data-members="([^"]*)"/gu)].map(([, ids]) =>
			ids!.split(" "),
		);
		const relationships = new Set(content.edges.map(({ id }) => id));
		expect(listed.length).toBe([...marks.matchAll(/<(?:circle|path)\b/gu)].length);
		for (const ids of listed) {
			expect(ids.length).toBeGreaterThanOrEqual(2);
			for (const id of ids) expect(relationships.has(id)).toBeTrue();
		}
	},
	30_000,
);
