// What the vault checker says about a board whose overview is too crowded to
// read (ADR 0052).

import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import * as store from "@/runtime/semantic-board-store/index";
import { createConfiguredTestVault } from "@/runtime/semantic-board-store/tests/configured-vault";
import * as contract from "@/shared/semantic-board/index";

const vault = createConfiguredTestVault("archboard-overview-budget-");

afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

/**
 * Write one board of a service holding parts, each part calling the next.
 * @param name The board's name.
 * @param parts How many parts the service holds directly.
 * @param inAreas How many containers the parts are gathered into, or none.
 */
async function create(name: string, parts: number, inAreas = 0): Promise<void> {
	const areas = Array.from({ length: inAreas }, (_, index) => ({
		name: `Area ${index}`,
		kind: "module",
		parent: "Service",
	}));
	const nodes = Array.from({ length: parts }, (_, index) => ({
		name: `Part ${index}`,
		kind: "function",
		parent: inAreas === 0 ? "Service" : `Area ${index % inAreas}`,
	}));
	const edges = nodes.slice(1).map((node, index) => ({
		from: nodes[index]!.name,
		to: node.name,
		kind: "call",
	}));
	const written = await store.writeSemanticBoard({
		vault,
		board: name,
		writer: { kind: "agent" },
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name,
				level: "service",
				nodes: [{ name: "Service", kind: "service" }, ...areas, ...nodes],
				edges,
			}),
		),
	});
	if (written.outcome !== "applied") throw new Error(`seed refused: ${JSON.stringify(written)}`);
}

/**
 * Which boards the checker says are crowded.
 * @returns Their names.
 */
function crowded(): string[] {
	return store
		.checkSemanticVault(vault)
		.diagnostics.filter((issue) => issue.code === "OVERVIEW_CROWDED")
		.map((issue) => issue.board ?? "")
		.toSorted();
}

test("a flat board over the budget is crowded, and the same parts in areas are not", async () => {
	await create("Flat", 20);
	await create("Gathered", 20, 4);
	await create("Small", 10);
	expect(crowded()).toEqual(["Flat"]);
});
