import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	across,
	breadth,
	faceOf,
	readingOf,
} from "@/runtime/semantic-renderer/tests/drawn-reading";
import { routePoints, routeCrosses } from "@/runtime/semantic-renderer/tests/drawn-routes";

test("an added forward skip leaves the flank beside its chain and enters the target from behind", async () => {
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
	const direction = readingOf(drawing);
	const points = routePoints(drawing.svg).get("skip")!;
	const source = drawing.atlas.nodes["source"]!;
	const target = drawing.atlas.nodes["target"]!;
	expect(faceOf(points[0]!, source, direction)).toBe("beside");
	expect(across(points[1]!, direction)).toBeLessThan(across(source, direction));
	expect(faceOf(points.at(-1)!, target, direction)).toBe("behind");
	expect(across(points.at(-1)!, direction)).toBeGreaterThan(across(target, direction));
	expect(across(points.at(-1)!, direction)).toBeLessThan(
		across(target, direction) + breadth(target, direction),
	);
	expect(routeCrosses(points, drawing.atlas.nodes["middle"]!)).toBe(false);
});
