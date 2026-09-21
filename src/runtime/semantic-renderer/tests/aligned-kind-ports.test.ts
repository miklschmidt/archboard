import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { routeGraph } from "@/transformers/semantic-renderer/layout";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";

const loaded = AvoidLib.load();

test("an unused incoming face does not force a labeled outgoing channel to detour", async () => {
	const viz = await instance();
	const placed = Object.assign(viz, {
		renderJSON: () => ({
			bb: "0,0,600,320",
			objects: [
				{ name: "client", pos: "50,40" },
				{ name: "source", pos: "300,40" },
				{ name: "target", pos: "350,240" },
				{ name: "label_issue", pos: "350,140" },
			],
		}),
	});
	await loaded;
	const solve = createLayoutEngine(placed, AvoidLib.getInstance());
	// The request arrives from the left. Its unused south-face seed used to
	// displace the outgoing channel from the label's otherwise clear center.
	const graph: ElkNode = {
		id: "root",
		children: ["client", "source", "target"].map((id) => ({
			id,
			width: id === "client" ? 100 : 200,
			height: 80,
		})),
		edges: [
			{
				id: "request",
				sources: ["client"],
				targets: ["source"],
				layoutOptions: { "archboard.relationship.kind": "http" },
			},
			{
				id: "issue",
				sources: ["source"],
				targets: ["target"],
				layoutOptions: { "archboard.relationship.kind": "call", "archboard.route-label": "true" },
				labels: [{ id: "label_issue", width: 80, height: 30 }],
			},
		],
	};
	const result = solve(graph, {});
	const issue = result.edges!.find((edge) => edge.id === "issue")!;
	const section = issue.sections![0]!;
	const label = issue.labels![0]!;
	expect(section.startPoint.x).toBeCloseTo(label.x! + label.width! / 2, 6);
	expect(section.endPoint.x).toBeCloseTo(section.startPoint.x, 6);
	expect(section.bendPoints ?? []).toHaveLength(0);
	const request = result.edges!.find((edge) => edge.id === "request")!.sections![0]!;
	const source = result.children!.find((node) => node.id === "source")!;
	expect(request.endPoint.x).toBe(source.x!);
	expect(request.bendPoints ?? []).toHaveLength(0);
});

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

test("a clear native vertical run reaches the target top without a second horizontal detour", async () => {
	await loaded;
	const graph: ElkNode = {
		id: "root",
		width: 1000,
		height: 850,
		children: [
			{ id: "source", x: 572, y: 24, width: 340, height: 88 },
			{ id: "block", x: 537, y: 242, width: 340, height: 105 },
			{ id: "target", x: 273, y: 697, width: 340, height: 105 },
		],
		edges: [
			{
				id: "route",
				sources: ["source"],
				targets: ["target"],
				labels: [{ id: "label_route", x: 477, y: 158, width: 80, height: 31 }],
				layoutOptions: { "archboard.relationship.kind": "data", "archboard.route-label": "true" },
			},
		],
	};
	const result = routeGraph(AvoidLib.getInstance() as AvoidEngine, graph);
	const edge = result.edges![0]!;
	const section = edge.sections![0]!;
	const label = edge.labels![0]!;
	// The obstacle requires the first turn; the clear run through the label
	// can then continue directly to the target's top face.
	expect(section.bendPoints).toHaveLength(1);
	expect(section.endPoint.x).toBeCloseTo(label.x! + label.width! / 2, 6);
	expect(section.endPoint.y).toBe(graph.children![2]!.y!);
	expect(section.bendPoints![0]!.x).toBe(section.endPoint.x);
});
