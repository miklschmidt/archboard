import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { LayoutEngineSchema } from "@/shared/semantic-board/index";
import { routesThroughCards } from "@/runtime/semantic-renderer/tests/drawn-ink";

const BASE = {
	nodes: [
		{ id: "server", name: "Archboard server", kind: "service" },
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

const RELATIONSHIPS = [
	["from the frame back to a card", { id: "e5", from: "server", to: "pane", kind: "data" }],
	["from a card back to the frame", { id: "e4", from: "vault", to: "server", kind: "data" }],
] as const;

test.each(
	LayoutEngineSchema.options.flatMap((layout) =>
		RELATIONSHIPS.map(([name, relationship]) => [name, layout, relationship] as const),
	),
)("a frame draws a relationship %s (%s)", async (_, layout, relationship) => {
	const before = orderedFixture({
		...BASE,
		edges: [...BASE.edges, relationship],
	});
	const content = orderedFixture({
		nodes: [...before.nodes, { id: "extra", name: "Another card", kind: "module" }],
		edges: [...before.edges, { id: "e9", from: "pane", to: "extra", kind: "call" }],
	});
	const drawing = await renderArchitecture({ content, theme: "light", layout });
	expect(Object.keys(drawing.atlas.edges)).toContain(relationship.id);
	expect(routesThroughCards(drawing, content)).toEqual([]);
});
