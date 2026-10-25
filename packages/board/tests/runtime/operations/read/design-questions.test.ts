import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readDesignQuestions } from "#runtime/operations/read/design-questions.ts";
import { locateSemanticBoard } from "#runtime/store/location.ts";
import { createBoardTransition } from "#runtime/operations/write/transitions.ts";
import { writeSemanticBoard } from "#runtime/operations/write/write.ts";
import { BoardCreateInputSchema } from "#shared/protocol/board-input.ts";

// The design questions of a vault (ADR 0044, ADR 0057), read from the files of
// its boards: each board at its current variant, the boards that cannot be
// read listed with the reason, and the boards a caller names narrowing the read.

const vault = mkdtempSync(join(tmpdir(), "archboard-design-questions-"));
const writer = { kind: "agent" as const };

afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

/**
 * Write a board.
 * @param name The board.
 * @param lifecycle Whether the board's first variant is built.
 * @param nodes What it holds.
 * @param edges Its relationships, by the names of their ends.
 */
async function createBoard(
	name: string,
	lifecycle: "current" | "draft",
	nodes: object[],
	edges: object[] = [],
): Promise<void> {
	const written = await writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition: createBoardTransition(
			BoardCreateInputSchema.parse({ name, level: "system", lifecycle, nodes, edges }),
		),
	});
	expect(written.outcome).toBe("applied");
}

await createBoard(
	"Shop",
	"current",
	[
		{ name: "Shop", kind: "service" },
		{ name: "Cart", kind: "service", parent: "Shop" },
		{ name: "Web", kind: "service" },
		{ name: "Disk", kind: "service" },
	],
	[
		{ from: "Web", to: "Cart", kind: "call" },
		{ from: "Cart", to: "Disk", kind: "call" },
	],
);
await createBoard("Vault", "current", [
	{ name: "Vault", kind: "service" },
	{ name: "Keys", kind: "service", parent: "Vault" },
]);
await createBoard("Planned", "draft", [{ name: "Gateway", kind: "service" }]);
// A file that holds no coherent board.
const broken = locateSemanticBoard("Broken", vault).file;
mkdirSync(dirname(broken), { recursive: true });
writeFileSync(broken, "{}\n");

/**
 * The answer of a read that succeeded.
 * @param named The boards to narrow to.
 * @returns The reply.
 */
function replyOf(named?: readonly string[]) {
	const read = readDesignQuestions(vault, named);
	if (!read.ok) throw new Error(`refused: ${read.missing.join(", ")}`);
	return read.reply;
}

test("every board is read at its current variant, and the boards that cannot be read are listed with the reason", () => {
	const reply = replyOf();
	expect(reply.boards.map((one) => one.board).toSorted()).toEqual(["Shop", "Vault"]);
	expect(reply.skipped.toSorted((a, b) => a.board.localeCompare(b.board))).toEqual([
		expect.objectContaining({ board: "Broken", reason: "board-unreadable" }),
		{ board: "Planned", reason: "no-current-variant" },
	]);
	const { questions } = reply;
	expect(questions.passThroughEntryPoints.results.map((one) => one.board)).toEqual(["Shop"]);
	expect(questions.containersWithNoEntryPoint.results.map((one) => one.board)).toEqual(["Vault"]);
});

test("naming boards narrows the read, in the order named, whatever the case, and reads a board named twice once", () => {
	const reply = replyOf(["vault", "Shop", "VAULT"]);
	expect(reply.boards.map((one) => one.board)).toEqual(["Vault", "Shop"]);
	expect(reply.skipped).toEqual([]);
});

test("a named board nobody has built is skipped, not refused", () => {
	const reply = replyOf(["Planned"]);
	expect(reply.boards).toEqual([]);
	expect(reply.skipped).toEqual([{ board: "Planned", reason: "no-current-variant" }]);
});

test("a name that matches no board refuses the read and says which names matched none", () => {
	expect(readDesignQuestions(vault, ["Shop", "Shpo", "../outside"])).toEqual({
		ok: false,
		missing: ["Shpo", "../outside"],
	});
});
