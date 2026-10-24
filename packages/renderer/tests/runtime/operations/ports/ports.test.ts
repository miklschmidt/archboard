// A line that meets the foot of a card runs into a port, a slot cut through the
// card's front edge (TASK-424). What this catches: a port drawn where no line
// meets a card's foot, a line that meets one with no port, a slot that is drawn
// on the edge rather than cut through it, a line that goes into it at another
// width than its own, and a card's shadow drawn over a line (TASK-425).

import { expect, test } from "bun:test";

import { renderArchitecture } from "#runtime/operations/render.ts";
import { bodyShift, routePoints } from "#tests/runtime/support/drawn-routes.ts";
import { groupOf } from "#tests/runtime/support/drawn-subjects.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

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
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
	});
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

	// The line's end runs into the port at the line's own width (TASK-425).
	const width = /<path d="[^"]*" marker-end="[^"]*"[^>]* stroke-width="([\d.]+)"/u.exec(line)![1];
	expect(/ab-port"[\s\S]*?<line [^>]* stroke-width="([\d.]+)"/u.exec(line)![1]).toBe(width);
	// No card casts its shadow on a line: the shadows lie under every line.
	const shadow = drawing.svg.indexOf('data-members="upper"');
	expect(shadow).toBeGreaterThan(-1);
	expect(shadow).toBeLessThan(drawing.svg.indexOf('data-semantic-kind="edge"'));

	// The port is drawn near and far alike: it belongs to neither view's layer (TASK-430).
	expect(line).not.toMatch(/ab-(?:near|far)[^"]*ab-port|ab-port[^"]*ab-(?:near|far)/u);

	// The slot is cut through the card it leaves, and the card it arrives at is whole.
	// The cut is in the card's own box, so it moves with the card.
	const cut = /<clipPath id="(ab-port-[\da-f]+)" clipPathUnits="objectBoundingBox"/u.exec(
		drawing.svg,
	)?.[1];
	expect(cut).toBeDefined();
	expect(groupOf(drawing.svg, "node", "upper")!.markup).toContain(`clip-path="url(#${cut})"`);
	expect(groupOf(drawing.svg, "node", "lower")!.markup).not.toContain("clip-path");
});

test("a pulse that arrives in an arrowhead at a card's foot rides on over the head into the hole", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "upper", name: "Upper", kind: "service" },
			{ id: "lower", name: "Lower", kind: "service" },
		],
		// The answer goes back up, and arrives in its head at the upper card's foot.
		edges: [
			{ id: "down", from: "upper", to: "lower", kind: "call" },
			{ id: "up", from: "lower", to: "upper", kind: "call", traffic: {} },
		],
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
	});
	const shift = bodyShift(drawing.svg);
	const upper = drawing.atlas.nodes["upper"]!;
	const foot = upper.y + upper.height;
	expect(routePoints(drawing.svg).get("up")!.at(-1)!.y).toBeCloseTo(foot, 0);
	// The highest point the pulses ride: past the head, up to the lid of the slot.
	const traffic = (drawing.svg.split('data-traffic="up"')[1] ?? "").split(
		/data-(?:semantic-id|traffic)=/u,
	)[0]!;
	const ys = [...traffic.matchAll(/<path d="([^"]+)"/gu)].flatMap(([, d]) =>
		[...d!.matchAll(/-?[\d.]+,(-?[\d.]+)/gu)].map(([, y]) => Number(y) + shift.y),
	);
	expect(ys.length).toBeGreaterThan(0);
	expect(Math.min(...ys)).toBeLessThan(foot - 2);
	expect(Math.min(...ys)).toBeGreaterThan(foot - 4);
});
