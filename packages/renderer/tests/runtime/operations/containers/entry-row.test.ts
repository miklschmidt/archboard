// A container's entry points take its first row on the Track engine, and its
// hidden parts sit below them (ADR 0044, TASK-368.08). The interface is read
// off the whole variant, never off what a view or a comparison draws.
import { expect, test } from "bun:test";
import { renderArchitecture, renderBoard } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { SemanticBoardSchema, SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";
import type { DiagramAtlas } from "@archboard/board/render-reply";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

// The scheduler is a hidden part that only calls out: nothing holds it below
// the entry point but the interface, so without it Graphviz stands it on the
// container's first row beside the API.
const service = {
	nodes: [
		{ id: "client", name: "Client", kind: "service" },
		{ id: "svc", name: "Service", kind: "service" },
		{ id: "api", name: "API", kind: "module", parent: "svc" },
		{ id: "job", name: "Scheduler", kind: "module", parent: "svc" },
		{ id: "core", name: "Core", kind: "module", parent: "svc" },
	],
	edges: [
		{ id: "call", from: "client", to: "api", kind: "call", label: "requests" },
		{ id: "use", from: "api", to: "core", kind: "call" },
		{ id: "tick", from: "job", to: "core", kind: "call" },
	],
};

/**
 * Whether one drawn part stands wholly below another.
 * @param atlas The drawing's atlas.
 * @param upper The part above.
 * @param lower The part below.
 * @returns True when the lower part's top is under the upper part's bottom.
 */
function standsBelow(atlas: DiagramAtlas, upper: string, lower: string): boolean {
	const [over, under] = [atlas.nodes[upper]!, atlas.nodes[lower]!];
	return under.y >= over.y + over.height;
}

/**
 * A board whose current variant is the service, with a view and a draft.
 * @param draft The draft's content.
 * @returns The board.
 */
function boardOf(draft: unknown) {
	return SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "board",
		name: "Service",
		level: "system",
		version: 1,
		createdAt: "2026-10-06T00:00:00.000Z",
		updatedAt: "2026-10-06T00:00:00.000Z",
		current: "current",
		views: [
			{
				id: "inside",
				name: "Inside",
				grammar: "architecture",
				scope: { kind: "selection", nodes: ["svc", "api", "job", "core"] },
			},
		],
		variants: [
			{ id: "current", name: "Current", lifecycle: "current", content: orderedFixture(service) },
			{
				id: "draft",
				name: "Draft",
				lifecycle: "draft",
				parent: "current",
				content: orderedFixture(draft),
			},
		],
	});
}

/**
 * The atlas of one rendered board picture.
 * @param board The board.
 * @param choices The variant and view.
 * @param choices.variant The variant.
 * @param choices.view The view, if any.
 * @returns The atlas.
 */
async function atlasOf(
	board: ReturnType<typeof boardOf>,
	choices: { variant: string; view?: string },
): Promise<DiagramAtlas> {
	const outcome = await renderBoard(
		board,
		{ ...choices, theme: "light", layout: "track" },
		DEFAULT_SEMANTIC_POLICY,
	);
	if (!outcome.ok || !("atlas" in outcome.reply)) throw new Error("Expected a drawn picture");
	return outcome.reply.atlas;
}

test("a container's entry point takes its first row and its hidden parts sit below it", async () => {
	const { atlas } = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: orderedFixture(service),
		theme: "light",
		layout: "track",
	});
	expect(standsBelow(atlas, "client", "api")).toBe(true);
	expect(standsBelow(atlas, "api", "job")).toBe(true);
	expect(standsBelow(atlas, "api", "core")).toBe(true);
});

test("an entry point keeps the first row in a view that hides its caller", async () => {
	const atlas = await atlasOf(boardOf(service), { variant: "current", view: "inside" });
	expect(atlas.nodes["client"]).toBeUndefined();
	expect(standsBelow(atlas, "api", "job")).toBe(true);
});

test("a view holds a container's first row only where the whole variant does", async () => {
	// A composition root inside the service calls the API, so on the variant
	// the API stands below its caller and holds no row. A view that hides the
	// root draws no line into the API from inside, and still holds none.
	const rooted = {
		nodes: [
			...service.nodes,
			{ id: "boot", name: "Composition root", kind: "module", parent: "svc" },
		],
		edges: [...service.edges, { id: "wire", from: "boot", to: "api", kind: "call" }],
	};
	const atlas = await atlasOf(boardOf(rooted), { variant: "draft", view: "inside" });
	expect(atlas.nodes["boot"]).toBeUndefined();
	expect(standsBelow(atlas, "api", "job")).toBe(false);
});

test("a child a comparison puts back is never an entry point", async () => {
	// The current variant reaches a webhook in the service from outside; the
	// draft removes it, so its comparison draws the webhook back as removed.
	const current = {
		nodes: [...service.nodes, { id: "hook", name: "Webhook", kind: "module", parent: "svc" }],
		edges: [...service.edges, { id: "notify", from: "client", to: "hook", kind: "call" }],
	};
	const board = boardOf(service);
	const withHook = SemanticBoardSchema.parse({
		...board,
		variants: [{ ...board.variants[0]!, content: orderedFixture(current) }, board.variants[1]!],
	});
	const atlas = await atlasOf(withHook, { variant: "draft", view: "Everything" });
	expect(atlas.nodes["hook"]).toBeDefined();
	expect(standsBelow(atlas, "api", "hook")).toBe(true);
});
