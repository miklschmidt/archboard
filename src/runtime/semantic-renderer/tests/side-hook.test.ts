// A line from a card up and off to the side dropped down the gutter beside its
// target, past the target's top corner, and turned into its side a few points
// below it: the top face's only pin was its channel's seed, far along the face,
// so the router took the side (Renderer layout's "measure every word", Codex
// session's "decode parameters and answer"). Offered the top face just inside
// the corner it passed, the line enters there with one bend fewer, clear of
// the change badge a proposal pins in that corner (Board persistence's
// "adopt a draft"). A
// finished drawing is routed so only where it has such a hook (Renderer
// layout's "Responsibilities").

import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { AvoidLib } from "libavoid-js";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { requestOptions, routeGraph } from "@/runtime/semantic-renderer/layout";
import {
	cornersOf,
	routePoints,
	type DrawnPoint,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import rendererLayout from "./renderer-layout.json";

/**
 * How far from a card's top corner an arrow keeps clear of the change badge
 * pinned there: the badge's 12.2 px reach and half the widest arrowhead.
 */
const BADGE_CLEARANCE = 20;

/** The longest side stub a hook has: a card's own corridor and a lane. */
const HOOK_STUB = 36;

/** A card's box on the page. */
interface Box {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/**
 * Whether a drawn line end hooks into its card's side: a short side stub
 * turned from a run that comes from beyond the card's top or bottom.
 * @param box The card.
 * @param route The drawn line, ordered away from the card.
 * @returns True for a hook.
 */
function hooksInto(box: Box, route: readonly DrawnPoint[]): boolean {
	const [tip, bend, after] = [route[0]!, route[1]!, route[2]];
	if (after === undefined || Math.abs(tip.y - bend.y) >= 0.01) return false;
	if (Math.abs(tip.x - bend.x) > HOOK_STUB) return false;
	return after.y < box.y || after.y > box.y + box.height;
}

test("a line passing its target's top corner enters the top instead of hooking into the side", async () => {
	await AvoidLib.load();
	const target = { id: "target", x: 20, y: 232, width: 340, height: 88 };
	const graph: ElkNode = {
		id: "root",
		width: 1200,
		height: 400,
		layoutOptions: requestOptions({ cornerPins: true }),
		children: [
			{ id: "source", x: 700, y: 20, width: 340, height: 88 },
			target,
			{ id: "neighbour", x: 402, y: 232, width: 340, height: 88 },
		],
		edges: [
			{
				id: "call",
				sources: ["source"],
				targets: ["target"],
				layoutOptions: { "archboard.relationship.kind": "call" },
			},
		],
	};
	const section = routeGraph(AvoidLib.getInstance() as AvoidEngine, graph).edges![0]!.sections![0]!;
	expect(section.endPoint.y).toBeCloseTo(target.y, 1);
	expect(section.bendPoints).toHaveLength(1);
	const fromCorner = Math.min(
		section.endPoint.x - target.x,
		target.x + target.width - section.endPoint.x,
	);
	expect(fromCorner).toBeGreaterThanOrEqual(BADGE_CLEARANCE);
});

test("a finished drawing has no line hooking into a card's side past its corner", async () => {
	const content = orderedFixture(rendererLayout);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "graphviz" });
	const cards = drawing.atlas.nodes;
	const routes = routePoints(drawing.svg);
	const hooks = content.edges.flatMap(({ id, from, to }) => {
		const points = cornersOf(routes.get(id)!);
		return [hooksInto(cards[from]!, points), hooksInto(cards[to]!, points.toReversed())]
			.filter(Boolean)
			.map(() => id);
	});
	expect(hooks).toEqual([]);
});
