import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";

const loaded = AvoidLib.load();

test("different kinds reach a shared destination through distinct straight channels", async () => {
	const viz = await instance();
	const placed = Object.assign(viz, {
		renderJSON: () => ({
			bb: "0,0,600,320",
			objects: [
				{ name: "left", pos: "170,240" },
				{ name: "right", pos: "430,240" },
				{ name: "destination", pos: "320,40" },
			],
		}),
	});
	await loaded;
	const solve = createLayoutEngine(placed, AvoidLib.getInstance());
	const graph: ElkNode = {
		id: "root",
		children: ["left", "right", "destination"].map((id) => ({ id, width: 260, height: 72 })),
		edges: [
			{
				id: "left-call",
				sources: ["left"],
				targets: ["destination"],
				layoutOptions: { "archboard.relationship.kind": "call" },
			},
			{
				id: "right-data",
				sources: ["right"],
				targets: ["destination"],
				layoutOptions: { "archboard.relationship.kind": "data" },
			},
		],
	};
	for (const edges of [graph.edges!, graph.edges!.toReversed()]) {
		const result = solve({ ...graph, edges }, {});
		const routes = new Map(result.edges!.map((edge) => [edge.id, edge.sections![0]!]));
		for (const id of ["left-call", "right-data"]) {
			const route = routes.get(id)!;
			expect(route.startPoint.x).toBe(route.endPoint.x);
			expect(route.bendPoints ?? []).toHaveLength(0);
		}
		const left = routes.get("left-call")!;
		const right = routes.get("right-data")!;
		const centers = new Map(result.children!.map((node) => [node.id, node.x! + node.width! / 2]));
		expect(left.startPoint.x).toBeCloseTo(
			(centers.get("left")! + centers.get("destination")!) / 2,
			6,
		);
		expect(right.startPoint.x).toBeCloseTo(
			(centers.get("right")! + centers.get("destination")!) / 2,
			6,
		);
		expect(right.startPoint.x - left.startPoint.x).toBeGreaterThanOrEqual(12);
	}
});
