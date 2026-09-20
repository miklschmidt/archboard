import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { AvoidLib } from "libavoid-js";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import { routeGraph } from "@/transformers/semantic-renderer/layout";
import { routeCrosses } from "@/runtime/semantic-renderer/tests/drawn-routes";

const ready = AvoidLib.load();

test("an outside relationship avoids a frame while a connection to its child enters", async () => {
	await ready;
	const graph: ElkNode = {
		id: "root",
		children: [
			{ id: "source", x: 0, y: 200, width: 100, height: 60 },
			{
				id: "frame",
				x: 150,
				y: 100,
				width: 200,
				height: 300,
				layoutOptions: { "archboard.header.size": "40" },
				children: [{ id: "child", x: 200, y: 320, width: 100, height: 60 }],
			},
			{ id: "target", x: 400, y: 200, width: 100, height: 60 },
		],
		edges: [
			{ id: "external", sources: ["source"], targets: ["target"] },
			{ id: "related", sources: ["source"], targets: ["child"] },
		],
	};
	const routed = routeGraph(AvoidLib.getInstance() as AvoidEngine, graph);
	const points = (id: string) => {
		const section = routed.edges!.find((edge) => edge.id === id)!.sections![0]!;
		return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
	};
	const interior = { x: 151, y: 101, width: 198, height: 298 };
	expect(routeCrosses(points("external"), interior)).toBe(false);
	expect(routeCrosses(points("related"), interior)).toBe(true);
});
