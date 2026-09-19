// The third answer to a removal (TASK-213): a draft that removed a node its
// predecessor went on to change may bring it back, under the original id and
// in its own words, with one ordinary edit — and that edit settles the
// disagreement in the same write. Unknown and wrong-kind ids stay refused.
//
// The shape is the S11 evaluation scenario: a draft renames, rewords and
// removes; the predecessor then touches the same three nodes; a partial
// `resolve` settles two of the three; the restoration settles the last.

import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-restoration-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

const DRAFT = "Provider rewrite";
let board = "";
let boards = 0;
let ids: { app: string; helpers: string; tagged: string } = { app: "", helpers: "", tagged: "" };

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	ownVaultOrRefuse(vault, store.locateSemanticBoard("where this owner writes").file);
	contract = await import("@/shared/semantic-board/index");
});
beforeEach(async () => {
	boards += 1;
	board = `restoring-${boards}`;
	await store.writeSemanticBoard({
		board,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name: board,
				level: "service",
				nodes: [
					{ name: "Flask app", kind: "app", responsibility: "Creates the app" },
					{ name: "JSON helpers", kind: "module", responsibility: "dumps, loads, jsonify" },
					{
						name: "Tagged JSON",
						kind: "module",
						responsibility: "Serializes tagged values",
						description: "Serializes tagged values in sessions",
					},
				],
				edges: [
					{ from: "Flask app", to: "JSON helpers", kind: "call", label: "jsonify" },
					{ from: "Tagged JSON", to: "JSON helpers", kind: "call", label: "dumps / loads" },
				],
			}),
		),
	});
	const nodes = read().variants[0]!.content.nodes;
	ids = {
		app: nodes.find((node) => node.name === "Flask app")!.id,
		helpers: nodes.find((node) => node.name === "JSON helpers")!.id,
		tagged: nodes.find((node) => node.name === "Tagged JSON")!.id,
	};
	await write(
		store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ from: read().variants[0]!.name, name: DRAFT }),
		),
	);
	// The draft renames the helpers, rewords the app and removes the tagging.
	await edit({
		variant: DRAFT,
		nodes: [
			{
				id: ids.helpers,
				name: "Provider-backed helpers",
				kind: "module",
				responsibility: "dumps, loads, jsonify",
			},
			{ id: ids.app, name: "Flask app", kind: "app", responsibility: "Owns the provider" },
		],
		removeNodes: ["Tagged JSON"],
	});
	// The predecessor then touches all three.
	await edit({
		nodes: [
			{
				id: ids.helpers,
				name: "JSON helper functions",
				kind: "module",
				responsibility: "dumps, loads, jsonify",
			},
			{
				id: ids.app,
				name: "Flask app",
				kind: "app",
				responsibility: "Creates the app and holds the provider",
			},
			{
				id: ids.tagged,
				name: "Tagged JSON",
				kind: "module",
				responsibility: "Serializes tagged values",
				description: "Serializes tagged values in signed session cookies",
			},
		],
	});
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
 * One variant, by name.
 * @param name What it is called.
 * @returns The variant.
 */
function variant(name: string) {
	const found = read().variants.find((one) => one.name === name);
	if (found === undefined) throw new Error(`no variant called ${name}`);
	return found;
}

/**
 * One write against the version as read.
 * @param transition The command.
 * @returns What the write did.
 */
async function write(transition: StoreModule.SemanticTransition) {
	return store.writeSemanticBoard({ board, writer, expectedVersion: read().version, transition });
}

/**
 * One ordinary edit.
 * @param input The batch, as an agent would state it.
 * @returns What the write did.
 */
async function edit(input: unknown) {
	return write(store.editVariantTransition(contract.VariantEditInputSchema.parse(input)));
}

/**
 * The open disagreements of the draft, by subject and kind.
 * @returns One line per issue.
 */
function open(): string[] {
	return (variant(DRAFT).reconciliation?.issues ?? [])
		.map(
			(issue) =>
				`${issue.subject}:${issue.kind}${issue.field === undefined ? "" : `.${issue.field}`}`,
		)
		.toSorted();
}

/**
 * Settle the two field disagreements the way S11 asks: the predecessor's name,
 * the draft's own responsibility.
 * @returns What the write did.
 */
async function settleFields() {
	return write(
		store.settleVariantTransition(
			contract.ResolutionInputSchema.parse({
				variant: DRAFT,
				choices: [
					{ subject: ids.helpers, field: "name", side: "theirs" },
					{ subject: ids.app, field: "responsibility", side: "mine" },
				],
			}),
		),
	);
}

test("the fixture holds three disagreements of three kinds, and a partial resolve leaves the removal open", async () => {
	expect(open()).toEqual(
		[
			`${ids.helpers}:competing-field.name`,
			`${ids.app}:competing-field.responsibility`,
			`${ids.tagged}:deleted-and-changed`,
		].toSorted(),
	);
	const settled = await settleFields();
	expect(settled.outcome).toBe("applied");
	expect(open()).toEqual([`${ids.tagged}:deleted-and-changed`]);
	expect(variant(DRAFT).content.nodes.find((node) => node.id === ids.helpers)?.name).toBe(
		"JSON helper functions",
	);
}, 30_000);

test("an ordinary edit restores the removed node under its original id and settles the disagreement", async () => {
	await settleFields();
	const before = read();
	const restored = await edit({
		variant: DRAFT,
		nodes: [
			{
				id: ids.tagged,
				name: "Tagged JSON",
				kind: "module",
				responsibility: "Serializes tagged values",
				description: "Serializes tagged values in signed session cookies",
			},
		],
	});
	expect(restored.outcome).toBe("applied");
	if (restored.outcome !== "applied") throw new Error("not applied");
	const draft = variant(DRAFT);
	// The node is back under the identity the whole family knows it by, with
	// the requested field values, and nothing is open any more.
	const tagged = draft.content.nodes.find((node) => node.id === ids.tagged);
	expect(tagged?.description).toBe("Serializes tagged values in signed session cookies");
	expect(draft.reconciliation).toBeUndefined();
	expect(draft.lifecycle).toBe("draft");
	// One write, one version, and the answer says the draft settled.
	expect(read().version).toBe(before.version + 1);
	expect(restored.descendants.map((one) => one.outcome)).toEqual([]);
	// Everything the earlier choices decided stands.
	expect(draft.content.nodes.find((node) => node.id === ids.helpers)?.name).toBe(
		"JSON helper functions",
	);
	expect(draft.content.nodes.find((node) => node.id === ids.app)?.responsibility).toBe(
		"Owns the provider",
	);
}, 30_000);

test("a third wording is the draft's own answer, not a new disagreement", async () => {
	await settleFields();
	const restored = await edit({
		variant: DRAFT,
		nodes: [
			{
				id: ids.tagged,
				name: "Tagged JSON",
				kind: "module",
				responsibility: "Serializes tagged values for signed sessions",
				description: "Kept: sessions still round-trip tagged values",
			},
		],
	});
	expect(restored.outcome).toBe("applied");
	expect(variant(DRAFT).reconciliation).toBeUndefined();
	expect(variant(DRAFT).content.nodes.find((node) => node.id === ids.tagged)?.description).toBe(
		"Kept: sessions still round-trip tagged values",
	);
	// And it is durable: the predecessor moving again does not find the same
	// removal-against-change a second time.
	const moved = await edit({
		nodes: [
			{
				id: ids.helpers,
				name: "JSON helper functions",
				kind: "module",
				responsibility: "dumps, loads, jsonify and the provider",
			},
		],
	});
	expect(moved.outcome).toBe("applied");
	expect(variant(DRAFT).reconciliation).toBeUndefined();
}, 30_000);

test("restoring before the field disagreements are answered settles only the removal and keeps the rest visible", async () => {
	const restored = await edit({
		variant: DRAFT,
		nodes: [
			{
				id: ids.tagged,
				name: "Tagged JSON",
				kind: "module",
				responsibility: "Serializes tagged values",
				description: "Serializes tagged values in signed session cookies",
			},
		],
	});
	expect(restored.outcome).toBe("applied");
	if (restored.outcome !== "applied") throw new Error("not applied");
	expect(open()).toEqual(
		[`${ids.helpers}:competing-field.name`, `${ids.app}:competing-field.responsibility`].toSorted(),
	);
	// The answer to the write says what is still open.
	expect(restored.descendants).toHaveLength(1);
	expect(restored.descendants[0]).toMatchObject({ name: DRAFT, outcome: "conflicted" });
	expect(restored.descendants[0]?.issues).toHaveLength(2);
	expect(variant(DRAFT).lifecycle).toBe("draft");
	// The draft's own wording of the fields it is arguing about is untouched.
	expect(variant(DRAFT).content.nodes.find((node) => node.id === ids.helpers)?.name).toBe(
		"Provider-backed helpers",
	);
}, 30_000);

test("an unknown id stays refused, and nothing is written", async () => {
	await settleFields();
	const before = read();
	for (const stated of ["nope1", ids.helpers.split("").toReversed().join(""), read().id]) {
		const refused = await edit({
			variant: DRAFT,
			nodes: [{ id: stated, name: "Tagged JSON", kind: "module" }],
		});
		expect(refused.outcome === "rejected" && refused.code, stated).toBe("UNKNOWN_NODE");
	}
	expect(read()).toEqual(before);
}, 30_000);

test("a sibling's node is refused, and a settled removal may be restored later", async () => {
	await settleFields();
	await write(
		store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ name: "Sibling", from: read().variants[0]!.name }),
		),
	);
	const added = await edit({ variant: "Sibling", nodes: [{ name: "Only here", kind: "module" }] });
	expect(added.outcome).toBe("applied");
	const sibling = variant("Sibling").content.nodes.find((node) => node.name === "Only here")!;
	const refused = await edit({
		variant: DRAFT,
		nodes: [{ id: sibling.id, name: "Only here", kind: "module" }],
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_NODE");
	// Keeping a removal settles it, but does not discard the inherited identity.
	const kept = await write(
		store.settleVariantTransition(
			contract.ResolutionInputSchema.parse({
				variant: DRAFT,
				choices: [{ subject: ids.tagged, side: "mine" }],
			}),
		),
	);
	expect(kept.outcome).toBe("applied");
	expect(variant(DRAFT).reconciliation).toBeUndefined();
	const late = await edit({
		variant: DRAFT,
		nodes: [{ id: ids.tagged, name: "Tagged JSON", kind: "module" }],
	});
	expect(late.outcome).toBe("applied");
	expect(variant(DRAFT).reconciliation).toBeUndefined();
}, 30_000);

test("a node stated without an id is still new, even when a removed one has its name", async () => {
	await settleFields();
	const added = await edit({
		variant: DRAFT,
		nodes: [{ name: "Tagged JSON", kind: "module", responsibility: "A second tagging module" }],
	});
	expect(added.outcome).toBe("applied");
	const twin = variant(DRAFT).content.nodes.find((node) => node.name === "Tagged JSON");
	expect(twin?.id).not.toBe(ids.tagged);
	// The argument about the original is still open: nothing here answered it.
	expect(open()).toEqual([`${ids.tagged}:deleted-and-changed`]);
}, 30_000);

test("a restoration that fails elsewhere in the batch writes nothing", async () => {
	await settleFields();
	const before = read();
	const refused = await edit({
		variant: DRAFT,
		nodes: [{ id: ids.tagged, name: "Tagged JSON", kind: "module" }],
		edges: [{ from: "Tagged JSON", to: "Nobody", kind: "call" }],
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_NODE");
	expect(read()).toEqual(before);
}, 30_000);

test("deleted relationships and flows cannot authorize node identities", async () => {
	const added = await edit({
		edges: [{ from: ids.helpers, to: ids.app, kind: "call", label: "decode" }],
		flows: [
			{
				name: "Decode request",
				participants: [ids.app, ids.helpers],
				steps: [{ from: ids.app, to: ids.helpers, label: "decode" }],
			},
		],
	});
	expect(added.outcome).toBe("applied");
	const current = variant("Initial");
	const edge = current.content.edges.find((one) => one.label === "decode")!;
	const flow = current.content.flows.find((one) => one.name === "Decode request")!;
	await write(
		store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ from: "Initial", name: "Kind draft" }),
		),
	);
	await edit({ variant: "Kind draft", removeEdges: [edge.id], removeFlows: [flow.id] });
	await edit({
		edges: [{ ...edge, label: "decode tagged values" }],
		flows: [
			{
				...flow,
				steps: [{ ...flow.steps[0], label: "decode tagged values" }],
			},
		],
	});
	const kindDraft = variant("Kind draft");
	expect(kindDraft.reconciliation?.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				subject: edge.id,
				what: "relationship",
				kind: "deleted-and-changed",
			}),
			expect.objectContaining({ subject: flow.id, what: "flow", kind: "deleted-and-changed" }),
		]),
	);
	const before = read();
	for (const id of [edge.id, flow.id]) {
		const refused = await edit({
			variant: "Kind draft",
			nodes: [{ id, name: "Wrong kind", kind: "module" }],
		});
		expect(refused.outcome === "rejected" && refused.code, id).toBe("UNKNOWN_NODE");
	}
	expect(read()).toEqual(before);
}, 30_000);
