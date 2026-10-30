import { expect, test } from "bun:test";
import { renderBoard } from "#runtime/operations/render.ts";
import { SemanticBoardSchema, SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

/** A board of unrelated drafts (so none is drawn against another), whose views name parts only `base` holds; `bare` holds nothing. */
const BOARD = SemanticBoardSchema.parse({
	schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
	kind: "semantic-board",
	id: "board",
	name: "Gateway",
	level: "system",
	version: 1,
	createdAt: "2026-10-16T00:00:00.000Z",
	updatedAt: "2026-10-16T00:00:00.000Z",
	views: [
		{
			id: "intake",
			name: "Intake",
			grammar: "architecture",
			scope: { kind: "selection", nodes: ["api"] },
		},
		{
			id: "exchange",
			name: "Exchange",
			grammar: "sequence",
			scope: { kind: "selection", flows: ["ingest"] },
		},
	],
	variants: [
		{
			id: "base",
			name: "Base",
			lifecycle: "draft",
			content: orderedFixture({
				nodes: [
					{ id: "api", name: "Intake API", kind: "service" },
					{ id: "queue", name: "Work queue", kind: "module" },
				],
			}),
		},
		{
			id: "other",
			name: "Other",
			lifecycle: "draft",
			content: orderedFixture({ nodes: [{ id: "worker", name: "Worker", kind: "service" }] }),
		},
		{ id: "bare", name: "Bare", lifecycle: "draft", content: orderedFixture({}) },
	],
});

/**
 * Which refusal the render answers with.
 * @param variant The variant to draw.
 * @param view The view to draw it in, or the overview.
 * @returns The code the empty answer carries, or nothing when a picture was drawn.
 */
async function emptyCode(variant: string, view?: string): Promise<string | undefined> {
	const outcome = await renderBoard(
		BOARD,
		{ theme: "light", variant, view },
		DEFAULT_SEMANTIC_POLICY,
	);
	if (!outcome.ok) throw new Error(outcome.error);
	return "empty" in outcome.reply ? outcome.reply.empty : undefined;
}

test("a view that names nothing the variant holds draws nothing, and says so as the view's own refusal", async () => {
	expect(await emptyCode("other", "Intake")).toBe("VIEW_EMPTY_ON_VARIANT");
	expect(await emptyCode("other", "Exchange")).toBe("VIEW_EMPTY_ON_VARIANT");
	expect(await emptyCode("base", "Intake")).toBeUndefined();
});

test("a variant with nothing on it keeps the empty-board refusal, in a view or not", async () => {
	expect(await emptyCode("bare")).toBe("NOTHING_TO_RENDER");
	expect(await emptyCode("bare", "Intake")).toBe("NOTHING_TO_RENDER");
});
