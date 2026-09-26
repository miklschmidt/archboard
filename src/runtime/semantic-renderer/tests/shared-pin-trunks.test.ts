import { expect, test } from "bun:test";
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import { AvoidLib } from "libavoid-js";
import { routeGraph } from "@/runtime/semantic-renderer/layout";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";

const loaded = AvoidLib.load();

/**
 * A placed card of the router's graph.
 * @param id Its identity.
 * @param x Its left edge.
 * @param y Its top edge.
 * @param width Its width.
 * @returns The card.
 */
function card(id: string, x: number, y: number, width = 340): ElkNode {
	return { id, x, y, width, height: 88 };
}

/**
 * A call between two cards.
 * @param id Its identity.
 * @param source Its source.
 * @param target Its target.
 * @returns The relationship.
 */
function call(id: string, source: string, target: string): ElkExtendedEdge {
	return {
		id,
		sources: [source],
		targets: [target],
		layoutOptions: { "archboard.relationship.kind": "call" },
	};
}

test("two lines squeezed through one passage into one pin join as one trunk", async () => {
	// The cards of the lower row stand one line's passage apart, and both
	// lines come down it into the right card's west pin.
	await loaded;
	const routed = routeGraph(AvoidLib.getInstance() as AvoidEngine, {
		id: "root",
		width: 1000,
		height: 500,
		children: [
			card("left", 40, 300),
			card("right", 422, 300),
			card("upper", 40, 40, 200),
			card("lower", 140, 150, 200),
		],
		edges: [call("from-upper", "upper", "right"), call("from-lower", "lower", "right")],
	});
	const verticals = (routed.edges ?? []).map((edge) => {
		const section = edge.sections![0]!;
		const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
		return points
			.slice(1)
			.flatMap((point, index) =>
				Math.abs(point.x - points[index]!.x) < 0.01 && point.x > 380 && point.x < 422
					? [point.x]
					: [],
			);
	});
	expect(verticals[0]).toHaveLength(1);
	expect(verticals[1]).toEqual(verticals[0]!);
});
