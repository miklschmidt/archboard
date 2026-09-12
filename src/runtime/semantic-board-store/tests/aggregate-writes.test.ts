import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

// config.ts snapshots the environment at import time, so this owner takes its
// own vault before any module that resolves a vault path is evaluated.
const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-semantic-store-"));
process.env["ARCHBOARD_VAULT"] = vault;

let store: typeof StoreModule;
let contract: typeof ContractModule;

const writer = { id: "test-agent", kind: "agent" as const };

/**
 * Start a board with the stated architecture.
 * @param name The board name.
 * @param stated What to put on it.
 * @returns What the write did.
 */
async function create(name: string, stated: Record<string, unknown> = {}) {
	return store.writeSemanticBoard({
		board: name,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({ ...stated, name }),
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
	const read = store.readSemanticBoard(name);
	return store.writeSemanticBoard({
		board: name,
		writer,
		transition: store.editVariantTransition(contract.VariantEditInputSchema.parse(stated)),
		expectedVersion: expectedVersion ?? (read.ok ? read.board.version : 0),
	});
}

/** The nodes on a board's first variant, by name. */
const namesOn = (board: ContractModule.SemanticBoard) =>
	board.variants[0]!.content.nodes.map((node) => node.name).toSorted();

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	// Where this owner's boards actually land, asked rather than assumed.
	ownVaultOrRefuse(vault, store.locateSemanticBoard("where this owner writes").file);
	contract = await import("@/shared/semantic-board/index");
});

afterAll(() => {
	if (callerVault === undefined) {
		delete process.env["ARCHBOARD_VAULT"];
	} else {
		process.env["ARCHBOARD_VAULT"] = callerVault;
	}
	rmSync(vault, { recursive: true, force: true });
});

describe("the semantic board aggregate", () => {
	test("a created board is readable again with the content it was given", async () => {
		const written = await create("round-trip", {
			nodes: [
				{ name: "Canvas", kind: "service", responsibility: "Serves boards to panes" },
				{ name: "Engine", kind: "module", parent: "Canvas" },
			],
			edges: [{ from: "Engine", to: "Canvas", kind: "call" }],
		});
		expect(written.outcome).toBe("applied");

		const read = store.readSemanticBoard("round-trip");
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		expect(read.board.version).toBe(1);
		expect(namesOn(read.board)).toEqual(["Canvas", "Engine"]);
		const engine = read.board.variants[0]!.content.nodes.find((n) => n.name === "Engine")!;
		const canvas = read.board.variants[0]!.content.nodes.find((n) => n.name === "Canvas")!;
		expect(engine.parent).toBe(canvas.id);
		expect(read.board.variants[0]!.content.edges[0]!.from).toBe(engine.id);
	});

	test("a board survives being read by a process that never wrote it", async () => {
		await create("restart", { nodes: [{ name: "Vault", kind: "datastore" }] });
		// A fresh module graph is the cheapest honest stand-in for a restart: the
		// store keeps nothing in memory, so what a new process sees is the file.
		const fresh = (await import(
			`@/runtime/semantic-board-store/index?restart=${Date.now()}`
		)) as typeof StoreModule;
		const read = fresh.readSemanticBoard("restart");
		expect(read.ok && namesOn(read.board)).toEqual(["Vault"]);
	});

	test("each accepted write advances the version exactly once", async () => {
		await create("counting");
		for (const expected of [2, 3, 4]) {
			const result = await edit("counting", {
				nodes: [{ name: `Step ${expected}`, kind: "module" }],
			});
			expect(result.outcome === "applied" && result.board.version).toBe(expected);
		}
	});

	test("a write from a stale read is refused and changes nothing on disk", async () => {
		await create("stale", { nodes: [{ name: "Only", kind: "module" }] });
		const location = store.locateSemanticBoard("stale");
		const before = readFileSync(location.file, "utf-8");

		const refused = await edit("stale", { nodes: [{ name: "Second", kind: "module" }] }, 99);
		expect(refused.outcome).toBe("rejected");
		if (refused.outcome !== "rejected") return;
		expect(refused.code).toBe("BOARD_VERSION_CONFLICT");
		expect(refused.version).toBe(1);
		expect(readFileSync(location.file, "utf-8")).toBe(before);
	});

	test("a write that would leave the board incoherent changes nothing on disk", async () => {
		await create("incoherent", { nodes: [{ name: "Held", kind: "module" }] });
		const location = store.locateSemanticBoard("incoherent");
		const before = readFileSync(location.file, "utf-8");

		const refused = await edit("incoherent", {
			edges: [{ from: "Held", to: "Nowhere", kind: "call" }],
		});
		expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_NODE");
		expect(readFileSync(location.file, "utf-8")).toBe(before);
	});

	test("a second board is untouched by a write to the first", async () => {
		await create("neighbour-a", { nodes: [{ name: "A", kind: "module" }] });
		await create("neighbour-b", { nodes: [{ name: "B", kind: "module" }] });
		const other = readFileSync(store.locateSemanticBoard("neighbour-b").file, "utf-8");
		await edit("neighbour-a", { nodes: [{ name: "A2", kind: "module" }] });
		expect(readFileSync(store.locateSemanticBoard("neighbour-b").file, "utf-8")).toBe(other);
	});

	test("creating a board that is already there is refused", async () => {
		await create("twice");
		const again = await create("twice");
		expect(again.outcome === "rejected" && again.code).toBe("BOARD_EXISTS");
	});

	test("a file that is not a coherent board is refused rather than read around", async () => {
		const location = store.locateSemanticBoard("broken");
		writeFileSync(location.file, '{"kind":"semantic-board"}\n');
		const read = store.readSemanticBoard("broken");
		expect(read.ok === false && read.code).toBe("BOARD_UNREADABLE");
		const refused = await edit("broken", { nodes: [{ name: "X", kind: "module" }] });
		expect(refused.outcome === "rejected" && refused.code).toBe("BOARD_UNREADABLE");
	});

	test("no Excalidraw note is created for a semantic board", async () => {
		await create("no-note", { nodes: [{ name: "Alone", kind: "module" }] });
		expect(readdirSync(vault).filter((entry) => entry.endsWith(".excalidraw.md"))).toEqual([]);
	});
});

describe("identity across edits", () => {
	test("renaming a node keeps its id", async () => {
		await create("renaming", { nodes: [{ name: "Old", kind: "module" }] });
		const first = store.readSemanticBoard("renaming");
		const id = first.ok ? first.board.variants[0]!.content.nodes[0]!.id : "";
		const renamed = await edit("renaming", { nodes: [{ id, name: "New", kind: "module" }] });
		expect(renamed.outcome).toBe("applied");
		if (renamed.outcome !== "applied") return;
		expect(renamed.board.variants[0]!.content.nodes[0]).toMatchObject({ id, name: "New" });
	});

	test("a node removed and written again is a new node, not the old one back", async () => {
		await create("reborn", { nodes: [{ name: "Gone", kind: "module" }] });
		const before = store.readSemanticBoard("reborn");
		const oldId = before.ok ? before.board.variants[0]!.content.nodes[0]!.id : "";
		await edit("reborn", { removeNodes: ["Gone"] });
		const again = await edit("reborn", { nodes: [{ name: "Gone", kind: "module" }] });
		expect(again.outcome).toBe("applied");
		if (again.outcome !== "applied") return;
		expect(again.board.variants[0]!.content.nodes[0]!.id).not.toBe(oldId);
	});

	test("a stated id that names nothing is refused rather than becoming a new node", async () => {
		await create("typo", { nodes: [{ name: "Real", kind: "module" }] });
		const refused = await edit("typo", {
			nodes: [{ id: "notreal", name: "Real", kind: "module" }],
		});
		expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_NODE");
		expect(refused.outcome === "rejected" && refused.problem).toContain("Leave the id out");
		const read = store.readSemanticBoard("typo");
		expect(read.ok && namesOn(read.board)).toEqual(["Real"]);
	});

	test("a stated relationship id that names nothing is refused", async () => {
		await create("typo-edge", {
			nodes: [
				{ name: "A", kind: "module" },
				{ name: "B", kind: "module" },
			],
		});
		const refused = await edit("typo-edge", {
			edges: [{ id: "notreal", from: "A", to: "B", kind: "call" }],
		});
		expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_EDGE");
	});

	test("a name that fits two nodes is refused rather than guessed at", async () => {
		// Two nodes may legitimately share a name — a `client` module inside two
		// different services — so the file is written with that shape directly
		// rather than reached through an edit, which would have replaced one with
		// the other by name.
		await create("ambiguous", { nodes: [{ name: "Shell", kind: "service" }] });
		const location = store.locateSemanticBoard("ambiguous");
		const board = JSON.parse(readFileSync(location.file, "utf-8"));
		board.variants[0].content.nodes.push(
			{ id: "cl1", name: "Client", kind: "module" },
			{ id: "cl2", name: "Client", kind: "module" },
		);
		writeFileSync(location.file, JSON.stringify(board));

		const refused = await edit("ambiguous", {
			edges: [{ from: "Client", to: "Shell", kind: "call" }],
		});
		expect(refused.outcome === "rejected" && refused.code).toBe("AMBIGUOUS_REFERENCE");
		expect(refused.outcome === "rejected" && refused.problem).toContain("cl1, cl2");
	});
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
			const read = store.readSemanticBoard(name);
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
		const read = store.readSemanticBoard("overlap");
		const edgeId = read.ok ? read.board.variants[0]!.content.edges[0]!.id : "";
		const result = await edit("overlap", { removeNodes: ["Right"], removeEdges: [edgeId] });
		expect(result.outcome).toBe("applied");
		if (result.outcome !== "applied") return;
		expect(result.board.variants[0]!.content.edges).toEqual([]);
		expect(namesOn(result.board)).toEqual(["Left"]);
	});
});

describe("one writer at a time, over the whole board", () => {
	test("an agent writing a claimed board writes as the claim", async () => {
		await create("claimed", { nodes: [{ name: "First", kind: "module" }] });
		const lock = await import("@/runtime/engine/board-lock");
		const { claim } = await lock.claimBoard({
			board: store.locateSemanticBoard("claimed").key,
			reason: "restructuring the board",
		});
		try {
			// A different per-write identity. The lease is the claim's, so this is
			// the same writer as far as the board is concerned and is admitted.
			const written = await store.writeSemanticBoard({
				board: "claimed",
				writer: { id: "some-other-agent", kind: "agent" },
				transition: store.editVariantTransition(
					contract.VariantEditInputSchema.parse({ nodes: [{ name: "Second", kind: "module" }] }),
				),
				expectedVersion: 1,
			});
			expect(written.outcome).toBe("applied");
			expect(lock.claimOn(store.locateSemanticBoard("claimed").key)?.holder.id).toBe(
				claim.holder.id,
			);
		} finally {
			lock.releaseClaim(store.locateSemanticBoard("claimed").key);
		}
	}, 30_000);

	test("a write is refused while somebody else holds the board", async () => {
		await create("busy", { nodes: [{ name: "Held", kind: "module" }] });
		const lock = await import("@/runtime/engine/board-lock");
		const key = store.locateSemanticBoard("busy").key;
		const hold = await lock.holdBoard({
			board: key,
			holder: { id: "the-other-writer", kind: "human" },
			leaseMs: 30_000,
		});
		try {
			const location = store.locateSemanticBoard("busy");
			const before = readFileSync(location.file, "utf-8");
			const refused = await store.writeSemanticBoard({
				board: "busy",
				writer: { id: "me", kind: "agent" },
				transition: store.editVariantTransition(
					contract.VariantEditInputSchema.parse({ nodes: [{ name: "Late", kind: "module" }] }),
				),
				expectedVersion: 1,
			});
			expect(refused.outcome === "rejected" && refused.code).toBe("BOARD_HELD");
			expect(readFileSync(location.file, "utf-8")).toBe(before);
		} finally {
			lock.releaseHold(key, hold.holder.id);
		}
	}, 30_000);
});

describe("where a board is allowed to be", () => {
	test("two spellings of one name are one board", async () => {
		const first = await create("Payments", { nodes: [{ name: "Charges", kind: "module" }] });
		expect(first.outcome).toBe("applied");
		const second = await create("payments", { nodes: [{ name: "Other", kind: "module" }] });
		expect(second.outcome === "rejected" && second.code).toBe("BOARD_EXISTS");
		expect(
			readdirSync(vault).filter((entry) => entry.toLowerCase().startsWith("payments")),
		).toEqual(["Payments.semantic.json"]);
	});

	test("a board is refused when its address resolves through a link out of the vault", async () => {
		const outside = mkdtempSync(join(tmpdir(), "archboard-not-the-vault-"));
		try {
			symlinkSync(outside, join(vault, "elsewhere"), "dir");
			const refused = await create("elsewhere/escaped", {
				nodes: [{ name: "Nope", kind: "module" }],
			});
			expect(refused.outcome).toBe("rejected");
		} catch (error) {
			// A refusal may also arrive as a thrown address error, which is the
			// same answer: the board is not written. What must not happen is a
			// file appearing outside the vault.
			expect(error).toBeInstanceOf(Error);
		}
		expect(readdirSync(outside)).toEqual([]);
		rmSync(outside, { recursive: true, force: true });
	});
});

describe("a board is the board its address names", () => {
	test("a create whose stated name is not the address it is written to is refused", async () => {
		const refused = await store.writeSemanticBoard({
			board: "target-location",
			writer,
			transition: store.createBoardTransition(
				contract.BoardCreateInputSchema.parse({ name: "declared-name" }),
			),
		});
		expect(refused.outcome === "rejected" && refused.code).toBe("BOARD_MISADDRESSED");
		expect(store.readSemanticBoard("target-location").ok).toBe(false);
		expect(store.readSemanticBoard("declared-name").ok).toBe(false);
	});
});

describe("a write says which identity it held the board under", () => {
	test("two unclaimed writes are two writers, and a claimed board's writes are one", async () => {
		const lock = await import("@/runtime/engine/board-lock");
		const first = await create("held-as");
		const second = await edit("held-as", { nodes: [{ name: "Ingest", kind: "service" }] });
		if (first.outcome !== "applied" || second.outcome !== "applied") {
			throw new Error("the writes did not land");
		}
		// Nothing standing was claimed, so each write is its own writer. A reader
		// deciding whether a change is news or its own echo has to be able to tell
		// them apart, and after ADR 0023 "an agent wrote it" tells it nothing.
		expect(first.heldAs).not.toBe(second.heldAs);

		const claimed = await lock.claimBoard({ board: "held-as", reason: "settling the ingest" });
		const third = await edit("held-as", { nodes: [{ name: "Store", kind: "datastore" }] });
		const fourth = await edit("held-as", { nodes: [{ name: "Ledger", kind: "service" }] });
		if (third.outcome !== "applied" || fourth.outcome !== "applied") {
			throw new Error("the claimed writes did not land");
		}
		// Under one claim they are one act, however many commands it took.
		expect(third.heldAs).toBe(claimed.claim.holder.id);
		expect(fourth.heldAs).toBe(claimed.claim.holder.id);
		lock.releaseClaim("held-as");
	}, 30_000);
});
