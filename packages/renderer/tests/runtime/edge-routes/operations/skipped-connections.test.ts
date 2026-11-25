import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { routePoints, routeCrosses } from "#tests/runtime/support/drawn-routes.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { defaultSemanticPolicy } from "@archboard/model/policy";

test("a proposal skip clears its chain and retains its label", async () => {
	const pairs = [
		["root", "source"],
		["root", "other"],
		["source", "middle"],
		["middle", "target"],
		["other", "extra"],
		["extra", "target"],
	];
	const before = orderedFixture({
		nodes: [...new Set(pairs.flat())].map((id) => ({ id, name: id, kind: "module" })),
		edges: pairs.map(([from, to], index) => ({ id: "e" + index, from, to, kind: "call" })),
	});
	const content = orderedFixture({
		...before,
		edges: [
			...before.edges,
			{ id: "skip", from: "source", to: "target", kind: "data", label: "complete drawing" },
		],
	});
	const drawing = await renderArchitecture({
		policy: defaultSemanticPolicy(),
		content,
		theme: "light",
	});

	const points = routePoints(drawing.svg).get("skip")!;
	expectDrawingIntact(drawing, content);
	for (const [id, card] of Object.entries(drawing.atlas.nodes)) {
		if (id === "source" || id === "target") continue;
		expect(routeCrosses(points, card), `the skip through ${id}`).toBe(false);
	}
});
