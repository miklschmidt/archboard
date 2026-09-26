// A line from a card up and off to the side dropped down the gutter beside its
// target, past the target's top corner, and turned into its side a few points
// below it: the top face's only pin was its channel's seed, far along the face,
// so the router took the side (Renderer layout's "measure every word", Codex
// session's "decode parameters and answer"). Offered the top face just inside
// the corner it passed, the line enters there with one bend fewer.

import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { AvoidLib } from "libavoid-js";
import { routeGraph } from "@/runtime/semantic-renderer/layout";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";

test("a line passing its target's top corner enters the top instead of hooking into the side", async () => {
	await AvoidLib.load();
	const target = { id: "target", x: 20, y: 232, width: 340, height: 88 };
	const graph: ElkNode = {
		id: "root",
		width: 1200,
		height: 400,
		layoutOptions: { "archboard.route.corner-pins": "true" },
		children: [
			{ id: "source", x: 700, y: 20, width: 340, height: 88 },
			target,
			{ id: "neighbour", x: 402, y: 232, width: 340, height: 88 },
		],
		edges: [
			{
				id: "call",
				sources: ["source"],
				targets: ["target"],
				layoutOptions: { "archboard.relationship.kind": "call" },
			},
		],
	};
	const section = routeGraph(AvoidLib.getInstance() as AvoidEngine, graph).edges![0]!.sections![0]!;
	expect(section.endPoint.y).toBeCloseTo(target.y, 1);
	expect(section.bendPoints).toHaveLength(1);
});
