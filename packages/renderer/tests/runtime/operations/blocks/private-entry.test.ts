import { expect, test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { corridorPoints } from "#tests/runtime/support/drawn-routes.ts";
import fixture from "#tests/runtime/support/fixtures/private-entry-parent.json";

// A root label outside an inline parent fell below the entire parent before
// returning to its target. Its exclusive caller can enter a local hierarchy.
test("an exclusive caller enters a closed hierarchy without a full-height return", async () => {
	const content = orderedFixture(fixture);
	const drawing = await renderArchitecture({
		content,
		policy: DEFAULT_SEMANTIC_POLICY,
		theme: "light",
		layout: "track",
	});
	expectDrawingIntact(drawing, content, "track");
	const routes = corridorPoints(drawing.svg);
	for (const edge of content.edges) {
		const points = routes.get(edge.id)!;
		const target = drawing.atlas.nodes[edge.to]!;
		expect(Math.max(...points.map(({ y }) => y)), edge.id).toBeLessThanOrEqual(
			target.y + target.height,
		);
	}
});

test("a private caller preserves the entry row inside nested work", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "client", name: "Client", kind: "service" },
			{ id: "scope", name: "Scope", kind: "module" },
			{ id: "service", name: "Service", kind: "service", parent: "scope" },
			{ id: "api", name: "API", kind: "module", parent: "service" },
			{ id: "job", name: "Scheduler", kind: "module", parent: "service" },
			{ id: "core", name: "Core", kind: "module", parent: "service" },
		],
		edges: [
			{ id: "call", from: "client", to: "api", kind: "call", label: "requests" },
			{ id: "use", from: "api", to: "core", kind: "call" },
			{ id: "tick", from: "job", to: "core", kind: "call" },
		],
	});
	const drawing = await renderArchitecture({
		content,
		policy: DEFAULT_SEMANTIC_POLICY,
		theme: "light",
		layout: "track",
	});
	expectDrawingIntact(drawing, content, "track");
	const { api, job, core } = drawing.atlas.nodes;
	expect(job!.y).toBeGreaterThanOrEqual(api!.y + api!.height);
	expect(core!.y).toBeGreaterThanOrEqual(api!.y + api!.height);
});
