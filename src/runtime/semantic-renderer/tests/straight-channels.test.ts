import { expect, test } from "bun:test";
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import { AvoidLib } from "libavoid-js";
import {
	curveThrough,
	projectLabelChannels,
	routeGraph,
	type ArchitectureDrawing,
	type DrawingEdge,
	type Point,
} from "@/runtime/semantic-renderer/layout";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";

const loaded = AvoidLib.load();

/**
 * One relationship of a kind between two placed cards.
 * @param id Its identity.
 * @param source Its source card.
 * @param target Its target card.
 * @param kind Its relationship kind.
 * @returns The layout edge.
 */
function relationship(id: string, source: string, target: string, kind: string): ElkExtendedEdge {
	return {
		id,
		sources: [source],
		targets: [target],
		layoutOptions: { "archboard.relationship.kind": kind },
	};
}

/**
 * Route a placed graph with the real router.
 * @param children The placed cards.
 * @param edges The relationships.
 * @returns Each relationship's route points.
 */
async function routes(
	children: ElkNode[],
	edges: ElkExtendedEdge[],
): Promise<Map<string, { x: number; y: number }[]>> {
	await loaded;
	const routed = routeGraph(AvoidLib.getInstance() as AvoidEngine, {
		id: "root",
		width: 1400,
		height: 900,
		children,
		edges,
	});
	return new Map(
		routed.edges!.map((edge) => {
			const section = edge.sections![0]!;
			return [edge.id, [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]];
		}),
	);
}

/**
 * A placed card of the router's graph.
 * @param id Its identity.
 * @param x Its left edge.
 * @param y Its top edge.
 * @returns The card.
 */
function card(id: string, x: number, y: number): ElkNode {
	return { id, x, y, width: 340, height: 88 };
}

/**
 * A drawn card of a finished drawing.
 * @param id Its identity.
 * @param x Its left edge.
 * @param y Its top edge.
 * @returns The card.
 */
function box(id: string, x: number, y: number): ArchitectureDrawing["cards"][number] {
	return {
		measured: {
			node: { id, order: 0, name: id, kind: "service" },
			width: 200,
			height: 80,
			headerHeight: 0,
			runs: [],
		},
		box: { x, y, width: 200, height: 80 },
		depth: 0,
	};
}

test("a line between two stacked cards drops straight when their centre pin belongs to another channel", async () => {
	// The source's three channels put another kind's pin at its centre, so the
	// two cards' seeds for this line stand at different columns. The router's
	// own run into the target is a clear straight column from the source.
	const drawn = await routes(
		[
			card("source", 40, 40),
			card("target", 40, 500),
			card("store", 200, 280),
			card("client", 800, 40),
		],
		[
			relationship("call", "source", "target", "call"),
			relationship("write", "source", "store", "data"),
			relationship("request", "client", "source", "http"),
			relationship("notify", "client", "target", "event"),
		],
	);
	expect(drawn.get("call")).toHaveLength(2);
});

/**
 * One drawn relationship carrying a reserved label.
 * @param id Its identity.
 * @param ends Its source and target cards.
 * @param route Its route.
 * @param label Its reserved label box.
 * @returns The drawn relationship.
 */
function reserved(
	id: string,
	ends: readonly [string, string],
	route: readonly Point[],
	label?: { x: number; y: number; width: number; height: number },
): DrawingEdge {
	const edge = {
		id,
		order: 0,
		from: ends[0],
		to: ends[1],
		kind: "call",
		emphasis: "normal",
	} as const;
	const curve = curveThrough(route);
	if (label === undefined) return { edge, curve, path: "" };
	return { edge, curve, path: "", label: { box: label, measured: { ...label, runs: [] } } };
}

test("one label's crowded channel proposal leaves the other labels' proposals standing", () => {
	// Both "left" and "right" step sideways through their reserved labels, and
	// each has a straight channel between its cards. Packing "right" beside the
	// fixed label "fixed" pushes it onto the unrelated "past" line.
	const drawing: ArchitectureDrawing = {
		direction: "down",
		width: 1400,
		height: 600,
		cards: [box("a1", 40, 40), box("a2", 40, 440), box("b1", 600, 40), box("b2", 600, 440)],
		containers: [],
		edges: [
			reserved(
				"left",
				["a1", "a2"],
				[
					{ x: 100, y: 120 },
					{ x: 100, y: 240 },
					{ x: 180, y: 240 },
					{ x: 180, y: 440 },
				],
				{ x: 150, y: 270, width: 60, height: 20 },
			),
			reserved(
				"right",
				["b1", "b2"],
				[
					{ x: 660, y: 120 },
					{ x: 660, y: 240 },
					{ x: 740, y: 240 },
					{ x: 740, y: 440 },
				],
				{ x: 710, y: 270, width: 60, height: 20 },
			),
			reserved(
				"fixed",
				["b1", "b2"],
				[
					{ x: 1100, y: 120 },
					{ x: 1100, y: 440 },
				],
				{ x: 640, y: 270, width: 50, height: 20 },
			),
			reserved(
				"past",
				["b1", "b2"],
				[
					{ x: 772, y: 120 },
					{ x: 772, y: 440 },
				],
			),
		],
	};
	const measured = new Map(
		drawing.edges.flatMap(({ edge, label }) => (label ? [[edge.id, label.measured] as const] : [])),
	);
	const anchors = projectLabelChannels(drawing, measured, new Set(["left", "right", "fixed"]));
	expect([...anchors.keys()]).toEqual(["left"]);
});
