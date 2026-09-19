import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";
import { overdrawnRun } from "@/runtime/semantic-renderer/tests/drawn-ink";
import { routeLabels, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import publicApi from "../../../../docs/design/wide-board-layout-fixtures/public-api-independent.content.json";

const loaded = AvoidLib.load();

/** The gateway lanes that reproduce the live comparison's shared channels. */
const CHANNEL_EDGE_IDS = [
	"NHlWy1Yw",
	"fXPVXdiF",
	"2L2brMps",
	"SlxZ7y45",
	"kJaF9nLs",
	"HOKDAQTU",
] as const;

const channelContent = (() => {
	const complete = VariantContentSchema.parse(publicApi);
	const edges = complete.edges.filter((edge) =>
		CHANNEL_EDGE_IDS.includes(edge.id as (typeof CHANNEL_EDGE_IDS)[number]),
	);
	const ids = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
	for (const node of complete.nodes) {
		if (node.parent !== undefined && ids.has(node.id)) ids.add(node.parent);
	}
	return VariantContentSchema.parse({
		nodes: complete.nodes.filter((node) => ids.has(node.id)),
		edges,
	});
})();

const OUTGOING_CHANNELS = ["kJaF9nLs", "HOKDAQTU"] as const;

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

test("opposing same-kind channels do not share an overdrawn run", async () => {
	const plain = await renderArchitecture({ content: channelContent, theme: "dark" });
	// These two routes leave the same gateway in the same direction, so their
	// existing shared-trunk behavior remains intact without a comparison mark.
	expect(overdrawnRun(plain, OUTGOING_CHANNELS)).toBeGreaterThan(0);
	// Each pair below uses the same HTTP kind but arrives at the gateway where
	// the other route leaves it. Their local direction is therefore different.
	for (const pair of [
		["NHlWy1Yw", "kJaF9nLs"],
		["NHlWy1Yw", "HOKDAQTU"],
		["fXPVXdiF", "2L2brMps"],
	] as const) {
		expect(overdrawnRun(plain, pair), pair.join(" / ")).toBe(0);
	}
	expect(routePoints(plain.svg).size).toBe(channelContent.edges.length);
	expect(routeLabels(plain.svg).size).toBe(channelContent.edges.length);
});

for (const [left, right] of [
	["added", "changed"],
	["added", "removed"],
	["added", "unchanged"],
	["changed", "removed"],
	["changed", "unchanged"],
	["removed", "unchanged"],
] as const) {
	test(`different comparison standings use distinct same-kind channels (${left}/${right})`, async () => {
		const drawing = await renderArchitecture({
			content: channelContent,
			theme: "dark",
			standing: { [OUTGOING_CHANNELS[0]]: left, [OUTGOING_CHANNELS[1]]: right },
		});
		expect(overdrawnRun(drawing, OUTGOING_CHANNELS), `${left}/${right}`).toBe(0);
		expect(routePoints(drawing.svg).size).toBe(channelContent.edges.length);
		expect(routeLabels(drawing.svg).size).toBe(channelContent.edges.length);
	});
}
