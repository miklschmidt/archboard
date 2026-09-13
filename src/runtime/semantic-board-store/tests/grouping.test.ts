// A node's group is meaning: it is authored, it persists, and it behaves like
// every other thing a board says about a part.
//
// The point of these is the line between the two halves of the feature. What a
// part belongs to is on the board, so it survives a restart, shows up in a
// comparison, and is merged field by field when a predecessor moves under a
// proposal. What colour that group is drawn in is not on the board at all, so
// nothing here mentions a colour — and retuning the palette can never make one
// of these fail, which is the property that makes the colours safe to edit.

import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-grouping-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

let board = "";
let boards = 0;

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	ownVaultOrRefuse(vault, store.locateSemanticBoard("where this owner writes").file);
	contract = await import("@/shared/semantic-board/index");
});
beforeEach(async () => {
	boards += 1;
	board = `grouped-${boards}`;
	await store.writeSemanticBoard({
		board,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name: board,
				level: "system",
				nodes: [
					{ name: "Gateway", kind: "route", group: "the write path" },
					{ name: "Orders", kind: "service", group: "the write path" },
					{ name: "Ledger", kind: "datastore" },
				],
			}),
		),
	});
});
afterAll(() => {
	if (callerVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = callerVault;
	rmSync(vault, { recursive: true, force: true });
});

/**
 * The board as it now stands, read back off the disk.
 * @param name The board name.
 * @returns The board.
 */
function read(name: string) {
	const answer = store.readSemanticBoard(name);
	if (!answer.ok) throw new Error(answer.problem);
	return answer.board;
}

/**
 * One node of the current variant, by name.
 * @param name The node's name.
 * @returns The node.
 */
function nodeNamed(name: string) {
	const held = read(board);
	const variant = held.variants.find((one) => one.id === held.current)!;
	const node = variant.content.nodes.find((one) => one.name === name);
	expect(node, `no node called ${name}`).toBeDefined();
	return node!;
}

/**
 * Restate one node, which is how every field of one is written.
 * @param node The node as it is being stated now.
 * @returns What the write did.
 */
async function state(node: Record<string, unknown>) {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read(board).version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({ nodes: [node] }),
		),
	});
}

test("a group is written, read back, and belongs to the node rather than to its neighbours", () => {
	// Two parts in one group and one part in none: a group is a label on a node,
	// so there is nothing on the board to keep in step and nothing to register.
	expect(nodeNamed("Gateway").group).toBe("the write path");
	expect(nodeNamed("Orders").group).toBe("the write path");
	expect(nodeNamed("Ledger").group).toBeUndefined();
}, 20_000);

test("a group crosses containment and is not inherited from a parent", async () => {
	const gateway = nodeNamed("Gateway");
	expect(
		(await state({ id: gateway.id, name: "Gateway", kind: "route", group: "payments" })).outcome,
	).toBe("applied");
	// Contained by the part it is now grouped away from: being inside something
	// and being part of an effort are different questions, and the board answers
	// both without either deciding the other.
	const orders = nodeNamed("Orders");
	expect(
		(
			await state({
				id: orders.id,
				name: "Orders",
				kind: "service",
				group: "the write path",
				parent: "Gateway",
			})
		).outcome,
	).toBe("applied");
	expect(nodeNamed("Orders").parent).toBe(nodeNamed("Gateway").id);
	expect(nodeNamed("Orders").group).toBe("the write path");
	expect(nodeNamed("Gateway").group).toBe("payments");
}, 20_000);

test("a group is cleared the way every other field is: by stating the node without it", async () => {
	const gateway = nodeNamed("Gateway");
	expect((await state({ id: gateway.id, name: "Gateway", kind: "route" })).outcome).toBe("applied");
	expect(nodeNamed("Gateway").group).toBeUndefined();
	// And the node is otherwise the node it was, under the id it was minted with.
	expect(nodeNamed("Gateway").id).toBe(gateway.id);
}, 20_000);

test("moving a part to another group is a change to the architecture", async () => {
	const before = read(board);
	const baseline = before.variants[0]!;
	expect(
		(
			await store.writeSemanticBoard({
				board,
				writer,
				expectedVersion: before.version,
				transition: store.branchVariantTransition(
					contract.BoardBranchInputSchema.parse({ from: baseline.name, name: "Regrouped" }),
				),
			})
		).outcome,
	).toBe("applied");
	const orders = nodeNamed("Orders");
	expect(
		(
			await store.writeSemanticBoard({
				board,
				writer,
				expectedVersion: read(board).version,
				transition: store.editVariantTransition(
					contract.VariantEditInputSchema.parse({
						variant: "Regrouped",
						nodes: [{ id: orders.id, name: "Orders", kind: "service", group: "payments" }],
					}),
				),
			})
		).outcome,
	).toBe("applied");

	const held = read(board);
	const proposal = held.variants.find((one) => one.name === "Regrouped")!;
	const comparison = contract.compareVariants(baseline.content, proposal.content);
	// A part that moved from one effort to another is a changed part, and the
	// field that moved is named — which is what a reader is shown beside the
	// picture. Colour is nowhere in this: the comparison never sees one.
	expect(comparison.nodes.get(orders.id)?.kind).toBe("changed");
	expect(comparison.nodes.get(orders.id)?.fields.map((moved) => moved.field)).toContain("group");
	expect(comparison.nodes.get(nodeNamed("Gateway").id)?.kind).toBe("unchanged");
}, 20_000);

test("a change to a part's group propagates to a draft that has not touched it", async () => {
	const baseline = read(board).variants[0]!;
	expect(
		(
			await store.writeSemanticBoard({
				board,
				writer,
				expectedVersion: read(board).version,
				transition: store.branchVariantTransition(
					contract.BoardBranchInputSchema.parse({ from: baseline.name, name: "Untouched" }),
				),
			})
		).outcome,
	).toBe("applied");
	const ledger = nodeNamed("Ledger");

	// The architecture moves a part into an effort. The draft said nothing about
	// that part, so there is nothing to disagree with and it simply follows.
	expect(
		(
			await store.writeSemanticBoard({
				board,
				writer,
				expectedVersion: read(board).version,
				transition: store.editVariantTransition(
					contract.VariantEditInputSchema.parse({
						variant: baseline.name,
						nodes: [{ id: ledger.id, name: "Ledger", kind: "datastore", group: "payments" }],
					}),
				),
			})
		).outcome,
	).toBe("applied");

	const draft = read(board).variants.find((one) => one.name === "Untouched")!;
	expect(draft.content.nodes.find((one) => one.id === ledger.id)?.group).toBe("payments");
	expect(draft.reconciliation ?? null).toBeNull();
}, 20_000);

test("two answers about one part's group are held, settled, and can settle to no group", async () => {
	const baseline = read(board).variants[0]!;
	await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read(board).version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ from: baseline.name, name: "Regrouped" }),
		),
	});
	const gateway = nodeNamed("Gateway");

	// The draft moves the part to one effort; the architecture moves it to
	// another. Nobody can decide that from the two documents.
	for (const [variant, group] of [
		["Regrouped", "payments"],
		[baseline.name, "the read path"],
	] as const) {
		expect(
			(
				await store.writeSemanticBoard({
					board,
					writer,
					expectedVersion: read(board).version,
					transition: store.editVariantTransition(
						contract.VariantEditInputSchema.parse({
							variant,
							nodes: [{ id: gateway.id, name: "Gateway", kind: "route", group }],
						}),
					),
				})
			).outcome,
		).toBe("applied");
	}

	const held = read(board).variants.find((one) => one.name === "Regrouped")!;
	const issue = held.reconciliation?.issues.find((one) => one.field === "group");
	expect(issue, "the competing groups were not held for somebody to settle").toBeDefined();
	expect(issue?.subject).toBe(gateway.id);
	expect(issue?.mine).toBe("payments");
	expect(issue?.theirs).toBe("the read path");
	// The draft keeps what it said while the argument stands, rather than
	// quietly taking one side.
	expect(
		read(board)
			.variants.find((one) => one.name === "Regrouped")!
			.content.nodes.find((one) => one.id === gateway.id)?.group,
	).toBe("payments");

	// Settling for the predecessor's answer takes that value and closes it.
	expect(
		(
			await store.writeSemanticBoard({
				board,
				writer,
				expectedVersion: read(board).version,
				transition: store.settleVariantTransition(
					contract.ResolutionInputSchema.parse({
						variant: "Regrouped",
						choices: [{ subject: gateway.id, field: "group", side: "theirs" }],
					}),
				),
			})
		).outcome,
	).toBe("applied");
	const settled = read(board).variants.find((one) => one.name === "Regrouped")!;
	expect(settled.content.nodes.find((one) => one.id === gateway.id)?.group).toBe("the read path");
	expect(settled.reconciliation?.issues.some((one) => one.field === "group") ?? false).toBe(false);

	// And a settled part can then be taken out of every effort, which is an
	// ordinary edit: a field left out is a field cleared.
	expect(
		(
			await store.writeSemanticBoard({
				board,
				writer,
				expectedVersion: read(board).version,
				transition: store.editVariantTransition(
					contract.VariantEditInputSchema.parse({
						variant: "Regrouped",
						nodes: [{ id: gateway.id, name: "Gateway", kind: "route" }],
					}),
				),
			})
		).outcome,
	).toBe("applied");
	expect(
		read(board)
			.variants.find((one) => one.name === "Regrouped")!
			.content.nodes.find((one) => one.id === gateway.id)?.group,
	).toBeUndefined();
}, 20_000);

test("adopting a proposal carries its grouping into the architecture", async () => {
	const baseline = read(board).variants[0]!;
	await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read(board).version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ from: baseline.name, name: "Adopted" }),
		),
	});
	const orders = nodeNamed("Orders");
	await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read(board).version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: "Adopted",
				nodes: [{ id: orders.id, name: "Orders", kind: "service", group: "payments" }],
			}),
		),
	});
	expect(
		(
			await store.writeSemanticBoard({
				board,
				writer,
				expectedVersion: read(board).version,
				transition: store.adoptVariantTransition(
					contract.BoardAdoptInputSchema.parse({
						variant: "Adopted",
						reason: "the grouping was right",
					}),
				),
			})
		).outcome,
	).toBe("applied");

	// What was proposed is now what exists, grouping and all.
	expect(nodeNamed("Orders").group).toBe("payments");
	const held = read(board);
	expect(held.variants.find((one) => one.id === held.current)?.name).toBe("Adopted");
}, 20_000);
