import { test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import clearance from "#tests/runtime/support/fixtures/top-port-header-clearance.json";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

test.each([
	["independent entry work", false, undefined, false],
	["labels before the fork", true, undefined, false],
	["calls within the entry work", false, "a", false],
	["a later destination from other work", false, "c", false],
	["mixed traffic into the parent", false, undefined, true],
] as const)("entry routes preserve %s", async (_name, header, internal, mixed) => {
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
		content.edges.push({
			id: "internal",
			order: 3000,
			from: internal,
			to: "b",
			kind: "call",
			emphasis: "normal",
		});
	if (mixed)
		content.edges.push({
			id: "other",
			order: 4000,
			from: "worker",
			to: "c",
			kind: "dependency",
			emphasis: "normal",
		});
	const drawing = await renderArchitecture({
		content,
		policy: DEFAULT_SEMANTIC_POLICY,
		theme: "light",
		layout: "blocks",
	});
	expectDrawingIntact(drawing, content, "blocks");
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
