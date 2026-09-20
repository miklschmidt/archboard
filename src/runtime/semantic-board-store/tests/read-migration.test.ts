import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import type * as LockModule from "@/runtime/engine/board-lock";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-read-migration-"));
process.env["ARCHBOARD_VAULT"] = vault;

let store: typeof StoreModule;
let lock: typeof LockModule;

function legacyBoard(name: string) {
	return {
		schemaVersion: "2.2.0",
		kind: "semantic-board",
		id: "board1",
		name,
		level: "system",
		version: 7,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-12T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "Initial",
				lifecycle: "current",
				content: {
					nodes: [
						{ id: "n1", name: "First", kind: "module" },
						{ id: "n2", name: "Second", kind: "module", order: 4000 },
						{ id: "n3", name: "Third", kind: "module" },
					],
					edges: [
						{ id: "e1", from: "n1", to: "n2", kind: "call" },
						{ id: "e2", from: "n2", to: "n3", kind: "call" },
					],
				},
			},
			{
				id: "v2",
				name: "Proposal",
				lifecycle: "draft",
				parent: "v1",
				content: {
					nodes: [{ id: "n3", name: "Third", kind: "module" }],
					edges: [],
				},
			},
		],
	};
}

function put(name: string, board: Record<string, unknown>): string {
	const file = store.locateSemanticBoard(name).file;
	writeFileSync(file, `${JSON.stringify(board)}\n`);
	return file;
}

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	lock = await import("@/runtime/engine/board-lock");
	ownVaultOrRefuse(vault, store.locateSemanticBoard("migration-probe").file);
});

afterAll(() => {
	if (callerVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = callerVault;
	rmSync(vault, { recursive: true, force: true });
});

test("read migrates every variant and persists one new board version", async () => {
	const name = "legacy-ordered";
	const original = legacyBoard(name);
	const file = put(name, original);
	const result = await store.readSemanticBoard(name);
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	const persisted = JSON.parse(readFileSync(file, "utf8"));
	expect(persisted).toEqual({
		...original,
		schemaVersion: "2.3.0",
		version: 8,
		updatedAt: persisted.updatedAt,
		variants: [
			{
				...original.variants[0],
				content: {
					nodes: [
						{ id: "n1", name: "First", kind: "module", order: 1000 },
						{ id: "n2", name: "Second", kind: "module", order: 4000 },
						{ id: "n3", name: "Third", kind: "module", order: 3000 },
					],
					edges: [
						{ id: "e1", from: "n1", to: "n2", kind: "call", order: 1000 },
						{ id: "e2", from: "n2", to: "n3", kind: "call", order: 2000 },
					],
				},
			},
			{
				...original.variants[1],
				content: { nodes: [{ id: "n3", name: "Third", kind: "module", order: 1000 }], edges: [] },
			},
		],
	});
	expect(Date.parse(persisted.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt));
	expect(result.board.version).toBe(8);
	expect(result.board.variants[0]?.content.nodes.map((node) => node.order)).toEqual([
		1000, 4000, 3000,
	]);
	const migratedBytes = readFileSync(file, "utf8");
	expect((await store.readSemanticBoard(name)).ok).toBe(true);
	expect(readFileSync(file, "utf8")).toBe(migratedBytes);
});

test("invalid legacy content is refused without persisting an upgrade", async () => {
	const name = "invalid-legacy";
	const board = legacyBoard(name);
	const variants = board["variants"] as Array<{
		content: { edges: Array<Record<string, unknown>> };
	}>;
	variants[0]!.content.edges[0]!["order"] = -1;
	const file = put(name, board);
	const bytes = readFileSync(file, "utf8");
	const result = await store.readSemanticBoard(name);
	expect(result.ok).toBe(false);
	expect(readFileSync(file, "utf8")).toBe(bytes);
});

test("a held board remains readable and migration waits for the holder to leave", async () => {
	const name = "held-legacy";
	const file = put(name, legacyBoard(name));
	const bytes = readFileSync(file, "utf8");
	const key = store.locateSemanticBoard(name).key;
	const holder = "other-agent";
	await lock.holdBoard({ board: key, holder: { id: holder, kind: "agent", claimed: true } });
	try {
		const pending = await store.readSemanticBoard(name);
		expect(pending.ok).toBe(true);
		if (!pending.ok) return;
		expect(pending.warnings.some((warning) => warning.code === "SCHEMA_MIGRATION_PENDING")).toBe(
			true,
		);
		expect(pending.board.variants[0]?.content.nodes[0]?.order).toBe(1000);
		expect(readFileSync(file, "utf8")).toBe(bytes);
	} finally {
		lock.releaseHold(key, holder);
	}
	const migrated = await store.readSemanticBoard(name);
	expect(migrated.ok).toBe(true);
	expect(JSON.parse(readFileSync(file, "utf8")).schemaVersion).toBe("2.3.0");
});

test("a version without a registered path is refused without rewriting", async () => {
	const name = "unknown-old";
	const board = { ...legacyBoard(name), schemaVersion: "2.1.5" };
	const file = put(name, board);
	const bytes = readFileSync(file, "utf8");
	const result = await store.readSemanticBoard(name);
	expect(result.ok).toBe(false);
	expect(readFileSync(file, "utf8")).toBe(bytes);
});

test("known older contracts advance through compatibility steps", async () => {
	const name = "old-compatible";
	const file = put(name, { ...legacyBoard(name), schemaVersion: "2.0.0" });
	const result = await store.readSemanticBoard(name);
	expect(result.ok).toBe(true);
	expect(JSON.parse(readFileSync(file, "utf8")).schemaVersion).toBe("2.3.0");
});
