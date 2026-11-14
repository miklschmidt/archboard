// The footprint of a branch (ADR 0045), on Git repositories this owner builds
// for itself, with its own checkout registry through ARCHBOARD_REPOS so
// nothing reads the machine's real one.
//
// `shop` has `main`, which moves on after the branch left it, and a `feature`
// branch that is HEAD. `other` is registered too but has no `main`. A document's
// current variant binds parts into both, into a repository that is not
// registered, and to nothing; a proposal against it adds, changes and removes
// parts and relationships. The merge base is what keeps the commits of `main`
// out of the footprint.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as LensModule from "#tests/runtime/support/history-lens/lens.ts";
import { FootprintAnswerSchema, type FootprintAnswer } from "#shared/protocol/footprint.ts";
import {
	LEGACY_BOARD_SCHEMA_VERSION,
	LegacyBoardSchema,
	currentVariant,
	resolveVariant,
	type LegacyBoard,
} from "@archboard/model/legacy-board";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-footprint-"));
const shop = join(scratch, "shop");
const other = join(scratch, "other");
const registry = join(scratch, "repos.json");
const globalConfig = join(scratch, "gitconfig");
process.env["ARCHBOARD_REPOS"] = registry;
const SHOP = "github.com/test/shop";
const OTHER = "github.com/test/other";
const STRANGER = "github.com/test/stranger";
let lens: typeof LensModule;
let clock = 1_790_000_000;

/** Run Git with a controlled identity, configuration and commit time. */
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

/** Write and commit fixture files, then return the commit id. */
function commit(root: string, subject: string, files: Record<string, string>): string {
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(join(root, file, ".."), { recursive: true });
		writeFileSync(join(root, file), text);
	}
	git(root, "add", "-A");
	git(root, "commit", "-q", "--no-gpg-sign", "-m", subject);
	return git(root, "rev-parse", "HEAD");
}

/** Initialize a fixture repository with an origin and a starting branch. */
function repository(root: string, identity: string, branch: string): void {
	mkdirSync(root, { recursive: true });
	git(root, "init", "-q", "-b", branch);
	git(root, "remote", "add", "origin", `https://${identity}.git`);
}

/** Every part of the current variant, as ids a test reads the answer by. */
const BUILT = [
	{ id: "pA", name: "Checkout", binding: { repo: SHOP, path: "src/a.ts" } },
	{ id: "pB", name: "Billing", binding: { repo: SHOP, path: "src/b.ts" } },
	{ id: "pD", name: "Payments", binding: { repo: SHOP, path: "src/dir" } },
	{ id: "pL", name: "Ledger", binding: { repo: SHOP, path: "src/ledger.ts" } },
	{ id: "pR", name: "Legacy", binding: { repo: SHOP, path: "src/old.ts" } },
	{ id: "pE", name: "Events", binding: { repo: SHOP, path: "src/e.ts" } },
	{ id: "pU", name: "Customer" },
	{
		id: "pX",
		name: "Platform",
		binding: { repo: SHOP, path: "src" },
		drillDown: { board: "Platform", variant: { kind: "current" } },
	},
	{ id: "pS", name: "Stranger", binding: { repo: STRANGER, path: "x.ts" } },
	{ id: "pO", name: "Other", binding: { repo: OTHER, path: "lib.ts" } },
	{ id: "pY", name: "Refunds", binding: { repo: SHOP, path: "src/dir/sub/y.ts" } },
];

/** Give each fixture module its kind and order in the document. */
function nodeOf(node: (typeof BUILT)[number] & { responsibility?: string }, index: number) {
	return { ...node, order: (index + 1) * 1000, kind: "module" };
}

/**
 * The document: the built architecture and the proposal that changes it. The
 * proposal rewords Ledger, adds Cache, a relationship from Checkout to
 * Payments and a step from Billing to Ledger, removes Legacy, and rewords the
 * stranger's part.
 * @returns The document.
 */
function document(): LegacyBoard {
	const built = BUILT.map(nodeOf);
	const reworded = new Set(["pL", "pS"]);
	const proposed = [
		...BUILT.filter((node) => node.id !== "pR"),
		{ id: "pC", name: "Cache", binding: { repo: SHOP, path: "src/c.ts" } },
	].map((node, index) =>
		nodeOf(
			reworded.has(node.id) ? { ...node, responsibility: "Says it differently" } : node,
			index,
		),
	);
	return LegacyBoardSchema.parse({
		schemaVersion: LEGACY_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "bd",
		name: "Shop",
		level: "system",
		version: 4,
		createdAt: "2026-09-27T00:00:00.000Z",
		updatedAt: "2026-09-27T00:00:00.000Z",
		current: "v1",
		variants: [
			{ id: "v1", name: "Built", lifecycle: "current", content: { nodes: built } },
			{
				id: "v2",
				name: "Plan",
				lifecycle: "draft",
				parent: "v1",
				content: {
					nodes: proposed,
					edges: [{ id: "eAD", order: 1000, from: "pA", to: "pD", kind: "call" }],
					flows: [
						{
							id: "fP",
							name: "Pay",
							participants: ["pB", "pL"],
							steps: [{ id: "sP", from: "pB", to: "pL", label: "charge" }],
						},
					],
				},
			},
			{ id: "v3", name: "Old plan", lifecycle: "shelved", parent: "v1", content: { nodes: built } },
		],
	});
}

/**
 * Read the footprint of the branch against the document.
 * @param base The ref.
 * @param proposal The proposal's name, when one is named.
 * @param head The ref the commits run up to, when it is not HEAD.
 * @returns The answer, checked against its schema.
 */
async function footprint(base: string, proposal?: string, head?: string): Promise<FootprintAnswer> {
	const value = document();
	const current = currentVariant(value);
	if (current === undefined) throw new Error("the document has no current variant");
	const named = proposal === undefined ? undefined : resolveVariant(value, proposal);
	return FootprintAnswerSchema.parse(
		await lens.readVariantFootprint({
			vault: scratch,
			document: value,
			against: current,
			proposal: named,
			base,
			head,
		}),
	);
}

/**
 * The subjects of the commits a part has in the answer, newest first.
 * @param answer The answer.
 * @param part What the answer lists.
 * @returns The subjects.
 */
function subjectsOf(answer: FootprintAnswer, part: { commits: string[] }): string[] {
	return part.commits.map(
		(hash) => answer.commits.find((one) => one.commit === hash)?.subject ?? hash,
	);
}

const ids = (parts: readonly { subject: { id: string } }[]): string[] =>
	parts.map((part) => part.subject.id);
let branchPoint = "";
let notes = "";

beforeAll(async () => {
	writeFileSync(globalConfig, "");
	repository(shop, SHOP, "main");
	repository(other, OTHER, "trunk");
	writeFileSync(
		registry,
		JSON.stringify(
			[SHOP, OTHER].map((repo) => ({
				repo,
				root: repo === SHOP ? shop : other,
				source: "declared",
				addedAt: "2026-09-27T00:00:00.000Z",
			})),
		),
	);
	commit(other, "other", { "lib.ts": "1\n" });
	branchPoint = commit(shop, "the code before the branch", {
		"src/a.ts": "1\n",
		"src/b.ts": "1\n",
		"src/dir/x.ts": "1\n",
		"src/ledger.ts": "1\n",
		"src/old.ts": "1\n",
		"src/e.ts": "1\n",
	});
	git(shop, "checkout", "-q", "-b", "feature");
	commit(shop, "change a.ts", { "src/a.ts": "2\n" });
	commit(shop, "change a file deep below the bound directory", { "src/dir/sub/y.ts": "1\n" });
	commit(shop, "a large commit", {
		"src/a.ts": "3\n",
		...Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`gen/${index}.ts`, "1\n"])),
	});
	commit(shop, "add the cache", { "src/c.ts": "1\n" });
	git(shop, "rm", "-q", "src/old.ts");
	git(shop, "commit", "-q", "--no-gpg-sign", "-m", "remove the legacy file");
	commit(shop, "change events", { "src/e.ts": "2\n" });
	git(shop, "checkout", "-q", "main");
	commit(shop, "main moves on: change b.ts", { "src/b.ts": "2\n" });
	git(shop, "checkout", "-q", "feature");
	// A layer of a stack that is not checked out, and a branch only `origin` holds.
	git(shop, "checkout", "-q", "-b", "stack-two");
	commit(shop, "change the ledger on the second layer", { "src/ledger.ts": "2\n" });
	git(shop, "update-ref", "refs/remotes/origin/remote-only", git(shop, "rev-parse", "stack-two"));
	// A file that a later commit renames into a bound directory, beside one that stays unbound.
	git(shop, "checkout", "-q", "-b", "renames", "feature");
	notes = commit(shop, "write notes", { "notes/draft.ts": "draft\n", "notes/todo.md": "todo\n" });
	git(shop, "mv", "notes/draft.ts", "src/dir/draft.ts");
	git(shop, "commit", "-q", "--no-gpg-sign", "-m", "move the draft into payments");
	// Two layers of a stack that make the same change and merge instead of rebasing, and a change
	// that the upper layer undoes.
	git(shop, "checkout", "-q", "-b", "lower", "feature");
	commit(shop, "lower: change the ledger", { "src/ledger.ts": "2\n" });
	git(shop, "checkout", "-q", "-b", "upper", "feature");
	commit(shop, "upper: change the ledger as the lower layer does", { "src/ledger.ts": "2\n" });
	commit(shop, "upper: try billing", { "src/b.ts": "9\n", "notes/scratch.md": "x\n" });
	unlinkSync(join(shop, "notes/scratch.md"));
	commit(shop, "upper: undo billing", { "src/b.ts": "1\n" });
	commit(shop, "upper: change events", { "src/e.ts": "3\n" });
	git(shop, "merge", "-q", "--no-edit", "--no-gpg-sign", "lower");
	git(shop, "checkout", "-q", "feature");
	lens = await import("#tests/runtime/support/history-lens/lens.ts");
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

test("the parts whose bound files changed between the merge base and HEAD, with their commits, and the commits of the ref's own history left out", async () => {
	const answer = await footprint("main");
	if (answer.proposal !== null) throw new Error("no proposal was named");
	expect(ids(answer.changed)).toEqual(["pA", "pD", "pR", "pE", "pY"]);
	const [checkout] = answer.changed;
	expect(checkout && subjectsOf(answer, checkout)).toEqual(["a large commit", "change a.ts"]);
	expect(answer.changed.find((part) => part.subject.id === "pD")).toMatchObject({
		path: "src/dir",
	});
	expect(answer.commits.map((one) => one.subject)).not.toContain("main moves on: change b.ts");
	expect(answer.repositories).toContainEqual(
		expect.objectContaining({ status: "read", repo: SHOP, mergeBase: branchPoint, commits: 6 }),
	);
});

test("a changed file that no binding holds is listed with its commits, and a skipped part's binding still holds its files", async () => {
	const answer = await footprint("main");
	const generated = Array.from({ length: 30 }, (_, index) => `gen/${index}.ts`);
	expect(answer.unboundFiles.map((file) => file.path).toSorted()).toEqual(generated.toSorted());
	const large = answer.commits.find((one) => one.subject === "a large commit")?.commit;
	expect(answer.unboundFiles.every((file) => file.repo === SHOP)).toBe(true);
	expect(answer.unboundFiles.every((file) => file.commits.join() === large)).toBe(true);
});

test("a file renamed into a bound path is bound under its former name too", async () => {
	const answer = await footprint("feature", undefined, "renames");
	expect(answer.unboundFiles).toEqual([{ repo: SHOP, path: "notes/todo.md", commits: [notes] }]);
});

test("a change that the range undoes, or that a merge brings in again from a lower layer, changes no part", async () => {
	const answer = await footprint("lower", "Plan", "upper");
	if (answer.proposal === null) throw new Error("a proposal was named");
	expect(answer.repositories).toContainEqual(
		expect.objectContaining({ status: "read", repo: SHOP, commits: 4 }),
	);
	expect(ids(answer.namedAndChanged)).toEqual([]);
	expect(ids(answer.changedNotNamed)).toEqual(["pE"]);
	expect(ids(answer.namedNotChanged)).toEqual(expect.arrayContaining(["pB", "pL"]));
	const [events] = answer.changedNotNamed;
	expect(events && subjectsOf(answer, events)).toEqual(["upper: change events"]);
	expect(answer.commits.map((one) => one.subject)).toEqual(["upper: change events"]);
	expect(answer.unboundFiles).toEqual([]);
});

test("a large commit is kept and marked", async () => {
	const answer = await footprint("main");
	expect(answer.commits.filter((one) => one.large).map((one) => [one.subject, one.files])).toEqual([
		["a large commit", 31],
	]);
});

test("a proposal splits the parts into named and changed, changed but not named, and named but not changed", async () => {
	const answer = await footprint("main", "Plan");
	if (answer.proposal === null) throw new Error("a proposal was named");
	expect(answer.proposal.name).toBe("Plan");
	expect(ids(answer.namedAndChanged)).toEqual(["pA", "pD", "pC", "pR"]);
	expect(ids(answer.changedNotNamed)).toEqual(["pE", "pY"]);
	expect(ids(answer.namedNotChanged)).toEqual(["pB", "pL"]);
	expect(answer.changedNotNamed.every((part) => part.named.length === 0)).toBe(true);
	// Payments is bound to the directory that holds the file of Refunds, so it changes with it.
	const held = [...answer.namedAndChanged, ...answer.changedNotNamed, ...answer.namedNotChanged];
	expect(
		held.filter((part) => part.holds.length > 0).map((part) => [part.subject.id, part.holds]),
	).toEqual([["pD", ["pY"]]]);
});

test("the answer says why the proposal names each part, the far end of a new relationship or step included", async () => {
	const answer = await footprint("main", "Plan");
	if (answer.proposal === null) throw new Error("a proposal was named");
	const reasons = Object.fromEntries(
		[...answer.namedAndChanged, ...answer.namedNotChanged].map((part) => [
			part.subject.id,
			part.named,
		]),
	);
	expect(reasons["pC"]).toEqual([{ by: "part", status: "added" }]);
	expect(reasons["pR"]).toEqual([{ by: "part", status: "removed" }]);
	const step = {
		by: "step",
		status: "added",
		step: "sP",
		flow: "fP",
		from: { id: "pB", name: "Billing" },
		to: { id: "pL", name: "Ledger" },
	} as const;
	expect(reasons["pL"]).toEqual([{ by: "part", status: "changed" }, step]);
	expect(reasons["pB"]).toEqual([step]);
	for (const end of ["pA", "pD"]) {
		expect(reasons[end]).toEqual([
			{
				by: "relationship",
				status: "added",
				relationship: "eAD",
				from: { id: "pA", name: "Checkout" },
				to: { id: "pD", name: "Payments" },
			},
		]);
	}
});

test("a part the lens skipped is in none of the three lists and says why, with the reasons its proposal names it", async () => {
	const answer = await footprint("main", "Plan");
	if (answer.proposal === null) throw new Error("a proposal was named");
	const listed = new Set(
		[answer.namedAndChanged, answer.changedNotNamed, answer.namedNotChanged].flatMap(ids),
	);
	const skipped = Object.fromEntries(answer.skipped.map((skip) => [skip.subject.id, skip]));
	expect(Object.keys(skipped).toSorted()).toEqual(["pO", "pS", "pU", "pX"]);
	expect(Object.keys(skipped).filter((id) => listed.has(id))).toEqual([]);
	expect(skipped["pU"]?.reason).toBe("unbound");
	expect(skipped["pX"]?.reason).toBe("drill-down");
	expect(skipped["pS"]).toMatchObject({
		reason: "repository-unregistered",
		named: [{ by: "part", status: "changed" }],
	});
	expect(skipped["pO"]).toMatchObject({ reason: "base-unresolved", repo: OTHER, named: [] });
});

test("a checkout where the ref does not resolve is named in the answer and not read", async () => {
	const answer = await footprint("main");
	expect(answer.repositories.find((one) => one.repo === OTHER)).toMatchObject({
		status: "unread",
		reason: "base-unresolved",
	});
	expect((await footprint("a-ref-nobody-has")).repositories.map((one) => one.status)).toEqual([
		"unread",
		"unread",
	]);
});

test("a ref that looks like an option is a ref and never an option", async () => {
	const target = join(scratch, "written-by-an-option");
	const answer = await footprint(`--output=${target}`);
	expect(answer.repositories.every((one) => one.status === "unread")).toBe(true);
	expect(existsSync(target)).toBe(false);
});

test("--head reads a branch that is not checked out, and the checkout stays where it was", async () => {
	const answer = await footprint("feature", undefined, "stack-two");
	if (answer.proposal !== null) throw new Error("no proposal was named");
	expect(answer.head).toBe("stack-two");
	expect(ids(answer.changed)).toEqual(["pL"]);
	expect(answer.repositories.find((one) => one.repo === SHOP)).toMatchObject({
		status: "read",
		commits: 1,
	});
	expect(git(shop, "rev-parse", "--abbrev-ref", "HEAD")).toBe("feature");
	expect((await footprint("feature")).repositories.find((one) => one.repo === SHOP)).toMatchObject({
		status: "read",
		commits: 0,
	});
});

test("--head resolves a branch only origin holds, as the code check does", async () => {
	const answer = await footprint("feature", undefined, "remote-only");
	if (answer.proposal !== null) throw new Error("no proposal was named");
	expect(ids(answer.changed)).toEqual(["pL"]);
});

test("a --head no checkout resolves is unread in each, and no part is reported unchanged", async () => {
	const answer = await footprint("main", "Plan", "a-branch-nobody-has");
	if (answer.proposal === null) throw new Error("a proposal was named");
	expect(answer.repositories.every((one) => one.status === "unread")).toBe(true);
	expect(
		answer.repositories.every((one) => one.status === "unread" && one.reason === "head-unresolved"),
	).toBe(true);
	expect(
		[answer.namedAndChanged, answer.changedNotNamed, answer.namedNotChanged].flatMap(ids),
	).toEqual([]);
	expect(answer.skipped.filter((skip) => skip.reason === "head-unresolved").length).toBeGreaterThan(
		0,
	);
});

test("a --head that looks like an option is a ref and never an option", async () => {
	const target = join(scratch, "written-by-a-head");
	const answer = await footprint("main", undefined, `--output=${target}`);
	expect(answer.repositories.every((one) => one.status === "unread")).toBe(true);
	expect(existsSync(target)).toBe(false);
});

/**
 * Read the footprint of a proposal against a variant of the test's choosing.
 * @param proposal The proposal's name.
 * @param variantName The variant it is read against, or none for nothing.
 * @returns The answer, which names a proposal.
 */
async function readAgainst(proposal: string, variantName?: string) {
	const value = document();
	const answer = FootprintAnswerSchema.parse(
		await lens.readVariantFootprint({
			vault: scratch,
			document: value,
			against: variantName === undefined ? undefined : resolveVariant(value, variantName),
			proposal: resolveVariant(value, proposal),
			base: "main",
		}),
	);
	if (answer.proposal === null) throw new Error("a proposal was named");
	return answer;
}

test("the variant a proposal is read against decides which parts it names", async () => {
	const swapped = await readAgainst("Built", "Plan");
	expect(swapped.against).toMatchObject({ name: "Plan" });
	const reasons = Object.fromEntries(
		[...swapped.namedAndChanged, ...swapped.namedNotChanged].map((part) => [
			part.subject.id,
			part.named,
		]),
	);
	// Read against Plan, Built is the proposal that adds Legacy and removes Cache.
	expect(reasons["pR"]).toEqual([{ by: "part", status: "added" }]);
	expect(reasons["pC"]).toEqual([{ by: "part", status: "removed" }]);
});

test("a proposal read against nothing names every part it holds", async () => {
	const answer = await readAgainst("Plan");
	expect(answer.against).toBeNull();
	const proposed = [
		...answer.namedAndChanged,
		...answer.changedNotNamed,
		...answer.namedNotChanged,
	];
	expect(ids(answer.changedNotNamed)).toEqual([]);
	expect(proposed.every((part) => part.named.some((reason) => reason.status === "added"))).toBe(
		true,
	);
	expect(ids(answer.namedAndChanged)).toContain("pA");
});
