import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { routePoints, routeCrosses } from "@/runtime/semantic-renderer/tests/drawn-routes";

test("an added forward skip leaves the left side and enters the target top", async () => {
	const pairs = [
		["root", "source"],
		["root", "other"],
		["source", "middle"],
		["middle", "target"],
		["other", "extra"],
		["extra", "target"],
	];
	const before = VariantContentSchema.parse({
		nodes: [...new Set(pairs.flat())].map((id) => ({ id, name: id, kind: "module" })),
		edges: pairs.map(([from, to], index) => ({ id: "e" + index, from, to, kind: "call" })),
	});
	const content = VariantContentSchema.parse({
		...before,
		edges: [
			...before.edges,
			{ id: "skip", from: "source", to: "target", kind: "data", label: "complete drawing" },
		],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const points = routePoints(drawing.svg).get("skip")!;
	const source = drawing.atlas.nodes["source"]!;
	const target = drawing.atlas.nodes["target"]!;
	expect(points[0]!.x).toBe(source.x);
	expect(points[1]!.x).toBeLessThan(source.x);
	expect(points.at(-1)!.y).toBe(target.y);
	expect(points.at(-1)!.x).toBeGreaterThan(target.x);
	expect(points.at(-1)!.x).toBeLessThan(target.x + target.width);
	expect(routeCrosses(points, drawing.atlas.nodes["middle"]!)).toBe(false);
});
