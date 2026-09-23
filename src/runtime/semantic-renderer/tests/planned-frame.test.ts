import { expect, test } from "bun:test";
import { renderBoard } from "@/runtime/semantic-renderer/index";
import {
	SemanticBoardSchema,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	type DiagramBox,
} from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";

/**
 * One board holding the same content, built or not.
 * @param built Whether its variant is current.
 * @returns The board.
 */
function boardOf(built: boolean) {
	return SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "board",
		name: "Ingest",
		level: "system",
		version: 1,
		createdAt: "2026-09-23T00:00:00.000Z",
		updatedAt: "2026-09-23T00:00:00.000Z",
		...(built ? { current: "plan" } : {}),
		variants: [
			{
				id: "plan",
				name: "Queued ingest",
				lifecycle: built ? "current" : "draft",
				content: orderedFixture({
					nodes: [
						{ id: "api", name: "Intake API", kind: "service" },
						{ id: "queue", name: "Work queue", kind: "module" },
					],
					edges: [{ id: "put", from: "api", to: "queue", kind: "data", label: "Enqueue" }],
				}),
			},
		],
	});
}

/**
 * Draw a board by its bare name.
 * @param built Whether its variant is current.
 * @returns The drawn reply.
 */
async function drawn(built: boolean) {
	const outcome = await renderBoard(
		boardOf(built),
		{ theme: "light", fonts: "linked" },
		DEFAULT_SEMANTIC_POLICY,
	);
	if (!outcome.ok || !("svg" in outcome.reply)) throw new Error("Expected a drawn board");
	return outcome.reply;
}

/**
 * How far a box moved.
 * @param a Where it was.
 * @param b Where it is.
 * @returns The move, right and down.
 */
function offset(a: DiagramBox, b: DiagramBox): readonly number[] {
	return [b.x - a.x, b.y - a.y];
}

test("a board nothing is built of is framed as planned, its atlas moved with its drawing", async () => {
	const built = await drawn(true);
	const planned = await drawn(false);

	expect(built.svg).not.toContain('data-slot="planned-frame"');
	expect(planned.svg).toContain('data-slot="planned-frame"');
	expect(planned.width).toBeGreaterThan(built.width);
	expect(planned.height).toBeGreaterThan(built.height);

	// Every subject keeps its size and moves by the one offset the drawing moved by, so a
	// pane hit-testing the framed picture still lands on what it drew.
	const shift = offset(built.atlas.nodes["api"]!, planned.atlas.nodes["api"]!);
	for (const kind of ["nodes", "edges"] as const) {
		for (const [id, box] of Object.entries(built.atlas[kind])) {
			const moved = planned.atlas[kind][id]!;
			expect(offset(box, moved)).toEqual(shift);
			expect([moved.width, moved.height]).toEqual([box.width, box.height]);
		}
	}
});
