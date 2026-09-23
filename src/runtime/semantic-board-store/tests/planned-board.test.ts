import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

// A board for something nobody has built (ADR 0031): created with a draft and
// no current variant, worked on by commands that name no variant, and adopted
// the day the architecture starts existing.

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-planned-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };
const board = "planned";

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	ownVaultOrRefuse(vault, store.locateSemanticBoard("where this owner writes").file);
	contract = await import("@/shared/semantic-board/index");
});
afterAll(() => {
	if (callerVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = callerVault;
	rmSync(vault, { recursive: true, force: true });
});

/**
 * The board as it now stands.
 * @returns The board.
 */
function read() {
	const answer = store.readSemanticBoard(board);
	if (!answer.ok) throw new Error(answer.problem);
	return answer.board;
}

/**
 * Write one transition against the board as it now stands.
 * @param transition The transition.
 * @returns What the write did.
 */
function write(transition: StoreModule.SemanticTransition) {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition,
	});
}

test("a planned board is written, worked on unqualified, and adopted into existence", async () => {
	const created = await store.writeSemanticBoard({
		board,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
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
		store.editVariantTransition(
			contract.VariantEditInputSchema.parse({ nodes: [{ name: "Orders", kind: "service" }] }),
		),
	);
	expect(edited.outcome).toBe("applied");
	expect(read().variants[0]?.content.nodes).toHaveLength(2);
	const branched = await write(
		store.branchVariantTransition(contract.BoardBranchInputSchema.parse({ name: "Queued" })),
	);
	expect(branched.outcome).toBe("applied");
	expect(read().variants[1]?.parent).toBe(root?.id);

	// Asking for the current variant by its word finds nothing to act on.
	const refused = await write(
		store.adoptVariantTransition(contract.BoardAdoptInputSchema.parse({ variant: "current" })),
	);
	expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_VARIANT");

	// Adoption is the moment it starts existing: nothing was current, so nothing
	// becomes history, and the record says it took the designation from nothing.
	const adopted = await write(
		store.adoptVariantTransition(
			contract.BoardAdoptInputSchema.parse({ variant: root?.name ?? "" }),
		),
	);
	expect(adopted.outcome).toBe("applied");
	const built = read();
	expect(built.current).toBe(root?.id);
	expect(built.variants.map((variant) => variant.lifecycle)).toEqual(["current", "draft"]);
	expect(built.adoptions).toHaveLength(1);
	expect(built.adoptions?.[0]).not.toHaveProperty("from");
}, 20_000);
