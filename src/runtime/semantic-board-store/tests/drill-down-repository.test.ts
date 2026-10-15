// A drill-down that names a repository identity (ADR 0049, TASK-472.12).
//
// It opens a board of the vault of that identity's chosen checkout, and a
// drill-down that names none stays in the vault that carries it. Everything
// here is checked through `checkSemanticVault`, the one reader of a link, over
// two throwaway git checkouts with vaults and a registry of their own.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { declareDirectory } from "@/runtime/engine/repo-registry";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import type * as ContractModule from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY, type VaultDiagnostic } from "@/shared/semantic-policy/index";

const META = "github.com/acme/meta";
const PRODUCT = "github.com/acme/product";
const callerRepos = process.env["ARCHBOARD_REPOS"];
const root = realpathSync.native(mkdtempSync(join(tmpdir(), "archboard-drill-repo-")));
process.env["ARCHBOARD_REPOS"] = join(root, "repos.json");
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };
/** The vaults by checkout name; `meta` carries the drill-downs. */
const vaults = {
	meta: join(root, "meta", ".archboard", "vault"),
	product: join(root, "product", ".archboard", "vault"),
	spare: join(root, "product-spare", ".archboard", "vault"),
};

/**
 * Make a git checkout whose origin names an identity, with a configured vault.
 * @param name The checkout's directory name.
 * @param identity The repository identity its origin names.
 * @returns The checkout's canonical root.
 */
function checkout(name: string, identity: string): string {
	const directory = join(root, name);
	const vault = join(directory, ".archboard");
	mkdirSync(vault, { recursive: true });
	writeFileSync(join(vault, "config.yaml"), Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
	mkdirSync(join(vault, "vault"));
	for (const args of [
		["init", "-q"],
		["remote", "add", "origin", `https://${identity}.git`],
	]) {
		expect(Bun.spawnSync(["git", ...args], { cwd: directory }).exitCode).toBe(0);
	}
	return realpathSync.native(directory);
}

beforeAll(async () => {
	checkout("meta", META);
	// The spare is registered first, so it is the chosen checkout of the product until a person says otherwise.
	const spare = checkout("product-spare", PRODUCT);
	const product = checkout("product", PRODUCT);
	await declareDirectory(spare);
	await declareDirectory(product);
	store = await import("@/runtime/semantic-board-store/index");
	contract = await import("@/shared/semantic-board/index");
	// The product holds the board; the spare, which is chosen, does not.
	await create(vaults.product, { name: "Payments", level: "service", nodes: nodes("module") });
	await create(vaults.spare, { name: "Spare only", level: "service", nodes: nodes("module") });
	await create(vaults.meta, { name: "Local", level: "service", nodes: nodes("module") });
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(root, { recursive: true, force: true });
});

/**
 * The parts of a board of one kind.
 * @param kind The kind of its only part.
 * @returns The nodes.
 */
function nodes(kind: string) {
	return [{ name: "Store", kind }];
}

/**
 * Write one board into a vault, refusing to continue when the store would not take it.
 * @param vault The vault.
 * @param input The create payload.
 */
async function create(vault: string, input: Record<string, unknown>): Promise<void> {
	const written = await store.writeSemanticBoard({
		vault,
		board: String(input["name"]),
		writer,
		transition: store.createBoardTransition(contract.BoardCreateInputSchema.parse(input)),
	});
	if (written.outcome !== "applied") throw new Error(`seed refused: ${JSON.stringify(written)}`);
}

/**
 * A system board in the `meta` vault with one part that opens a board.
 * @param name The board's name.
 * @param opens What the part's drill-down names.
 * @param kind The part's kind.
 * @returns The drill-down findings about the board.
 */
async function linking(
	name: string,
	opens: Record<string, unknown>,
	kind = "service",
): Promise<VaultDiagnostic[]> {
	await create(vaults.meta, {
		name,
		level: "system",
		nodes: [
			{ name: "Caller", kind: "app" },
			{ name: "Callee", kind, drillDown: { variant: { kind: "current" }, ...opens } },
		],
		edges: [{ from: "Caller", to: "Callee", kind: "http" }],
	});
	return store
		.checkSemanticVault(vaults.meta)
		.diagnostics.filter((issue) => issue.board === name && issue.code.startsWith("DRILL_DOWN_"));
}

test("a drill-down that names no repository stays in the vault that carries it", async () => {
	expect((await linking("stays-local", { board: "Local" })).map((one) => one.code)).toEqual([]);
	// The product holds Payments, and the vault of the board does not.
	expect((await linking("stays-here", { board: "Payments" })).map((one) => one.code)).toEqual([
		"DRILL_DOWN_UNKNOWN_BOARD",
	]);
});

test("a drill-down that names a repository opens the vault of its chosen checkout", async () => {
	// The chosen checkout is the one registered first, and it has no Payments.
	const spare = await linking("reaches-chosen", { board: "Payments", repo: PRODUCT });
	expect(spare.map((one) => one.code)).toEqual(["DRILL_DOWN_UNKNOWN_BOARD"]);
	expect(spare[0]?.message).toContain(PRODUCT);
	// The product's other checkout holds it, and it is the one a person chooses.
	await declareDirectory(join(root, "product"), { choose: true });
	expect(
		store
			.checkSemanticVault(vaults.meta)
			.diagnostics.filter((one) => one.board === "reaches-chosen"),
	).toEqual([]);
});

test("the level of the board it opens is read in the vault of the repository", async () => {
	const findings = await linking("level-in-product", { board: "Payments", repo: PRODUCT });
	expect(findings.map((one) => one.code)).toEqual([]);
	const mismatch = await linking("level-wrong", { board: "Payments", repo: PRODUCT }, "external");
	expect(mismatch.map((one) => one.code)).toEqual(["DRILL_DOWN_LEVEL_MISMATCH"]);
});

test("a name the board had before a rename, or in other letters, opens it in that vault", async () => {
	const before = store.readSemanticBoard(vaults.product, "Payments");
	if (!before.ok) throw new Error(before.problem);
	const renamed = await store.writeSemanticBoard({
		vault: vaults.product,
		board: "Payments",
		writer,
		expectedVersion: before.board.version,
		transition: store.renameTransition(contract.BoardRenameInputSchema.parse({ to: "Ledger" })),
	});
	expect(renamed.outcome).toBe("applied");
	for (const [at, board] of ["Payments", "LEDGER", "ledger"].entries()) {
		expect(
			(await linking(`spelled-${at}`, { board, repo: PRODUCT })).map((one) => one.code),
		).toEqual([]);
	}
});

test("a drill-down naming the identity of its own vault stays in that vault", async () => {
	expect(
		(await linking("own-identity", { board: "Local", repo: META })).map((one) => one.code),
	).toEqual([]);
	// Nothing registered the meta checkout, and the board the product holds is not its own.
	expect(
		(await linking("own-identity-missing", { board: "Ledger", repo: META })).map((one) => one.code),
	).toEqual(["DRILL_DOWN_UNKNOWN_BOARD"]);
	// A vault deeper in the checkout is the vault the link stays in, not the checkout root's.
	const nested = join(root, "meta", "nested", ".archboard");
	mkdirSync(join(nested, "vault"), { recursive: true });
	writeFileSync(join(nested, "config.yaml"), Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
	const vault = join(nested, "vault");
	await create(vault, { name: "Nested", level: "service", nodes: nodes("module") });
	await create(vault, {
		name: "Opens nested",
		level: "system",
		nodes: [
			{ name: "Caller", kind: "app" },
			{
				name: "Callee",
				kind: "service",
				drillDown: { board: "Nested", variant: { kind: "current" }, repo: META },
			},
		],
		edges: [{ from: "Caller", to: "Callee", kind: "http" }],
	});
	expect(
		store.checkSemanticVault(vault).diagnostics.filter((one) => one.code.startsWith("DRILL_DOWN_")),
	).toEqual([]);
});

test("a repository this machine has no checkout of is reported, with how to register one", async () => {
	const findings = await linking("unknown-repo", {
		board: "Anything",
		repo: "github.com/acme/unregistered",
	});
	expect(findings.map((one) => one.code)).toEqual(["DRILL_DOWN_UNKNOWN_REPOSITORY"]);
	expect(findings[0]?.severity).toBe("warning");
	expect(findings[0]?.message).toContain("repo add");
});

test("a chosen checkout whose directory is gone is reported as an unknown repository", async () => {
	const gone = checkout("gone", "github.com/acme/gone");
	await declareDirectory(gone);
	rmSync(gone, { recursive: true, force: true });
	expect(
		(await linking("gone-repo", { board: "Anything", repo: "github.com/acme/gone" })).map(
			(one) => one.code,
		),
	).toEqual(["DRILL_DOWN_UNKNOWN_REPOSITORY"]);
});

test("a chosen checkout that holds no vault is reported as an unknown repository", async () => {
	const bare = checkout("bare", "github.com/acme/bare");
	rmSync(join(bare, ".archboard"), { recursive: true, force: true });
	await declareDirectory(bare);
	expect(
		(await linking("bare-repo", { board: "Anything", repo: "github.com/acme/bare" })).map(
			(one) => one.code,
		),
	).toEqual(["DRILL_DOWN_UNKNOWN_REPOSITORY"]);
});

test("a board that the other vault holds but cannot read is named by its file", async () => {
	const broken = join(vaults.product, "broken.semantic.json");
	writeFileSync(broken, "{ not json");
	const findings = await linking("opens-broken", { board: "Broken", repo: PRODUCT });
	expect(findings.map((one) => one.code)).toEqual(["DRILL_DOWN_UNKNOWN_BOARD"]);
	expect(findings[0]?.message).toContain(broken);
	rmSync(broken);
});

test("reading a board of another repository writes nothing in its vault", async () => {
	const legacy = join(vaults.product, "Old.semantic.json");
	writeFileSync(
		legacy,
		`${JSON.stringify({
			schemaVersion: "2.2.0",
			kind: "semantic-board",
			id: "board1",
			name: "Old",
			level: "service",
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
					content: { nodes: [{ id: "n1", name: "First", kind: "module" }], edges: [] },
				},
			],
		})}\n`,
	);
	const before = readFileSync(legacy, "utf-8");
	expect((await linking("opens-legacy", { board: "Old", repo: PRODUCT })).length).toBe(0);
	expect(readFileSync(legacy, "utf-8")).toBe(before);
});
