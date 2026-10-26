// The footprint of parts pinned to a branch that is not checked out (TASK-493), on
// a Git repository this owner builds for itself, with its own checkout registry.
//
// `shop` has `feature` out. `stack-two` is built on it and changes the ledger. A
// part that pins `stack-two` is read up to it; so is every part of a draft whose
// own branch is `stack-two`, whatever older branch it pins.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as LensModule from "#tests/runtime/support/history-lens/lens.ts";
import { FootprintAnswerSchema } from "#shared/protocol/footprint.ts";
import {
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
	currentVariant,
	resolveVariant,
} from "@archboard/board/document";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-footprint-pinned-"));
const shop = join(scratch, "shop");
const SHOP = "github.com/test/shop";
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
let lens: typeof LensModule;

/**
 * Run Git in the repository.
 * @param args Git's arguments.
 */
function git(...args: string[]): void {
	const run = Bun.spawnSync(["git", ...args], {
		cwd: shop,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: join(scratch, "gitconfig"),
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "Owner",
			GIT_AUTHOR_EMAIL: "owner@example.com",
			GIT_COMMITTER_NAME: "Owner",
			GIT_COMMITTER_EMAIL: "owner@example.com",
		},
	});
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
}

/**
 * Write a file and commit it.
 * @param subject The commit's subject.
 * @param file The file.
 * @param text Its text.
 */
function commit(subject: string, file: string, text: string): void {
	mkdirSync(join(shop, file, ".."), { recursive: true });
	writeFileSync(join(shop, file), text);
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", subject);
}

/**
 * A part bound to a branch of the shop.
 * @param id Its id.
 * @param order Its order.
 * @param path Its bound path.
 * @param branch The branch it pins.
 * @returns The node.
 */
function part(id: string, order: number, path: string, branch: string) {
	return { id, name: id, kind: "module", order, binding: { repo: SHOP, path, branch } };
}

/**
 * A board with the variants a test says.
 * @param variants The variants.
 * @returns The board.
 */
function board(variants: readonly object[]) {
	return SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "bd",
		name: "Shop",
		level: "system",
		version: 1,
		createdAt: "2026-09-27T00:00:00.000Z",
		updatedAt: "2026-09-27T00:00:00.000Z",
		current: "v1",
		variants,
	});
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	commit("the code", "src/ledger.ts", "1\n");
	git("checkout", "-q", "-b", "feature");
	commit("change events on the feature", "src/e.ts", "1\n");
	git("checkout", "-q", "-b", "stack-two");
	commit("change the ledger on the second layer", "src/ledger.ts", "2\n");
	git("checkout", "-q", "feature");
	writeFileSync(
		join(scratch, "repos.json"),
		JSON.stringify([
			{ repo: SHOP, root: shop, source: "declared", addedAt: "2026-09-27T00:00:00.000Z" },
		]),
	);
	lens = await import("#tests/runtime/support/history-lens/lens.ts");
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * The ids of the parts a footprint lists as changed, and why it skipped the rest.
 * @param value The board.
 * @param proposal The draft to read, if any.
 * @returns The changed ids, and each skip as its part and reason.
 */
async function read(value: ReturnType<typeof board>, proposal?: string) {
	const answer = FootprintAnswerSchema.parse(
		await lens.readVariantFootprint({
			vault: scratch,
			board: value,
			against: currentVariant(value),
			proposal: proposal === undefined ? undefined : resolveVariant(value, proposal),
			base: "main",
		}),
	);
	const changed =
		answer.proposal === null
			? answer.changed
			: [...answer.namedAndChanged, ...answer.changedNotNamed];
	return {
		changed: changed.map((one) => one.subject.id),
		skipped: answer.skipped.map((skip) => [skip.subject.id, skip.reason]),
		detail: answer.skipped.map((skip) => skip.detail ?? ""),
	};
}

test("a part pinned to a branch that is not checked out is read up to that branch, and one pinned to a ref no checkout resolves is skipped naming it", async () => {
	const value = board([
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pP", 1000, "src/ledger.ts", "stack-two"),
					part("pQ", 2000, "src/ledger.ts", "gone"),
				],
			},
		},
	]);
	const answer = await read(value);
	expect(answer.changed).toEqual(["pP"]);
	expect(answer.skipped).toEqual([["pQ", "head-unresolved"]]);
	expect(answer.detail[0]).toContain("gone");
});

test("a draft is read at its own branch, which holds the older branch an inherited part pins", async () => {
	const inherited = part("pL", 1000, "src/ledger.ts", "feature");
	const value = board([
		{ id: "v1", name: "Built", lifecycle: "current", content: { nodes: [inherited] } },
		{
			id: "v2",
			name: "Layer two",
			lifecycle: "draft",
			parent: "v1",
			content: { nodes: [inherited, part("pE", 2000, "src/e.ts", "stack-two")] },
		},
	]);
	// The ledger changed on stack-two, a commit that `feature` alone lacks.
	expect((await read(value, "Layer two")).changed.toSorted()).toEqual(["pE", "pL"]);
});
