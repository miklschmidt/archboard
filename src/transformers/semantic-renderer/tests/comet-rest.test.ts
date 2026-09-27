// Where a still picture rests a line's streak beside a label.
//
// What is guarded: a streak whose glow only just clears a label reads as
// stuck to it (Agent workbench's "turn/start when idle" 2 px above its own
// label), so where its line has room the streak rests a lane from the label.

import { expect, test } from "bun:test";
import { restingPlace } from "@/transformers/semantic-renderer/layout";

/** The pitch of neighbouring parallel lines. */
const ROUTE_LANE = 16;

/** The radius of a streak's glow. */
const GLOW = 3;

test("a resting streak keeps a lane from a label its line has room to pass", () => {
	// A straight line down 300 px, with a label whose top edge stands just
	// clear of the glow at half way.
	const ride = {
		from: { x: 0, y: 0 },
		segments: [{ kind: "line" as const, to: { x: 0, y: 300 } }],
	};
	const label = { x: -60, y: 150 + GLOW + 4, width: 120, height: 31 };
	const rest = restingPlace(ride, 300, { glow: GLOW, body: 0 }, [label]);
	const gap = Math.max(label.y - rest, rest - label.y - label.height);
	expect(gap).toBeGreaterThanOrEqual(GLOW + ROUTE_LANE);
});

test("a resting streak's tail keeps a lane from a label its line has room to pass", () => {
	// The same line with the label above half way: a head a lane below the
	// label would drag its tail up out of the label's border.
	const ride = {
		from: { x: 0, y: 0 },
		segments: [{ kind: "line" as const, to: { x: 0, y: 300 } }],
	};
	const label = { x: -60, y: 100, width: 120, height: 31 };
	const body = 40;
	const rest = restingPlace(ride, 300, { glow: GLOW, body }, [label]);
	const gap = rest < label.y ? label.y - rest : rest - body - label.y - label.height;
	expect(gap).toBeGreaterThanOrEqual(GLOW + ROUTE_LANE);
});
