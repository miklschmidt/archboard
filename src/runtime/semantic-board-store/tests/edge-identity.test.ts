import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
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
						level: "module",
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

/**
 * What a write warned about, as code and path.
 * @param result The write's answer.
 * @returns The warnings, or null when the write did not land.
 */
function warningsOf(result: Awaited<ReturnType<typeof edit>>) {
	return result.outcome === "applied"
		? result.warnings.map((warning) => [warning.code, warning.path])
		: null;
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
])("a stated relationship keeps its id when %j changes", async (change) => {
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

test("traffic is preserved whole when a continuing relationship is restated", async () => {
	const edge = variant().content.edges[0]!;
	expect(
		(
			await edit({
				variant: "Proposal",
				edges: [{ ...edge, traffic: { speed: 72, volume: 2 } }],
			})
		).outcome,
	).toBe("applied");
	expect(variant().content.edges[0]).toMatchObject({
		id: edge.id,
		traffic: { speed: 72, volume: 2 },
	});
});

test("equivalent traffic can be restated on a continuing relationship", async () => {
	const proposal = variant();
	const predecessor = read().variants.find((one) => one.id === proposal.parent)!;
	const edge = predecessor.content.edges[0]!;
	expect(
		(
			await edit({
				variant: predecessor.name,
				edges: [{ ...edge, traffic: {} }],
			})
		).outcome,
	).toBe("applied");
	const changed = variant().content.edges[0]!;
	expect(
		(
			await edit({
				variant: "Proposal",
				edges: [
					{
						...changed,
						traffic: {
							volume: contract.DEFAULT_TRAFFIC_VOLUME,
							speed: contract.DEFAULT_TRAFFIC_SPEED,
						},
					},
				],
			})
		).outcome,
	).toBe("applied");
});

test("a continuing relationship keeps its id across endpoint, kind and traffic changes", async () => {
	const edge = variant().content.edges[0]!;
	const predecessor = variant("Initial");
	const result = await edit({
		variant: "Proposal",
		edges: [
			{
				...edge,
				to: "Compound",
				kind: "data",
				label: "measured sizes",
				emphasis: "hero",
				traffic: { speed: 72, volume: 2 },
			},
		],
	});
	expect(result.outcome).toBe("applied");
	expect(warningsOf(result)).toEqual([]);
	expect(variant().content.edges[0]).toMatchObject({
		id: edge.id,
		to: variant().content.nodes[2]!.id,
		kind: "data",
	});
	expect(
		contract.compareVariants(predecessor.content, variant().content).edges.get(edge.id)?.kind,
	).toBe("changed");
});

test("successive edits keep a continuing id despite multiple differences from the predecessor", async () => {
	const edge = variant().content.edges[0]!;
	expect((await edit({ variant: "Proposal", edges: [{ ...edge, to: "Compound" }] })).outcome).toBe(
		"applied",
	);
	const changed = variant().content.edges[0]!;
	expect(
		await edit({ variant: "Proposal", edges: [{ ...changed, label: "measured graph" }] }),
	).toMatchObject({ outcome: "applied" });
	expect(variant().content.edges[0]).toMatchObject({ id: edge.id, label: "measured graph" });
});

test("removing optional prose and changing emphasis preserves a continuing id", async () => {
	const edge = variant().content.edges[0]!;
	expect(
		await edit({
			variant: "Proposal",
			edges: [{ id: edge.id, from: edge.from, to: edge.to, kind: edge.kind, emphasis: "hero" }],
		}),
	).toMatchObject({ outcome: "applied" });
	expect(variant().content.edges[0]).toMatchObject({ id: edge.id, emphasis: "hero" });
});

test("a replacement gets a new identity and compares as removed plus added", async () => {
	const proposal = variant();
	const before = read().variants.find((one) => one.id === proposal.parent)!;
	const edge = proposal.content.edges[0]!;
	const written = await edit({
		variant: "Proposal",
		removeEdges: [edge.id],
		edges: [{ from: "Driver", to: "Compound", kind: "call", label: "measured graph" }],
	});
	expect(written.outcome).toBe("applied");
	const replacement = variant().content.edges[0]!;
	expect(replacement.id).not.toBe(edge.id);
	// Other ends: a different unit, so the write says nothing about it.
	expect(written.outcome === "applied" ? written.warnings : null).toEqual([]);
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

test("explicit removal and idless addition declares replacement even with one property changed", async () => {
	const edge = variant().content.edges[0]!;
	const reAdded = await edit({
		variant: "Proposal",
		removeEdges: [edge.id],
		edges: [{ from: "Driver", to: "Grid", kind: "call", label: "place grid", traffic: {} }],
	});
	expect(reAdded.outcome).toBe("applied");
	const twin = variant().content.edges[0]!;
	expect(twin.id).not.toBe(edge.id);
	expect(warningsOf(reAdded)).toEqual([]);
	const comparison = contract.compareVariants(variant("Initial").content, variant().content);
	expect(comparison.edges.get(edge.id)?.kind).toBe("removed");
	expect(comparison.edges.get(twin.id)?.kind).toBe("added");
	const replaced = await edit({
		variant: "Proposal",
		removeEdges: [twin.id],
		edges: [
			{
				from: "Driver",
				to: "Grid",
				kind: "call",
				label: "rebuilt grid",
				description: "now a different unit",
			},
		],
	});
	expect(replaced.outcome === "applied" ? replaced.warnings : null).toEqual([]);
});

test("a restatement without its id warns when it lands and again when a later write removes the original", async () => {
	const edge = variant().content.edges[0]!;
	const restated = await edit({
		variant: "Proposal",
		edges: [{ from: "Driver", to: "Grid", kind: "call", label: "place grid", traffic: {} }],
	});
	const copy = variant().content.edges.find((one) => one.id !== edge.id)!;
	expect(warningsOf(restated)).toEqual([["RELATIONSHIP_DUPLICATED", `edges.${copy.id}`]]);
	const removed = await edit({ variant: "Proposal", removeEdges: [edge.id] });
	expect(warningsOf(removed)).toEqual([["RELATIONSHIP_REPLACED", `edges.${copy.id}`]]);
	expect(removed.outcome === "applied" ? removed.warnings[0]?.message : "").toContain(edge.id);
});

test("moving a relationship onto successive replacement parts keeps its id across label changes", async () => {
	const edge = variant().content.edges[0]!;
	const moved = await edit({
		variant: "Proposal",
		removeNodes: ["Grid"],
		nodes: [{ name: "Grid engine", kind: "module", as: "engine" }],
		edges: [{ id: edge.id, from: "Driver", to: "engine", kind: "call", label: "place grid" }],
	});
	expect(moved.outcome).toBe("applied");
	const kept = variant().content.edges[0]!;
	expect(kept.id).toBe(edge.id);
	expect(kept.to).toBe(variant().content.nodes.find((node) => node.name === "Grid engine")!.id);
	expect(warningsOf(moved)).toEqual([]);

	const changed = await edit({
		variant: "Proposal",
		removeNodes: ["Grid engine"],
		nodes: [{ name: "Grid service", kind: "module", as: "service" }],
		edges: [{ id: kept.id, from: "Driver", to: "service", kind: "call", label: "draw grid" }],
	});
	expect(changed.outcome).toBe("applied");
	expect(warningsOf(changed)).toEqual([]);
	expect(variant().content.edges[0]).toMatchObject({ id: edge.id, label: "draw grid" });
});

test("dropping the id while the part the relationship was on goes is answered as a replaced identity", async () => {
	const edge = variant().content.edges[0]!;
	const reDrawn = await edit({
		variant: "Proposal",
		removeNodes: ["Grid"],
		nodes: [{ name: "Grid engine", kind: "module", as: "engine" }],
		edges: [{ from: "Driver", to: "engine", kind: "call", label: "place grid" }],
	});
	expect(reDrawn.outcome).toBe("applied");
	const minted = variant().content.edges[0]!;
	expect(minted.id).not.toBe(edge.id);
	expect(warningsOf(reDrawn)).toEqual([["RELATIONSHIP_REPLACED", `edges.${minted.id}`]]);
	expect(reDrawn.outcome === "applied" ? reDrawn.warnings[0]?.message : "").toContain(edge.id);
});

test("a relationship drawn afresh to a different part, saying something else, is not a lost identity", async () => {
	const written = await edit({
		variant: "Proposal",
		removeNodes: ["Grid"],
		nodes: [{ name: "Grid engine", kind: "module", as: "engine" }],
		edges: [{ from: "Driver", to: "engine", kind: "data", label: "measured sizes" }],
	});
	expect(written.outcome).toBe("applied");
	expect(warningsOf(written)).toEqual([]);
});

test("two calls between the same parts carrying different messages are not a restatement", async () => {
	const edge = variant().content.edges[0]!;
	const second = await edit({
		variant: "Proposal",
		edges: [{ from: "Driver", to: "Grid", kind: "call", label: "measure grid" }],
	});
	expect(second.outcome === "applied" ? second.warnings : null).toEqual([]);
	const removed = await edit({ variant: "Proposal", removeEdges: [edge.id] });
	expect(removed.outcome === "applied" ? removed.warnings : null).toEqual([]);
});

test("an ordinary edit restores an inherited relationship absent from a proposal", async () => {
	const edge = variant().content.edges[0]!;
	expect((await edit({ variant: "Proposal", removeEdges: [edge.id] })).outcome).toBe("applied");
	const before = read().version;
	const result = await edit({ variant: "Proposal", edges: [edge] });
	expect(result.outcome).toBe("applied");
	expect(variant().content.edges).toContainEqual(edge);
	expect(read().version).toBe(before + 1);
});

test("restoring an inherited edge repairs its copy without reversing the identity warning", async () => {
	const edge = variant().content.edges[0]!;
	await edit({
		variant: "Proposal",
		edges: [{ from: edge.from, to: edge.to, kind: edge.kind, label: edge.label }],
	});
	const copy = variant().content.edges.find((one) => one.id !== edge.id)!;
	await edit({ variant: "Proposal", removeEdges: [edge.id] });
	const restoredBeside = await edit({ variant: "Proposal", edges: [edge] });
	expect(warningsOf(restoredBeside)).toEqual([["RELATIONSHIP_DUPLICATED", `edges.${copy.id}`]]);
	await edit({ variant: "Proposal", removeEdges: [edge.id] });
	const result = await edit({ variant: "Proposal", removeEdges: [copy.id], edges: [edge] });
	expect(warningsOf(result)).toEqual([]);
	expect(variant().content.edges).toEqual([edge]);
});

test("restoration refuses unknown, sibling, wrong-kind and contradictory ids without changing the board", async () => {
	await branch("current", "Sibling");
	await edit({ variant: "Sibling", edges: [{ from: "Compound", to: "Driver", kind: "call" }] });
	const siblingEdge = variant("Sibling").content.edges.find(
		(edge) => edge.from === variant().content.nodes[2]!.id,
	)!;
	const edge = variant().content.edges[0]!;
	const node = variant().content.nodes[1]!;
	await edit({ variant: "Proposal", removeNodes: [node.id] });
	const before = read();
	for (const id of ["unknown1", siblingEdge.id, node.id]) {
		const result = await edit({
			variant: "Proposal",
			edges: [{ id, from: "Driver", to: "Compound", kind: "call" }],
		});
		expect(result.outcome === "rejected" && result.code).toBe("UNKNOWN_EDGE");
	}
	const wrongNode = await edit({
		variant: "Proposal",
		nodes: [{ id: edge.id, name: "Wrong kind", kind: "module" }],
	});
	expect(wrongNode.outcome === "rejected" && wrongNode.code).toBe("UNKNOWN_NODE");
	expect(read()).toEqual(before);
	await edit({ variant: "Proposal", nodes: [node], edges: [edge] });
	const restored = read();
	for (const input of [
		{ removeEdges: [edge.id], edges: [edge] },
		{ removeNodes: [node.id], nodes: [node] },
	]) {
		expect((await edit({ variant: "Proposal", ...input })).outcome).toBe("rejected");
	}
	expect(read()).toEqual(restored);
});

test("restoring a changed inherited relationship settles its deletion and carries the answer to descendants", async () => {
	const edge = variant().content.edges[0]!;
	await edit({ variant: "Proposal", removeEdges: [edge.id] });
	await branch("Proposal", "Child");
	await edit({ edges: [{ ...edge, label: "place refreshed grid" }] });
	expect(variant().reconciliation?.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ subject: edge.id, kind: "deleted-and-changed" }),
		]),
	);
	const before = read().version;
	const result = await edit({
		variant: "Proposal",
		edges: [{ ...edge, label: "place chosen grid" }],
	});
	expect(result.outcome).toBe("applied");
	expect(read().version).toBe(before + 1);
	expect(variant().reconciliation).toBeUndefined();
	expect(variant("Child").reconciliation).toBeUndefined();
	expect(variant("Child").content.edges).toEqual(variant().content.edges);
	await edit({
		nodes: [{ ...variant("Initial").content.nodes[0]!, responsibility: "Runs layout" }],
	});
	expect(variant().reconciliation).toBeUndefined();
});

test("the recorded base restores absent subjects without settling an unrelated disagreement", async () => {
	const [driver, grid] = variant().content.nodes;
	const edge = variant().content.edges[0]!;
	await edit({
		variant: "Proposal",
		removeNodes: [grid!.id],
		nodes: [{ ...driver, name: "Proposal driver" }],
	});
	await edit({ removeNodes: [grid!.id], nodes: [{ ...driver, name: "Current driver" }] });
	const standing = variant().reconciliation;
	expect(standing?.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ subject: driver!.id, kind: "competing-field", field: "name" }),
		]),
	);
	expect(variant("Initial").content.nodes.some((node) => node.id === grid!.id)).toBe(false);
	const result = await edit({ variant: "Proposal", nodes: [grid], edges: [edge] });
	expect(result.outcome).toBe("applied");
	expect(variant().reconciliation).toEqual(standing);
	expect(variant().content.edges).toEqual([edge]);
	expect(variant().content.nodes).toContainEqual(grid!);
});

test("an absent ancestor-only subject is not inherited by a newly branched child", async () => {
	const grid = variant().content.nodes[1]!;
	await edit({ variant: "Proposal", removeNodes: [grid.id] });
	await branch("Proposal", "Child");
	const before = read();
	const result = await edit({ variant: "Child", nodes: [grid] });
	expect(result.outcome === "rejected" && result.code).toBe("UNKNOWN_NODE");
	expect(read()).toEqual(before);
});
