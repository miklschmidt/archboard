import { afterAll, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareSemanticBoardWrite } from "#runtime/operations/write/prepare.ts";
import { writeSemanticBoard } from "#runtime/operations/write/write.ts";
import {
	createBoardTransition,
	editVariantTransition,
} from "#runtime/operations/write/transitions.ts";
import { readSemanticBoard } from "#runtime/operations/read/read.ts";
import { locateSemanticBoard } from "#runtime/store/location.ts";
import { BoardCreateInputSchema, VariantEditInputSchema } from "#shared/protocol/board-input.ts";
import { HistoricalCorrectionInputSchema } from "#shared/protocol/historical-correction.ts";
import { SemanticBoardSchema } from "#shared/schemas/board-document.ts";
import type { SemanticPolicy } from "#shared/schemas/semantic-policy.ts";

const vault = mkdtempSync(join(tmpdir(), "archboard-prepared-write-"));
const writer = { kind: "agent" as const };
const kinds = {
	api: { name: "API", icon: "RiServerLine" },
	worker: { name: "Worker", icon: "RiTerminalLine" },
};
let serial = 0;
let name = "";

/**
 * Configure the vault's vocabulary.
 * @param nodeKinds The node kinds it configures.
 */
function configure(nodeKinds: SemanticPolicy["nodeKinds"]): void {
	const policy: SemanticPolicy = {
		levels: ["system"],
		nodeKinds,
		relationshipKinds: { request: { name: "Request", dash: "solid", arrowhead: "filled" } },
		groups: {},
	};
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(policy));
}

/**
 * Start this test's board, holding one API.
 * @returns The version it is at.
 */
async function created(): Promise<number> {
	const result = await writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition: createBoardTransition(
			BoardCreateInputSchema.parse({
				name,
				level: "system",
				nodes: [{ name: "API", kind: "api" }],
			}),
		),
	});
	if (result.outcome !== "applied") throw new Error(result.problem);
	return result.board.version;
}

/**
 * Prepare adding a part to this test's board.
 * @param version The version the writer read.
 * @param part The part's name.
 * @returns The preparation.
 */
function prepareAdding(version: number, part: string) {
	return prepareSemanticBoardWrite({
		vault,
		board: name,
		expectedVersion: version,
		transition: editVariantTransition(
			VariantEditInputSchema.parse({ nodes: [{ name: part, kind: "worker" }] }),
		),
	});
}

/** The bytes of this test's board file. */
const bytes = () => readFileSync(locateSemanticBoard(name, vault).file, "utf8");

beforeEach(() => {
	serial++;
	name = `prepared-${serial}`;
	configure(kinds);
});
afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

test("a commit writes the prepared candidate, with the subject ids it was prepared with", async () => {
	const version = await created();
	const before = bytes();
	const prepared = prepareAdding(version, "Worker");
	if (prepared.outcome !== "prepared") throw new Error(prepared.problem);
	expect(prepared.previousVersion).toBe(version);
	expect(bytes()).toBe(before);
	const committed = await prepared.commit({ writer });
	if (committed.outcome !== "applied") throw new Error(committed.problem);
	const stored = readSemanticBoard(vault, name);
	if (!stored.ok) throw new Error(stored.problem);
	expect(stored.board).toEqual(prepared.board);
	expect(committed.board).toEqual(prepared.board);
	expect(stored.board.version).toBe(version + 1);
});

test("a commit after somebody else's write is refused and leaves their write", async () => {
	const version = await created();
	const prepared = prepareAdding(version, "Worker");
	if (prepared.outcome !== "prepared") throw new Error(prepared.problem);
	const concurrent = prepareAdding(version, "Other");
	if (concurrent.outcome !== "prepared") throw new Error(concurrent.problem);
	expect((await concurrent.commit({ writer })).outcome).toBe("applied");
	const written = bytes();
	expect(await prepared.commit({ writer })).toMatchObject({
		outcome: "rejected",
		code: "BOARD_VERSION_CONFLICT",
		version: version + 1,
	});
	expect(bytes()).toBe(written);
});

test("the vault's policy is admitted when the write is prepared and again when it commits", async () => {
	const version = await created();
	configure({ api: kinds.api });
	expect(prepareAdding(version, "Worker")).toMatchObject({
		outcome: "rejected",
		code: "INVALID_CONTENT",
	});
	configure(kinds);
	const prepared = prepareAdding(version, "Worker");
	if (prepared.outcome !== "prepared") throw new Error(prepared.problem);
	const before = bytes();
	configure({ api: kinds.api });
	expect(await prepared.commit({ writer })).toMatchObject({
		outcome: "rejected",
		code: "INVALID_CONTENT",
	});
	expect(bytes()).toBe(before);
});

test("a board that awaits its migration is prepared at the version its commit finds, and writes nothing before the commit", async () => {
	// From before nodes carried their order: the next read under its lease migrates it.
	const legacy = {
		schemaVersion: "2.2.0",
		kind: "semantic-board",
		id: "legacy1",
		name,
		level: "system",
		version: 3,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-12T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "Initial",
				lifecycle: "current",
				content: { nodes: [{ id: "n1", name: "API", kind: "api" }], edges: [] },
			},
		],
	};
	writeFileSync(locateSemanticBoard(name, vault).file, `${JSON.stringify(legacy)}\n`);
	const before = bytes();
	const prepared = prepareAdding(4, "Worker");
	if (prepared.outcome !== "prepared") throw new Error(prepared.problem);
	expect(prepared.previousVersion).toBe(4);
	expect(bytes()).toBe(before);
	const committed = await prepared.commit({ writer });
	if (committed.outcome !== "applied") throw new Error(committed.problem);
	expect(committed.board).toEqual(prepared.board);
	expect(committed.board.version).toBe(5);
});

/**
 * Prepare correcting the historical state of this test's board.
 * @returns The preparation.
 */
const prepareCorrection = () =>
	prepareSemanticBoardWrite({
		vault,
		board: name,
		expectedVersion: 1,
		correct: HistoricalCorrectionInputSchema.parse({
			variant: "Initial",
			reason: "Repair the recorded fact",
			revisions: [{ repo: "example", commit: "a".repeat(40) }],
			edit: { nodes: [{ name: "Queue", kind: "worker" }] },
		}),
	});

test("a correction is prepared against its historical state and committed as prepared", async () => {
	expect(prepareCorrection()).toMatchObject({ outcome: "rejected", code: "BOARD_MISSING" });
	expect(existsSync(locateSemanticBoard(name, vault).file)).toBe(false);
	const created = createBoardTransition(
		BoardCreateInputSchema.parse({ name, level: "system" }),
	).apply(null, "2026-10-01T12:00:00.000Z");
	if (!created.ok) throw new Error(created.problem);
	const original = created.board.variants[0]!;
	const family = SemanticBoardSchema.parse({
		...created.board,
		version: 1,
		current: "next",
		variants: [
			{ ...original, lifecycle: "historical" },
			{ ...original, id: "next", name: "Implemented", parent: original.id },
		],
		adoptions: [{ variant: "next", from: original.id, at: created.board.updatedAt }],
	});
	writeFileSync(locateSemanticBoard(name, vault).file, JSON.stringify(family));
	const prepared = prepareCorrection();
	if (prepared.outcome !== "prepared") throw new Error(prepared.problem);
	const committed = await prepared.commit({ writer });
	if (committed.outcome !== "applied") throw new Error(committed.problem);
	expect(committed.board).toEqual(prepared.board);
	expect(committed.board.variants[0]!.corrections).toHaveLength(1);
});
