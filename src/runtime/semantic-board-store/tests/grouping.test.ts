// A node's groups are meaning: they are authored, they persist, and they behave
// like every other thing a board says about a part.
//
// What a part belongs to is on the board, as a set of ids the vault
// configuration defines, so it survives a restart, shows up in a comparison,
// and is merged membership by membership when a predecessor moves under a
// proposal. What a group is called is not on the board at all, so nothing here
// mentions a name — and renaming one can never make a variant read as changed.

import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@/shared/semantic-policy/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-grouping-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

/** The vault's policy: three groups, named however the consumer likes. */
const POLICY: SemanticPolicy = {
	...DEFAULT_SEMANTIC_POLICY,
	groups: {
		fulfillment: { name: "Fulfillment" },
		billing: { name: "Billing" },
		"read-path": { name: "The read path" },
	},
};

let board = "";
let boards = 0;

/**
 * Write the vault's configuration.
 * @param policy What it says.
 */
function configure(policy: SemanticPolicy): void {
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(policy));
}

beforeAll(async () => {
	configure(POLICY);
	store = await import("@/runtime/semantic-board-store/index");
	ownVaultOrRefuse(vault, store.locateSemanticBoard("where this owner writes").file);
	contract = await import("@/shared/semantic-board/index");
});
beforeEach(async () => {
	configure(POLICY);
	boards += 1;
	board = `grouped-${boards}`;
	// Fulfillment crosses two containers; the worker inside Shipping is also
	// Billing's. The ledger belongs to nothing.
	await store.writeSemanticBoard({
		board,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name: board,
				level: "system",
				nodes: [
					{ name: "Orders", kind: "service" },
					{ name: "Shipping", kind: "service" },
					{ name: "Handler", kind: "route", parent: "Orders", groups: ["fulfillment"] },
					{ name: "Queue", kind: "queue", parent: "Orders", groups: ["fulfillment"] },
					{
						name: "Worker",
						kind: "job",
						parent: "Shipping",
						groups: ["fulfillment", "billing", "fulfillment"],
					},
					{ name: "Ledger", kind: "datastore" },
				],
				edges: [
					{ from: "Handler", to: "Queue", kind: "queue" },
					{ from: "Queue", to: "Worker", kind: "queue" },
					{ from: "Worker", to: "Ledger", kind: "data" },
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
 * @returns The board and its warnings.
 */
function read(name: string) {
	const answer = store.readSemanticBoard(name);
	if (!answer.ok) throw new Error(answer.problem);
	return answer;
}

/**
 * One node of one variant, by name.
 * @param name The node's name.
 * @param variant The variant's name; the current one when absent.
 * @returns The node.
 */
function nodeNamed(name: string, variant?: string) {
	const held = read(board).board;
	const state =
		variant === undefined
			? held.variants.find((one) => one.id === held.current)
			: held.variants.find((one) => one.name === variant);
	const node = state?.content.nodes.find((one) => one.name === name);
	expect(node, `no node called ${name}`).toBeDefined();
	return node!;
}

/**
 * Restate one node on one variant, which is how every field of one is written.
 * @param node The node as it is being stated now.
 * @param variant The variant to write to, when not the current one.
 * @returns What the write did.
 */
async function restate(node: Record<string, unknown>, variant?: string) {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read(board).board.version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				...(variant === undefined ? {} : { variant }),
				nodes: [node],
			}),
		),
	});
}

/**
 * Derive a proposal from the current variant.
 * @param name What to call it.
 */
async function branch(name: string): Promise<void> {
	const held = read(board).board;
	const baseline = held.variants.find((one) => one.id === held.current)!;
	expect(
		(
			await store.writeSemanticBoard({
				board,
				writer,
				expectedVersion: held.version,
				transition: store.branchVariantTransition(
					contract.BoardBranchInputSchema.parse({ from: baseline.name, name }),
				),
			})
		).outcome,
	).toBe("applied");
}

test("memberships persist canonically: unique, ordered, and absent when there are none", () => {
	// Stated as ["fulfillment", "billing", "fulfillment"]; held as one sorted set.
	expect(nodeNamed("Worker").groups).toEqual(["billing", "fulfillment"]);
	expect(nodeNamed("Handler").groups).toEqual(["fulfillment"]);
	expect(nodeNamed("Ledger").groups).toBeUndefined();
	// Nothing is inherited: the containers are in no group.
	expect(nodeNamed("Orders").groups).toBeUndefined();
	expect(nodeNamed("Shipping").groups).toBeUndefined();
	expect(read(board).warnings).toEqual([]);
}, 20_000);

test("an empty list, a missing field and a reordered list are all the same membership", async () => {
	const worker = nodeNamed("Worker");
	const baseline = read(board).board.variants[0]!;
	await branch("Reordered");
	expect(
		(
			await restate(
				{
					id: worker.id,
					name: "Worker",
					kind: "job",
					parent: "Shipping",
					groups: ["fulfillment", "billing"],
				},
				"Reordered",
			)
		).outcome,
	).toBe("applied");
	const ledger = nodeNamed("Ledger");
	expect(
		(await restate({ id: ledger.id, name: "Ledger", kind: "datastore", groups: [] }, "Reordered"))
			.outcome,
	).toBe("applied");
	expect(nodeNamed("Ledger", "Reordered").groups).toBeUndefined();
	const proposal = read(board).board.variants.find((one) => one.name === "Reordered")!;
	const comparison = contract.compareVariants(baseline.content, proposal.content);
	expect(comparison.nodes.get(worker.id)?.kind).toBe("unchanged");
	expect(comparison.nodes.get(ledger.id)?.kind).toBe("unchanged");
}, 20_000);

test("membership crosses containment and is cleared by stating the node without it", async () => {
	const handler = nodeNamed("Handler");
	expect(
		(await restate({ id: handler.id, name: "Handler", kind: "route", parent: "Shipping" })).outcome,
	).toBe("applied");
	expect(nodeNamed("Handler").parent).toBe(nodeNamed("Shipping").id);
	expect(nodeNamed("Handler").groups).toBeUndefined();
	expect(nodeNamed("Handler").id).toBe(handler.id);
}, 20_000);

test("joining or leaving a group is a change to the architecture", async () => {
	const baseline = read(board).board.variants[0]!;
	await branch("Regrouped");
	const queue = nodeNamed("Queue");
	expect(
		(
			await restate(
				{ id: queue.id, name: "Queue", kind: "queue", parent: "Orders", groups: ["billing"] },
				"Regrouped",
			)
		).outcome,
	).toBe("applied");
	const proposal = read(board).board.variants.find((one) => one.name === "Regrouped")!;
	const comparison = contract.compareVariants(baseline.content, proposal.content);
	expect(comparison.nodes.get(queue.id)?.kind).toBe("changed");
	expect(comparison.nodes.get(queue.id)?.fields.map((moved) => moved.field)).toEqual(["groups"]);
	expect(comparison.nodes.get(nodeNamed("Handler").id)?.kind).toBe("unchanged");
}, 20_000);

test("a membership change propagates to a draft that has not touched that node", async () => {
	await branch("Untouched");
	const ledger = nodeNamed("Ledger");
	expect(
		(await restate({ id: ledger.id, name: "Ledger", kind: "datastore", groups: ["billing"] }))
			.outcome,
	).toBe("applied");
	const draft = read(board).board.variants.find((one) => one.name === "Untouched")!;
	expect(draft.content.nodes.find((one) => one.id === ledger.id)?.groups).toEqual(["billing"]);
	expect(draft.reconciliation ?? null).toBeNull();
}, 20_000);

test("each membership merges on its own, so two sides touching different groups never disagree", async () => {
	await branch("Regrouped");
	const worker = nodeNamed("Worker");
	// The draft takes the worker out of Billing; the architecture puts it on
	// the read path. Neither touched the other's membership.
	expect(
		(
			await restate(
				{ id: worker.id, name: "Worker", kind: "job", parent: "Shipping", groups: ["fulfillment"] },
				"Regrouped",
			)
		).outcome,
	).toBe("applied");
	expect(
		(
			await restate({
				id: worker.id,
				name: "Worker",
				kind: "job",
				parent: "Shipping",
				groups: ["fulfillment", "billing", "read-path"],
			})
		).outcome,
	).toBe("applied");
	const draft = read(board).board.variants.find((one) => one.name === "Regrouped")!;
	expect(draft.reconciliation ?? null).toBeNull();
	expect(draft.content.nodes.find((one) => one.id === worker.id)?.groups).toEqual([
		"fulfillment",
		"read-path",
	]);
}, 20_000);

test("a node removed here and regrouped there is still a deletion somebody has to settle", async () => {
	await branch("Trimmed");
	const ledger = nodeNamed("Ledger");
	expect(
		(
			await store.writeSemanticBoard({
				board,
				writer,
				expectedVersion: read(board).board.version,
				transition: store.editVariantTransition(
					contract.VariantEditInputSchema.parse({
						variant: "Trimmed",
						removeNodes: [ledger.id],
					}),
				),
			})
		).outcome,
	).toBe("applied");
	expect(
		(await restate({ id: ledger.id, name: "Ledger", kind: "datastore", groups: ["billing"] }))
			.outcome,
	).toBe("applied");
	const draft = read(board).board.variants.find((one) => one.name === "Trimmed")!;
	const issue = draft.reconciliation?.issues.find((one) => one.subject === ledger.id);
	expect(issue?.kind).toBe("deleted-and-changed");
	expect(issue?.theirs).toContain("groups");
}, 20_000);

test("adopting a proposal carries its memberships into the architecture", async () => {
	await branch("Adopted");
	const ledger = nodeNamed("Ledger");
	expect(
		(
			await restate(
				{ id: ledger.id, name: "Ledger", kind: "datastore", groups: ["billing"] },
				"Adopted",
			)
		).outcome,
	).toBe("applied");
	expect(
		(
			await store.writeSemanticBoard({
				board,
				writer,
				expectedVersion: read(board).board.version,
				transition: store.adoptVariantTransition(
					contract.BoardAdoptInputSchema.parse({ variant: "Adopted" }),
				),
			})
		).outcome,
	).toBe("applied");
	expect(nodeNamed("Ledger").groups).toEqual(["billing"]);
}, 20_000);

test("valid configuration refuses a newly authored unknown group, and keeps a retained one readable with a warning", async () => {
	const ledger = nodeNamed("Ledger");
	const refused = await restate({
		id: ledger.id,
		name: "Ledger",
		kind: "datastore",
		groups: ["platform"],
	});
	expect(refused.outcome).not.toBe("applied");
	expect(nodeNamed("Ledger").groups).toBeUndefined();

	// The consumer retires Billing. The worker still says it; the board still
	// reads, the warning names the node and the group, and the worker can still
	// be restated as it is.
	configure({ ...POLICY, groups: { fulfillment: { name: "Fulfillment" } } });
	const answer = read(board);
	const warning = answer.warnings.find((one) => one.path?.includes("billing"));
	expect(warning?.code).toBe("UNKNOWN_VOCABULARY");
	expect(warning?.path).toContain(nodeNamed("Worker").id);
	const worker = nodeNamed("Worker");
	expect(
		(
			await restate({
				id: worker.id,
				name: "Worker",
				kind: "job",
				parent: "Shipping",
				groups: ["billing", "fulfillment"],
				responsibility: "Ships it",
			})
		).outcome,
	).toBe("applied");
	// But a second node may not join the retired group anew.
	expect(
		(await restate({ id: ledger.id, name: "Ledger", kind: "datastore", groups: ["billing"] }))
			.outcome,
	).not.toBe("applied");
}, 20_000);

test("a board from before 2.2.0 carrying the singular label is refused with the conversion, not rewritten", () => {
	const held = read(board);
	const legacy = structuredClone(held.board) as unknown as {
		variants: { content: { nodes: Record<string, unknown>[] } }[];
	};
	const worker = legacy.variants[0]!.content.nodes.find((one) => one["name"] === "Worker")!;
	delete worker["groups"];
	worker["group"] = "the write path";
	const before = JSON.stringify(legacy);
	writeFileSync(held.location.file, before);
	const refused = store.readSemanticBoard(board);
	expect(refused.ok).toBe(false);
	if (!refused.ok) {
		expect(refused.code).toBe("BOARD_UNREADABLE");
		expect(refused.problem).toContain("Worker");
		expect(refused.problem).toContain("the write path");
		expect(refused.problem).toContain("2.2.0");
	}
	expect(JSON.stringify(JSON.parse(readFileSync(held.location.file, "utf8")))).toBe(
		JSON.stringify(JSON.parse(before)),
	);
}, 20_000);
