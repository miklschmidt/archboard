import { test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";

// A line into a parent itself comes down into its header. Laying out the
// parent folded into columns asked where that header stood before it was
// placed, and the core trapped (Renderer layout's Responsibilities, drawn
// against TASK-482.07).
test("a parent that a line enters draws when its children could fold into columns", async () => {
	const stages = Array.from({ length: 24 }, (_, index) => ({
		id: `s${index}`,
		name: `Stage ${index + 1}`,
		kind: "module",
		parent: "pipe",
	}));
	const content = orderedFixture({
		nodes: [
			{ id: "caller", name: "Caller", kind: "module" },
			{ id: "pipe", name: "Pipeline", kind: "module" },
			...stages,
		],
		edges: [
			{ id: "uses", from: "caller", to: "pipe", kind: "dependency" },
			...stages.slice(1).map((stage, index) => ({
				id: `e${index}`,
				from: stages[index]!.id,
				to: stage.id,
				kind: "call",
			})),
		],
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		layout: "blocks",
		theme: "light",
	});
	expectDrawingIntact(drawing, content, "blocks");
});
