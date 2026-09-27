// Where a still picture rests a line's streak beside a label.
//
// What is guarded: a streak whose glow only just clears a label reads as
// stuck to it (Agent workbench's "turn/start when idle" 2 px above its own
// label), so where its line has room the streak rests a lane from the label,
// a label standing beside the line as well as one across it; and a streak on
// a crossing's hop or on a stretch two lines share reads as either line's
// traffic, so it keeps a lane from those too, and where it has no lane's
// room it keeps off them before it keeps its tail from under a label.

import { expect, test } from "bun:test";
import { restingPlace } from "@/transformers/semantic-renderer/layout";

/** The pitch of neighbouring parallel lines. */
const ROUTE_LANE = 16;

/** The radius of a streak's glow. */
const GLOW = 3;

/** A straight line down 300 px. */
const RIDE = {
	from: { x: 0, y: 0 },
	segments: [{ kind: "line" as const, to: { x: 0, y: 300 } }],
};

/** A box on the page. */
interface Box {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/**
 * How far a streak resting on the line down keeps from a box, its body included.
 * @param rest Where its head rests.
 * @param body How far behind its head its body reaches.
 * @param box The box.
 * @returns The least distance from any point of the streak to the box.
 */
function gapTo(rest: number, body: number, box: Box): number {
	const dx = Math.max(box.x, 0, -box.x - box.width);
	const top = rest - body;
	const dy = Math.max(box.y - rest, 0, top - box.y - box.height);
	return Math.hypot(dx, dy);
}

test("a resting streak keeps a lane from a label its line has room to pass", () => {
	// A label whose top edge stands just clear of the glow at half way.
	const label = { x: -60, y: 150 + GLOW + 4, width: 120, height: 31 };
	const rest = restingPlace(RIDE, 300, { glow: GLOW, body: 0 }, { labels: [label], met: [] });
	expect(gapTo(rest, 0, label)).toBeGreaterThanOrEqual(GLOW + ROUTE_LANE);
});

test("a resting streak's tail keeps a lane from a label its line has room to pass", () => {
	// The label above half way: a head a lane below the label would drag its
	// tail up out of the label's border.
	const label = { x: -60, y: 100, width: 120, height: 31 };
	const body = 40;
	const rest = restingPlace(RIDE, 300, { glow: GLOW, body }, { labels: [label], met: [] });
	expect(gapTo(rest, body, label)).toBeGreaterThanOrEqual(GLOW + ROUTE_LANE);
});

test("a resting streak keeps a lane from a label standing beside its line", () => {
	// A label 10 px beside the line's middle, clear of the line itself.
	const label = { x: 10, y: 140, width: 120, height: 31 };
	const rest = restingPlace(RIDE, 300, { glow: GLOW, body: 0 }, { labels: [label], met: [] });
	expect(gapTo(rest, 0, label)).toBeGreaterThanOrEqual(GLOW + ROUTE_LANE - 0.5);
});

test("a resting streak keeps a lane from a hop and from a stretch its line shares", () => {
	const body = 20;
	const hop = { x: -6, y: 144, width: 12, height: 12 };
	const shared = { x: 0, y: 120, width: 0, height: 180 };
	for (const met of [hop, shared]) {
		const rest = restingPlace(RIDE, 300, { glow: GLOW, body }, { labels: [], met: [met] });
		expect(gapTo(rest, body, met)).toBeGreaterThanOrEqual(GLOW + ROUTE_LANE - 0.5);
	}
});

test("a resting streak with no lane's room rests off a hop between two shared stretches", () => {
	// A line down 100 px shared with other lines above and below a hop at its
	// middle: nowhere keeps a lane, and the hop overlaps the streak deeper
	// than the stretches beside it.
	const ride = {
		from: { x: 0, y: 0 },
		segments: [{ kind: "line" as const, to: { x: 0, y: 100 } }],
	};
	const hop = { x: -6, y: 44, width: 12, height: 12 };
	const met = [{ x: 0, y: 0, width: 0, height: 44 }, hop, { x: 0, y: 56, width: 0, height: 44 }];
	const body = 10;
	const rest = restingPlace(ride, 100, { glow: GLOW, body }, { labels: [], met });
	expect(rest <= hop.y || rest - body >= hop.y + hop.height).toBe(true);
});

test("a resting streak with no lane's room lets its tail run under its label rather than rest against a junction", () => {
	// Command interface's "requestJson": its own label above, a stretch it
	// shares into its card below, and no place between them where the whole
	// streak keeps clear of the label.
	const ride = {
		from: { x: 0, y: 0 },
		segments: [{ kind: "line" as const, to: { x: 0, y: 60 } }],
	};
	const label = { x: -40, y: 0, width: 80, height: 28 };
	const shared = { x: 0, y: 50, width: 0, height: 10 };
	const rest = restingPlace(ride, 60, { glow: GLOW, body: 20 }, { labels: [label], met: [shared] });
	expect(shared.y - rest).toBeGreaterThanOrEqual(10);
});

test("a resting streak with no lane's room keeps the most room it can", () => {
	// Two junction dots 32 px apart on a line down 70 px: half way stands
	// 10 px from the upper one, the middle between them 13 px from each.
	const ride = {
		from: { x: 0, y: 0 },
		segments: [{ kind: "line" as const, to: { x: 0, y: 70 } }],
	};
	const dots = [
		{ x: -2, y: 18, width: 4, height: 4 },
		{ x: -2, y: 54, width: 4, height: 4 },
	];
	const rest = restingPlace(ride, 70, { glow: GLOW, body: 0 }, { labels: [], met: dots });
	expect(Math.min(...dots.map((dot) => gapTo(rest, 0, dot)))).toBeGreaterThanOrEqual(15.5);
});
