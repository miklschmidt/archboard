// One synthetic board read with and without its comparison, and what the
// two drawings must share, for the owners of the comparison toggle.

import { expect } from "bun:test";

import { renderBoard } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { SemanticBoardSchema, SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";
import type { DrawnBoard, LayoutEngineName } from "@archboard/board/render-reply";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/**
 * A board whose draft lacks what its current variant has, drawn with its
 * comparison and without, in one engine and one view.
 * @param current The current variant's content.
 * @param draft The draft's content.
 * @param how The engine, and the view when it is one.
 * @param how.layout The engine.
 * @param how.view The view's grammar and scope, when the drawing is of one.
 * @returns Both drawings.
 */
async function bothModes(
	current: unknown,
	draft: unknown,
	how: { layout?: LayoutEngineName; view?: { grammar: string; scope?: unknown } },
): Promise<{ compared: DrawnBoard; plain: DrawnBoard }> {
	const board = SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "board",
		name: "Removals",
		level: "system",
		version: 1,
		createdAt: "2026-09-27T00:00:00.000Z",
		updatedAt: "2026-09-27T00:00:00.000Z",
		current: "current",
		views: how.view === undefined ? [] : [{ id: "view", name: "View", ...how.view }],
		variants: [
			{ id: "current", name: "Current", lifecycle: "current", content: orderedFixture(current) },
			{
				id: "draft",
				name: "Draft",
				lifecycle: "draft",
				parent: "current",
				content: orderedFixture(draft),
			},
		],
	});
	const ask = { variant: "draft", layout: how.layout } as const;
	const view = how.view === undefined ? {} : { view: "view" };
	const [compared, plain] = await Promise.all([
		renderBoard(board, { ...ask, ...view }, DEFAULT_SEMANTIC_POLICY),
		renderBoard(board, { ...ask, ...view, comparison: false }, DEFAULT_SEMANTIC_POLICY),
	]);
	if (!compared.ok || !plain.ok || !("svg" in compared.reply) || !("svg" in plain.reply)) {
		throw new Error("Expected two drawn proposals");
	}
	return { compared: compared.reply, plain: plain.reply };
}

/**
 * Every subject of the drawing without its comparison stands where it stands
 * with it, and nothing that stands removed is drawn or can be picked.
 * @param drawings Both drawings.
 * @param drawings.compared The drawing with its comparison.
 * @param drawings.plain The drawing without it.
 * @param removed The ids that stand removed.
 */
function expectSamePlaces(
	{ compared, plain }: { compared: DrawnBoard; plain: DrawnBoard },
	removed: readonly string[],
): void {
	for (const kind of ["nodes", "edges", "regions"] as const) {
		const kept = Object.fromEntries(
			Object.keys(plain.atlas[kind]).map((id) => [id, compared.atlas[kind][id]!]),
		);
		expect(plain.atlas[kind]).toEqual(kept);
		for (const id of removed) expect(plain.atlas[kind][id]).toBeUndefined();
	}
	for (const id of removed) {
		expect(compared.svg).toContain(`data-semantic-id="${id}"`);
		expect(plain.svg).not.toContain(`data-semantic-id="${id}"`);
	}
	expect(plain.width).toBe(compared.width);
	expect(plain.height).toBe(compared.height);
}

export { bothModes, expectSamePlaces };
