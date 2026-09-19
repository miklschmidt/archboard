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

test("an ordinary source aligns to a fixed external frame arrival in its own channel", async () => {
	const viz = await instance();
	const placed = Object.assign(viz, {
		renderJSON: () => ({
			bb: "0,0,600,440",
			objects: [
				{ name: "before", pos: "500,40" },
				{ name: "source", pos: "100,40" },
				{ name: "frame", pos: "100,340" },
				{ name: "label_arrival", pos: "100,180" },
			],
		}),
	});
	await loaded;
	const solve = createLayoutEngine(placed, AvoidLib.getInstance());
	const graph: ElkNode = {
		id: "root",
		children: [
			{ id: "before", width: 200, height: 80 },
			{ id: "source", width: 200, height: 80 },
			{
				id: "frame",
				width: 200,
				height: 200,
				layoutOptions: { "archboard.header.size": "40" },
				children: [{ id: "child", width: 160, height: 80 }],
			},
		],
		edges: [
			{
				id: "incoming",
				sources: ["before"],
				targets: ["source"],
				layoutOptions: { "archboard.relationship.kind": "call" },
			},
			{
				id: "arrival",
				sources: ["source"],
				targets: ["frame"],
				layoutOptions: { "archboard.relationship.kind": "call", "archboard.route-label": "true" },
				labels: [{ id: "label", width: 80, height: 30 }],
			},
		],
	};
	const result = solve(graph, {});
	const route = result.edges!.find((edge) => edge.id === "arrival")!.sections![0]!;
	expect(route.startPoint.x).toBe(route.endPoint.x);
	expect(route.bendPoints ?? []).toHaveLength(0);
	const frame = result.children!.find((node) => node.id === "frame")!;
	expect(route.endPoint.x).toBe(frame.x! + frame.width! / 2);
	expect(route.endPoint.y).toBe(frame.y!);
});

test("distinct comparison channels align cards and external frame arrivals through their own labels", async () => {
	const viz = await instance();
	const placed = Object.assign(viz, {
		renderJSON: () => ({
			bb: "0,0,1000,600",
			objects: [
				{ name: "first", pos: "300,40" },
				{ name: "second", pos: "700,40" },
				{ name: "frame", pos: "500,450" },
				{ name: "label_added", pos: "330,220" },
				{ name: "label_changed", pos: "670,220" },
			],
		}),
	});
	await loaded;
	const solve = createLayoutEngine(placed, AvoidLib.getInstance());
	const graph: ElkNode = {
		id: "root",
		children: [
			{ id: "first", width: 340, height: 80 },
			{ id: "second", width: 340, height: 80 },
			{
				id: "frame",
				width: 1000,
				height: 200,
				layoutOptions: { "archboard.header.size": "40" },
				children: [{ id: "child", width: 960, height: 80 }],
			},
		],
		edges: ["added", "changed"].map((standing, index) => ({
			id: standing,
			sources: [index === 0 ? "first" : "second"],
			targets: ["frame"],
			layoutOptions: {
				"archboard.relationship.kind": "call",
				"archboard.relationship.standing": standing,
				"archboard.route-label": "true",
			},
			labels: [{ id: `label_${standing}`, width: 80, height: 30 }],
		})),
	};
	for (const edges of [graph.edges!, graph.edges!.toReversed()]) {
		const result = solve({ ...graph, edges }, {});
		const ends = [];
		for (const edge of result.edges!) {
			const section = edge.sections![0]!;
			const label = edge.labels![0]!;
			expect(section.startPoint.x).toBe(label.x! + label.width! / 2);
			expect(section.endPoint.x).toBe(section.startPoint.x);
			expect(section.bendPoints ?? []).toHaveLength(0);
			ends.push(section.endPoint.x);
		}
		expect(Math.abs(ends[0]! - ends[1]!)).toBeGreaterThanOrEqual(12);
	}
});
