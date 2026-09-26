// A card face is taken away from a relationship channel when a route's
// approach through it is too cramped to round. A jog narrower than a stroke
// is straightened when the route is drawn, so it must not cost a face: the
// channel then detours round its card for every relationship in it.
import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { EndpointOptions } from "@/runtime/semantic-renderer/layout";

test("a jog narrower than a stroke never takes a face away", () => {
	const nodes = new Map<string, ElkNode>([
		["source", { id: "source", x: -100, y: -60, width: 200, height: 60 }],
		["target", { id: "target", x: 100, y: 270, width: 200, height: 60 }],
	]);
	const options = new EndpointOptions();
	// Down from the source, a 1-unit step sideways, down, then into the
	// target's west face.
	const rejected = options.reject(
		[
			{
				id: "call",
				sources: ["source"],
				targets: ["target"],
				sections: [
					{
						id: "call:route",
						startPoint: { x: 0, y: 0 },
						bendPoints: [
							{ x: 0, y: 50 },
							{ x: 1, y: 50 },
							{ x: 1, y: 300 },
						],
						endPoint: { x: 100, y: 300 },
					},
				],
			},
		],
		nodes,
	);
	expect(rejected).toBe(false);
});
