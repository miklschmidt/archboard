// An anchor on a relationship and a flow step, and a symbol on a binding, as
// an agent writes them and as the board keeps them (ADR 0046).

import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as store from "@/runtime/semantic-board-store/index";
import * as contract from "@/shared/semantic-board/index";

const vault = mkdtempSync(join(tmpdir(), "archboard-anchors-"));
const writer = { kind: "agent" as const };
let board = "";
let boards = 0;

const REPO = "github.com/acme/shop";
const CALL = { repo: REPO, path: "src/checkout.ts", symbol: "placeOrder" };
const REPLY = { repo: REPO, path: "src/orders.ts", symbol: "Orders.accept" };

beforeEach(async () => {
	board = `anchors-${++boards}`;
	const created = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name: board,
				level: "module",
				nodes: [
					{ name: "Checkout", kind: "module" },
					{
						name: "Orders",
						kind: "module",
						binding: { repo: REPO, path: "src/orders.ts", symbol: "Orders" },
					},
				],
				edges: [{ from: "Checkout", to: "Orders", kind: "call", label: "place", anchor: CALL }],
				flows: [
					{
						name: "Place an order",
						participants: ["Checkout", "Orders"],
						steps: [
							{ from: "Checkout", to: "Orders", label: "place", anchor: CALL },
							{ from: "Orders", to: "Checkout", label: "accepted", kind: "return", anchor: REPLY },
						],
					},
				],
			}),
		),
	});
	expect(created.outcome).toBe("applied");
});

afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

/**
 * The content of this test's board as the file holds it.
 * @returns The current variant's content.
 */
function current() {
	const result = store.readSemanticBoard(vault, board);
	if (!result.ok) throw new Error(result.problem);
	return result.board.variants[0]!.content;
}

/**
 * Apply one batch at the version on disk.
 * @param input The batch as an agent states it.
 * @returns What the write did.
 */
function edit(input: unknown) {
	const read = store.readSemanticBoard(vault, board);
	if (!read.ok) throw new Error(read.problem);
	return store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: read.board.version,
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

test("a new board keeps the anchors and the binding symbol the agent wrote", () => {
	const content = current();
	expect(content.edges[0]?.anchor).toEqual(CALL);
	expect(content.flows[0]?.steps.map((step) => step.anchor)).toEqual([CALL, REPLY]);
	expect(content.nodes[1]?.binding?.symbol).toBe("Orders");
});

test("an anchor is stated whole: a missing field is refused at the boundary", () => {
	const { symbol: _symbol, ...unnamed } = CALL;
	for (const anchor of [unnamed, { ...CALL, symbol: " " }, { ...CALL, line: 12 }]) {
		const stated = { from: "Checkout", to: "Orders", kind: "call", anchor };
		expect(contract.VariantEditInputSchema.safeParse({ edges: [stated] }).success).toBe(false);
	}
});

test("restating a relationship with its anchor keeps it and says nothing", async () => {
	const edge = current().edges[0]!;
	const result = await edit({ edges: [{ ...edge, label: "place order" }] });
	expect(warningsOf(result)).toEqual([]);
	expect(current().edges[0]?.anchor).toEqual(CALL);
});

test("restating a relationship without its anchor drops it and says so", async () => {
	const { anchor: _anchor, ...edge } = current().edges[0]!;
	const result = await edit({ edges: [{ ...edge, label: "place order" }] });
	expect(warningsOf(result)).toEqual([["ANCHOR_DROPPED", `edges.${edge.id}.anchor`]]);
	expect(current().edges[0]?.anchor).toBeUndefined();
});

test("restating a flow drops the anchor of each step stated without one, and says so", async () => {
	const flow = current().flows[0]!;
	const [placed, accepted] = flow.steps;
	const { anchor: _anchor, ...bare } = accepted!;
	const result = await edit({ flows: [{ ...flow, steps: [placed, bare] }] });
	expect(warningsOf(result)).toEqual([
		["ANCHOR_DROPPED", `flows.${flow.id}.steps.${accepted!.id}.anchor`],
	]);
	expect(current().flows[0]?.steps.map((step) => step.anchor)).toEqual([CALL, undefined]);
});
