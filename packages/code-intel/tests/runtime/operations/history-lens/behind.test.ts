// How far a board is behind its code (ADR 0045), on Git repositories this
// owner builds for itself, with its own checkout registry through
// ARCHBOARD_REPOS so nothing reads the machine's real one.
//
// The repository holds a vault and the code it describes, as the dogfood
// vault does; a second repository holds code only, as a vault of its own
// reads another repository. Every commit time is set, so the order across the
// two is the one each test states.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as LensModule from "#runtime/api/history-lens.ts";
import { decodeSemanticBoardDocument } from "@archboard/board/store-read";
import { BoardBehindSchema, type BoardBehind } from "#shared/protocol/code-check.ts";
import {
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
	type SemanticBoard,
} from "@archboard/board/document";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-history-lens-"));
const shop = join(scratch, "shop");
const other = join(scratch, "other");
const outside = join(scratch, "outside");
const registry = join(scratch, "repos.json");
const globalConfig = join(scratch, "gitconfig");
process.env["ARCHBOARD_REPOS"] = registry;
const SHOP = "github.com/test/shop";
const OTHER = "github.com/test/other";
const STRANGER = "github.com/test/stranger";
// Registered, and its checkout is not on this machine any more.
const GONE = "github.com/test/gone";
let lens: typeof LensModule;
let clock = 1_790_000_000;

/**
 * Run Git in a test repository with this owner's identity and a commit time it sets.
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
			GIT_CONFIG_GLOBAL: globalConfig,
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
 * Write files into a repository.
 * @param root The repository.
 * @param files Each path and its text.
 */
function write(root: string, files: Record<string, string>): void {
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(join(root, file, ".."), { recursive: true });
		writeFileSync(join(root, file), text);
	}
}

/**
 * Commit everything in a repository.
 * @param root The repository.
 * @param subject The commit's subject.
 * @returns The commit's id.
 */
function commit(root: string, subject: string): string {
	git(root, "add", "-A");
	git(root, "commit", "-q", "--no-gpg-sign", "-m", subject);
	return git(root, "rev-parse", "HEAD");
}

/**
 * Make a repository that identifies as a repository identity.
 * @param root Where.
 * @param identity The identity its origin gives it.
 */
function repository(root: string, identity: string): void {
	mkdirSync(root, { recursive: true });
	git(root, "init", "-q", "-b", "main");
	git(root, "remote", "add", "origin", `https://${identity}.git`);
}

/** The parts every board of this owner starts from. */
const PARTS = [
	{ id: "pA", name: "Checkout", kind: "module", binding: { repo: SHOP, path: "src/a.ts" } },
	{ id: "pD", name: "Payments", kind: "module", binding: { repo: SHOP, path: "src/dir/" } },
	{ id: "pR", name: "Ledger", kind: "module", binding: { repo: SHOP, path: "src/ledger.ts" } },
	{
		id: "pX",
		name: "Platform",
		kind: "service",
		binding: { repo: SHOP, path: "src" },
		drillDown: { board: "Platform", variant: { kind: "current" } },
	},
	{ id: "pS", name: "Stranger", kind: "module", binding: { repo: STRANGER, path: "x.ts" } },
	{
		id: "pP",
		name: "Pinned",
		kind: "module",
		binding: { repo: SHOP, path: "src/a.ts", branch: "elsewhere" },
	},
	{ id: "pO", name: "Other", kind: "module", binding: { repo: OTHER, path: "lib.ts" } },
	{ id: "pU", name: "Customer", kind: "person" },
	{ id: "pG", name: "Coupons", kind: "module", binding: { repo: SHOP, path: "src/coupons.ts" } },
	{ id: "pV", name: "Vanished", kind: "module", binding: { repo: GONE, path: "x.ts" } },
];

/**
 * A board with one current variant and one draft.
 * @param version The board's version.
 * @param extra Parts the current variant has beyond the first ones.
 * @param draftNote What the draft's summary says, which no reading of behind looks at.
 * @returns The board.
 */
function board(version: number, extra: readonly object[] = [], draftNote = "first"): SemanticBoard {
	const nodes = [...PARTS, ...extra].map((node, index) =>
		Object.assign({ order: (index + 1) * 1000 }, node),
	);
	return SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "bd",
		name: "Shop",
		level: "system",
		version,
		createdAt: "2026-09-27T00:00:00.000Z",
		updatedAt: "2026-09-27T00:00:00.000Z",
		current: "v1",
		variants: [
			{ id: "v1", name: "Built", lifecycle: "current", content: { nodes } },
			{
				id: "v2",
				name: "Proposal",
				lifecycle: "draft",
				parent: "v1",
				summary: draftNote,
				content: { nodes },
			},
		],
	});
}

const boardFile = join(shop, "vault", "Shop.semantic.json");

/**
 * Write a board into the shop's vault.
 * @param value The board.
 * @param file Where.
 */
function writeBoard(value: SemanticBoard, file = boardFile): void {
	mkdirSync(join(file, ".."), { recursive: true });
	writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`);
}

/**
 * How far one board is behind, read the way the server reads it.
 * @param value The board as it stands.
 * @param reading The reading to ask, when a test holds its memory.
 * @param file The board's file.
 * @param vault The vault directory.
 * @returns The answer for that board.
 */
async function behind(
	value: SemanticBoard,
	reading = lens.createBehindReading(),
	file = boardFile,
	vault = join(shop, "vault"),
): Promise<BoardBehind> {
	const [answer] = await reading.read(vault, [{ board: value, file }]);
	return BoardBehindSchema.parse(answer);
}

/**
 * The commits one part is behind by, by the subjects a test gave them.
 * @param answer The board's answer.
 * @param id The part.
 * @returns The subjects, newest first, or undefined when the part was not read.
 */
function partSubjects(answer: BoardBehind, id: string): string[] | undefined {
	if (!("parts" in answer)) return undefined;
	const part = answer.parts.find((one) => one.subject.id === id);
	return part?.commits.map(
		(hash) => answer.commits.find((one) => one.commit === hash)?.subject ?? hash,
	);
}

const subjects: Record<string, string> = {};

beforeAll(async () => {
	writeFileSync(globalConfig, "");
	repository(shop, SHOP);
	repository(other, OTHER);
	mkdirSync(outside, { recursive: true });
	writeFileSync(
		registry,
		JSON.stringify(
			[
				[SHOP, shop],
				[OTHER, other],
				[GONE, join(scratch, "gone")],
			].map(([repo, root]) => ({
				repo,
				root,
				source: "declared",
				addedAt: "2026-09-27T00:00:00.000Z",
			})),
		),
	);
	write(other, { "lib.ts": "1\n" });
	commit(other, "other before the board");
	write(shop, {
		"src/a.ts": "1\n",
		"src/old.ts": "1\n",
		"src/coupons.ts": "1\n",
		"src/dir/x.ts": "1\n",
		"src/dir/sub/y.ts": "1\n",
		"elsewhere.ts": "1\n",
	});
	commit(shop, "code before the board");
	write(shop, { "src/a.ts": "2\n" });
	writeBoard(board(1));
	subjects["created"] = commit(shop, "create the board, with a change to a.ts");
	write(other, { "lib.ts": "2\n" });
	commit(other, "other after the board");
	write(shop, { "src/a.ts": "3\n" });
	commit(shop, "change a.ts");
	write(shop, { "src/dir/sub/y.ts": "2\n", "elsewhere.ts": "2\n" });
	commit(shop, "change a file deep below the bound directory");
	write(shop, { "src/old.ts": "2\n" });
	commit(shop, "change the ledger under its former name");
	git(shop, "mv", "src/old.ts", "src/ledger.ts");
	commit(shop, "rename the ledger");
	git(shop, "rm", "-q", "src/coupons.ts");
	commit(shop, "delete the coupons");
	write(shop, { "src/a.ts": "4\n" });
	// A tracked embed is the board's, not the current variant's (ADR 0057).
	writeBoard({
		...board(2, [], "a draft edit"),
		trackedEmbeds: [{ repo: OTHER, path: "docs/shop.svg" }],
	});
	commit(shop, "edit the draft and a.ts, and track an embed");
	write(
		shop,
		Object.fromEntries([
			["src/a.ts", "5\n"],
			...Array.from({ length: 30 }, (_, index) => [`generated/${index}.ts`, "1\n"]),
		]),
	);
	commit(shop, "a large commit");
	lens = await import("#runtime/api/history-lens.ts");
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

test("a board is behind by the commits to each part's bound files after its last change, and a draft edit or a tracked embed is no change", async () => {
	const answer = await behind(board(2, [], "a draft edit"));
	expect(answer.lastChange).toMatchObject({ kind: "commit", commit: subjects["created"] });
	expect(partSubjects(answer, "pA")).toEqual([
		"a large commit",
		"edit the draft and a.ts, and track an embed",
		"change a.ts",
	]);
	if (!("commits" in answer)) throw new Error("the last change was not found");
	expect(answer.commits.filter((one) => one.large).map((one) => one.files)).toEqual([31]);
	expect(answer.commits.find((one) => one.subject === "change a.ts")?.large).toBe(false);
});

test("a binding to a directory counts every file below it, and a part that drills into another board is skipped", async () => {
	const answer = await behind(board(2, [], "a draft edit"));
	expect(partSubjects(answer, "pD")).toEqual(["change a file deep below the bound directory"]);
	expect(partSubjects(answer, "pX")).toBeUndefined();
	if (!("skipped" in answer)) throw new Error("the last change was not found");
	expect(answer.skipped.find((skip) => skip.subject.id === "pX")?.reason).toBe("drill-down");
	expect(answer.skipped.find((skip) => skip.subject.id === "pU")?.reason).toBe("unbound");
});

test("a renamed file keeps the history it had under its former name, and a deleted file is read up to its deletion", async () => {
	const answer = await behind(board(2, [], "a draft edit"));
	expect(partSubjects(answer, "pR")).toEqual([
		"rename the ledger",
		"change the ledger under its former name",
	]);
	expect(partSubjects(answer, "pG")).toEqual(["delete the coupons"]);
});

test("an unregistered repository stays silent, and a part pinned to a ref its checkout does not have out is skipped", async () => {
	const answer = await behind(board(2, [], "a draft edit"));
	if (!("skipped" in answer)) throw new Error("the last change was not found");
	expect(partSubjects(answer, "pS")).toBeUndefined();
	expect(answer.skipped.find((skip) => skip.subject.id === "pS")).toMatchObject({
		reason: "repository-unregistered",
		repo: STRANGER,
	});
	expect(answer.skipped.find((skip) => skip.subject.id === "pP")).toMatchObject({
		reason: "ref-not-checked-out",
		ref: { named: "elsewhere", checkedOut: "main" },
	});
	expect(answer.skipped.find((skip) => skip.subject.id === "pV")).toMatchObject({
		reason: "checkout-unavailable",
		repo: GONE,
	});
	expect(answer.commits.every((one) => one.repo !== STRANGER)).toBe(true);
});

test("a checkout without the last change's commit counts the commits after its time, and its next commit reaches a remembered answer", async () => {
	const reading = lens.createBehindReading();
	const current = board(2, [], "a draft edit");
	expect(partSubjects(await behind(current, reading), "pO")).toEqual(["other after the board"]);
	write(other, { "lib.ts": "3\n" });
	commit(other, "other later");
	expect(partSubjects(await behind(current, reading), "pO")).toEqual([
		"other later",
		"other after the board",
	]);
});

test("an edit in place moves the last change, and the commit that carries it with code counts for nothing", async () => {
	const reading = lens.createBehindReading();
	expect(partSubjects(await behind(board(2, [], "a draft edit"), reading), "pA")).toHaveLength(3);
	const edited = board(3, [{ id: "pN", name: "Refunds", kind: "module" }], "a draft edit");
	writeBoard(edited);
	expect((await behind(edited, reading)).lastChange.kind).toBe("uncommitted");
	expect(partSubjects(await behind(edited, reading), "pA")).toEqual([]);
	write(shop, { "src/a.ts": "6\n" });
	subjects["edited"] = commit(shop, "add refunds, with a change to a.ts");
	const answer = await behind(edited, reading);
	expect(answer.lastChange).toMatchObject({ kind: "commit", commit: subjects["edited"] });
	expect(partSubjects(answer, "pA")).toEqual([]);
	write(shop, { "src/a.ts": "7\n" });
	commit(shop, "change a.ts after the edit");
	expect(partSubjects(await behind(edited, reading), "pA")).toEqual(["change a.ts after the edit"]);
});

test("a board file Git does not track is a change no commit holds, and one Git ignores or outside Git cannot be read", async () => {
	const fresh = join(shop, "vault", "Fresh.semantic.json");
	writeBoard(board(1), fresh);
	expect((await behind(board(1), undefined, fresh)).lastChange.kind).toBe("uncommitted");
	// A space in the name, as most board names have one, must not change what Git answers.
	write(shop, { ".gitignore": "vault/Ignored board.semantic.json\n" });
	const ignored = join(shop, "vault", "Ignored board.semantic.json");
	writeBoard(board(1), ignored);
	const ignoredAnswer = await behind(board(1), undefined, ignored);
	expect(ignoredAnswer.lastChange).toEqual({ kind: "unknown", reason: "board-file-ignored" });
	expect("commits" in ignoredAnswer).toBe(false);
	const loose = join(outside, "vault", "Loose.semantic.json");
	writeBoard(board(1), loose);
	const looseAnswer = await behind(board(1), undefined, loose, join(outside, "vault"));
	expect(looseAnswer.lastChange).toEqual({ kind: "unknown", reason: "vault-outside-git" });
	expect("commits" in looseAnswer).toBe(false);
});

test("Behind migrates historical bytes without writing and a schema-only migration commit is no semantic last change", async () => {
	const legacy = JSON.parse(JSON.stringify(board(1)));
	legacy.schemaVersion = "2.2.0";
	for (const variant of legacy.variants) {
		for (const node of variant.content.nodes) delete node.order;
	}
	writeFileSync(boardFile, JSON.stringify(legacy));
	const created = commit(shop, "create a board in an old schema");
	write(shop, { "src/a.ts": "a source change after the old board\n" });
	commit(shop, "change code before the migration");
	const bytes = readFileSync(boardFile, "utf8");
	const modified = statSync(boardFile).mtimeMs;
	const decoded = decodeSemanticBoardDocument(bytes);
	if (!decoded.ok) throw new Error(decoded.problem);
	const inMemory = await behind(decoded.board);
	expect(inMemory.lastChange).toMatchObject({ kind: "commit", commit: created });
	expect(partSubjects(inMemory, "pA")).toEqual(["change code before the migration"]);
	expect(readFileSync(boardFile, "utf8")).toBe(bytes);
	expect(statSync(boardFile).mtimeMs).toBe(modified);
	const migrated = {
		...decoded.board,
		version: decoded.board.version + 1,
		updatedAt: "2026-10-07T00:00:00.000Z",
	};
	writeBoard(migrated);
	commit(shop, "migrate the board schema only");
	const answer = await behind(migrated);
	expect(answer.lastChange).toMatchObject({ kind: "commit", commit: created });
	expect(partSubjects(answer, "pA")).toEqual(["change code before the migration"]);
});
