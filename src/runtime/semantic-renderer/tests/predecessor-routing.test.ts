import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";

test("inherited return lanes and new branch labels stay beside their endpoints", async () => {
	const before = VariantContentSchema.parse({
		nodes: ["a", "b", "c", "d"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "ab", from: "a", to: "b", label: "first", kind: "call" },
			{ id: "bc", from: "b", to: "c", label: "second", kind: "call" },
			{ id: "cd", from: "c", to: "d", label: "third", kind: "call" },
			{ id: "back", from: "d", to: "a", label: "return result", kind: "call" },
		],
	});
	const content = VariantContentSchema.parse({
		...before,
		nodes: [
			...before.nodes,
			{ id: "new", name: "New stage", kind: "module" },
			{ id: "next", name: "Next stage", kind: "module" },
		],
		edges: [
			...before.edges,
			{ id: "branch", from: "b", to: "new", label: "branch", kind: "call" },
			{ id: "nextstep", from: "new", to: "next", label: "prepare and wrap", kind: "call" },
		],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const routes = routePoints(drawing.svg);
	const source = drawing.atlas.nodes["new"]!,
		target = drawing.atlas.nodes["next"]!;
	const minimum = Math.min(source.x, target.x),
		maximum = Math.max(source.x + source.width, target.x + target.width);
	for (const point of routes.get("nextstep")!) {
		expect(point.x).toBeGreaterThanOrEqual(minimum);
		expect(point.x).toBeLessThanOrEqual(maximum);
	}
	const first = drawing.atlas.nodes["a"]!,
		last = drawing.atlas.nodes["d"]!;
	for (const point of routes.get("back")!)
		expect(point.x).toBeGreaterThanOrEqual(Math.min(first.x + first.width, last.x + last.width));
});
