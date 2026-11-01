import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locateSemanticBoard } from "#runtime/store/location.ts";
import { decodeSemanticBoardDocument } from "#runtime/store/format/decode.ts";
import { SEMANTIC_BOARD_SCHEMA_VERSION } from "#shared/schemas/board-document.ts";

const vault = mkdtempSync(join(tmpdir(), "archboard-read-migration-"));

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
	const file = locateSemanticBoard(name, vault).file;
	writeFileSync(file, `${JSON.stringify(board)}\n`);
	return file;
}

afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

test("decoding old board bytes migrates every variant in memory without changing the vault, version or timestamps", () => {
	const original = legacyBoard("decoded-legacy");
	const file = put(original.name, original);
	const bytes = readFileSync(file, "utf8");
	const files = readdirSync(vault, { recursive: true });
	const modified = statSync(file).mtimeMs;
	const decoded = decodeSemanticBoardDocument(bytes);
	expect(decoded.ok).toBe(true);
	if (!decoded.ok) return;
	expect(decoded.changed).toBe(true);
	expect(decoded.board).toMatchObject({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		version: original.version,
		createdAt: original.createdAt,
		updatedAt: original.updatedAt,
	});
	expect(
		decoded.board.variants.map((variant) => variant.content.nodes.map((node) => node.order)),
	).toEqual([[1000, 4000, 3000], [1000]]);
	expect(readFileSync(file, "utf8")).toBe(bytes);
	expect(statSync(file).mtimeMs).toBe(modified);
	expect(readdirSync(vault, { recursive: true })).toEqual(files);
});
