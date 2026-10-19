// What the vault checker says about a node's binding to code (TASK-260).
//
// The binding is an address into a repository, so this owner brings its own:
// a throwaway checkout with one file in it, and its own registry through
// ARCHBOARD_REPOS, so nothing here reads or writes the machine's real one.

import { checkSemanticVault } from "#runtime/operations/check/diagnostics.ts";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSemanticBoard } from "#runtime/operations/write/write.ts";
import {
	createBoardTransition,
	branchVariantTransition,
	editVariantTransition,
	adoptVariantTransition,
} from "#runtime/operations/write/transitions.ts";
import { readSemanticBoard } from "#runtime/operations/read/read.ts";
import { createConfiguredTestVault } from "#tests/runtime/support/configured-vault.ts";
import {
	BoardCreateInputSchema,
	BoardBranchInputSchema,
	VariantEditInputSchema,
} from "#shared/protocol/board-input.ts";
import { type SemanticBoard } from "#shared/schemas/board-document.ts";
import { BoardAdoptInputSchema } from "#shared/protocol/resolution-input.ts";
import type { VaultDiagnostic } from "#shared/schemas/semantic-policy.ts";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const vault = createConfiguredTestVault("archboard-bindings-");
const checkout = mkdtempSync(join(tmpdir(), "archboard-bound-checkout-"));
const registry = join(mkdtempSync(join(tmpdir(), "archboard-bound-registry-")), "repos.json");
process.env["ARCHBOARD_REPOS"] = registry;
const REPO = "github.com/test/bound";
const PRESENT = "src/present.ts";
const GONE = "src/gone.ts";
/** A link inside the checkout to a file beside it, which the code opener refuses to open. */
const LEAVES = "src/leaves.ts";
const writer = { kind: "agent" as const };

beforeAll(async () => {
	mkdirSync(join(checkout, "src"), { recursive: true });
	writeFileSync(join(checkout, PRESENT), "export {};\n");
	const outside = join(registry, "..", "outside.ts");
	writeFileSync(outside, "export {};\n");
	symlinkSync(outside, join(checkout, LEAVES));
	writeFileSync(
		registry,
		JSON.stringify([
			{ repo: REPO, root: checkout, source: "declared", addedAt: new Date().toISOString() },
		]),
	);
});
afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	for (const directory of [vault, checkout, join(registry, "..")])
		rmSync(directory, { recursive: true, force: true });
});

/**
 * Write one board, refusing to continue when the store would not take it.
 * @param input The create payload.
 * @param into The vault to write it in.
 */
async function create(input: Record<string, unknown>, into: string = vault): Promise<void> {
	const written = await writeSemanticBoard({
		vault: into,
		board: String(input["name"]),
		writer,
		transition: createBoardTransition(BoardCreateInputSchema.parse(input)),
	});
	if (written.outcome !== "applied") throw new Error(`seed refused: ${JSON.stringify(written)}`);
}

/**
 * One board as it stands on disk.
 * @param board Its name.
 * @returns The saved family.
 */
function read(board: string): SemanticBoard {
	const result = readSemanticBoard(vault, board);
	if (!result.ok) throw new Error(result.problem);
	return result.board;
}

/**
 * The checker's binding findings about one board.
 * @param board The board's name.
 * @returns Its `BINDING_PATH_MISSING` diagnostics.
 */
function bindingFindings(board: string): VaultDiagnostic[] {
	return checkSemanticVault(vault).diagnostics.filter(
		(issue) => issue.board === board && issue.code === "BINDING_PATH_MISSING",
	);
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
	// The canvas and the code check find the part by id, not by parsing a path.
	expect(missing?.subject).toEqual({ kind: "node", id: moved?.id ?? "no node", name: "Moved" });
}, 30_000);

test("a binding whose symbolic link leaves the checkout is reported, as the code opener refuses it", async () => {
	await create({
		name: "linked-system",
		level: "system",
		nodes: [
			{ name: "Kept", kind: "module", binding: { repo: REPO, path: PRESENT } },
			{ name: "Linked", kind: "module", binding: { repo: REPO, path: LEAVES } },
		],
		edges: [{ from: "Kept", to: "Linked", kind: "call" }],
	});
	expect(bindingFindings("linked-system").map((issue) => issue.subject?.name)).toEqual(["Linked"]);
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
	const branched = await writeSemanticBoard({
		vault,
		board: "rebound-system",
		writer,
		expectedVersion: read("rebound-system").version,
		transition: branchVariantTransition(
			BoardBranchInputSchema.parse({ from: baseline, name: "Where it went" }),
		),
	});
	expect(branched.outcome).toBe("applied");
	const rebound = await writeSemanticBoard({
		vault,
		board: "rebound-system",
		writer,
		expectedVersion: read("rebound-system").version,
		transition: editVariantTransition(
			VariantEditInputSchema.parse({
				variant: "Where it went",
				nodes: [{ name: "Moved", kind: "module", binding: { repo: REPO, path: PRESENT } }],
			}),
		),
	});
	expect(rebound.outcome).toBe("applied");
	const adopted = await writeSemanticBoard({
		vault,
		board: "rebound-system",
		writer,
		expectedVersion: read("rebound-system").version,
		transition: adoptVariantTransition(BoardAdoptInputSchema.parse({ variant: "Where it went" })),
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
	const adopted = await writeSemanticBoard({
		vault,
		board: "planned-system",
		writer,
		expectedVersion: read("planned-system").version,
		transition: adoptVariantTransition(
			BoardAdoptInputSchema.parse({ variant: read("planned-system").variants[0]!.name }),
		),
	});
	expect(adopted.outcome).toBe("applied");
	expect(bindingFindings("planned-system")).toHaveLength(1);
}, 30_000);

test("a binding into the vault's own repository is looked for in the checkout that holds the vault", async () => {
	// A second checkout of the bound repository, not registered, with a file that the registered one lacks.
	const own = mkdtempSync(join(tmpdir(), "archboard-bound-own-"));
	try {
		mkdirSync(join(own, "src"), { recursive: true });
		writeFileSync(join(own, "src", "own-only.ts"), "export {};\n");
		for (const args of [
			["init", "-q"],
			["remote", "add", "origin", `https://${REPO}.git`],
		]) {
			Bun.spawnSync(["git", ...args], { cwd: own });
		}
		const ownVault = join(own, "vault");
		mkdirSync(join(ownVault, ".archboard"), { recursive: true });
		writeFileSync(
			join(ownVault, ".archboard", "config.yaml"),
			readFileSync(join(vault, ".archboard", "config.yaml")),
		);
		const board = {
			name: "own-system",
			level: "system",
			nodes: [
				{ name: "Kept", kind: "module", binding: { repo: REPO, path: PRESENT } },
				{ name: "Here", kind: "module", binding: { repo: REPO, path: "src/own-only.ts" } },
			],
			edges: [{ from: "Kept", to: "Here", kind: "call" }],
		};
		await create(board, ownVault);
		await create(board);
		// The registered checkout lacks the file, so a vault elsewhere is wrong about it.
		expect(bindingFindings("own-system").map((issue) => issue.subject?.name)).toEqual(["Here"]);
		// The vault that stands in a checkout of the repository reads that checkout, which has it.
		const inOwn = checkSemanticVault(ownVault).diagnostics.filter(
			(issue) => issue.code === "BINDING_PATH_MISSING",
		);
		expect(inOwn.map((issue) => issue.subject?.name)).toEqual(["Kept"]);
	} finally {
		rmSync(own, { recursive: true, force: true });
	}
}, 30_000);
