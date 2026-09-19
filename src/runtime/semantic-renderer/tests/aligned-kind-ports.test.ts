import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";

const loaded = AvoidLib.load();

test("overlapping cards share a straight, balanced attachment despite different relationship kinds", async () => {
	const viz = await instance();
	const placed = Object.assign(viz, {
		renderJSON: () => ({
			bb: "0,0,600,320",
			objects: [
				{ name: "consumer", pos: "100,40" },
				{ name: "api", pos: "140,240" },
				{ name: "data", pos: "500,240" },
			],
		}),
	});
	await loaded;
	const solve = createLayoutEngine(placed, AvoidLib.getInstance());
	const graph: ElkNode = {
		id: "root",
		children: ["consumer", "api", "data"].map((id) => ({ id, width: 200, height: 80 })),
		edges: [
			{
				id: "request",
				sources: ["consumer"],
				targets: ["api"],
				layoutOptions: { "archboard.relationship.kind": "call" },
			},
			{
				id: "query",
				sources: ["api"],
				targets: ["data"],
				layoutOptions: { "archboard.relationship.kind": "data" },
			},
		],
	};
	for (const edges of [graph.edges!, graph.edges!.toReversed()]) {
		const result = solve({ ...graph, edges }, {});
		const route = result.edges!.find((edge) => edge.id === "request")!.sections![0]!;
		expect(route.startPoint.x).toBe(route.endPoint.x);
		expect(route.bendPoints ?? []).toHaveLength(0);
		const source = result.children!.find((node) => node.id === "consumer")!;
		const target = result.children!.find((node) => node.id === "api")!;
		const centers = [source, target].map((node) => node.x! + node.width! / 2);
		expect(route.startPoint.x).toBeCloseTo((centers[0]! + centers[1]!) / 2, 6);
	}
});
