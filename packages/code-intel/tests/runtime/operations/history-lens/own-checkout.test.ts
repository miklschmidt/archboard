// Behind, footprint and locality read a board against the checkout that holds
// its vault, for the vault's own repository (ADR 0049, TASK-472.03).
//
// The registry holds `shop` on `main`. A second checkout of the same
// repository holds the vault, is on `feature` and is not registered. A part is
// pinned to `feature`, so the lens reads it only in the checkout on that
// branch, and skips it in the other: where each reader found the part says
// which checkout it read.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBehindReading } from "#runtime/operations/history-lens/behind.ts";
import { createVariantLocality } from "#runtime/operations/history-lens/locality.ts";
import { readVariantFootprint } from "#runtime/operations/history-lens/footprint.ts";
import {
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
	currentVariant,
	type SemanticBoard,
} from "@archboard/board/document";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-own-checkout-"));
const shop = join(scratch, "shop");
const holder = join(scratch, "holder");
const vault = join(holder, "vault");
const registry = join(scratch, "repos.json");
process.env["ARCHBOARD_REPOS"] = registry;
const SHOP = "github.com/test/shop";
let clock = 1_790_000_000;
let first = "";

/**
 * Run Git in a test repository with a commit time this owner sets.
 * @param cwd The repository.
 * @param args Git's arguments.
 * @returns Git's trimmed output.
 */
function git(cwd: string, ...args: string[]): string {
	clock += 60;
	const date = `@${clock} +0000`;
	const run = Bun.spawnSync(["git", ...args], {
		cwd,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "Owner",
			GIT_AUTHOR_EMAIL: "owner@example.com",
			GIT_COMMITTER_NAME: "Owner",
			GIT_COMMITTER_EMAIL: "owner@example.com",
			GIT_AUTHOR_DATE: date,
			GIT_COMMITTER_DATE: date,
		},
	});
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
	return run.stdout.toString().trim();
}

/**
 * Make a repository of the shop's identity with a commit in it.
 * @param root Where.
 * @param branch The branch it is on.
 * @param files Each path and its text.
 * @returns The commit's id.
 */
function repository(root: string, branch: string, files: Record<string, string>): string {
	mkdirSync(root, { recursive: true });
	git(root, "init", "-q", "-b", branch);
	git(root, "remote", "add", "origin", `https://${SHOP}.git`);
	return commit(root, "first", files);
}

/**
 * Commit files in a repository.
 * @param root The repository.
 * @param subject The commit's subject.
 * @param files Each path and its text.
 * @returns The commit's id.
 */
function commit(root: string, subject: string, files: Record<string, string>): string {
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(join(root, file, ".."), { recursive: true });
		writeFileSync(join(root, file), text);
	}
	git(root, "add", "-A");
	git(root, "commit", "-q", "--no-gpg-sign", "-m", subject);
	return git(root, "rev-parse", "HEAD");
}

/** A board with one part, pinned to the branch the vault's checkout is on. */
const board: SemanticBoard = SemanticBoardSchema.parse({
	schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
	kind: "semantic-board",
	id: "bd",
	name: "Shop",
	level: "system",
	version: 1,
	createdAt: "2026-09-27T00:00:00.000Z",
	updatedAt: "2026-09-27T00:00:00.000Z",
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					{
						id: "pA",
						order: 1000,
						name: "Checkout",
						kind: "module",
						binding: { repo: SHOP, path: "src/a.ts", branch: "feature" },
					},
				],
			},
		},
	],
});

beforeAll(() => {
	writeFileSync(
		registry,
		JSON.stringify([{ repo: SHOP, root: shop, source: "declared", addedAt: "2026-01-01" }]),
	);
	repository(shop, "main", { "src/a.ts": "export {};\n" });
	first = repository(holder, "feature", { "src/a.ts": "export {};\n" });
	// The board is committed, then the code it describes changes.
	mkdirSync(vault, { recursive: true });
	writeFileSync(join(vault, "Shop.semantic.json"), `${JSON.stringify(board, null, "\t")}\n`);
	commit(holder, "board", {});
	commit(holder, "code moved on", { "src/a.ts": "export const a = 1;\n" });
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

test("behind counts the commits of the checkout that holds the vault", async () => {
	const [answer] = await createBehindReading().read(vault, [
		{ board, file: join(vault, "Shop.semantic.json") },
	]);
	if (answer === undefined || !("parts" in answer)) throw new Error("the board was not read");
	expect(answer.skipped).toEqual([]);
	expect(answer.parts.map((part) => [part.subject.id, part.commits.length])).toEqual([["pA", 1]]);
});

test("footprint and locality read the part in the checkout that holds the vault", async () => {
	const current = currentVariant(board)!;
	const footprint = await readVariantFootprint({ vault, board, against: current, base: first });
	expect(footprint.skipped).toEqual([]);
	expect(footprint.proposal).toBeNull();
	const locality = await createVariantLocality().read(vault, board, current, undefined);
	expect(locality.skipped).toEqual([]);
	expect(locality.hotspots.map((one) => one.subject.id)).toEqual(["pA"]);
});
