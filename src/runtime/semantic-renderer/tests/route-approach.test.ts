// How a drawn route meets the thing it points at.
//
// A reader photographed an arrowhead arriving at a card at an angle, on the
// curve of its own turn rather than on a straight line into the side. Two
// things were behind it, and only one of them was visible: a rounded corner
// takes its radius off BOTH of its legs, so a fourteen-unit approach arrived on
// seven units of line and seven of arc; and a track allowed to sit six units
// off a card leaves an approach shorter than the arrowhead drawn on it.
//
// What these hold to is the reader's own words: a route leaves and arrives
// square to the side it touches, with enough straight line before the turn for
// the head and its rounding to sit on. Measured on a drawn page rather than
// argued from the router, because every one of those numbers is the product of
// the planner, the ports, the tracks and the rounding together.

import { describe, expect, test } from "bun:test";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";
import { renderArchitecture, type RenderedDiagram } from "@/runtime/semantic-renderer/index";

/**
 * How much straight line an endpoint must keep, which is `APPROACH_STRAIGHT` in
 * `lib/design.ts`: the widest arrowhead this renderer draws is 7.5 units, and a
 * head needs to sit on line rather than on arc.
 */
const APPROACH = 12;

/** A point on the page. */
interface At {
	readonly x: number;
	readonly y: number;
}

/** One step of a drawn path: what sort, where it started, where it ended. */
interface Step {
	readonly kind: string;
	readonly from: At;
	readonly to: At;
}

/**
 * An architecture with containment and enough traffic to crowd its corridors.
 *
 * Two services with modules inside them and a datastore beside them, wired
 * every way round: a shape that makes the track allocator pack runs into the
 * gaps beside cards, which is where a short approach comes from.
 */
const CROWDED: VariantContent = VariantContentSchema.parse({
	nodes: [
		{ id: "edge", name: "Edge", kind: "service", responsibility: "Public entry points" },
		{ id: "gw", name: "API Gateway", kind: "route", parent: "edge" },
		{ id: "web", name: "Operator Console", kind: "ui", parent: "edge" },
		{ id: "core", name: "Board Runtime", kind: "service", responsibility: "Owns every write" },
		{ id: "io", name: "board-io", kind: "module", parent: "core" },
		{ id: "queue", name: "Edit Queue", kind: "queue", parent: "core" },
		{ id: "lease", name: "Write Lease", kind: "module", parent: "core" },
		{ id: "store", name: "Vault", kind: "datastore" },
	],
	edges: [
		{ id: "e1", from: "web", to: "gw", kind: "http", label: "REST" },
		{ id: "e2", from: "gw", to: "io", kind: "call", label: "read board", emphasis: "hero" },
		{ id: "e3", from: "gw", to: "queue", kind: "event", label: "enqueue" },
		{ id: "e4", from: "queue", to: "io", kind: "call", label: "drain" },
		{ id: "e5", from: "io", to: "lease", kind: "call", label: "take" },
		{ id: "e6", from: "io", to: "store", kind: "data", label: "writes" },
		{ id: "e7", from: "store", to: "web", kind: "data", label: "the picture" },
		{ id: "e8", from: "lease", to: "gw", kind: "event", label: "released" },
	],
});

/**
 * Every path command's endpoint, in order.
 * @param d The `d` attribute.
 * @returns The steps.
 */
function stepsOf(d: string): Step[] {
	const steps: Step[] = [];
	let at: At = { x: 0, y: 0 };
	for (const command of d.matchAll(/([MLC])([-\d.,\s]+)/gu)) {
		const numbers = (command[2] ?? "")
			.trim()
			.split(/[\s,]+/u)
			.map(Number);
		const pairs: At[] = [];
		for (let index = 0; index + 1 < numbers.length; index += 2) {
			pairs.push({ x: numbers[index]!, y: numbers[index + 1]! });
		}
		const to = pairs[pairs.length - 1] ?? at;
		steps.push({ kind: command[1] ?? "", from: at, to });
		at = to;
	}
	return steps;
}

/** One box of the drawn page, in page coordinates. */
interface Drawn {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/**
 * Which side of a box a point touches, and that side's outward normal.
 * @param point The point, in page coordinates.
 * @param box The box.
 * @returns The side and its normal, or null when the point is not on the box.
 */
function faceAt(point: At, box: Drawn): { side: string; normal: At } | null {
	const slack = 2;
	const nearest = [
		{ side: "left", away: Math.abs(point.x - box.x), normal: { x: -1, y: 0 } },
		{ side: "right", away: Math.abs(point.x - (box.x + box.width)), normal: { x: 1, y: 0 } },
		{ side: "top", away: Math.abs(point.y - box.y), normal: { x: 0, y: -1 } },
		{ side: "bottom", away: Math.abs(point.y - (box.y + box.height)), normal: { x: 0, y: 1 } },
	].toSorted((one, other) => one.away - other.away)[0]!;
	const inside =
		point.x >= box.x - slack &&
		point.x <= box.x + box.width + slack &&
		point.y >= box.y - slack &&
		point.y <= box.y + box.height + slack;
	return nearest.away <= slack && inside ? nearest : null;
}

/** One endpoint of one drawn route, as a reader meets it. */
interface Approach {
	/** Which relationship it belongs to. */
	readonly id: string;
	/** Whether it is where the route starts or where it ends. */
	readonly what: "leaves" | "arrives";
	/** The side of the box it touches. */
	readonly side: string;
	/** How square its direction is to that side: 1 is perpendicular. */
	readonly square: number;
	/** How much dead-straight line it has before the route turns. */
	readonly straight: number;
}

/**
 * Every endpoint of every drawn route, measured against the side it touches.
 * @param drawn The rendered picture.
 * @returns One entry per endpoint that attaches to a drawn box.
 */
function approaches(drawn: RenderedDiagram): Approach[] {
	const boxes: Drawn[] = [
		...Object.values(drawn.atlas.nodes),
		...Object.values(drawn.atlas.regions),
	];
	const found = /<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)">/.exec(drawn.svg);
	const shift: At = { x: Number(found?.[1] ?? 0), y: Number(found?.[2] ?? 0) };
	const measured: Approach[] = [];
	for (const group of drawn.svg.matchAll(
		/<g data-semantic-kind="edge" data-semantic-id="([^"]+)"[^>]*>([\s\S]*?)<\/g>/gu,
	)) {
		const paths = [...(group[2] ?? "").matchAll(/<path[^>]*\sd="([^"]*)"/gu)];
		const steps = stepsOf(paths[paths.length - 1]?.[1] ?? "");
		if (steps.length < 2) {
			continue;
		}
		const ends = [
			{ what: "leaves" as const, step: steps[1]!, point: steps[0]!.to },
			{
				what: "arrives" as const,
				step: steps[steps.length - 1]!,
				point: steps[steps.length - 1]!.to,
			},
		];
		for (const end of ends) {
			const on = { x: end.point.x + shift.x, y: end.point.y + shift.y };
			const face = boxes.map((box) => faceAt(on, box)).find((side) => side !== null);
			const run = { x: end.step.to.x - end.step.from.x, y: end.step.to.y - end.step.from.y };
			const length = Math.hypot(run.x, run.y);
			if (face === undefined || face === null || length < 0.01) {
				continue;
			}
			measured.push({
				id: group[1] ?? "",
				what: end.what,
				side: face.side,
				square: Math.abs((run.x / length) * face.normal.x + (run.y / length) * face.normal.y),
				// Only a line is straight: a route whose first or last command is a
				// curve has no approach at all, which is the failure in the picture.
				straight: end.step.kind === "L" ? length : 0,
			});
		}
	}
	return measured;
}

describe("a route meets what it points at", () => {
	test("every endpoint of a crowded page leaves and arrives square to its side", () => {
		const measured = approaches(renderArchitecture({ content: CROWDED, theme: "light" }));
		// A page this shape draws sixteen endpoints; an assertion over an empty
		// list would pass while the router drew nothing at all.
		expect(measured.length).toBeGreaterThan(10);
		for (const approach of measured) {
			expect(
				approach.square,
				`${approach.id} ${approach.what} its ${approach.side} side at ${(approach.square * 100).toFixed(0)}% square`,
			).toBeGreaterThan(0.999);
		}
	});

	test("every endpoint keeps enough straight line for the head drawn on it", () => {
		const measured = approaches(renderArchitecture({ content: CROWDED, theme: "light" }));
		const cramped = measured.filter((approach) => approach.straight < APPROACH);
		expect(
			cramped.map(
				(approach) =>
					`${approach.id} ${approach.what} ${approach.side}: ${approach.straight.toFixed(1)}`,
			),
		).toEqual([]);
	});

	test("the same holds on the other ground, because geometry is not a palette", () => {
		for (const theme of ["light", "dark"] as const) {
			const measured = approaches(renderArchitecture({ content: CROWDED, theme }));
			expect(measured.every((approach) => approach.straight >= APPROACH)).toBe(true);
			expect(measured.every((approach) => approach.square > 0.999)).toBe(true);
		}
	});
});

describe("a node that calls itself", () => {
	/** One part that calls itself, beside a neighbour so the loop has a side to pick. */
	const LOOPED: VariantContent = VariantContentSchema.parse({
		nodes: [
			{ id: "core", name: "Board Runtime", kind: "service", responsibility: "Owns every write" },
			{ id: "io", name: "board-io", kind: "module", parent: "core" },
		],
		edges: [
			{ id: "self", from: "io", to: "io", kind: "call", label: "retries" },
			{ id: "down", from: "core", to: "io", kind: "call" },
		],
	});

	test("its loop leaves and returns square to the face, with room for the head", () => {
		const measured = approaches(renderArchitecture({ content: LOOPED, theme: "light" }));
		const loop = measured.filter((approach) => approach.id === "self");
		// Both ends of the loop, and both on the card it belongs to.
		expect(loop).toHaveLength(2);
		for (const end of loop) {
			expect(
				end.square,
				`the loop ${end.what} its ${end.side} side at ${(end.square * 100).toFixed(0)}% square`,
			).toBeGreaterThan(0.999);
			expect(
				end.straight,
				`the loop ${end.what} on ${end.straight.toFixed(1)} of line`,
			).toBeGreaterThanOrEqual(APPROACH);
		}
	});

	test("the loop stays outside the card it belongs to", () => {
		const drawn = renderArchitecture({ content: LOOPED, theme: "light" });
		const card = drawn.atlas.nodes["io"]!;
		const found = /<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)">/.exec(drawn.svg);
		const shift: At = { x: Number(found?.[1] ?? 0), y: Number(found?.[2] ?? 0) };
		const group = /<g data-semantic-kind="edge" data-semantic-id="self"[^>]*>([\s\S]*?)<\/g>/u.exec(
			drawn.svg,
		);
		const paths = [...(group?.[1] ?? "").matchAll(/<path[^>]*\sd="([^"]*)"/gu)];
		const points = stepsOf(paths[paths.length - 1]?.[1] ?? "").map((step) => ({
			x: step.to.x + shift.x,
			y: step.to.y + shift.y,
		}));
		expect(points.length).toBeGreaterThan(2);
		// Every point of it is on the card's edge or beyond it: a loop that cut
		// back through the card would be drawn over the words it belongs to.
		for (const point of points) {
			expect(point.x).toBeGreaterThanOrEqual(card.x + card.width - 0.01);
		}
	});
});
