import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as store from "@/runtime/semantic-board-store/index";
import * as contract from "@/shared/semantic-board/index";

const vault = mkdtempSync(join(tmpdir(), "archboard-one-write-"));

const writer = { id: "test-agent", kind: "agent" as const };

/**
 * Start a board with the stated architecture.
 * @param name The board name.
 * @param stated What to put on it.
 * @returns What the write did.
 */
async function create(name: string, stated: Record<string, unknown> = {}) {
	return store.writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({ level: "system", ...stated, name }),
		),
	});
}

/**
 * Apply one batch of stated changes, as a caller that has just read the board.
 * @param name The board name.
 * @param stated The batch.
 * @param expectedVersion The version to state; the board's own when not given.
 * @returns What the write did.
 */
async function edit(name: string, stated: Record<string, unknown>, expectedVersion?: number) {
	const read = store.readSemanticBoard(vault, name);
	return store.writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition: store.editVariantTransition(contract.VariantEditInputSchema.parse(stated)),
		expectedVersion: expectedVersion ?? (read.ok ? read.board.version : 0),
	});
}

/** The nodes on a board's first variant, by name. */
const namesOn = (board: contract.SemanticBoard) =>
	board.variants[0]!.content.nodes.map((node) => node.name).toSorted();

afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

describe("one thing asked for is one write", () => {
	test("a container goes and its child is re-parented in the same command, in either order", async () => {
		for (const [name, order] of [
			["order-a", ["Wrapper"]],
			["order-b", ["Wrapper"]],
		] as const) {
			await create(name, {
				nodes: [
					{ name: "Wrapper", kind: "service" },
					{ name: "Inner", kind: "module", parent: "Wrapper" },
					{ name: "Host", kind: "service" },
				],
			});
			const read = store.readSemanticBoard(vault, name);
			const inner = read.ok
				? read.board.variants[0]!.content.nodes.find((n) => n.name === "Inner")!
				: undefined;
			const result = await edit(name, {
				nodes: [{ id: inner?.id, name: "Inner", kind: "module", parent: "Host" }],
				removeNodes: order,
			});
			expect(result.outcome).toBe("applied");
			if (result.outcome !== "applied") continue;
			expect(namesOn(result.board)).toEqual(["Host", "Inner"]);
		}
	});

	test("a container left with something inside it is refused with what to do", async () => {
		await create("orphan", {
			nodes: [
				{ name: "Wrapper", kind: "service" },
				{ name: "Inner", kind: "module", parent: "Wrapper" },
			],
		});
		const refused = await edit("orphan", { removeNodes: ["Wrapper"] });
		expect(refused.outcome === "rejected" && refused.code).toBe("NODE_HAS_CHILDREN");
		expect(refused.outcome === "rejected" && refused.problem).toContain("same command");
	});

	test("an edge named for removal that its endpoint already takes away is not an error", async () => {
		await create("overlap", {
			nodes: [
				{ name: "Left", kind: "module" },
				{ name: "Right", kind: "module" },
			],
			edges: [{ from: "Left", to: "Right", kind: "call" }],
		});
		const read = store.readSemanticBoard(vault, "overlap");
		const edgeId = read.ok ? read.board.variants[0]!.content.edges[0]!.id : "";
		const result = await edit("overlap", { removeNodes: ["Right"], removeEdges: [edgeId] });
		expect(result.outcome).toBe("applied");
		if (result.outcome !== "applied") return;
		expect(result.board.variants[0]!.content.edges).toEqual([]);
		expect(namesOn(result.board)).toEqual(["Left"]);
	});

	test("a part goes, its replacement arrives and the relationship moves onto it keeping its id", async () => {
		await create("moved-endpoint", {
			nodes: [
				{ name: "Driver", kind: "module" },
				{ name: "Old", kind: "module" },
			],
			edges: [{ from: "Driver", to: "Old", kind: "call", label: "place grid" }],
		});
		const read = store.readSemanticBoard(vault, "moved-endpoint");
		const before = read.ok ? read.board.variants[0]!.content.edges[0]! : undefined;
		const result = await edit("moved-endpoint", {
			removeNodes: ["Old"],
			nodes: [{ name: "New", kind: "module", as: "new" }],
			edges: [{ id: before?.id, from: "Driver", to: "new", kind: "call", label: "place grid" }],
		});
		expect(result.outcome).toBe("applied");
		if (result.outcome !== "applied") return;
		const content = result.board.variants[0]!.content;
		const moved = content.edges[0]!;
		expect(moved.id).toBe(before!.id);
		expect(moved.to).toBe(content.nodes.find((node) => node.name === "New")!.id);
		expect(namesOn(result.board)).toEqual(["Driver", "New"]);
		// The move is the whole instruction, so there is nothing to warn about.
		expect(result.warnings).toEqual([]);
	});

	test("a relationship left on the part the same command removes is refused", async () => {
		await create("stranded-endpoint", {
			nodes: [
				{ name: "Driver", kind: "module" },
				{ name: "Old", kind: "module" },
			],
			edges: [{ from: "Driver", to: "Old", kind: "call", label: "place grid" }],
		});
		const read = store.readSemanticBoard(vault, "stranded-endpoint");
		const before = read.ok ? read.board.variants[0]!.content.edges[0]! : undefined;
		const location = store.locateSemanticBoard("stranded-endpoint", vault);
		const bytes = readFileSync(location.file, "utf-8");
		const refused = await edit("stranded-endpoint", {
			removeNodes: ["Old"],
			edges: [{ id: before?.id, from: "Driver", to: "Old", kind: "call", label: "regrid" }],
		});
		expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_NODE");
		expect(refused.outcome === "rejected" && refused.problem).toContain("Old");
		expect(readFileSync(location.file, "utf-8")).toBe(bytes);

		// The two mistakes an endpoint can make read the same to an agent and are
		// not the same mistake, so the answer has to tell them apart: naming a
		// part this command removes is not naming nothing.
		const typo = await edit("stranded-endpoint", {
			edges: [{ id: before?.id, from: "Driver", to: "Nowhere", kind: "call" }],
		});
		expect(typo.outcome === "rejected" && typo.code).toBe("UNKNOWN_NODE");
		expect(typo.outcome === "rejected" && typo.problem).not.toBe(
			refused.outcome === "rejected" ? refused.problem : "",
		);
	});

	test("a relationship named for removal and stated again in the same batch is refused", async () => {
		await create("remove-and-restate", {
			nodes: [
				{ name: "Driver", kind: "module" },
				{ name: "Grid", kind: "module" },
			],
			edges: [{ from: "Driver", to: "Grid", kind: "call", label: "place grid" }],
		});
		const read = store.readSemanticBoard(vault, "remove-and-restate");
		const before = read.ok ? read.board.variants[0]!.content.edges[0]! : undefined;
		const location = store.locateSemanticBoard("remove-and-restate", vault);
		const bytes = readFileSync(location.file, "utf-8");
		const refused = await edit("remove-and-restate", {
			removeEdges: [before?.id],
			edges: [{ id: before?.id, from: "Driver", to: "Grid", kind: "call", label: "regrid" }],
		});
		expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_EDGE");
		expect(readFileSync(location.file, "utf-8")).toBe(bytes);
	});
});
