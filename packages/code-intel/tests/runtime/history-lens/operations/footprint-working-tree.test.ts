// The footprint of a branch read up to the working tree (TASK-646.02), on a Git repository this
// owner builds for itself, with its own checkout registry through ARCHBOARD_REPOS so nothing reads
// the machine's real one.
//
// `shop` has `main` and a checked-out `feature` branch that commits a change to `a.ts`. The first
// case reads the clean checkout. The second leaves an unstaged edit, a staged edit, a deleted file,
// an untracked file in a bound directory, an untracked file that no binding holds, an ignored
// file in a bound directory, and an edit to one of two declarations in a file.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as LensModule from "#tests/runtime/support/history-lens/lens.ts";
import { FootprintAnswerSchema, type FootprintAnswer } from "#shared/protocol/footprint.ts";
import {
	LEGACY_BOARD_SCHEMA_VERSION,
	LegacyBoardSchema,
	currentVariant,
} from "@archboard/model/legacy-board";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-footprint-working-tree-"));
const shop = join(scratch, "shop");
const registry = join(scratch, "repos.json");
process.env["ARCHBOARD_REPOS"] = registry;
const SHOP = "github.com/test/shop";
let lens: typeof LensModule;

/**
 * Run Git with a controlled identity and configuration.
 * @param args Git's arguments.
 * @returns Git's trimmed output.
 */
function git(...args: string[]): string {
	const run = Bun.spawnSync(["git", ...args], {
		cwd: shop,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "Owner",
			GIT_AUTHOR_EMAIL: "owner@example.com",
			GIT_COMMITTER_NAME: "Owner",
			GIT_COMMITTER_EMAIL: "owner@example.com",
		},
	});
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
	return run.stdout.toString().trim();
}

/**
 * Write files into the checkout.
 * @param files Each file and its text.
 */
function write(files: Record<string, string>): void {
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(join(shop, file, ".."), { recursive: true });
		writeFileSync(join(shop, file), text);
	}
}

/**
 * Write and commit files.
 * @param subject The commit's subject.
 * @param files Each file and its text.
 */
function commit(subject: string, files: Record<string, string>): void {
	write(files);
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", subject);
}

const PARTS = [
	{ id: "pA", name: "Checkout", binding: { repo: SHOP, path: "src/a.ts" } },
	{ id: "pB", name: "Billing", binding: { repo: SHOP, path: "src/b.ts" } },
	{ id: "pE", name: "Events", binding: { repo: SHOP, path: "src/e.ts" } },
	{ id: "pR", name: "Legacy", binding: { repo: SHOP, path: "src/old.ts" } },
	{ id: "pD", name: "Payments", binding: { repo: SHOP, path: "src/dir" } },
	{ id: "pO", name: "Output", binding: { repo: SHOP, path: "out" } },
	{ id: "pK", name: "Keep", binding: { repo: SHOP, path: "src/k.ts", symbol: "keep" } },
	{ id: "pS", name: "Still", binding: { repo: SHOP, path: "src/k.ts", symbol: "still" } },
];

/**
 * Read the footprint of the checkout since `main`.
 * @param head Where the commits end: the working tree, or HEAD when absent.
 * @returns The answer, checked against its schema.
 */
async function footprint(head?: { readonly workingTree: true }): Promise<FootprintAnswer> {
	const document = LegacyBoardSchema.parse({
		schemaVersion: LEGACY_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "bd",
		name: "Shop",
		level: "system",
		version: 1,
		createdAt: "2026-11-19T00:00:00.000Z",
		updatedAt: "2026-11-19T00:00:00.000Z",
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "Built",
				lifecycle: "current",
				content: {
					nodes: PARTS.map((part, index) => ({ ...part, kind: "module", order: index + 1 })),
				},
			},
		],
	});
	const against = currentVariant(document);
	return FootprintAnswerSchema.parse(
		await lens.readVariantFootprint({ vault: scratch, document, against, base: "main", head }),
	);
}

/**
 * What a reading could change in the checkout: its objects, its index and its status.
 * @returns A description to compare.
 */
function checkoutState(): string {
	return [
		git("count-objects", "-v"),
		readFileSync(join(shop, ".git", "index")).toString("base64"),
		git("status", "--porcelain=v1", "--untracked-files=all"),
	].join("\n");
}

const changedIds = (answer: FootprintAnswer): string[] =>
	answer.proposal === null ? answer.changed.map((part) => part.subject.id) : [];

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	writeFileSync(
		registry,
		JSON.stringify([
			{ repo: SHOP, root: shop, source: "declared", addedAt: "2026-11-19T00:00:00.000Z" },
		]),
	);
	commit("the code before the branch", {
		".gitignore": "out/\n",
		"src/a.ts": "1\n",
		"src/b.ts": "1\n",
		"src/e.ts": "1\n",
		"src/old.ts": "1\n",
		"src/dir/x.ts": "1\n",
		"src/k.ts":
			"export function keep() {\n\treturn 1;\n}\n\nexport function still() {\n\treturn 1;\n}\n",
	});
	git("checkout", "-q", "-b", "feature");
	commit("change a.ts", { "src/a.ts": "2\n" });
	lens = await import("#tests/runtime/support/history-lens/lens.ts");
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

test("a clean working tree reads as HEAD does", async () => {
	const atHead = await footprint();
	const atWorkingTree = await footprint({ workingTree: true });
	expect(atWorkingTree).toEqual({ ...atHead, workingTree: true });
	expect(changedIds(atWorkingTree)).toEqual(["pA"]);
});

test("the working tree as the head names the parts that uncommitted changes touch, and leaves the checkout as it was", async () => {
	write({
		"src/b.ts": "2\n",
		"src/e.ts": "2\n",
		"src/dir/new.ts": "export const fresh = true;\n",
		"notes/todo.md": "todo\n",
		"out/build.js": "1\n",
		"src/k.ts":
			"export function keep() {\n\treturn 2;\n}\n\nexport function still() {\n\treturn 1;\n}\n",
	});
	git("add", "src/e.ts");
	unlinkSync(join(shop, "src/old.ts"));
	const before = checkoutState();

	const answer = await footprint({ workingTree: true });

	expect(answer.workingTree).toBe(true);
	expect(changedIds(answer)).toEqual(["pA", "pB", "pE", "pR", "pD", "pK"]);
	expect(
		answer.proposal === null && answer.changed.find((part) => part.subject.id === "pD"),
	).toMatchObject({ newSource: true });
	expect(answer.unboundFiles.map((file) => file.path)).toEqual(["notes/todo.md"]);
	expect(changedIds(await footprint())).toEqual(["pA"]);
	expect(checkoutState()).toBe(before);
});
