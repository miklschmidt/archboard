// A variant's document references are held to the files at the version each
// names, read as a binding of the same repository and ref is read (TASK-498,
// ADR 0054).
//
// The checkout `shop` has `main` out. Branch `design` adds `docs/stack.md` and
// deletes `docs/old.md`. So a pass that read the files on disk where a
// reference names `design` would miss `stack.md` and find `old.md`.

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
const scratch = mkdtempSync(join(tmpdir(), "archboard-documents-"));
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

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, { "docs/design.md": "# Design\n", "docs/old.md": "# Old\n" });
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "main");
	git("checkout", "-q", "-b", "design");
	write(shop, { "docs/stack.md": "# Stack\n" });
	git("rm", "-q", "docs/old.md");
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "design");
	git("checkout", "-q", "main");
	register(scratch, { [SHOP]: shop });
	fixtureBoard(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			documents: [
				{ repo: SHOP, path: "docs/design.md" },
				{ repo: SHOP, path: "docs/missing.md" },
				{ repo: SHOP, path: "docs" },
				{ repo: SHOP, path: "docs/stack.md", branch: "design" },
				{ repo: SHOP, path: "docs/old.md", branch: "design" },
				{ repo: SHOP, path: "docs/design.md", branch: "feat/gone" },
				{ repo: "github.com/test/elsewhere", path: "README.md" },
			],
			content: { nodes: [] },
		},
		{
			id: "v2",
			name: "TASK-1",
			lifecycle: "draft",
			parent: "v1",
			documents: [{ repo: SHOP, path: "docs/stack.md" }],
			content: { nodes: [] },
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
	if (!read.ok) throw new Error(`no draft ${variant}`);
	return check.checkCode(vault, read.boards, new AbortController().signal);
}

/**
 * Each finding about a document reference, as its code and its place.
 * @param outcome The pass's outcome.
 * @returns The pairs.
 */
function found(outcome: CodeCheckOutcome): string[] {
	return outcome.findings
		.filter((finding) => finding.path?.includes(".documents.") === true)
		.map((finding) => `${finding.severity} ${finding.code} ${finding.path}`);
}

test("a reference whose file is not at the version it names is a warning, and one that is there is not", async () => {
	expect(found(await pass())).toEqual([
		"warning DOCUMENT_PATH_MISSING variants.v1.documents.1",
		// A directory is not a document.
		"warning DOCUMENT_PATH_MISSING variants.v1.documents.2",
		// On disk, but not on the branch the reference names.
		"warning DOCUMENT_PATH_MISSING variants.v1.documents.4",
	]);
});

test("a ref the checkout cannot resolve and an unregistered repository are skipped with the reason", async () => {
	const skips = (await pass()).skipped.filter((skip) => skip.board === "Shop");
	expect(skips.map((skip) => [skip.reason, skip.variant, skip.ref?.named, skip.detail])).toEqual([
		["ref-not-checked-out", "v1", "feat/gone", "docs/design.md"],
		["repository-unregistered", "v1", undefined, "README.md"],
	]);
});

test("a draft's references are read when the check reads the draft, at the checkout's files where it pins none", async () => {
	// `stack.md` is only on `design`, and the draft names no ref.
	expect(found(await pass("TASK-1"))).toEqual([
		"warning DOCUMENT_PATH_MISSING variants.v2.documents.0",
	]);
	const status = Bun.spawnSync(["git", "status", "--porcelain", "--branch"], { cwd: shop });
	expect(status.stdout.toString().trim()).toBe("## main");
});
