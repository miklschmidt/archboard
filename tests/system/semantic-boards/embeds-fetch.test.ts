import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	readRenderRecipe,
	replaceRenderRecipe,
	type RenderRecipe,
} from "@archboard/renderer/recipe";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { ensureSemanticVaultConfiguration } from "../support/semantic-vault.ts";
import { vaultIn } from "../support/test-vault.ts";
import { TEST_WALL_CLOCK_BUDGET_MS } from "../support/timing.ts";

// `archboard check embeds` reads the vault of a repository that this machine
// has no checkout of from the default branch of its remote (ADR 0057,
// TASK-526.05). The remote is a local bare repository: Git's own
// `url.<base>.insteadOf`, set for the command alone, turns the HTTPS address of
// `github.com/example/models` into it, as a person's rule turns it into SSH.
// The server never sees the rule. The models checkout is registered only in a
// registry of its own, so the docs checkout knows no checkout of it.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-embeds-fetch-")));
const docs = path.join(root, "docs");
const models = path.join(root, "models");
const remote = path.join(root, "remotes", "example", "models");
const state = path.join(root, "state");
const modelsRegistry = { ARCHBOARD_REPOS: path.join(root, "models-repos.json") };
const MODELS = "github.com/example/models";
let server: OwnedServer;

/** A Git command in a repository, committing as a test author. */
function git(repository: string, ...args: string[]): string {
	const run = spawnSync(
		"git",
		["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
		{ cwd: repository, encoding: "utf8" },
	);
	if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
	return run.stdout.trim();
}

/** A command in a repository, against the server, that must exit as expected. */
function cli(
	repository: string,
	args: readonly string[],
	options: { input?: string; env?: Record<string, string>; status?: number } = {},
) {
	const run = runServerCli({
		repoRoot,
		server,
		vault: path.join(repository, ".archboard", "vault"),
		args,
		input: options.input,
		env: options.env,
	});
	expect(run.status, `${args.join(" ")}: ${run.stderr}`).toBe(options.status ?? 0);
	return run;
}

/** Change the store's responsibility on the models board, commit it and push it to the remote. */
function publishEdit(responsibility: string): string {
	const board = JSON.parse(
		cli(models, ["semantic", "show", "orders"], { env: modelsRegistry }).stdout,
	).board as {
		version: number;
		current: string;
		variants: { id: string; content: { nodes: { name: string }[] } }[];
	};
	const current = board.variants.find((variant) => variant.id === board.current);
	const store = current?.content.nodes.find((node) => node.name === "Order store");
	cli(
		models,
		[
			"semantic",
			"edit",
			"orders",
			"--expect-version",
			String(board.version),
			"--doing",
			"changing what an embed shows",
		],
		{ input: JSON.stringify({ nodes: [{ ...store, responsibility }] }), env: modelsRegistry },
	);
	return publish("change the orders board");
}

/** Commit the models checkout and push it to the remote's default branch. */
function publish(message: string): string {
	git(models, "add", ".");
	git(models, "commit", "-qm", message);
	git(models, "push", "-q", remote, "main");
	return git(models, "rev-parse", "HEAD");
}

/** The environment of a check whose remotes are below a base address: the local bare repositories, or none at all. */
function reaching(remotes: string, stateHome = state): Record<string, string> {
	return {
		XDG_STATE_HOME: stateHome,
		GIT_CONFIG_COUNT: "1",
		GIT_CONFIG_KEY_0: `url.${remotes}/.insteadOf`,
		GIT_CONFIG_VALUE_0: "https://github.com/",
	};
}
const online = reaching(`file://${path.join(root, "remotes")}`);
const offline = reaching(`file://${path.join(root, "unreachable")}`);

/** What a test reads of the embeds part. */
interface EmbedsPart {
	vaults: { source: string; repo: string; commit?: string; severity?: string; code?: string }[];
	findings: {
		severity: string;
		code: string;
		file: string;
		vaultRepo?: string | null;
		missing?: string;
		removedIn?: unknown;
	}[];
}

/** Run the embeds check in the docs repository. */
function checkEmbeds(env: Record<string, string>, status: number, args: string[] = []) {
	const run = cli(docs, ["check", "embeds", ...args], { env, status });
	return { part: JSON.parse(run.stdout).embeds as EmbedsPart, stderr: run.stderr };
}

/** The cached checkout of a commit of the models repository. */
const cached = (commit: string, stateHome = state) =>
	path.join(stateHome, "archboard", "fetched-vaults", MODELS, commit);

let first = "";

beforeAll(async () => {
	vaultIn(docs);
	ensureSemanticVaultConfiguration(vaultIn(models));
	git(root, "init", "-q", "--bare", "-b", "main", remote);
	// As a hosted remote does, so the fetch can leave out the blobs outside the vault.
	git(remote, "config", "uploadpack.allowFilter", "true");
	for (const [repository, origin] of [
		[docs, "https://github.com/example/docs.git"],
		[models, `https://${MODELS}.git`],
	] as const) {
		git(repository, "init", "-q", "-b", "main");
		git(repository, "remote", "add", "origin", origin);
	}
	server = await startOwnedServer({
		serverPath: path.join(repoRoot, "apps/server/src/server.ts"),
		vault: path.join(docs, ".archboard", "vault"),
		env: { ARCHBOARD_REPOS: path.join(root, "repos.json") },
	});
	cli(models, ["semantic", "new", "orders", "--doing", "drawing a board to embed"], {
		env: modelsRegistry,
		input: JSON.stringify({
			level: "system",
			nodes: [
				{ name: "Order intake", kind: "service", responsibility: "Takes every order" },
				{ name: "Order store", kind: "datastore", responsibility: "Keeps every order" },
			],
			edges: [{ from: "Order intake", to: "Order store", kind: "data", label: "write" }],
		}),
	});
	fs.writeFileSync(path.join(models, "README.md"), "Outside the vault, so never fetched.\n");
	fs.symlinkSync(os.tmpdir(), path.join(models, ".archboard", "vault", "outside"));
	first = publish("draw the orders board");
	fs.mkdirSync(path.join(docs, "docs"));
	cli(models, ["semantic", "render", "orders", "--out", path.join(docs, "docs", "orders.svg")], {
		env: modelsRegistry,
	});
	git(docs, "add", ".");
	git(docs, "commit", "-qm", "embed the orders board");
}, TEST_WALL_CLOCK_BUDGET_MS);

afterAll(async () => {
	await server?.dispose();
	fs.rmSync(root, { recursive: true, force: true });
});

describe("check embeds with a vault of an unregistered repository", () => {
	test(
		"fetches the vault of the default branch shallow and sparse, caches it by commit, and draws the embed from it",
		() => {
			const { part, stderr } = checkEmbeds(online, 0);
			expect(part.vaults).toEqual([{ source: "fetched", repo: MODELS, commit: first }]);
			expect(part.findings).toEqual([]);
			expect(stderr).toContain(MODELS);
			expect(stderr).toContain(first.slice(0, 9));
			const checkout = cached(first);
			expect(
				fs.existsSync(path.join(checkout, ".archboard", "vault", "orders.semantic.json")),
			).toBe(true);
			expect(fs.existsSync(path.join(checkout, "README.md"))).toBe(false);
			// A link the remote commits leads nowhere out of the cache.
			expect(fs.lstatSync(path.join(checkout, ".archboard", "vault", "outside")).isFile()).toBe(
				true,
			);
			expect(git(checkout, "rev-parse", "--is-shallow-repository")).toBe("true");
			// The README's blob was never downloaded: Git lists it as missing.
			const readme = git(models, "rev-parse", `${first}:README.md`);
			expect(git(checkout, "rev-list", "--objects", "--missing=print", "HEAD")).toContain(
				`?${readme}`,
			);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"reads the cached commit again, without a fetch, while the default branch has not moved",
		() => {
			const trace = path.join(root, "trace.log");
			const board = path.join(cached(first), ".archboard", "vault", "orders.semantic.json");
			const kept = fs.readFileSync(board, "utf8");
			// The cache is what is read: a change to it shows in the check.
			fs.writeFileSync(board, kept.replace("Keeps every order", "Keeps the cached orders"));
			try {
				const { part } = checkEmbeds({ ...online, GIT_TRACE: trace }, 1);
				expect(part.findings.map((one) => one.code)).toEqual(["EMBED_OUTDATED"]);
				expect(part.vaults).toEqual([{ source: "fetched", repo: MODELS, commit: first }]);
				const commands = fs.readFileSync(trace, "utf8");
				expect(commands).toContain("ls-remote");
				expect(commands).not.toContain("clone");
			} finally {
				fs.writeFileSync(board, kept);
			}
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"fetches the commit the default branch moved to, and keeps only it and running fetches in the cache",
		() => {
			const moved = publishEdit("Keeps every order for a year");
			// What a killed check left, and what a running one is writing.
			const left = path.join(path.dirname(cached(first)), ".incoming-killed");
			const running = path.join(path.dirname(cached(first)), ".incoming-running");
			fs.mkdirSync(left);
			fs.mkdirSync(running);
			fs.utimesSync(left, new Date(0), new Date(0));
			const { part } = checkEmbeds(online, 1);
			expect(part.vaults).toEqual([{ source: "fetched", repo: MODELS, commit: moved }]);
			expect(part.findings.map((one) => [one.file, one.code])).toEqual([
				["docs/orders.svg", "EMBED_OUTDATED"],
			]);
			expect(fs.existsSync(cached(moved))).toBe(true);
			expect(fs.existsSync(cached(first))).toBe(false);
			expect([fs.existsSync(left), fs.existsSync(running)]).toEqual([false, true]);
			fs.rmSync(running, { recursive: true });
			checkEmbeds(online, 0, ["--fix"]);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"offline with a cached copy reads the newest cached commit and says so as information",
		() => {
			const newest = git(models, "rev-parse", "HEAD");
			const { part, stderr } = checkEmbeds(offline, 0);
			expect(part.vaults).toEqual([
				expect.objectContaining({
					source: "cache",
					repo: MODELS,
					commit: newest,
					severity: "information",
					code: "EMBED_VAULT_CACHED",
				}),
			]);
			expect(part.findings).toEqual([]);
			expect(stderr).toContain("EMBED_VAULT_CACHED");
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"offline with no cached copy is a warning that names the repository",
		() => {
			const empty = path.join(root, "empty-state");
			const { part } = checkEmbeds(reaching(`file://${path.join(root, "unreachable")}`, empty), 1);
			expect(part.vaults).toEqual([]);
			expect(part.findings).toEqual([
				expect.objectContaining({
					severity: "warning",
					code: "EMBED_VAULT_FETCH_FAILED",
					file: "docs/orders.svg",
					vaultRepo: MODELS,
				}),
			]);
			expect(fs.existsSync(path.join(empty, "archboard", "fetched-vaults", MODELS))).toBe(true);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"a board gone from a fetched vault is missing, and the shallow history names no removing commit",
		() => {
			fs.rmSync(path.join(models, ".archboard", "vault", "orders.semantic.json"));
			publish("remove the orders board");
			const { part } = checkEmbeds(online, 1);
			expect(part.findings).toEqual([
				expect.objectContaining({ code: "EMBED_SOURCE_MISSING", missing: "board" }),
			]);
			expect(part.findings[0]?.removedIn).toBeUndefined();
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"a vault the server refuses is information about its embed, and the check goes on",
		() => {
			// A registered checkout whose .archboard/vault is a file: the server refuses to read it.
			const linked = path.join(root, "linked");
			fs.mkdirSync(path.join(linked, ".archboard"), { recursive: true });
			git(linked, "init", "-q", "-b", "main");
			git(linked, "remote", "add", "origin", "https://github.com/example/linked.git");
			cli(docs, ["repo", "add", linked]);
			fs.writeFileSync(path.join(linked, ".archboard", "vault"), "not a directory\n");
			const bytes = fs.readFileSync(path.join(docs, "docs", "orders.svg"));
			const read = readRenderRecipe(bytes);
			if (read.kind !== "recipe") throw new Error("orders.svg carries no recipe");
			const recipe: RenderRecipe = { ...read.recipe, vault: { repo: "github.com/example/linked" } };
			fs.writeFileSync(path.join(docs, "docs", "linked.svg"), replaceRenderRecipe(bytes, recipe));
			git(docs, "add", "docs/linked.svg");
			const { part } = checkEmbeds(online, 1);
			expect(Object.fromEntries(part.findings.map((one) => [one.file, one.code]))).toEqual({
				"docs/linked.svg": "EMBED_VAULT_UNAVAILABLE",
				"docs/orders.svg": "EMBED_SOURCE_MISSING",
			});
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"a cancelled check ends its Git and the helpers that hold the remote's connection",
		async () => {
			const opened = Promise.withResolvers<void>();
			const closed = Promise.withResolvers<void>();
			// A remote that takes the connection and never answers.
			const silent = Bun.listen({
				hostname: "127.0.0.1",
				port: 0,
				socket: { data() {}, open: () => opened.resolve(), close: () => closed.resolve() },
			});
			try {
				const check = Bun.spawn([path.join(repoRoot, "bin", "archboard"), "check", "embeds"], {
					cwd: docs,
					stdin: "ignore",
					stdout: "ignore",
					stderr: "ignore",
					env: {
						...process.env,
						ARCHBOARD_REPOS: server.registry,
						ARCHBOARD_URL: server.base,
						ARCHBOARD_NO_AUTOSTART: "1",
						...reaching(`http://127.0.0.1:${silent.port}`, path.join(root, "silent-state")),
					},
				});
				await opened.promise;
				check.kill("SIGINT");
				await closed.promise;
				await check.exited;
			} finally {
				silent.stop(true);
			}
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);
});
