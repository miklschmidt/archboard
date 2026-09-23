// What the vault checker says about a node's binding to code (TASK-260).
//
// The binding is an address into a repository, so this owner brings its own:
// a throwaway checkout with one file in it, and its own registry through
// ARCHBOARD_REPOS, so nothing here reads or writes the machine's real one.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { createConfiguredTestVault } from "@/runtime/semantic-board-store/tests/configured-vault";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";
import type { VaultDiagnostic } from "@/shared/semantic-policy/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const callerRepos = process.env["ARCHBOARD_REPOS"];
const vault = createConfiguredTestVault("archboard-bindings-");
const checkout = mkdtempSync(join(tmpdir(), "archboard-bound-checkout-"));
const registry = join(mkdtempSync(join(tmpdir(), "archboard-bound-registry-")), "repos.json");
process.env["ARCHBOARD_VAULT"] = vault;
process.env["ARCHBOARD_REPOS"] = registry;
const REPO = "github.com/test/bound";
const PRESENT = "src/present.ts";
const GONE = "src/gone.ts";
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

beforeAll(async () => {
	mkdirSync(join(checkout, "src"), { recursive: true });
	writeFileSync(join(checkout, PRESENT), "export {};\n");
	writeFileSync(
		registry,
		JSON.stringify([
			{ repo: REPO, root: checkout, source: "declared", addedAt: new Date().toISOString() },
		]),
	);
	store = await import("@/runtime/semantic-board-store/index");
	ownVaultOrRefuse(vault, store.locateSemanticBoard("where this owner writes").file);
	contract = await import("@/shared/semantic-board/index");
});
afterAll(() => {
	if (callerVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = callerVault;
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	for (const directory of [vault, checkout, join(registry, "..")])
		rmSync(directory, { recursive: true, force: true });
});

/**
 * Write one board, refusing to continue when the store would not take it.
 * @param input The create payload.
 */
async function create(input: Record<string, unknown>): Promise<void> {
	const written = await store.writeSemanticBoard({
		board: String(input["name"]),
		writer,
		transition: store.createBoardTransition(contract.BoardCreateInputSchema.parse(input)),
	});
	if (written.outcome !== "applied") throw new Error(`seed refused: ${JSON.stringify(written)}`);
}

/**
 * One board as it stands on disk.
 * @param board Its name.
 * @returns The saved family.
 */
function read(board: string): ContractModule.SemanticBoard {
	const result = store.readSemanticBoard(board);
	if (!result.ok) throw new Error(result.problem);
	return result.board;
}

/**
 * The checker's binding findings about one board.
 * @param board The board's name.
 * @returns Its `BINDING_PATH_MISSING` diagnostics.
 */
function bindingFindings(board: string): VaultDiagnostic[] {
	return store
		.checkSemanticVault(vault)
		.diagnostics.filter((issue) => issue.board === board && issue.code === "BINDING_PATH_MISSING");
}

test("a binding whose path has left the repository is reported, and one that is there is not", async () => {
	await create({
		name: "bound-system",
		level: "system",
		nodes: [
			{ name: "Kept", kind: "module", binding: { repo: REPO, path: PRESENT } },
			{ name: "Moved", kind: "module", binding: { repo: REPO, path: GONE } },
			{ name: "Unbound", kind: "module" },
		],
		edges: [{ from: "Kept", to: "Moved", kind: "call" }],
	});
	const findings = bindingFindings("bound-system");
	expect(findings).toHaveLength(1);
	const [missing] = findings;
	expect(missing?.severity).toBe("warning");
	// The path is what a repair needs, so the warning has to say it.
	expect(missing?.message).toContain(GONE);
	const moved = read("bound-system").variants[0]?.content.nodes.find(
		(node) => node.name === "Moved",
	);
	expect(missing?.path).toContain(moved?.id ?? "no node");
}, 30_000);

test("a repository this machine has not registered is not something the vault got wrong", async () => {
	await create({
		name: "elsewhere-system",
		level: "system",
		nodes: [
			{ name: "Ours", kind: "module", binding: { repo: REPO, path: PRESENT } },
			{
				name: "Theirs",
				kind: "module",
				binding: { repo: "github.com/test/never-cloned", path: GONE },
			},
		],
		edges: [{ from: "Ours", to: "Theirs", kind: "call" }],
	});
	expect(bindingFindings("elsewhere-system")).toEqual([]);
}, 30_000);

test("a binding a frozen variant carries is not reported once it is history", async () => {
	await create({
		name: "rebound-system",
		level: "system",
		nodes: [
			{ name: "Kept", kind: "module", binding: { repo: REPO, path: PRESENT } },
			{ name: "Moved", kind: "module", binding: { repo: REPO, path: GONE } },
		],
		edges: [{ from: "Kept", to: "Moved", kind: "call" }],
	});
	expect(bindingFindings("rebound-system")).toHaveLength(1);

	const baseline = read("rebound-system").variants[0]!.name;
	const branched = await store.writeSemanticBoard({
		board: "rebound-system",
		writer,
		expectedVersion: read("rebound-system").version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ from: baseline, name: "Where it went" }),
		),
	});
	expect(branched.outcome).toBe("applied");
	const rebound = await store.writeSemanticBoard({
		board: "rebound-system",
		writer,
		expectedVersion: read("rebound-system").version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: "Where it went",
				nodes: [{ name: "Moved", kind: "module", binding: { repo: REPO, path: PRESENT } }],
			}),
		),
	});
	expect(rebound.outcome).toBe("applied");
	const adopted = await store.writeSemanticBoard({
		board: "rebound-system",
		writer,
		expectedVersion: read("rebound-system").version,
		transition: store.adoptVariantTransition(
			contract.BoardAdoptInputSchema.parse({ variant: "Where it went" }),
		),
	});
	expect(adopted.outcome).toBe("applied");

	const was = read("rebound-system").variants.find((variant) => variant.name === baseline);
	expect(was?.lifecycle).toBe("historical");
	// The record still says where that code was, and saying so is correct: the
	// file existed when the binding was written.
	expect(was?.content.nodes.find((node) => node.name === "Moved")?.binding?.path).toBe(GONE);
	expect(bindingFindings("rebound-system")).toEqual([]);
}, 30_000);

test("a binding on a draft is ahead of the code until adoption says the code is there", async () => {
	await create({
		name: "planned-system",
		level: "system",
		lifecycle: "draft",
		nodes: [{ name: "Planned", kind: "module", binding: { repo: REPO, path: GONE } }],
	});
	// A proposal names where code will live; nothing claims it is there yet.
	expect(bindingFindings("planned-system")).toEqual([]);
	const adopted = await store.writeSemanticBoard({
		board: "planned-system",
		writer,
		expectedVersion: read("planned-system").version,
		transition: store.adoptVariantTransition(
			contract.BoardAdoptInputSchema.parse({ variant: read("planned-system").variants[0]!.name }),
		),
	});
	expect(adopted.outcome).toBe("applied");
	expect(bindingFindings("planned-system")).toHaveLength(1);
}, 30_000);
