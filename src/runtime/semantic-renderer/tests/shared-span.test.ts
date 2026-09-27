// A line between two cards stacked one above the other with a shared span left
// one card by its side and entered the other by its side, although a straight
// drop through the shared span was free. Two causes: the straight channel was
// tried only at centred coordinates, which a third card between them blocked
// (Agent workbench's "Board changes reach the workhorse"), and a reserved label
// Graphviz parked beside the shared span, which a route forced through it had
// to reach from a side (IIS Ingress Migration's "Today: DNS points here"). A
// label moved onto the span stands where its line meets each card's face,
// not its corner: moved the nudging distance from a corner, Browser
// application's "start voice" left Agent setup 12 px from its corner. A row
// of labels moves only where every label keeps clear of cards and of the
// label before it, inside its frame's inset, and only onto a channel no
// other card stands in.

import { expect, test } from "bun:test";
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import { AvoidLib } from "libavoid-js";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { LABEL_LABEL_CLEARANCE } from "@/transformers/semantic-renderer/config";
import { centreLabels, requestOptions, routeGraph } from "@/runtime/semantic-renderer/layout";
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

/**
 * Where the reserved labels of lines from one card down to another stand once centred.
 * @param labels Each line's label, where placement put it.
 * @param others Other cards on the page.
 * @returns Each label's box after centring.
 */
function centredLabels(
	labels: readonly { x: number; y: number; width: number; height: number }[],
	others: readonly ElkNode[] = [],
): { x: number; width: number }[] {
	const graph: ElkNode = {
		id: "root",
		width: 800,
		height: 380,
		children: [
			{ id: "upper", x: 200, y: 20, width: 340, height: 88 },
			{ id: "lower", x: 20, y: 272, width: 340, height: 88 },
			...others,
		],
		edges: labels.map((label, index) => ({
			id: `line${index}`,
			sources: ["upper"],
			targets: ["lower"],
			labels: [{ ...label }],
			layoutOptions: { "archboard.relationship.kind": "call", "archboard.route-label": "true" },
		})),
	};
	centreLabels(graph);
	return graph.edges!.map((edge) => ({ x: edge.labels![0]!.x!, width: edge.labels![0]!.width! }));
}

/** A label Graphviz put left of the span the two cards share, which runs from 200 to 360. */
const LEFT = { x: 110, y: 174, width: 135, height: 32 };

test("a label moved onto a shared span from its far side keeps its line off the lower card's corner", () => {
	const [label] = centredLabels([{ ...LEFT, x: 380 }]);
	expect(360 - (label!.x + label!.width / 2)).toBeGreaterThanOrEqual(FACE_INSET);
});

test("a label stays where a card stands in the channel or where it would meet a card", () => {
	const inChannel = { id: "in", x: 205, y: 240, width: 30, height: 20 };
	const besideChannel = { id: "beside", x: 260, y: 170, width: 40, height: 30 };
	expect(centredLabels([LEFT], [inChannel])[0]!.x).toBe(LEFT.x);
	expect(centredLabels([LEFT], [besideChannel])[0]!.x).toBe(LEFT.x);
});

test("labels moved onto one span in one row keep a label's clearance apart", () => {
	const [one, other] = centredLabels([LEFT, { ...LEFT, x: 300 }]);
	expect(other!.x - one!.x - one!.width).toBeGreaterThanOrEqual(LABEL_LABEL_CLEARANCE);
});

test("a label stays where sliding it onto the span would take it out of its frame's inset", () => {
	// The frame holds both cards; slid onto the span, the wide label would end inside its inset.
	const frame: ElkNode = {
		id: "frame",
		x: 100,
		y: 0,
		width: 500,
		height: 380,
		children: [
			{ id: "upper", x: 200, y: 20, width: 340, height: 88 },
			{ id: "lower", x: 120, y: 272, width: 340, height: 88 },
		],
	};
	const label = { x: 300, y: 174, width: 300, height: 32 };
	const graph: ElkNode = {
		id: "root",
		width: 800,
		height: 380,
		children: [frame],
		edges: [
			{
				id: "line",
				sources: ["upper"],
				targets: ["lower"],
				labels: [{ ...label }],
				layoutOptions: { "archboard.relationship.kind": "call", "archboard.route-label": "true" },
			},
		],
	};
	centreLabels(graph);
	expect(graph.edges![0]!.labels![0]!.x).toBe(label.x);
});
