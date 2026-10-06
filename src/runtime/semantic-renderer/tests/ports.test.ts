// A line that meets the foot of a card runs into a port, a slot cut through the
// card's front edge (TASK-424). What this catches: a port drawn where no line
// meets a card's foot, a line that meets one with no port, and a slot that is
// drawn on the edge rather than cut through it.

import { expect, test } from "bun:test";

import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { bodyShift, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { groupOf } from "@/runtime/semantic-renderer/tests/drawn-subjects";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";

/** The well of a port, the first shape of its inside: its outline's top edge, from end to end of its straight run. */
const WELL = /ab-port"><path d="M(-?[\d.]+),(-?[\d.]+)H(-?[\d.]+)A(-?[\d.]+),/u;

test("a port is cut where a line meets the foot of a card, and nowhere else", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "upper", name: "Upper", kind: "service" },
			{ id: "lower", name: "Lower", kind: "service" },
		],
		edges: [{ id: "down", from: "upper", to: "lower", kind: "call" }],
	});
	const drawing = await renderArchitecture({ content, theme: "light" });
	const shift = bodyShift(drawing.svg);
	const [upper, lower] = [drawing.atlas.nodes["upper"]!, drawing.atlas.nodes["lower"]!];
	const route = routePoints(drawing.svg).get("down")!;
	const foot = upper.y + upper.height;
	// The line leaves the foot of the upper card and arrives on top of the lower one.
	expect(route[0]!.y).toBeCloseTo(foot, 1);
	expect(route.at(-1)!.y).toBeLessThan(lower.y + lower.height / 2);

	// One port, at the foot it leaves: centred where the line meets the foot, and
	// inside the card's front edge.
	const line = groupOf(drawing.svg, "edge", "down")!.markup;
	expect(line.match(/ab-port"/gu)).toHaveLength(1);
	const [, left, top, right, round] = WELL.exec(line)!.map(Number);
	expect((left! + right!) / 2 + shift.x).toBeCloseTo(route[0]!.x, 1);
	expect(top! + shift.y).toBeGreaterThan(foot - 4);
	expect(top! + 2 * round! + shift.y).toBeLessThan(foot);

	// The slot is cut through the card it leaves, and the card it arrives at is whole.
	const cut = /<clipPath id="(ab-port-[\da-f]+)"/u.exec(drawing.svg)?.[1];
	expect(cut).toBeDefined();
	expect(groupOf(drawing.svg, "node", "upper")!.markup).toContain(`clip-path="url(#${cut})"`);
	expect(groupOf(drawing.svg, "node", "lower")!.markup).not.toContain("clip-path");
});
