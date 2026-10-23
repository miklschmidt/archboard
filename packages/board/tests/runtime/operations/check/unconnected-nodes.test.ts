import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { checkSemanticVault } from "#runtime/operations/check/diagnostics.ts";
import { semanticUnconnectedNodeDiagnostics } from "#runtime/operations/check/unconnected-nodes.ts";
import { writeSemanticBoard } from "#runtime/operations/write/write.ts";
import { createBoardTransition } from "#runtime/operations/write/transitions.ts";
import { readSemanticBoard } from "#runtime/operations/read/read.ts";
import { BoardCreateInputSchema } from "#shared/protocol/board-input.ts";
import { createConfiguredTestVault } from "#tests/runtime/support/configured-vault.ts";

const vault = createConfiguredTestVault("archboard-unconnected-");
afterAll(() => rmSync(vault, { recursive: true, force: true }));

/**
 * Persist a board through its normal write boundary.
 * @param input The authored payload.
 * @returns The stored board.
 */
async function create(input: Record<string, unknown>) {
	const name = String(input["name"]);
	const result = await writeSemanticBoard({
		vault,
		board: name,
		writer: { kind: "agent" },
		transition: createBoardTransition(BoardCreateInputSchema.parse(input)),
	});
	if (result.outcome !== "applied") throw new Error(JSON.stringify(result));
	const read = readSemanticBoard(vault, name);
	if (!read.ok) throw new Error(read.problem);
	return read.board;
}

test("warns only for nodes without another node connected by structure or exchange", async () => {
	const board = await create({
		name: "Connections",
		level: "service",
		nodes: [
			...[
				"Sender",
				"Receiver",
				"Container",
				"Flow sender",
				"Flow receiver",
				"Isolated",
				"Self",
			].map((name) => ({ name, kind: "module" })),
			{ name: "Child", kind: "module", parent: "Container" },
		],
		edges: [{ from: "Sender", to: "Receiver", kind: "call" }],
		flows: [
			{
				name: "Exchange",
				participants: ["Flow sender", "Flow receiver", "Isolated"],
				steps: [
					{
						kind: "loop",
						condition: "More work",
						steps: [{ from: "Flow sender", to: "Flow receiver", label: "Send" }],
					},
				],
			},
			{
				name: "Local work",
				participants: ["Self"],
				steps: [{ from: "Self", to: "Self", kind: "self", label: "Compute" }],
			},
		],
	});
	const issues = checkSemanticVault(vault).diagnostics.filter(
		(issue) => issue.code === "NODE_UNCONNECTED" && issue.board === board.name,
	);
	expect(issues.map((issue) => issue.subject?.name)).toEqual(["Isolated", "Self"]);
	for (const issue of issues) {
		expect(issue.severity).toBe("warning");
		expect(issue.variant).toBe(board.variants[0]!.name);
		expect(issue.subject).toEqual({
			kind: "node",
			id: board.variants[0]!.content.nodes.find((node) => node.name === issue.subject?.name)!.id,
			name: issue.subject!.name,
		});
	}
});

test("checks singleton current and draft content but leaves frozen variants alone", async () => {
	const board = await create({
		name: "Singleton",
		level: "service",
		nodes: [{ name: "Alone", kind: "module" }],
	});
	const variant = board.variants[0]!;
	const family = {
		...board,
		variants: (["current", "draft", "historical", "shelved"] as const).map((lifecycle) =>
			Object.assign({}, variant, { name: lifecycle, lifecycle }),
		),
	};
	expect(
		semanticUnconnectedNodeDiagnostics(family, "board.semantic.json").map((issue) => issue.variant),
	).toEqual(["current", "draft"]);
	const empty = await create({ name: "Empty", level: "service" });
	expect(semanticUnconnectedNodeDiagnostics(empty, "empty.semantic.json")).toEqual([]);
});
