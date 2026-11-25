// The footprint of a head reads the vault at that head (TASK-633), through the lens's public
// operation over a canonical vault and repositories this owner builds for itself, with its own
// checkout registry through ARCHBOARD_REPOS so nothing reads the machine's real one.
//
// `shop` holds the vault. Its `plan` branch, which is never checked out, moves the binding of
// `Ledger` from `b.ts` to `c.ts`, changes both files, and holds a proposal that edits `Checkout`.
// `main` is checked out and holds neither. The last case adds `adopted`, which follows `plan` and
// adopts its proposal, as a branch does before it merges. `other` holds `Worker` and a branch that
// `shop` lacks.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as ApiModule from "#runtime/api/history-lens.ts";
import { ArchitectureHistoryResultSchema } from "#shared/protocol/canonical-history.ts";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import { readArchitectureClaims, readArchitectureModel } from "@archboard/model/store-read";
import {
	claimArchitectureSubjects,
	editArchitectureModule,
	releaseArchitectureClaim,
} from "@archboard/model/store-write";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-footprint-head-"));
const shop = join(scratch, "shop");
const other = join(scratch, "other");
const vault = join(shop, ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
const OTHER = "github.com/test/other";
let api: typeof ApiModule;
let proposal = "";
let planCommit = "";

/**
 * Run Git in a test repository.
 * @param cwd The repository.
 * @param args Git's arguments.
 * @returns Git's trimmed output.
 */
function git(cwd: string, ...args: string[]): string {
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
		},
	});
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
	return run.stdout.toString().trim();
}

/**
 * Commit everything in a repository.
 * @param root The repository.
 * @param files Each file to write first, and its text.
 * @param subject The commit's subject.
 */
function commit(root: string, files: Record<string, string>, subject: string): void {
	for (const [file, text] of Object.entries(files)) writeFileSync(join(root, file), text);
	git(root, "add", "-A");
	git(root, "commit", "-q", "--no-gpg-sign", "-m", subject);
}

/**
 * A repository with an identity, as the registry knows it.
 * @param root Where.
 * @param identity The identity its origin gives it.
 */
function repository(root: string, identity: string): void {
	mkdirSync(root, { recursive: true });
	git(root, "init", "-q", "-b", "main");
	git(root, "remote", "add", "origin", `https://${identity}.git`);
	// The public write commits with the process's Git, so the machine's signing must not reach it.
	git(root, "config", "commit.gpgsign", "false");
	git(root, "config", "user.name", "Owner");
	git(root, "config", "user.email", "owner@example.com");
}

/**
 * The text of a module bound to one file of a repository.
 * @param name The module's name.
 * @param repo The repository it binds.
 * @param path The file it binds.
 * @returns The module's file.
 */
function moduleText(name: string, repo: string, path: string): string {
	return JSON.stringify({
		schemaVersion: 1,
		id: `Shop#${name}`,
		name,
		kind: "module",
		order: 0,
		binding: { repo, path },
		outgoing: [],
	});
}

/**
 * Create a proposal that edits `Checkout` through the public write.
 * @returns The proposal's identity.
 */
async function createProposal(): Promise<string> {
	const model = readArchitectureModel(vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	const target = { model: model.manifest.id, state: "Current" };
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "planning on a branch",
		subjects: [model.manifest.id, "Current", ...model.modules.map((module) => module.id)],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const edit = await editArchitectureModule(vault, {
		target,
		writer: "agent",
		doing: "planning on a branch",
		claim: claim.claim.id,
		operationId: crypto.randomUUID(),
		expectedRevision: model.revision,
		proposal: { type: "create", name: "Plan" },
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Checkout",
				set: { description: "Planned on a branch." },
			},
		],
	});
	if (!edit.success || edit.target.state === null) throw new Error(JSON.stringify(edit));
	return edit.target.state;
}

/**
 * Adopt a proposal through the public write, as a branch does before it merges.
 * @param state The proposal.
 */
async function adopt(state: string): Promise<void> {
	const model = readArchitectureModel(vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	// The planning write keeps its claim, so this write releases it first.
	const claims = readArchitectureClaims(vault);
	if (!claims.success) throw new Error(JSON.stringify(claims));
	for (const held of claims.claims)
		await releaseArchitectureClaim(vault, { claim: held.id, writer: held.writer });
	const target = { model: model.manifest.id, state };
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "adopting on a branch",
		subjects: [model.manifest.id, "Current", state, ...model.modules.map((module) => module.id)],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const adopted = await editArchitectureModule(vault, {
		target,
		writer: "agent",
		doing: "adopting on a branch",
		claim: claim.claim.id,
		operationId: crypto.randomUUID(),
		expectedRevision: model.revision,
		proposal: { type: "adopt", reason: "The branch built the plan." },
		changes: [],
	});
	if (!adopted.success) throw new Error(JSON.stringify(adopted));
}

/**
 * A footprint of `main` up to a head, as the browser parses it.
 * @param input The state, head and `modelAt`.
 * @returns The parsed answer, which may be a refusal.
 */
async function footprint(input: { state?: string; head?: string; modelAt?: "head" | "checkout" }) {
	return ArchitectureHistoryResultSchema.parse(
		await api.readArchitectureHistory(vault, { analysis: "footprint", base: "main", ...input }),
	);
}

const names = (parts: readonly { subject: { name: string } }[]) =>
	parts.map((part) => part.subject.name);

/**
 * A successful footprint's modules, by name.
 * @param answer The parsed answer.
 * @returns The names in each list.
 */
function listed(answer: Awaited<ReturnType<typeof footprint>>) {
	if (!answer.success || answer.analysis !== "footprint") throw new Error(JSON.stringify(answer));
	return "changed" in answer
		? { changed: names(answer.changed) }
		: {
				namedAndChanged: names(answer.namedAndChanged),
				changedNotNamed: names(answer.changedNotNamed),
			};
}

beforeAll(async () => {
	repository(shop, SHOP);
	repository(other, OTHER);
	writeFileSync(
		process.env["ARCHBOARD_REPOS"] ?? "",
		JSON.stringify(
			[
				[SHOP, shop],
				[OTHER, other],
			].map(([repo, root]) => ({
				repo,
				root,
				source: "declared",
				addedAt: "2026-10-06T00:00:00.000Z",
			})),
		),
	);
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(defaultSemanticPolicy()));
	writeFileSync(
		join(vault, "model.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop",
			name: "Shop",
			current: { id: "Current", name: "Built" },
		}),
	);
	writeFileSync(join(vault, "checkout.module.json"), moduleText("Checkout", SHOP, "a.ts"));
	writeFileSync(join(vault, "ledger.module.json"), moduleText("Ledger", SHOP, "b.ts"));
	writeFileSync(join(vault, "worker.module.json"), moduleText("Worker", OTHER, "w.ts"));
	commit(shop, { "a.ts": "1\n", "b.ts": "1\n", "c.ts": "1\n" }, "first");
	commit(other, { "w.ts": "1\n" }, "first");
	git(other, "checkout", "-q", "-b", "code-only");
	commit(other, { "w.ts": "2\n" }, "change the worker");
	git(other, "checkout", "-q", "main");

	git(shop, "checkout", "-q", "-b", "plan");
	writeFileSync(join(vault, "ledger.module.json"), moduleText("Ledger", SHOP, "c.ts"));
	commit(shop, { "a.ts": "2\n", "c.ts": "2\n" }, "move the ledger, change both");
	proposal = await createProposal();
	commit(shop, {}, "plan the checkout");
	planCommit = git(shop, "rev-parse", "plan");
	git(shop, "checkout", "-q", "main");
	api = await import("#runtime/api/history-lens.ts");
}, 60_000);

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

test("a head that the vault's repository holds is read with its own proposal and bindings, and the answer names it", async () => {
	const before = {
		head: git(shop, "rev-parse", "HEAD"),
		index: readFileSync(join(shop, ".git/index")),
		status: git(shop, "status", "--porcelain=v1", "--untracked-files=all"),
	};
	const answer = await footprint({ state: proposal, head: "plan" });
	expect(answer).toMatchObject({
		vaultRead: { at: "ref", ref: "plan", commit: planCommit },
		state: { id: proposal },
		head: "plan",
	});
	// The proposal exists only at the head, and `Ledger` is bound to `c.ts` only there.
	expect(listed(answer)).toEqual({
		namedAndChanged: ["Checkout"],
		changedNotNamed: ["Ledger"],
	});
	expect(await footprint({ head: "plan" })).toMatchObject({
		vaultRead: { at: "ref", ref: "plan" },
	});
	expect(git(shop, "rev-parse", "HEAD")).toBe(before.head);
	expect(readFileSync(join(shop, ".git/index"))).toEqual(before.index);
	expect(git(shop, "status", "--porcelain=v1", "--untracked-files=all")).toBe(before.status);
}, 30_000);

test("modelAt checkout reads the vault on disk, which lacks the head's proposal and moved binding", async () => {
	expect(await footprint({ state: proposal, head: "plan", modelAt: "checkout" })).toMatchObject({
		success: false,
		code: "STATE_NOT_FOUND",
	});
	const onDisk = await footprint({ head: "plan", modelAt: "checkout" });
	expect(onDisk).toMatchObject({ vaultRead: { at: "checkout" } });
	expect(listed(onDisk)).toEqual({ changed: ["Checkout"] });
	expect(listed(await footprint({ head: "plan", modelAt: "head" }))).toEqual({
		changed: ["Checkout", "Ledger"],
	});
});

test("a head that only a code repository holds keeps the vault on disk", async () => {
	const answer = await footprint({ head: "code-only" });
	expect(answer).toMatchObject({ vaultRead: { at: "checkout" } });
	if (!answer.success || answer.analysis !== "footprint") throw new Error(JSON.stringify(answer));
	expect(answer.repositories).toMatchObject([
		{ status: "unread", repo: SHOP, reason: "head-unresolved" },
		{ status: "read", repo: OTHER },
	]);
	expect(listed(answer)).toEqual({ changed: ["Worker"] });
});

test("a footprint without a head reads the vault on disk whatever modelAt says", async () => {
	const none = await footprint({});
	const checkout = await footprint({ modelAt: "checkout" });
	expect(none).toMatchObject({ vaultRead: { at: "checkout" } });
	expect(checkout).toEqual(none);
	expect(await footprint({ modelAt: "head" })).toEqual(none);
});

test("a branch footprint can compare its proposal with a retained checkpoint", async () => {
	const model = await readArchitectureModel(vault, undefined, undefined, {
		ref: "plan",
		state: proposal,
	});
	if (!model.success || model.selectedState?.baseline === undefined)
		throw new Error(JSON.stringify(model));
	const answer = await api.readArchitectureHistory(vault, {
		analysis: "footprint",
		base: "main",
		head: "plan",
		state: proposal,
		against: model.selectedState.baseline,
	});
	expect(answer).toMatchObject({
		success: true,
		vaultRead: { at: "ref", ref: "plan", commit: planCommit },
		state: { id: proposal },
	});
});

// The adoption reaches the retained history that every reading shares, so this case runs last.
test("a proposal that the head adopted is the plan, set against the merge base's current state", async () => {
	git(shop, "checkout", "-q", "-b", "adopted", "plan");
	await adopt(proposal);
	commit(shop, {}, "adopt the plan");
	git(shop, "checkout", "-q", "main");
	const answer = await footprint({ head: "adopted" });
	expect(answer).toMatchObject({
		vaultRead: { at: "ref", ref: "adopted" },
		state: { id: proposal, lifecycle: "current" },
		against: { id: "Current" },
		proposal: { id: proposal },
	});
	// The branch moved the binding of `Ledger` in its model, so the plan names it too.
	expect(listed(answer)).toEqual({ namedAndChanged: ["Checkout", "Ledger"], changedNotNamed: [] });
	// A head that adopted nothing keeps the current state of the merge base, which has no plan.
	expect(listed(await footprint({ head: "plan" }))).toEqual({ changed: ["Checkout", "Ledger"] });
}, 30_000);
