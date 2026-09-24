// A forced label's route passes through the label's centre. When the route
// must then step sideways by less than two fixed bends to clear a card, the
// label moves onto the route's own channel so the step disappears. The route
// already runs in the page's outer margin there, so the label follows it in.

import { expect, test } from "bun:test";
import {
	alignLabelRows,
	curveThrough,
	type ArchitectureDrawing,
	type Point,
} from "@/runtime/semantic-renderer/layout";

// The Voice coordinator view "Workhorse news" (TASK-329): the reserved badge
// sits against the page's left margin, centred 11 units right of the channel
// the route takes past the card below it.
const CHANNEL = 72.56;
const RESERVED = { x: 24, y: 281, width: 119.12, height: 31 };
const ROUTE: readonly Point[] = [
	{ x: 347.81, y: 129 },
	{ x: 347.81, y: 211 },
	{ x: 83.56, y: 211 },
	{ x: 83.56, y: 643 },
	{ x: CHANNEL, y: 643 },
	{ x: CHANNEL, y: 1190.25 },
	{ x: 262.56, y: 1190.25 },
	{ x: 262.56, y: 1221 },
];

test("a reserved label steps onto its route's channel beside the page margin", () => {
	const measured = { width: RESERVED.width, height: RESERVED.height, runs: [] };
	const curve = curveThrough(ROUTE);
	const drawing: ArchitectureDrawing = {
		direction: "down",
		width: 2203,
		height: 1333,
		cards: [],
		containers: [],
		edges: [
			{
				edge: {
					id: "start",
					order: 1000,
					from: "voice",
					to: "session",
					kind: "call",
					emphasis: "normal",
				},
				curve,
				path: "",
				label: { measured, box: RESERVED },
			},
		],
	};
	const anchor = alignLabelRows(drawing, new Map([["start", measured]]), new Set(["start"])).get(
		"start",
	);
	expect(anchor).toBeDefined();
	expect(anchor!.x + anchor!.width / 2).toBeCloseTo(CHANNEL, 6);
	expect(anchor!.y).toBe(RESERVED.y);
	expect(anchor!.x).toBeGreaterThanOrEqual(0);
});
