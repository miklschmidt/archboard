import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname } from "node:path";
import type * as LockModule from "@/runtime/engine/board-lock";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { createConfiguredTestVault } from "@/runtime/semantic-board-store/tests/configured-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

// Renaming a board or a variant through the write boundary (TASK-281, ADR
// 0036): only the name moves, the old name keeps opening what it named, and a
// rename that cannot land leaves the vault exactly as it was.

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = createConfiguredTestVault("archboard-renaming-");
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
let lock: typeof LockModule;
const writer = { kind: "agent" as const };

let serial = 0;
/** The board every case starts from: a slug-like name, as the vaults have them. */
let board = "";

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	contract = await import("@/shared/semantic-board/index");
	lock = await import("@/runtime/engine/board-lock");
});
afterAll(() => {
	if (callerVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = callerVault;
	rmSync(vault, { recursive: true, force: true });
});

// A family with history in it: an adopted proposal, the state it superseded,
// and a proposal that was let go.
beforeEach(async () => {
	serial += 1;
	board = `platform-public-api-${serial}`;
	applied(
		await store.writeSemanticBoard({
			vault,
			board,
			writer,
			transition: store.createBoardTransition(
				contract.BoardCreateInputSchema.parse({
					name: board,
					level: "system",
					nodes: [
						{ name: "API", kind: "service" },
						{ name: "Store", kind: "datastore" },
					],
					edges: [{ from: "API", to: "Store", kind: "call" }],
				}),
			),
		}),
	);
	await write(store.branchVariantTransition({ from: "Initial", name: "public-api-independent" }));
	await write(
		store.adoptVariantTransition({ variant: "public-api-independent", reason: "shipped" }),
	);
	await write(store.branchVariantTransition({ from: "public-api-independent", name: "abandoned" }));
	await write(store.shelveVariantTransition({ variant: "abandoned", reason: "overtaken" }));
});

/**
 * The readable name this case gives its board: one per case, since the cases
 * share a vault and a name one of them took is taken.
 * @returns The name.
 */
function readable(): string {
	return `Platform Public API ${serial}`;
}

/**
 * The board as a name opens it.
 * @param name The name, as it is now or as it was.
 * @returns The board.
 */
function read(name = board) {
	const answer = store.readSemanticBoard(vault, name);
	if (!answer.ok) throw new Error(answer.problem);
	return answer.board;
}

/**
 * The write's result, when it landed.
 * @param result What the write did.
 * @returns The same result, narrowed.
 */
function applied(result: StoreModule.SemanticWriteResult) {
	if (result.outcome !== "applied") throw new Error(`${result.code}: ${result.problem}`);
	return result;
}

/**
 * Write one transition against the board as it now stands.
 * @param transition What to do.
 * @param name The name the write addresses the board by.
 * @returns What the write did.
 */
async function write(transition: StoreModule.SemanticTransition, name = board) {
	return store.writeSemanticBoard({
		vault,
		board: name,
		writer,
		expectedVersion: read(name).version,
		transition,
	});
}

/**
 * A rename, as the route states it.
 * @param to What to call it.
 * @param variant The variant to rename, or none for the board.
 * @returns The transition.
 */
function rename(to: string, variant?: string) {
	return store.renameTransition(
		contract.BoardRenameInputSchema.parse(variant === undefined ? { to } : { to, variant }),
	);
}

/**
 * Everything about a board a rename must not change.
 * @param one The board.
 * @returns It, without its name, its former names and its edit stamp.
 */
function identity(one: ContractModule.SemanticBoard) {
	const { name: _name, formerNames: _formerNames, version: _v, updatedAt: _at, ...rest } = one;
	return {
		...rest,
		variants: rest.variants.map(({ name: _n, formerNames: _f, ...variant }) => variant),
	};
}

test("a board renamed keeps every id and all its history, moves its file, and answers to its old name", async () => {
	const before = read();
	const oldFile = store.locateSemanticBoard(board, vault).file;
	const renamed = applied(await write(rename(readable())));
	expect(renamed.renamedFrom?.key).toBe(board);
	expect(renamed.location.key).toBe(readable().toLowerCase());

	const after = read(readable());
	expect(after.name).toBe(readable());
	expect(after.formerNames).toEqual([board]);
	expect(after.version).toBe(before.version + 1);
	expect(identity(after)).toEqual(identity(before));
	expect(existsSync(oldFile)).toBeFalse();
	expect(existsSync(renamed.location.file)).toBeTrue();
	expect(store.listSemanticBoards(vault).map((one) => one.name)).toContain(readable());
	expect(store.listSemanticBoards(vault).map((one) => one.key)).not.toContain(board);

	// The old name opens the board, and a write addressed by it lands on it.
	expect(read(board).id).toBe(before.id);
	const edited = applied(
		await write(
			store.editVariantTransition(
				contract.VariantEditInputSchema.parse({ nodes: [{ name: "Cache", kind: "service" }] }),
			),
			board,
		),
	);
	expect(edited.board.name).toBe(readable());
	expect(edited.location.file).toBe(renamed.location.file);
});

test("a variant renamed keeps its id, lifecycle and ancestry, and answers to its old name", async () => {
	const before = read();
	const old = before.variants.find((one) => one.name === "public-api-independent")!;
	const renamed = applied(
		await write(rename("Independent Public and Phone APIs", "public-api-independent")),
	);
	expect(renamed.renamedFrom).toBeUndefined();
	const after = read();
	expect(identity(after)).toEqual(identity(before));
	const now = contract.findVariant(after, "public-api-independent");
	expect(now?.id).toBe(old.id);
	expect(now?.name).toBe("Independent Public and Phone APIs");
	expect(now?.formerNames).toEqual(["public-api-independent"]);
	// A drill-down names a variant by name, and one written before still opens it.
	expect(contract.variantNamed(after, "public-api-independent")?.id).toBe(old.id);
	expect(contract.addressedVariant(after, "public-api-independent")).toMatchObject({ ok: true });
});

test("a drill-down naming a board's old name still opens a board the vault holds", async () => {
	const linking = `linking-${serial}`;
	applied(
		await store.writeSemanticBoard({
			vault,
			board: linking,
			writer,
			transition: store.createBoardTransition(
				contract.BoardCreateInputSchema.parse({
					name: linking,
					level: "system",
					nodes: [
						{ name: "Edge", kind: "service" },
						{
							name: "Public API",
							kind: "system",
							drillDown: { board, variant: { kind: "named", name: "public-api-independent" } },
						},
					],
					edges: [{ from: "Edge", to: "Public API", kind: "call" }],
				}),
			),
		}),
	);
	await write(rename(readable()));
	await write(rename("Independent Public and Phone APIs", "public-api-independent"));
	const unknown = store
		.checkSemanticVault(vault)
		.diagnostics.filter((one) => one.code === "DRILL_DOWN_UNKNOWN_BOARD" && one.board === linking);
	expect(unknown).toEqual([]);
	// The linking board was not written: nothing but the renamed board changed.
	expect(read(linking).version).toBe(1);
});

test("a stale rename is refused and the vault is left exactly as it was", async () => {
	const location = store.locateSemanticBoard(board, vault);
	const bytes = readFileSync(location.file, "utf-8");
	const stale = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: read().version - 1,
		transition: rename(readable()),
	});
	expect(stale).toMatchObject({ outcome: "rejected", code: "BOARD_VERSION_CONFLICT" });
	expect(readFileSync(location.file, "utf-8")).toBe(bytes);
	expect(store.readSemanticBoard(vault, readable())).toMatchObject({ code: "BOARD_MISSING" });
});

test("a name another board carries, or used to carry, is refused and nothing moves", async () => {
	const other = `other-${serial}`;
	applied(
		await store.writeSemanticBoard({
			vault,
			board: other,
			writer,
			transition: store.createBoardTransition(
				contract.BoardCreateInputSchema.parse({ name: other, level: "system" }),
			),
		}),
	);
	const location = store.locateSemanticBoard(board, vault);
	const bytes = readFileSync(location.file, "utf-8");
	for (const taken of [other, other.toUpperCase()]) {
		expect(await write(rename(taken))).toMatchObject({ outcome: "rejected", code: "BOARD_EXISTS" });
	}
	// Once the other board is renamed, its old name still opens it, so it is
	// not free for this one either — and a new board cannot take it.
	await write(rename(`Other ${serial}`), other);
	expect(await write(rename(other))).toMatchObject({ outcome: "rejected", code: "BOARD_EXISTS" });
	const created = await store.writeSemanticBoard({
		vault,
		board: other,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({ name: other, level: "system" }),
		),
	});
	expect(created).toMatchObject({ outcome: "rejected", code: "BOARD_EXISTS" });
	expect(readFileSync(location.file, "utf-8")).toBe(bytes);
});

test("a name that cannot address a board is refused", async () => {
	expect(await write(rename("public@api"))).toMatchObject({
		outcome: "rejected",
		code: "INVALID_NAME",
	});
});

test("a variant name another variant answers to is refused", async () => {
	await write(rename("Independent", "public-api-independent"));
	const initial = contract.findVariant(read(), "Initial")!.id;
	const version = read().version;
	// Another variant's name, a name another variant had, and another's id.
	for (const [renaming, taken] of [
		["abandoned", "Initial"],
		["abandoned", "public-api-independent"],
		["Initial", "abandoned"],
		["abandoned", initial],
	] as const) {
		expect(await write(rename(taken, renaming))).toMatchObject({
			outcome: "rejected",
			code: "VARIANT_EXISTS",
		});
	}
	expect(read().version).toBe(version);
});

test("the name it already has is refused, and a change of case alone keeps every address", async () => {
	const version = read().version;
	expect(await write(rename(board))).toMatchObject({ outcome: "rejected", code: "NAME_UNCHANGED" });
	expect(await write(rename("Initial", "Initial"))).toMatchObject({ code: "NAME_UNCHANGED" });
	expect(read().version).toBe(version);

	const oldFile = store.locateSemanticBoard(board, vault).file;
	const cased = applied(await write(rename(board.toUpperCase())));
	expect(cased.renamedFrom).toBeUndefined();
	expect(cased.location.key).toBe(board);
	expect(cased.board.formerNames).toBeUndefined();
	expect(store.locateSemanticBoard(board, vault).file).toBe(cased.location.file);
	expect(cased.location.file.endsWith(`${board.toUpperCase()}.semantic.json`)).toBeTrue();
	const entries = readdirSync(dirname(cased.location.file));
	expect(entries).toContain(basename(cased.location.file));
	if (cased.location.file !== oldFile) expect(entries).not.toContain(basename(oldFile));
});

test("a board given back a name it had drops it from its former names", async () => {
	await write(rename(readable()));
	await write(rename(`Public API ${serial}`));
	expect(read().formerNames).toEqual([board, readable()]);
	const back = applied(await write(rename(board)));
	expect(back.board.name).toBe(board);
	expect(back.board.formerNames).toEqual([readable(), `Public API ${serial}`]);
	expect(read(`Public API ${serial}`).id).toBe(back.board.id);
});

test("a rename waits for nobody: a new name somebody is writing is refused, naming no change", async () => {
	const key = readable().toLowerCase();
	const hold = await lock.holdBoard({
		vault,
		board: key,
		holder: { id: "someone-creating-it", kind: "agent" },
		leaseMs: 30_000,
	});
	try {
		const bytes = readFileSync(store.locateSemanticBoard(board, vault).file, "utf-8");
		expect(await write(rename(readable()))).toMatchObject({
			outcome: "rejected",
			code: "BOARD_HELD",
		});
		expect(readFileSync(store.locateSemanticBoard(board, vault).file, "utf-8")).toBe(bytes);
	} finally {
		lock.releaseHold(vault, key, hold.holder.id);
	}
});
