// Hotspots (ADR 0045) on Git repositories this owner builds for itself, with
// its own checkout registry through ARCHBOARD_REPOS so nothing reads the
// machine's real one.
//
// Every commit has the time a test states, in days before the last commit, so
// the period of a year ends at that commit and not at the clock. The shop's
// history holds, in this order: every file, edits that are a part's commits,
// a rename, one commit of more than 30 files, a branch with its merge, and a
// last commit.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as LensModule from "#runtime/api/history-lens.ts";
import { LocalityAnswerSchema, type LocalityAnswer } from "#shared/protocol/locality.ts";
import {
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-locality-"));
const shop = join(scratch, "shop");
const tiny = join(scratch, "tiny");
const registry = join(scratch, "repos.json");
const globalConfig = join(scratch, "gitconfig");
process.env["ARCHBOARD_REPOS"] = registry;
const SHOP = "github.com/test/shop";
const TINY = "github.com/test/tiny";
const STRANGER = "github.com/test/stranger";
const DAY = 86_400;
/** The time of the last commit of every repository, in seconds. */
const LAST = 1_790_000_000;
let lens: typeof LensModule;

/**
 * Run Git in a test repository as this owner, at a time it states.
 * @param cwd The repository.
 * @param daysBefore How many days before the last commit.
 * @param args Git's arguments.
 * @returns Git's trimmed output.
 */
function git(cwd: string, daysBefore: number, ...args: string[]): string {
	const date = `@${LAST - daysBefore * DAY} +0000`;
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
 * @param daysBefore How many days before the last commit.
 * @param subject The commit's subject.
 */
function commit(root: string, daysBefore: number, subject: string): void {
	git(root, daysBefore, "add", "-A");
	git(root, daysBefore, "commit", "-q", "--no-gpg-sign", "-m", subject);
}

/**
 * Make a repository that identifies as a repository identity.
 * @param root Where.
 * @param identity The identity its origin gives it.
 */
function repository(root: string, identity: string): void {
	mkdirSync(root, { recursive: true });
	git(root, 0, "init", "-q", "-b", "main");
	git(root, 0, "remote", "add", "origin", `https://${identity}.git`);
}

/** The text of a file at one edit, so every edit changes it. */
const edit = (name: string, times: number): Record<string, string> => ({
	[name]: `${name} ${times}\n`,
});

/** A part of the shop's board. */
const part = (id: string, name: string, binding?: object, extra: object = {}) => ({
	id,
	name,
	kind: "module",
	...(binding === undefined ? {} : { binding }),
	...extra,
});

const IN_SHOP = (path: string, extra: object = {}) => ({ repo: SHOP, path, ...extra });

/**
 * A board whose current variant holds every kind of part, and whose draft binds
 * one more part.
 * @param version The board's version.
 * @returns The board.
 */
function board(version: number): SemanticBoard {
	const current = [
		part("pA", "Checkout", IN_SHOP("src/a.ts")),
		part("pB", "Payments", IN_SHOP("src/b.ts")),
		part("pC", "Ledger", IN_SHOP("src/c.ts")),
		part("pD", "Catalogue", IN_SHOP("src/dir/")),
		part("pR", "Renamed", IN_SHOP("src/new.ts")),
		part("pX", "Platform", IN_SHOP("src"), {
			drillDown: { board: "Platform", variant: { kind: "current" } },
		}),
		part("pU", "Customer"),
		part("pS", "Stranger", { repo: STRANGER, path: "x.ts" }),
		part("pP", "Pinned", IN_SHOP("src/a.ts", { branch: "elsewhere" })),
	].map((node, index) => Object.assign({ order: (index + 1) * 1000 }, node));
	const draft = [...current, { order: 10_000, ...part("pN", "Cache", IN_SHOP("src/b.ts")) }];
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
			{ id: "v1", name: "Built", lifecycle: "current", content: { nodes: current } },
			{ id: "v2", name: "Proposal", lifecycle: "draft", parent: "v1", content: { nodes: draft } },
		],
	});
}

/**
 * One variant of a board.
 * @param value The board.
 * @param id The variant's id.
 * @returns The variant.
 */
function variantOf(value: SemanticBoard, id: string): SemanticVariant {
	const found = value.variants.find((one) => one.id === id);
	if (found === undefined) throw new Error(`no variant ${id}`);
	return found;
}

const built = board(1);

/**
 * The hotspots of the shop's board, parsed as the route answers them.
 * @param since The start of the period, or undefined for the default.
 * @param variant The variant's id.
 * @returns The answer.
 */
async function hotspots(since?: Date, variant = "v1"): Promise<LocalityAnswer> {
	return LocalityAnswerSchema.parse(
		await lens.createLocalityReading().read(scratch, built, variantOf(built, variant), since),
	);
}

/**
 * The subjects of the commits one part lists, as the answer names them.
 * @param answer The answer.
 * @param id The part.
 * @returns The subjects, newest first, or undefined when the part is not ranked.
 */
function subjectsOf(answer: LocalityAnswer, id: string): string[] | undefined {
	const found = answer.hotspots.find((one) => one.subject.id === id);
	return found?.commits.map(
		(hash) => answer.commits.find((one) => one.commit === hash)?.subject ?? hash,
	);
}

beforeAll(async () => {
	writeFileSync(globalConfig, "");
	repository(shop, SHOP);
	repository(tiny, TINY);
	writeFileSync(
		registry,
		JSON.stringify(
			[SHOP, TINY].map((repo) => ({
				repo,
				root: repo === SHOP ? shop : tiny,
				source: "declared",
				addedAt: "2026-10-06T00:00:00.000Z",
			})),
		),
	);
	write(shop, {
		...edit("src/a.ts", 0),
		...edit("src/b.ts", 0),
		...edit("src/c.ts", 0),
		...edit("src/dir/x.ts", 0),
		...edit("src/dir/y.ts", 0),
		...edit("src/old.ts", 0),
	});
	commit(shop, 400, "initial: before the period");
	write(shop, edit("src/a.ts", 1));
	commit(shop, 200, "a1");
	write(shop, edit("src/b.ts", 1));
	commit(shop, 190, "b1");
	write(shop, edit("src/a.ts", 2));
	commit(shop, 180, "a2");
	write(shop, { ...edit("src/a.ts", 3), ...edit("src/b.ts", 2) });
	commit(shop, 170, "a and b together");
	write(shop, edit("src/dir/x.ts", 1));
	commit(shop, 160, "dir x");
	write(shop, { ...edit("src/dir/y.ts", 1), ...edit("src/dir/z.ts", 1) });
	commit(shop, 150, "dir y and z");
	write(shop, edit("src/old.ts", 1));
	commit(shop, 140, "old edit");
	git(shop, 130, "mv", "src/old.ts", "src/new.ts");
	commit(shop, 130, "rename old to new");
	write(shop, edit("src/new.ts", 2));
	commit(shop, 120, "new edit");
	write(shop, edit("src/c.ts", 1));
	commit(shop, 110, "c1");
	write(shop, {
		...edit("src/a.ts", 4),
		...edit("src/c.ts", 2),
		...Object.fromEntries(Array.from({ length: 31 }, (_, one) => [`bulk/f${one}.txt`, `${one}\n`])),
	});
	commit(shop, 100, "one commit of 33 files");
	git(shop, 90, "checkout", "-q", "-b", "feature");
	write(shop, edit("src/b.ts", 3));
	commit(shop, 90, "b on a branch");
	git(shop, 85, "checkout", "-q", "main");
	write(shop, edit("src/dir/x.ts", 2));
	commit(shop, 85, "dir x on main");
	git(shop, 80, "merge", "-q", "--no-ff", "--no-gpg-sign", "-m", "merge the branch", "feature");
	write(shop, edit("src/a.ts", 5));
	commit(shop, 0, "a last");
	write(tiny, edit("t.ts", 0));
	commit(tiny, 0, "tiny");
	lens = await import("#runtime/api/history-lens.ts");
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

test("parts are ranked by the commits that changed their bound files in the year before HEAD", async () => {
	const answer = await hotspots();
	expect(answer.hotspots.map((one) => [one.subject.name, one.count])).toEqual([
		["Checkout", 4],
		["Payments", 3],
		["Catalogue", 3],
		["Renamed", 3],
		["Ledger", 1],
	]);
	expect(subjectsOf(answer, "pA")).toEqual(["a last", "a and b together", "a2", "a1"]);
	expect(subjectsOf(answer, "pD")).toEqual(["dir x on main", "dir y and z", "dir x"]);
});

test("each part lists its commits newest first, and a count that is that list's length", async () => {
	const answer = await hotspots();
	const times = answer.commits.map((one) => one.committedAt);
	expect(times).toEqual(times.toSorted().toReversed());
	for (const one of answer.hotspots) expect(one.count).toBe(one.commits.length);
	expect(answer.commits.every((one) => one.files <= 30)).toBe(true);
});

test("a rename keeps the commits before it, and a merge counts for nothing of its own", async () => {
	const answer = await hotspots();
	expect(subjectsOf(answer, "pR")).toEqual(["new edit", "rename old to new", "old edit"]);
	expect(answer.commits.map((one) => one.subject)).not.toContain("merge the branch");
	expect(subjectsOf(answer, "pB")).toEqual(["b on a branch", "a and b together", "b1"]);
});

test("the period ends at the commit time of HEAD and starts a year before it", async () => {
	const [period] = (await hotspots()).periods;
	expect(period?.repo).toBe(SHOP);
	expect(period?.until).toBe(new Date(LAST * 1000).toISOString());
	expect(period?.since).toBe(new Date((LAST - 365 * DAY) * 1000).toISOString());
	expect(period?.head).toBe(git(shop, 0, "rev-parse", "HEAD"));
});

test("since names another start, and an earlier one counts the commits before the default", async () => {
	// A start before 1973, and one before 1970, count every commit.
	const early = await hotspots(new Date(DAY * 1000));
	expect(early.hotspots.find((one) => one.subject.id === "pA")?.count).toBe(5);
	expect(subjectsOf(early, "pR")).toContain("initial: before the period");
	expect((await hotspots(new Date("1969-12-31"))).hotspots[0]?.count).toBe(5);
	const late = await hotspots(new Date((LAST - 155 * DAY) * 1000));
	expect(late.hotspots.map((one) => [one.subject.name, one.count])).toEqual([
		["Renamed", 3],
		["Catalogue", 2],
		["Checkout", 1],
		["Payments", 1],
		["Ledger", 1],
	]);
});

test("a commit of more than 30 files is left out of every count, and the answer says how many", async () => {
	const answer = await hotspots();
	expect(answer.leftOut.largeCommits).toBe(1);
	expect(answer.commits.map((one) => one.subject)).not.toContain("one commit of 33 files");
	expect(subjectsOf(answer, "pC")).toEqual(["c1"]);
	const wide = await hotspots(new Date((LAST - 450 * DAY) * 1000));
	expect(wide.leftOut.largeCommits).toBe(1);
});

test("a part that was not read is listed with its reason and is in no ranking", async () => {
	const answer = await hotspots();
	const reasons = Object.fromEntries(answer.skipped.map((one) => [one.subject.id, one.reason]));
	expect(reasons).toEqual({
		pX: "drill-down",
		pU: "unbound",
		pS: "repository-unregistered",
		pP: "ref-not-checked-out",
	});
	const ranked = answer.hotspots.map((one) => one.subject.id);
	for (const id of Object.keys(reasons)) expect(ranked).not.toContain(id);
});

test("a draft is read when it is named, and its parts rank beside the current ones", async () => {
	const answer = await hotspots(undefined, "v2");
	expect(answer.variant).toMatchObject({ id: "v2", lifecycle: "draft" });
	expect(answer.hotspots.find((one) => one.subject.id === "pN")?.count).toBe(3);
});

test("a board with no part in a registered repository answers an empty ranking, not a failure", async () => {
	const lonely = SemanticBoardSchema.parse({
		...built,
		variants: [
			{
				id: "v1",
				name: "Built",
				lifecycle: "current",
				content: { nodes: [{ order: 1000, ...part("pU", "Customer") }] },
			},
		],
	});
	const answer = LocalityAnswerSchema.parse(
		await lens.createLocalityReading().read(scratch, lonely, variantOf(lonely, "v1"), undefined),
	);
	expect(answer.hotspots).toEqual([]);
	expect(answer.periods).toEqual([]);
	expect(answer.skipped.map((one) => one.reason)).toEqual(["unbound"]);
});

const small = (version: number): SemanticBoard =>
	SemanticBoardSchema.parse({
		...built,
		version,
		variants: [
			{
				id: "v1",
				name: "Built",
				lifecycle: "current",
				content: {
					nodes: [{ order: 1000, ...part("pT", "Tiny", { repo: TINY, path: "t.ts" }) }],
				},
			},
		],
	});

test("an answer is kept until the board's version, the start of the period or a checkout's HEAD moves, and is no other vault's", async () => {
	const reading = lens.createLocalityReading();
	const first = small(1);
	const answer = await reading.read(scratch, first, variantOf(first, "v1"), undefined);
	expect(await reading.read(scratch, first, variantOf(first, "v1"), undefined)).toBe(answer);
	// Two worktrees of one repository hold copies of a board with one id and version, which
	// each may have changed since (ADR 0049): what one vault's board is read as is not the other's.
	const elsewhere = join(scratch, "another-vault");
	expect(await reading.read(elsewhere, first, variantOf(first, "v1"), undefined)).not.toBe(answer);
	const next = small(2);
	expect(await reading.read(scratch, next, variantOf(next, "v1"), undefined)).not.toBe(answer);
	expect(
		await reading.read(scratch, first, variantOf(first, "v1"), new Date(LAST * 1000 - DAY * 1000)),
	).not.toBe(answer);
	write(shop, edit("src/c.ts", 3));
	commit(shop, 0, "a commit in a repository the board does not bind");
	expect(await reading.read(scratch, first, variantOf(first, "v1"), undefined)).toBe(answer);
	write(tiny, edit("t.ts", 1));
	commit(tiny, 0, "tiny again");
	const moved = await reading.read(scratch, first, variantOf(first, "v1"), undefined);
	expect(moved).not.toBe(answer);
	expect(moved.hotspots[0]?.count).toBe(2);
});
