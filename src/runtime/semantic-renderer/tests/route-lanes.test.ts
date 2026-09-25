import { expect, test } from "bun:test";
import type { ElkNode, ElkPoint as Point } from "@archboard/elk-rs";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";

const loaded = AvoidLib.load();

/**
 * The Graphviz engine with its placement fixed, so the real router alone decides.
 * @param objects Each card's or reserved label's Graphviz centre.
 * @param bb The Graphviz bounds.
 * @returns The engine.
 */
async function fixedEngine(objects: { name: string; pos: string }[], bb: string) {
	const viz = await instance();
	await loaded;
	return createLayoutEngine(
		Object.assign(viz, { renderJSON: () => ({ bb, objects }) }),
		AvoidLib.getInstance(),
	);
}

/**
 * A routed relationship's corner points.
 * @param graph The routed graph.
 * @param id The relationship.
 * @returns Its points.
 */
function pointsOf(graph: ElkNode, id: string): Point[] {
	const section = graph.edges!.find((edge) => edge.id === id)!.sections![0]!;
	return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
}

/**
 * The vertical runs of a route, as their x and their y span.
 * @param points The route.
 * @returns Its vertical runs.
 */
function verticals(points: readonly Point[]): { x: number; from: number; to: number }[] {
	return points.slice(1).flatMap((point, index) => {
		const previous = points[index]!;
		return Math.abs(point.x - previous.x) < 0.01 && Math.abs(point.y - previous.y) > 0.01
			? [{ x: point.x, from: Math.min(point.y, previous.y), to: Math.max(point.y, previous.y) }]
			: [];
	});
}

/**
 * A measured card.
 * @param id Its identity.
 * @returns The card.
 */
function card(id: string): ElkNode {
	return { id, width: 100, height: 60 };
}

test("two lines sharing an open corridor run a whole lane apart", async () => {
	const solve = await fixedEngine(
		[
			{ name: "west1", pos: "50,330" },
			{ name: "west2", pos: "50,90" },
			{ name: "east1", pos: "550,90" },
			{ name: "east2", pos: "550,330" },
		],
		"0,0,600,360",
	);
	const routed = solve(
		{
			id: "root",
			children: [card("west1"), card("west2"), card("east1"), card("east2")],
			edges: [
				{ id: "down", sources: ["west1"], targets: ["east1"] },
				{ id: "up", sources: ["west2"], targets: ["east2"] },
			],
		},
		{},
	);
	const [one, other] = [verticals(pointsOf(routed, "down")), verticals(pointsOf(routed, "up"))];
	const gaps = one.flatMap((run) =>
		other
			.filter((next) => Math.min(run.to, next.to) - Math.max(run.from, next.from) > 16)
			.map((next) => Math.abs(run.x - next.x)),
	);
	expect(gaps.length).toBeGreaterThan(0);
	for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(16 - 0.01);
});
