// A still picture rests each line's streak where it reads as that line's
// traffic alone: off the stretch it shares with another line out of one card,
// and off a crossing's hop, whichever line carries the hop. Rested on either,
// it read as either line's traffic ("requestJson" in Command interface,
// "renderBoard on the core" in Semantic renderer).
// Where no place keeps a lane from both its label and the stretch it shares,
// its head keeps off the junction the stretch starts at and lets its tail
// run under its label ("requestJson" in Command interface's whole).
// What this catches: the painter judging a resting place against the labels
// alone, not against the places other lines meet its line, and a tail under
// a label counted as deep as a streak on a junction.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { roundBridges, type DrawnPoint } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { headsOn, trafficLayers } from "@/runtime/semantic-renderer/tests/drawn-traffic";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import commandGroups from "./command-groups.json";
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
 * How far along a line a point on it stands.
 * @param line The line's points.
 * @param point A point within a unit of it.
 * @returns The distance along it, or nothing when the point is off it.
 */
function along(line: readonly DrawnPoint[], point: DrawnPoint): number | undefined {
	let travelled = 0;
	for (const [index, next] of line.slice(1).entries()) {
		const from = line[index]!;
		const length = Math.hypot(next.x - from.x, next.y - from.y);
		const share =
			length === 0
				? 0
				: ((point.x - from.x) * (next.x - from.x) + (point.y - from.y) * (next.y - from.y)) /
					length ** 2;
		const t = Math.min(Math.max(share, 0), 1);
		const off = Math.hypot(
			from.x + (next.x - from.x) * t - point.x,
			from.y + (next.y - from.y) * t - point.y,
		);
		if (off < 1) return travelled + length * t;
		travelled += length;
	}
	return undefined;
}

/**
 * A relationship's resting streak: every layer's reach behind the head, the head's place along its ride, and the ride.
 * @param fixture The board.
 * @param id The relationship.
 * @returns The streak, the ride's points and every route's path data.
 */
async function resting(fixture: Parameters<typeof orderedFixture>[0], id: string) {
	const { svg } = await renderArchitecture({
		content: orderedFixture(fixture),
		theme: "light",
		layout: "graphviz",
	});
	const layers = trafficLayers(svg, id);
	const glow = Math.max(...layers.map(({ width }) => width / 2));
	const reaches = layers.filter(({ width }) => width / 2 < glow).map(({ still }) => still[0]!);
	const head = headsOn(layers[0]!.still, layers[0]!.offset, 1e4)[0]!;
	const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]*)"[^>]*marker-end=/gu)].map(([, d]) => d!);
	return { glow, reaches, head, ride: pointsIn(layers[0]!.d), paths };
}

test("a resting streak keeps a lane past where its line parts from one out of the same card", async () => {
	// Two calls leave one card down one stroke until the first turns away 35 px down.
	const { glow, head, ride, paths } = await resting(readingABoard, "e5");
	const [start] = ride;
	const parts = paths
		.flatMap(pointsIn)
		.filter(({ x, y }) => Math.abs(x - start!.x) < 1 && y > start!.y + 1 && y < start!.y + 60);
	const parted = Math.max(...parts.map(({ y }) => y)) - start!.y;
	expect(head - parted).toBeGreaterThanOrEqual(glow + ROUTE_LANE);
});

// The line that passed under Cloud Infrastructure's hop no longer crosses
// there since its fold was refused (ADR 0039); what is left is the line
// that carries one.
test("a resting streak lies over no hop its line carries", async () => {
	const { reaches, head, ride, paths } = await resting(commandGroups, "ytXRvhS3");
	// A hop's middle lies on the line it passes over, its ends on the line that carries it.
	const hops = paths
		.flatMap((d) => roundBridges(d))
		.flatMap(({ start, end }) => {
			const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
			return along(ride, middle) ?? along(ride, start) ?? [];
		});
	expect(hops.length).toBeGreaterThan(0);
	for (const hop of hops)
		for (const reach of reaches) expect(hop < head - reach || hop > head).toBe(true);
});

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

test("a resting streak with no lane's room lets its tail run under its label rather than rest on the junction it joins", async () => {
	const { svg } = await renderArchitecture({
		content: orderedFixture(commandInterface),
		theme: "light",
		layout: "graphviz",
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
}, 30_000);
