// A line between two cards stacked one above the other with a shared span left
// one card by its side and entered the other by its side, although a straight
// drop through the shared span was free. Two causes: the straight channel was
// tried only at centred coordinates, which a third card between them blocked
// (Agent workbench's "Board changes reach the workhorse"), and a reserved label
// Graphviz parked beside the shared span, which a route forced through it had
// to reach from a side (IIS Ingress Migration's "Today: DNS points here"). A
// label moved onto the span stands where its line meets each card's face,
// not its corner: moved the nudging distance from a corner, Browser
// application's "start voice" left Agent setup 12 px from its corner.

import { expect, test } from "bun:test";
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import { AvoidLib } from "libavoid-js";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { requestOptions, routeGraph } from "@/runtime/semantic-renderer/layout";
import { routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import sharedSpan from "./shared-span.json";

/** The narrowest shared span a straight line keeps its nudging distance in. */
const SHARED_SPAN = 24;

test("a line between stacked cards with a shared span leaves neither by its side", async () => {
	const content = orderedFixture(sharedSpan);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "graphviz" });
	const cards = new Map(
		Object.entries(drawing.atlas.nodes).filter(([id]) => !(id in drawing.atlas.regions)),
	);
	const routes = routePoints(drawing.svg);
	const sideExits = content.edges.flatMap(({ id, from, to }) => {
		const [one, other] = [cards.get(from), cards.get(to)];
		if (one === undefined || other === undefined) return [];
		const shared = Math.min(one.x + one.width, other.x + other.width) - Math.max(one.x, other.x);
		const stacked = one.y + one.height <= other.y || other.y + other.height <= one.y;
		if (!stacked || shared < SHARED_SPAN) return [];
		const points = routes.get(id)!;
		return [points, points.toReversed()]
			.filter(([end, next]) => Math.abs(end!.y - next!.y) < 0.01)
			.map(() => id);
	});
	expect(sideExits).toEqual([]);
});

/** How far from a card's corner a line meets its face and reads as meeting the face. */
const FACE_INSET = 20;

/**
 * A reserved label beside the span two stacked cards share, routed with labels centred.
 * @param upper The upper card.
 * @param lower The lower card.
 * @returns The routed relationship.
 */
function centred(upper: ElkNode, lower: ElkNode): ElkExtendedEdge {
	const graph: ElkNode = {
		id: "root",
		width: 800,
		height: 380,
		layoutOptions: requestOptions({ centredLabels: true }),
		children: [upper, lower, { id: "beside", x: lower.x! + 400, y: 272, width: 340, height: 88 }],
		edges: [
			{
				id: "today",
				sources: ["upper"],
				targets: ["lower"],
				labels: [{ x: 110, y: 174, width: 135, height: 32 }],
				layoutOptions: { "archboard.relationship.kind": "call", "archboard.route-label": "true" },
			},
		],
	};
	return routeGraph(AvoidLib.getInstance() as AvoidEngine, graph).edges![0]!;
}

test("a label reserved beside the span its cards share moves onto it when asked, and its line drops straight", async () => {
	await AvoidLib.load();
	const upper = { id: "upper", x: 200, y: 20, width: 340, height: 88 };
	const lower = { id: "lower", x: 20, y: 272, width: 340, height: 88 };
	const edge = centred(upper, lower);
	const label = edge.labels![0]!;
	const centre = label.x! + label.width! / 2;
	expect(centre).toBeGreaterThan(upper.x);
	expect(centre).toBeLessThan(lower.x + lower.width);
	expect(edge.sections![0]!.bendPoints ?? []).toHaveLength(0);
});

test("a label moved onto a shared span keeps its line off the cards' corners", async () => {
	await AvoidLib.load();
	const upper = { id: "upper", x: 200, y: 20, width: 340, height: 88 };
	const lower = { id: "lower", x: 20, y: 272, width: 340, height: 88 };
	const start = centred(upper, lower).sections![0]!.startPoint;
	expect(start.x - upper.x).toBeGreaterThanOrEqual(FACE_INSET);
});
