// A stack of pull requests read from Git (TASK-493).
//
// A draft is read at its own branch, which holds the layers below it: every part
// of the draft in a repository is read there, whatever older branch its binding
// pins, unless it pins a branch that one does not hold. A ref's tree resolves
// imports as a checkout would, through the `tsconfig.json` beside the code.
//
// The checkout `shop` has `main` out. `feat/x` adds `created`; `feat/y`, built
// on it, renames that to `created2` and adds `second`; `feat/z` is a branch off
// `main` that `feat/y` does not hold. `feat/alias` imports through a path alias.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "#tests/runtime/support/code-check/pass.ts";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import {
	board as fixtureBoard,
	git as fixtureGit,
	register,
	write,
} from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-ref-stack-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let check: typeof CheckModule;

/**
 * Run Git in the checkout.
 * @param args Git's arguments.
 */
function git(...args: string[]): void {
	fixtureGit(scratch, shop, ...args);
}

/**
 * Commit files on a new branch off another.
 * @param name The new branch.
 * @param from The branch it starts from.
 * @param files Each path and its text.
 */
function branch(name: string, from: string, files: Record<string, string>): void {
	git("checkout", "-q", "-b", name, from);
	write(shop, files);
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", name);
}

/**
 * A part bound to code in the shop.
 * @param id Its id.
 * @param order Its order.
 * @param path Its bound path.
 * @param ref Its branch.
 * @param symbol Its symbol, if any.
 * @returns The node.
 */
function part(id: string, order: number, path: string, ref: string, symbol?: string) {
	const binding = { repo: SHOP, path, branch: ref, ...(symbol === undefined ? {} : { symbol }) };
	return { id, name: id, kind: "module", order, binding };
}

/**
 * A relationship with no anchor.
 * @param id Its id.
 * @param from Its start.
 * @param to Its end.
 * @returns The edge.
 */
function edge(id: string, from: string, to: string) {
	return { id, order: id.length * 1000 + id.charCodeAt(1), from, to, kind: "call" };
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"src/ledger.ts": "export class Ledger {\n\tpost(): void {}\n}\n",
		"src/api.ts": "export const api = 1;\n",
	});
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "main");
	branch("feat/alias", "main", {
		"tsconfig.json": '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }\n',
		"src/api.ts":
			'import { Ledger } from "@/ledger";\nexport const used = new Ledger();\nused.post();\n',
	});
	branch("feat/x", "main", { "src/new.ts": "export function created(): void {}\n" });
	branch("feat/y", "feat/x", {
		"src/new.ts": "export function created2(): void {}\n",
		"src/layer2.ts": "export function second(): void {}\n",
	});
	branch("feat/z", "main", { "src/z.ts": "export function later(): void {}\n" });
	git("checkout", "-q", "main");
	register(scratch, { [SHOP]: shop });
	fixtureBoard(vault, "Alias", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("aApi", 1000, "src/api.ts", "feat/alias"),
					part("aLedger", 2000, "src/ledger.ts", "feat/alias"),
				],
				edges: [edge("ea", "aApi", "aLedger")],
			},
		},
	]);
	const inherited = part("sOld", 1000, "src/new.ts", "feat/x", "created");
	const kept = part("sKeep", 4000, "src/new.ts", "feat/x");
	const later = part("sLater", 3000, "src/z.ts", "feat/z", "later");
	fixtureBoard(vault, "Stack", [
		{ id: "v0", name: "Built", lifecycle: "current", content: { nodes: [inherited, kept, later] } },
		{
			id: "v1",
			name: "TASK-2",
			lifecycle: "draft",
			parent: "v0",
			content: {
				nodes: [inherited, kept, part("sSecond", 2000, "src/layer2.ts", "feat/y", "second"), later],
				edges: [edge("eIn", "sKeep", "sSecond"), edge("eOut", "sSecond", "sLater")],
			},
		},
	]);
	check = await import("#tests/runtime/support/code-check/pass.ts");
});

afterAll(() => {
	if (caller.ARCHBOARD_REPOS === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller.ARCHBOARD_REPOS;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Read the vault and run the pass.
 * @param variant The draft to read, if any.
 * @returns The outcome.
 */
async function pass(variant?: string): Promise<CodeCheckOutcome> {
	const read = check.readBoardsToCheck(vault, variant);
	if (!read.ok) throw new Error(`no draft ${variant} ${JSON.stringify(read)}`);
	return check.checkCode(vault, read.boards, new AbortController().signal);
}

/**
 * The finding codes and the ids of the subjects they are about.
 * @param outcome The pass's outcome.
 * @returns The pairs.
 */
function found(outcome: CodeCheckOutcome): string[] {
	return outcome.findings.map((finding) => `${finding.code} ${finding.subject?.id}`);
}

test("a draft's inherited part is read at the draft's own branch, which holds the layer it pins", async () => {
	const outcome = await pass("TASK-2");
	// `created` is on feat/x, the branch sOld pins, and gone on feat/y, where the draft is read.
	expect(found(outcome)).toContain("BINDING_SYMBOL_MISSING sOld");
	// sLater pins feat/z, which feat/y does not hold, so it keeps its pin and is sound there.
	expect(found(outcome).filter((one) => one.endsWith(" sLater"))).toEqual([]);
});

test("a relationship is judged where both ends are read at the draft's branch, and skipped where one pins a branch it does not hold", async () => {
	const outcome = await pass("TASK-2");
	expect(found(outcome)).toContain("RELATIONSHIP_UNSUPPORTED eIn");
	expect(
		outcome.skipped.filter((skip) => skip.reason === "refs-differ").map((skip) => skip.subject?.id),
	).toEqual(["eOut"]);
});

test("a ref's tree resolves an import through the tsconfig beside the code, as the checkout would", async () => {
	const outcome = await pass();
	// The alias `@/ledger` resolves only through feat/alias's tsconfig.json.
	expect(found(outcome)).not.toContain("RELATIONSHIP_UNSUPPORTED ea");
});
