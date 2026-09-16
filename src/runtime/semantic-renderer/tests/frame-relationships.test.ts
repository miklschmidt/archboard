// A relationship between a frame and a card outside it, drawn in a proposal
// whose cards are pinned where its predecessor put them. A fixed face on the
// frame used to crash the engine's layering there (TASK-237,
// `nodeOrder[l][0].layer`); the engine attaches such a relationship itself.

import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { routesThroughCards } from "@/runtime/semantic-renderer/tests/drawn-ink";

const BASE = {
	nodes: [
		{ id: "server", name: "Canvas server", kind: "service" },
		{ id: "store", name: "Board store", kind: "module", parent: "server" },
		{ id: "render", name: "Renderer", kind: "module", parent: "server" },
		{ id: "vault", name: "Vault", kind: "datastore" },
		{ id: "pane", name: "Pane", kind: "ui" },
	],
	edges: [
		{ id: "e1", from: "store", to: "vault", kind: "data" },
		{ id: "e2", from: "pane", to: "server", kind: "call" },
		{ id: "e3", from: "render", to: "store", kind: "call" },
	],
};

test.each([
	["from the frame back to a card", { id: "e5", from: "server", to: "pane", kind: "data" }],
	["from a card back to the frame", { id: "e4", from: "vault", to: "server", kind: "data" }],
])("a proposal draws a relationship %s", async (_, relationship) => {
	const before = VariantContentSchema.parse({
		...BASE,
		edges: [...BASE.edges, relationship],
	});
	const content = VariantContentSchema.parse({
		nodes: [...before.nodes, { id: "extra", name: "Another card", kind: "module" }],
		edges: [...before.edges, { id: "e9", from: "pane", to: "extra", kind: "call" }],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	expect(Object.keys(drawing.atlas.edges)).toContain(relationship.id);
	expect(routesThroughCards(drawing, content)).toEqual([]);
});
