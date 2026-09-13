import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import type * as ContractModule from "@/shared/semantic-board/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-edge-identity-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };
let board = "";
let boards = 0;

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	contract = await import("@/shared/semantic-board/index");
	ownVaultOrRefuse(vault, store.locateSemanticBoard("identity owner").file);
});

beforeEach(async () => {
	board = `edge-identity-${++boards}`;
	expect(
		(
			await store.writeSemanticBoard({
				board,
				writer,
				transition: store.createBoardTransition(
					contract.BoardCreateInputSchema.parse({
						name: board,
						nodes: [
							{ name: "Driver", kind: "module" },
							{ name: "Grid", kind: "module" },
							{ name: "Compound", kind: "module" },
						],
						edges: [{ from: "Driver", to: "Grid", kind: "call", label: "place grid" }],
					}),
				),
			})
		).outcome,
	).toBe("applied");
	expect((await branch("current", "Proposal")).outcome).toBe("applied");
});

afterAll(() => {
	if (callerVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = callerVault;
	rmSync(vault, { recursive: true, force: true });
});

/** Read this test's persisted board. */
function read() {
	const result = store.readSemanticBoard(board);
	if (!result.ok) throw new Error(result.problem);
	return result.board;
}

/** Read a particular variant. */
function variant(name = "Proposal") {
	return read().variants.find((one) => one.name === name)!;
}

/** Apply an authored batch against the version read by this test. */
function edit(input: unknown) {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.editVariantTransition(contract.VariantEditInputSchema.parse(input)),
	});
}

/** Derive a fresh successor. */
function branch(from: string, name: string) {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ from, name }),
		),
	});
}

test.each([
	{ from: "Compound" },
	{ to: "Compound" },
	{ kind: "data" },
	{ label: "place architecture" },
	{ description: "Calls the layout engine" },
	{ emphasis: "hero" },
])("one authored property may change: %j", async (change) => {
	const edge = variant().content.edges[0]!;
	expect((await edit({ variant: "Proposal", edges: [{ ...edge, ...change }] })).outcome).toBe(
		"applied",
	);
	expect(variant().content.edges[0]!.id).toBe(edge.id);
});

test("endpoint names, renamed nodes and default emphasis do not create differences", async () => {
	const edge = variant().content.edges[0]!;
	const grid = variant().content.nodes.find((node) => node.name === "Grid")!;
	expect(
		(
			await edit({
				variant: "Proposal",
				nodes: [{ ...grid, name: "Grid layout" }],
				edges: [
					{
						id: edge.id,
						from: "Driver",
						to: "Grid layout",
						kind: "call",
						label: "place architecture",
					},
				],
			})
		).outcome,
	).toBe("applied");
	expect(variant().content.edges[0]).toEqual({ ...edge, label: "place architecture" });
});

test("two changes in one batch reject the whole write and explain replacement", async () => {
	const edge = variant().content.edges[0]!;
	const file = store.locateSemanticBoard(board).file;
	const bytes = readFileSync(file, "utf8");
	const result = await edit({
		variant: "Proposal",
		nodes: [{ name: "Must not land", kind: "module" }],
		edges: [{ ...edge, to: "Compound", label: "graph and measured sizes" }],
	});
	expect(result).toMatchObject({ outcome: "rejected", code: "EDGE_IDENTITY_REUSED" });
	if (result.outcome !== "rejected") throw new Error("Expected rejection");
	for (const text of [edge.id, "Proposal", "to, label", "removeEdges", "without an ID"]) {
		expect(result.problem).toContain(text);
	}
	expect(readFileSync(file, "utf8")).toBe(bytes);
});

test("successive writes count against the predecessor, not the last edit", async () => {
	const edge = variant().content.edges[0]!;
	expect((await edit({ variant: "Proposal", edges: [{ ...edge, to: "Compound" }] })).outcome).toBe(
		"applied",
	);
	const before = read();
	const changed = variant().content.edges[0]!;
	expect(
		await edit({ variant: "Proposal", edges: [{ ...changed, label: "measured graph" }] }),
	).toMatchObject({ outcome: "rejected", code: "EDGE_IDENTITY_REUSED" });
	expect(read()).toEqual(before);
});

test("removing optional prose and changing emphasis counts as two changes", async () => {
	const edge = variant().content.edges[0]!;
	expect(
		await edit({
			variant: "Proposal",
			edges: [{ id: edge.id, from: edge.from, to: edge.to, kind: edge.kind, emphasis: "hero" }],
		}),
	).toMatchObject({ outcome: "rejected", code: "EDGE_IDENTITY_REUSED" });
});

test("a replacement gets a new identity and compares as removed plus added", async () => {
	const proposal = variant();
	const before = read().variants.find((one) => one.id === proposal.parent)!;
	const edge = proposal.content.edges[0]!;
	expect(
		(
			await edit({
				variant: "Proposal",
				removeEdges: [edge.id],
				edges: [{ from: "Driver", to: "Compound", kind: "call", label: "measured graph" }],
			})
		).outcome,
	).toBe("applied");
	const replacement = variant().content.edges[0]!;
	expect(replacement.id).not.toBe(edge.id);
	const comparison = contract.compareVariants(before.content, variant().content);
	expect(comparison.edges.get(edge.id)?.kind).toBe("removed");
	expect(comparison.edges.get(replacement.id)?.kind).toBe("added");
});

test("a nested proposal compares to its direct parent, not the root", async () => {
	const edge = variant().content.edges[0]!;
	expect((await edit({ variant: "Proposal", edges: [{ ...edge, to: "Compound" }] })).outcome).toBe(
		"applied",
	);
	expect((await branch("Proposal", "Next proposal")).outcome).toBe("applied");
	const inherited = variant("Next proposal").content.edges[0]!;
	expect(
		(await edit({ variant: "Next proposal", edges: [{ ...inherited, label: "measured graph" }] }))
			.outcome,
	).toBe("applied");
});
