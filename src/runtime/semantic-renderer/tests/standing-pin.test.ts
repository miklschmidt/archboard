// A card in a proposal wears its standing pin in its top-left corner, 3 px in
// with a 9.2 px radius. A line that lands beside it reads as pointing at the
// pin: a corner pin 20 px in put Board persistence's "adopt a draft" 8 px
// from the pin's rim, and a straight channel through Renderer layout's "place
// grid" met Grid placement's top as near. Every pin a route is offered on
// such a card keeps a lane from the standing pin's rim.
// What this catches: a corner pin or an aligned pin offered beside a standing
// pin, and a proposal's cards laid out without knowing which wear one.

import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { AvoidLib } from "libavoid-js";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { PINNED_STANDING, requestOptions, routeGraph } from "@/runtime/semantic-renderer/layout";
import { cornersOf, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import type { StatedStandings } from "@/transformers/semantic-renderer/index";
import proposal from "./renderer-layout-proposal.json";

/** How far in from a card's top-left corner its standing pin is centred. */
const PIN_INSET = 3;

/** How far along the top face from a card's left corner its standing pin reaches, and a lane past it. */
const PIN_CLEARANCE = PIN_INSET + 9.2 + 16;

/** The layout options of a card that wears a standing pin. */
const pinned = { layoutOptions: { [PINNED_STANDING]: "true" } };

/**
 * Where a routed line ends on its target.
 * @param graph The placed graph, one relationship from source to target.
 * @returns The end point.
 */
async function endOf(graph: ElkNode): Promise<{ x: number; y: number }> {
	await AvoidLib.load();
	return routeGraph(AvoidLib.getInstance() as AvoidEngine, graph).edges![0]!.sections![0]!.endPoint;
}

/**
 * A graph of cards and one call from source to target.
 * @param children The cards.
 * @param request What the routes are asked.
 * @returns The graph.
 */
function graphOf(children: ElkNode[], request: Parameters<typeof requestOptions>[0]): ElkNode {
	return {
		id: "root",
		width: 1200,
		height: 400,
		layoutOptions: requestOptions(request),
		children,
		edges: [
			{
				id: "call",
				sources: ["source"],
				targets: ["target"],
				layoutOptions: { "archboard.relationship.kind": "call" },
			},
		],
	};
}

/**
 * How far along a card's top or left face from its top-left corner a line ends.
 * @param target The card.
 * @param end The line's end on it.
 * @returns The distance along the face it ends on.
 */
function fromPinnedCorner(target: ElkNode, end: { x: number; y: number }): number {
	return Math.abs(end.y - target.y!) < 0.5 ? end.x - target.x! : end.y - target.y!;
}

test("a corner pin on the top of a card that wears a standing pin keeps a lane from its rim", async () => {
	const target = { id: "target", x: 702, y: 232, width: 340, height: 88, ...pinned };
	const end = await endOf(
		graphOf(
			[
				{ id: "source", x: 22, y: 20, width: 340, height: 88 },
				target,
				{ id: "neighbour", x: 320, y: 232, width: 340, height: 88 },
			],
			{ cornerPins: true },
		),
	);
	expect(end.y).toBeCloseTo(target.y, 1);
	expect(fromPinnedCorner(target, end)).toBeGreaterThanOrEqual(PIN_CLEARANCE);
});

test("a straight channel is not offered beside a standing pin", async () => {
	const target = { id: "target", x: 200, y: 272, width: 340, height: 88, ...pinned };
	const end = await endOf(
		graphOf([{ id: "source", x: 0, y: 20, width: 240, height: 88 }, target], {}),
	);
	expect(fromPinnedCorner(target, end)).toBeGreaterThanOrEqual(PIN_CLEARANCE);
});

test("no line of a proposal ends beside the standing pin a card wears", async () => {
	const { standing, ...board } = proposal;
	const drawing = await renderArchitecture({
		content: orderedFixture(board),
		standing: standing as StatedStandings,
		theme: "light",
		layout: "graphviz",
	});
	const routes = routePoints(drawing.svg);
	const stated: Readonly<Record<string, string>> = standing;
	const beside = board.edges.flatMap(({ id, from, to }) => {
		const points = cornersOf(routes.get(id)!);
		const ends = [
			[from, points[0]!],
			[to, points.at(-1)!],
		] as const;
		return ends.flatMap(([card, end]) => {
			const box = drawing.atlas.nodes[card];
			if (box === undefined || stated[card] === undefined) return [];
			const fromPin = Math.hypot(end.x - box.x - PIN_INSET, end.y - box.y - PIN_INSET);
			return fromPin < PIN_CLEARANCE - PIN_INSET ? [id] : [];
		});
	});
	expect(beside).toEqual([]);
});
