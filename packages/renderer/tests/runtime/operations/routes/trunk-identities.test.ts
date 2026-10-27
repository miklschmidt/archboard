import { expect, test } from "bun:test";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { ambiguousTrunks } from "#tests/runtime/support/drawn-ink.ts";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import fanout from "#tests/runtime/support/fixtures/mixed-kind-parent-fanout.json";

// Reduced from Voice coordinator: Tab sessions reaches Coordinator tools and
// Coordinator turn homes along one horizontal stroke, with different kinds.
test("a common source does not excuse shared ink with different relationship kinds", () => {
	const content = orderedFixture({
		nodes: ["source", "tools", "homes"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "event", from: "source", to: "tools", kind: "event" },
			{ id: "call", from: "source", to: "homes", kind: "call" },
		],
	});
	const drawing = {
		svg: `<svg><g data-semantic-kind="edge" data-semantic-id="event"><path d="M0,0 L100,0 L100,100" marker-end="url(#head)"/></g><g data-semantic-kind="edge" data-semantic-id="call"><path d="M0,0 L150,0 L150,100" marker-end="url(#head)"/></g></svg>`,
	};
	expect(ambiguousTrunks(drawing, content)).toEqual(["call / event"]);
	content.edges[1]!.kind = "event";
	expect(ambiguousTrunks(drawing, content)).toEqual([]);
});

test("Blocks keeps different kinds distinct from a caller to two parent members", async () => {
	const content = orderedFixture(fanout);
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "blocks",
	});
	expect(ambiguousTrunks(drawing, content)).toEqual([]);
});
