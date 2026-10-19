import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSemanticBoard } from "#runtime/operations/read/read.ts";
import {
	type SemanticTransition,
	createBoardTransition,
	editVariantTransition,
	branchVariantTransition,
	adoptVariantTransition,
} from "#runtime/operations/write/transitions.ts";
import { writeSemanticBoard } from "#runtime/operations/write/write.ts";
import {
	BoardCreateInputSchema,
	VariantEditInputSchema,
	BoardBranchInputSchema,
} from "#shared/protocol/board-input.ts";
import { BoardAdoptInputSchema } from "#shared/protocol/resolution-input.ts";

// A board for something nobody has built (ADR 0031): created with a draft and
// no current variant, worked on by commands that name no variant, and adopted
// the day the architecture starts existing.

const vault = mkdtempSync(join(tmpdir(), "archboard-planned-"));
const writer = { kind: "agent" as const };
const board = "planned";

afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

/**
 * The board as it now stands.
 * @returns The board.
 */
function read() {
	const answer = readSemanticBoard(vault, board);
	if (!answer.ok) throw new Error(answer.problem);
	return answer.board;
}

/**
 * Write one transition against the board as it now stands.
 * @param transition The transition.
 * @returns What the write did.
 */
function write(transition: SemanticTransition) {
	return writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: read().version,
		transition,
	});
}

test("a planned board is written, worked on unqualified, and adopted into existence", async () => {
	const created = await writeSemanticBoard({
		vault,
		board,
		writer,
		transition: createBoardTransition(
			BoardCreateInputSchema.parse({
				name: board,
				level: "system",
				lifecycle: "draft",
				nodes: [{ name: "Gateway", kind: "service" }],
			}),
		),
	});
	expect(created.outcome).toBe("applied");
	const planned = read();
	expect(planned.current).toBeUndefined();
	const [root] = planned.variants;
	expect(root?.lifecycle).toBe("draft");

	// An edit and a branch that name no variant land on the draft the board opens.
	const edited = await write(
		editVariantTransition(
			VariantEditInputSchema.parse({ nodes: [{ name: "Orders", kind: "service" }] }),
		),
	);
	expect(edited.outcome).toBe("applied");
	expect(read().variants[0]?.content.nodes).toHaveLength(2);
	const branched = await write(
		branchVariantTransition(BoardBranchInputSchema.parse({ name: "Queued" })),
	);
	expect(branched.outcome).toBe("applied");
	expect(read().variants[1]?.parent).toBe(root?.id);

	// Asking for the current variant by its word finds nothing to act on.
	const refused = await write(
		adoptVariantTransition(BoardAdoptInputSchema.parse({ variant: "current" })),
	);
	expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_VARIANT");

	// Adoption is the moment it starts existing: nothing was current, so nothing
	// becomes history, and the record says it took the designation from nothing.
	const adopted = await write(
		adoptVariantTransition(BoardAdoptInputSchema.parse({ variant: root?.name ?? "" })),
	);
	expect(adopted.outcome).toBe("applied");
	const built = read();
	expect(built.current).toBe(root?.id);
	expect(built.variants.map((variant) => variant.lifecycle)).toEqual(["current", "draft"]);
	expect(built.adoptions).toHaveLength(1);
	expect(built.adoptions?.[0]).not.toHaveProperty("from");
}, 20_000);
