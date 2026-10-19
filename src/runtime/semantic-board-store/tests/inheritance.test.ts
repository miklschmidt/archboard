// A proposal holds the whole architecture at its point (TASK-487). An edit that
// re-creates a part an ancestor holds under another id, or that removes most
// of what the variant inherited, is refused unless it confirms the code; a
// deliberate replacement and an ordinary edit need no confirmation.

import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as store from "@/runtime/semantic-board-store/index";
import {
	BoardCreateInputSchema,
	VariantEditInputSchema,
	BoardBranchInputSchema,
} from "@archboard/board/board-input";

const vault = mkdtempSync(join(tmpdir(), "archboard-inheritance-"));
const writer = { kind: "agent" as const };
const REPO = "device-trust";
const GATEWAY = { repo: REPO, path: "src/gateway", symbol: "Gateway" };
let board = "";
let boards = 0;

beforeEach(async () => {
	board = `inheritance-${++boards}`;
	await write(
		store.createBoardTransition(
			BoardCreateInputSchema.parse({
				name: board,
				level: "service",
				nodes: [
					{ name: "Gateway", kind: "service", binding: GATEWAY },
					{ name: "Registry", kind: "service" },
					{ name: "Policy", kind: "module" },
					{ name: "Audit log", kind: "store" },
					{ name: "Enrollment", kind: "service" },
					{ name: "Console", kind: "app" },
				],
			}),
		),
	);
	await branch("Initial", "First PR");
});

afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

/**
 * One write against the version as read.
 * @param transition The command.
 * @returns What the write did.
 */
function write(transition: store.SemanticTransition) {
	const found = store.readSemanticBoard(vault, board);
	return store.writeSemanticBoard({
		vault,
		board,
		writer,
		...(found.ok ? { expectedVersion: found.board.version } : {}),
		transition,
	});
}

/**
 * The board as it now stands.
 * @returns The board.
 */
function read() {
	const found = store.readSemanticBoard(vault, board);
	if (!found.ok) throw new Error(found.problem);
	return found.board;
}

/**
 * One variant's nodes, by name.
 * @param name The variant.
 * @returns Its nodes.
 */
function nodesOf(name: string) {
	return read().variants.find((one) => one.name === name)!.content.nodes;
}

/**
 * One ordinary edit.
 * @param input The batch, as an agent would state it.
 * @returns What the write did.
 */
function edit(input: unknown) {
	return write(store.editVariantTransition(VariantEditInputSchema.parse(input)));
}

/**
 * Derive a proposal.
 * @param from The predecessor's name.
 * @param name The proposal's name.
 * @returns What the write did.
 */
function branch(from: string, name: string) {
	return write(store.branchVariantTransition(BoardBranchInputSchema.parse({ from, name })));
}

/**
 * What a write refused with, or warned about when it landed.
 * @param result The write's answer.
 * @returns The refusal code, or each warning as code and path.
 */
function answer(result: Awaited<ReturnType<typeof edit>>) {
	return result.outcome === "applied"
		? result.warnings.map((warning) => [warning.code, warning.path])
		: result.code;
}

test("a part re-created by name under a grandparent's id is refused, and lands when confirmed", async () => {
	const gateway = nodesOf("First PR").find((node) => node.name === "Gateway")!;
	await edit({ variant: "First PR", removeNodes: [gateway.id] });
	await branch("First PR", "Second PR");
	const before = read();
	const recreating = { variant: "Second PR", nodes: [{ name: "Gateway", kind: "service" }] };
	const refused = await edit(recreating);
	expect(answer(refused)).toBe("PART_RECREATED");
	// The refusal names the id that brings the part back and the variant holding it.
	expect(refused.outcome === "rejected" && refused.problem).toContain(gateway.id);
	expect(refused.outcome === "rejected" && refused.problem).toContain("Initial");
	expect(read()).toEqual(before);
	const confirmed = await edit({ ...recreating, confirm: ["PART_RECREATED"] });
	const added = nodesOf("Second PR").find((node) => node.name === "Gateway")!;
	expect(answer(confirmed)).toEqual([["PART_RECREATED", `nodes.${added.id}`]]);
	expect(added.id).not.toBe(gateway.id);
});

test("a part re-created under another name with exactly the original's binding is refused", async () => {
	const gateway = nodesOf("First PR").find((node) => node.name === "Gateway")!;
	const refused = await edit({
		variant: "First PR",
		removeNodes: [gateway.id],
		nodes: [{ name: "Edge gateway", kind: "service", binding: GATEWAY }],
	});
	expect(answer(refused)).toBe("PART_RECREATED");
});

test("stating the ancestor's id brings the part back with no confirmation", async () => {
	const gateway = nodesOf("First PR").find((node) => node.name === "Gateway")!;
	await edit({ variant: "First PR", removeNodes: [gateway.id] });
	const restored = await edit({ variant: "First PR", nodes: [gateway] });
	expect(answer(restored)).toEqual([]);
	expect(nodesOf("First PR")).toContainEqual(gateway);
});

test("removing more than half of what a proposal inherited is refused, and lands when confirmed", async () => {
	const [, , ...dropped] = nodesOf("First PR").map((node) => node.id);
	const before = read();
	const removing = { variant: "First PR", removeNodes: dropped };
	expect(answer(await edit(removing))).toBe("INHERITANCE_DROPPED");
	expect(read()).toEqual(before);
	const confirmed = await edit({ ...removing, confirm: ["INHERITANCE_DROPPED"] });
	expect(answer(confirmed)).toEqual([["INHERITANCE_DROPPED", "nodes"]]);
	expect(nodesOf("First PR")).toHaveLength(2);
	// Exactly half is not most of it.
	await branch("Initial", "Half");
	const half = await edit({ variant: "Half", removeNodes: dropped.slice(1) });
	expect(answer(half)).toEqual([]);
});

test("a deliberate replacement and ordinary edits need no confirmation", async () => {
	const gateway = nodesOf("First PR").find((node) => node.name === "Gateway")!;
	const replaced = await edit({
		variant: "First PR",
		removeNodes: [gateway.id],
		nodes: [
			{ name: "Edge proxy", kind: "service", binding: { ...GATEWAY, path: "src/edge" } },
			{ id: nodesOf("First PR")[1]!.id, name: "Device registry", kind: "service" },
			{ name: "Attestation", kind: "service" },
		],
	});
	expect(answer(replaced)).toEqual([]);
	// The variant nothing derives from may be cut down as far as its author likes.
	const [, ...rest] = nodesOf("Initial").map((node) => node.id);
	expect(answer(await edit({ variant: "Initial", removeNodes: rest }))).toEqual([]);
});
