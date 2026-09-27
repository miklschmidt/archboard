// A card in a proposal wears its standing pin in its top-left corner, 3 px in
// with a 9.2 px radius. A line that lands beside it reads as pointing at the
// pin: a corner pin 20 px in put Board persistence's "adopt a draft" 8 px
// from the pin's rim, and a straight channel through Renderer layout's "place
// grid" met Grid placement's top as near. Every aligned pin a route is offered
// on such a card keeps a lane from the standing pin's rim. A channel's seed
// is its card-wide slot, and the first of two channels' slots on a left face
// 72 px tall stands 18 px down it, 6 px from the rim ("submit transition"
// into Board persistence's Write under lease). Moving every such seed moved
// labels and so placements (Renderer layout went from 0 crossings to 1 and 4
// hooks), so a finishing pass asks for seeds clear of the pin card by card.
// What this catches: a corner pin or an aligned pin offered beside a standing
// pin, a proposal's cards laid out without knowing which wear one, a seed
// left beside the pin of a card the routes were asked to clear, and a pin
// pass refused for one card's cost or for the bend a line takes to leave the pin.

import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { AvoidLib } from "libavoid-js";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	compoundGraph,
	finished,
	PINNED_STANDING,
	requestOptions,
	routeGraph,
} from "@/runtime/semantic-renderer/layout";
import { cornersOf, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { at, sketch, type Line } from "@/runtime/semantic-renderer/tests/sketched-drawings";
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
	// Shifted left, the corner pin's position rounds a hair under the lane it keeps.
	for (const shift of [0, -300]) {
		const target = { id: "target", x: 702 + shift, y: 232, width: 340, height: 88, ...pinned };
		const end = await endOf(
			graphOf(
				[
					{ id: "source", x: 22 + shift, y: 20, width: 340, height: 88 },
					target,
					{ id: "neighbour", x: 320 + shift, y: 232, width: 340, height: 88 },
				],
				{ cornerPins: true },
			),
		);
		expect(end.y).toBeCloseTo(target.y, 1);
		expect(fromPinnedCorner(target, end)).toBeGreaterThanOrEqual(PIN_CLEARANCE - 0.01);
	}
});

test("a straight channel is not offered beside a standing pin", async () => {
	const target = { id: "target", x: 200, y: 272, width: 340, height: 88, ...pinned };
	const end = await endOf(
		graphOf([{ id: "source", x: 0, y: 20, width: 240, height: 88 }, target], {}),
	);
	expect(fromPinnedCorner(target, end)).toBeGreaterThanOrEqual(PIN_CLEARANCE);
	// Beside it, the span the cards share across lies all within the pin's clearance of the left face.
	const beside = { id: "target", x: 400, y: 100, width: 340, height: 88, ...pinned };
	const across = await endOf(
		graphOf([{ id: "source", x: 0, y: 70, width: 240, height: 60 }, beside], {}),
	);
	expect(fromPinnedCorner(beside, across)).toBeGreaterThanOrEqual(PIN_CLEARANCE);
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

test("a card the routes are asked to clear has its seeds a lane from its standing pin's rim", async () => {
	// Two channels on the target: the call's seed is the first slot of its left face.
	const target = { id: "target", x: 500, y: 200, width: 260, height: 72, ...pinned };
	const graph = graphOf(
		[
			{ id: "source", x: 20, y: 20, width: 240, height: 72 },
			{ id: "other", x: 20, y: 400, width: 240, height: 72 },
			target,
		],
		{ clearPins: ["target"] },
	);
	graph.edges!.push({
		id: "data",
		sources: ["target"],
		targets: ["other"],
		layoutOptions: { "archboard.relationship.kind": "data" },
	});
	const end = await endOf(graph);
	expect(end.x).toBeCloseTo(target.x, 1);
	expect(fromPinnedCorner(target, end)).toBeGreaterThanOrEqual(PIN_CLEARANCE - 0.01);
});

/** Two cards that wear standing pins, the cards their lines come from, and one card pair's line. */
const cards = {
	a: { x: 200, y: 200, width: 200, height: 60 },
	b: { x: 700, y: 200, width: 200, height: 60 },
	fromA: { x: 0, y: 0, width: 100, height: 50 },
	fromB: { x: 500, y: 0, width: 100, height: 50 },
	left: { x: 560, y: 110, width: 40, height: 40 },
	right: { x: 900, y: 110, width: 60, height: 40 },
};

/** A line across the page that a line into b's top would cross. */
const across: Line = {
	id: "across",
	from: "left",
	to: "right",
	points: at([600, 130], [900, 130]),
};

test("a pin pass clears each card it can, and a line may turn once more to leave the pin", async () => {
	const lines = (cleared: readonly string[]): Line[] => [
		{
			id: "intoA",
			from: "fromA",
			to: "a",
			points: cleared.includes("a")
				? at([50, 50], [50, 100], [250, 100], [250, 200])
				: at([50, 50], [50, 210], [200, 210]),
		},
		{
			id: "intoB",
			from: "fromB",
			to: "b",
			points: cleared.includes("b")
				? at([550, 50], [550, 90], [750, 90], [750, 200])
				: at([550, 50], [550, 210], [700, 210]),
		},
		across,
	];
	const done = await finished(
		{ reading: [] as readonly string[], drawing: sketch(cards, lines([])) },
		(_, { clearPins }) =>
			Promise.resolve(
				clearPins === undefined
					? undefined
					: { reading: clearPins, drawing: sketch(cards, lines(clearPins)) },
			),
		new Set(["a", "b"]),
	);
	expect(done.reading).toEqual(["a"]);
});

test("a card wears a standing pin only when the proposal marks it", () => {
	const standings = { kept: "unchanged", added: "added" } as const;
	const ids = ["kept", "added", "plain"];
	const content = orderedFixture({
		nodes: ids.map((id) => ({ id, name: id, kind: "module" })),
		edges: [],
	});
	const measured = {
		nodes: new Map(
			content.nodes.map((node) => [
				node.id,
				{ node, width: 200, height: 60, headerHeight: 0, runs: [] },
			]),
		),
		labels: new Map(),
		lines: new Map(),
	};
	const graph = compoundGraph(content, measured, standings);
	const wearing = graph.children!.filter(
		({ layoutOptions }) => layoutOptions?.[PINNED_STANDING] === "true",
	);
	expect(wearing.map(({ id }) => id)).toEqual(["added"]);
});
