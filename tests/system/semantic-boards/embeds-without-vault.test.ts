import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { ensureSemanticVaultConfiguration } from "../support/semantic-vault.ts";
import { vaultIn } from "../support/test-vault.ts";
import { TEST_WALL_CLOCK_BUDGET_MS } from "../support/timing.ts";

// A documentation repository that holds no vault embeds a board of a
// registered repository's vault (ADR 0057). `archboard check` there runs the
// embeds check alone: it says that the semantics and code checks did not run
// and why, reports the embed that a board edit made outdated, and `--fix`
// draws it again. That the checks that read a vault stay refused there is
// owned by apps/cli/tests/cli/operations/invocation/runs-without-vault.test.ts.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-no-vault-")));
const models = path.join(root, "models");
const docs = path.join(root, "docs");
const embed = path.join(docs, "docs", "orders.svg");
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

/** A command in a directory, against the server, that must exit as expected. */
function cli(
	directory: string,
	args: readonly string[],
	options: { input?: string; status?: number } = {},
) {
	const run = runServerCli({
		repoRoot,
		server,
		vault: path.join(directory, ".archboard", "vault"),
		args,
		input: options.input,
	});
	expect(run.status, `${args.join(" ")}: ${run.stderr}`).toBe(options.status ?? 0);
	return run;
}

/** What a test reads of the answer of `archboard check`. */
interface CheckAnswer {
	vault?: unknown;
	semantics?: unknown;
	code?: unknown;
	skipped?: { checks: string[]; message: string };
	embeds: {
		checkout: string;
		embeds: string[];
		findings: { severity: string; code: string; file: string }[];
		fixed: { action: string; file: string }[];
	};
}

beforeAll(async () => {
	for (const [repository, identity] of [
		[models, "github.com/example/models"],
		[docs, "github.com/example/docs"],
	] as const) {
		fs.mkdirSync(repository, { recursive: true });
		git(repository, "init", "-q", "-b", "main");
		git(repository, "remote", "add", "origin", `https://${identity}.git`);
	}
	ensureSemanticVaultConfiguration(vaultIn(models));
	server = await startOwnedServer({
		serverPath: path.join(repoRoot, "apps/server/src/server.ts"),
		vault: vaultIn(models),
		env: { ARCHBOARD_REPOS: path.join(root, "repos.json") },
	});
	cli(models, ["semantic", "new", "orders", "--doing", "drawing a board to embed"], {
		input: JSON.stringify({
			level: "system",
			nodes: [
				{ name: "Order intake", kind: "service", responsibility: "Takes every order" },
				{ name: "Order store", kind: "datastore", responsibility: "Keeps every order" },
			],
			edges: [{ from: "Order intake", to: "Order store", kind: "data", label: "write" }],
		}),
	});
	fs.mkdirSync(path.dirname(embed), { recursive: true });
	cli(models, ["semantic", "render", "orders", "--out", embed]);
	git(docs, "add", ".");
	git(docs, "commit", "-qm", "embed the orders board");
	const board = JSON.parse(cli(models, ["semantic", "show", "orders"]).stdout).board as {
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
			"changing what the embed shows",
		],
		{ input: JSON.stringify({ nodes: [{ ...store, responsibility: "Keeps orders a year" }] }) },
	);
}, TEST_WALL_CLOCK_BUDGET_MS);

afterAll(async () => {
	await server?.dispose();
	fs.rmSync(root, { recursive: true, force: true });
});

describe("the check in a checkout without a vault", () => {
	test(
		"runs the embeds check alone, says why, reports the outdated embed and --fix draws it again",
		() => {
			const checked = cli(docs, ["check"], { status: 1 });
			const answer = JSON.parse(checked.stdout) as CheckAnswer;
			expect(answer.vault).toBeUndefined();
			expect([answer.semantics, answer.code]).toEqual([undefined, undefined]);
			expect(answer.skipped?.checks).toEqual(["semantics", "code"]);
			expect(checked.stderr).toContain(answer.skipped?.message ?? "no message");
			expect(answer.embeds.checkout).toBe(docs);
			expect(answer.embeds.findings).toEqual([
				expect.objectContaining({
					severity: "warning",
					code: "EMBED_OUTDATED",
					file: "docs/orders.svg",
				}),
			]);
			expect(fs.existsSync(path.join(docs, ".archboard"))).toBe(false);

			const before = fs.readFileSync(embed);
			const fixed = JSON.parse(cli(docs, ["check", "--fix"]).stdout) as CheckAnswer;
			expect(fixed.embeds.fixed).toEqual([
				expect.objectContaining({ action: "drawn", file: "docs/orders.svg" }),
			]);
			expect(fs.readFileSync(embed)).not.toEqual(before);
			cli(docs, ["check", "embeds"]);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);
});
