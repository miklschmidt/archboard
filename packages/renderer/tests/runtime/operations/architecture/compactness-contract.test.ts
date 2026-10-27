import { expect, test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { renderArchitecture, renderSemanticView } from "#runtime/operations/render.ts";
import { compactnessOf } from "#tests/runtime/support/drawn-compactness.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

test("corpus route measures include drawn sequence messages and self loops", async () => {
	const steps = [
		{ id: "call", from: "client", to: "server", label: "request", kind: "sync" },
		{ id: "work", from: "server", to: "server", label: "work", kind: "self" },
		{ id: "reply", from: "server", to: "client", label: "answer", kind: "return" },
	];
	const content = orderedFixture({
		nodes: ["client", "server"].map((id) => ({ id, name: id, kind: "service" })),
		flows: [{ id: "flow", name: "Request", participants: ["client", "server"], steps }],
	});
	const drawing = await renderSemanticView({
		content,
		policy: DEFAULT_SEMANTIC_POLICY,
		grammar: "sequence",
		theme: "light",
	});
	const measured = compactnessOf(drawing.svg, drawing.width, drawing.height);
	expect(measured.routes.map(({ id }) => id).toSorted()).toEqual(
		steps.map(({ id }) => id).toSorted(),
	);
	for (const route of measured.routes) {
		expect(route.length, route.id).toBeGreaterThan(0);
		expect(route.detour, route.id).toBeGreaterThanOrEqual(0);
	}
	expect(measured.routes.find(({ id }) => id === "work")!.detour).toBeGreaterThan(0);
	expect(measured.routes.find(({ id }) => id === "call")!.detour).toBe(0);
});

test("corpus route measures include relationships whose policy has no arrowhead", async () => {
	const content = orderedFixture({
		nodes: ["source", "target"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [{ id: "line", from: "source", to: "target", kind: "call" }],
	});
	const drawing = await renderArchitecture({
		content,
		policy: {
			...DEFAULT_SEMANTIC_POLICY,
			relationshipKinds: { call: { name: "Call", dash: "solid", arrowhead: "none" } },
		},
		theme: "light",
	});
	const measured = compactnessOf(drawing.svg, drawing.width, drawing.height);
	expect(measured.routes.map(({ id }) => id)).toEqual(["line"]);
	expect(measured.routes[0]!.length).toBeGreaterThan(0);
});
