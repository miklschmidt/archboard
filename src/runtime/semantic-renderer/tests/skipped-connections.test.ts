import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { across, along, breadth, depth } from "@/runtime/semantic-renderer/tests/drawn-reading";
import { routePoints, routeCrosses } from "@/runtime/semantic-renderer/tests/drawn-routes";

test("a skip a proposal adds beside its own chain is still drawn beside that chain", async () => {
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
	const drawing = await renderArchitecture({ content, theme: "light" });

	const points = routePoints(drawing.svg).get("skip")!;
	// The card it skips stays on one side of it: the skip runs beside that
	// card rather than weaving through the chain, and it crosses no card.
	const middle = drawing.atlas.nodes["middle"]!;
	const top = along(middle),
		bottom = top + depth(middle);
	// The lanes the skip runs in while it is level with the card it skips.
	const passing = points.slice(1).flatMap((end, index) => {
		const start = points[index]!;
		const alongReading = across(start) === across(end);
		const low = Math.min(along(start), along(end));
		const high = Math.max(along(start), along(end));
		return alongReading && low < bottom && high > top ? [across(start)] : [];
	});
	expect(passing.length, "the skip passes the card it skips").toBeGreaterThan(0);
	const lane = across(middle);
	const beside = passing.every((at) => at <= lane);
	const opposite = passing.every((at) => at >= lane + breadth(middle));
	expect(beside || opposite, "the skip keeps to one side of the card it skips").toBe(true);
	for (const [id, card] of Object.entries(drawing.atlas.nodes)) {
		if (id === "source" || id === "target") continue;
		expect(routeCrosses(points, card), `the skip through ${id}`).toBe(false);
	}
});
