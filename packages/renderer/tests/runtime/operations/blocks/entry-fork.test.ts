import { expect, test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import type { DiagramBox } from "@archboard/board/render-reply";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { corridorPoints, type DrawnPoint } from "#tests/runtime/support/drawn-routes.ts";
import clearance from "#tests/runtime/support/fixtures/top-port-header-clearance.json";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

/** The first place a route crosses into the parent that holds its target. */
function entryPoint(points: readonly DrawnPoint[], frame: DiagramBox): DrawnPoint {
	const inside = (point: DrawnPoint) =>
		point.x >= frame.x - 0.5 &&
		point.x <= frame.x + frame.width + 0.5 &&
		point.y >= frame.y - 0.5 &&
		point.y <= frame.y + frame.height + 0.5;
	for (let i = 1; i < points.length; i += 1) {
		const a = points[i - 1]!,
			b = points[i]!;
		if (inside(a) || !inside(b)) continue;
		const starts = (["x", "y"] as const).flatMap((axis) => {
			const step = b[axis] - a[axis];
			if (step === 0) return [];
			const size = axis === "x" ? frame.width : frame.height;
			return [Math.min((frame[axis] - a[axis]) / step, (frame[axis] + size - a[axis]) / step)];
		});
		const t = Math.max(0, ...starts);
		return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
	}
	throw new Error("The route does not enter its target parent.");
}

test.each([
	["independent entry work", false, undefined, false],
	["labels before the fork", true, undefined, false],
	["calls within the entry work", false, "a", false],
	["a later destination from other work", false, "c", false],
	["mixed traffic into the parent", false, undefined, true],
] as const)("a shared entry preserves %s", async (_name, header, internal, mixed) => {
	const content = orderedFixture({
		nodes: [
			{ id: "source", name: "Source work", kind: "module" },
			{ id: "worker", name: "Worker", kind: "function", parent: "source" },
			{ id: "target", name: "Target work", kind: "module" },
			{ id: "a", name: "First destination", kind: "function", parent: "target" },
			{ id: "b", name: "Second destination", kind: "function", parent: "target" },
			{ id: "c", name: "Other work", kind: "function", parent: "target" },
		],
		edges: [
			{
				id: "first",
				from: header ? "source" : "worker",
				to: "a",
				kind: "call",
				label: "first contract",
			},
			{
				id: "second",
				from: header ? "source" : "worker",
				to: "b",
				kind: "call",
				label: "second contract",
			},
		],
	});
	if (internal !== undefined)
		content.edges.push({ id: "internal", order: 3000, from: internal, to: "b", kind: "call" });
	if (mixed)
		content.edges.push({ id: "other", order: 4000, from: "worker", to: "c", kind: "dependency" });
	const drawing = await renderArchitecture({
		content,
		policy: DEFAULT_SEMANTIC_POLICY,
		theme: "light",
		layout: "blocks",
	});
	expectDrawingIntact(drawing, content, "blocks");
	const routes = corridorPoints(drawing.svg),
		frame = drawing.atlas.nodes["target"]!;
	const a = entryPoint(routes.get("first")!, frame),
		b = entryPoint(routes.get("second")!, frame);
	const separation = Math.hypot(a.x - b.x, a.y - b.y);
	if (header || internal === "c" || mixed) expect(separation).toBeGreaterThan(1);
	else expect(separation).toBeLessThan(1);
});

// Reduced from Archboard server. A top port inside the router's header
// clearance made the free-port fallback route through that header.
test("settled top ports keep the header clear at the router clearance", async () => {
	const content = orderedFixture(clearance);
	const drawing = await renderArchitecture({
		content,
		policy: DEFAULT_SEMANTIC_POLICY,
		theme: "light",
		layout: "blocks",
	});
	expectDrawingIntact(drawing, content, "blocks");
});
