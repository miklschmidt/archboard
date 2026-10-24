// `check code` against the vault of a linked worktree (ADR 0049,
// TASK-472.03): a binding into the vault's own repository reads the worktree's
// files while the main checkout is the chosen one, and a binding into another
// repository reads that repository's chosen checkout. An owned server, with a
// registry, home and state directory of its own, was started with a vault in no
// checkout, and the command names the worktree's (ADR 0049): what is read is the
// checkout of the vault the call names, not of the one the server started with.

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { ensureSemanticVaultConfiguration } from "../support/semantic-vault.ts";
import { runServerCli } from "../support/run-cli.ts";
import { packageBin } from "./support/package-cli.ts";
import { createRepositoryFixture, type RepositoryFixture } from "./support/repository-fixture.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const ORDERS = "github.com/acme/orders";
const BILLING = "github.com/acme/billing";
let fixture: RepositoryFixture;
let server: OwnedServer;
let vault = "";

/**
 * Add a definition to a checkout's service file, without committing it.
 * @param checkout The checkout.
 * @param name The exported constant.
 */
function define(checkout: string, name: string): void {
	appendFileSync(join(checkout, "src/service.ts"), `export const ${name} = 1;\n`);
}

/**
 * A binding to a definition in a checkout's service file.
 * @param repo The repository identity.
 * @param symbol The exported constant.
 * @returns The binding.
 */
function binding(repo: string, symbol: string) {
	return { repo, path: "src/service.ts", symbol };
}

/**
 * Run the archboard command of this package against the owned server.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
function cli(args: readonly string[], input?: string) {
	return runServerCli({ repoRoot, server, vault, args, input });
}

beforeAll(async () => {
	fixture = createRepositoryFixture();
	const orders = fixture.repository("orders", ORDERS);
	const billing = fixture.repository("billing", BILLING);
	const target = join(fixture.root, "orders-feature");
	execFileSync("git", ["worktree", "add", "-q", "-b", "feature", target], {
		cwd: orders,
		stdio: "ignore",
	});
	const worktree = realpathSync.native(target);
	define(worktree, "inTheWorktree");
	define(orders, "inTheMainCheckout");
	define(billing, "inBilling");
	// Registering the main checkout chooses it. The worktree is known with it, and not chosen.
	for (const checkout of [orders, billing]) {
		const added = spawnSync(packageBin, ["repo", "add", checkout], {
			cwd: fixture.nowhere,
			env: fixture.serverEnvironment,
			encoding: "utf8",
		});
		if (added.status !== 0) throw new Error(`repo add ${checkout}: ${added.stderr}`);
	}
	vault = join(worktree, ".archboard", "vault");
	mkdirSync(vault, { recursive: true });
	ensureSemanticVaultConfiguration(vault);
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault: fixture.vault,
		env: fixture.serverEnvironment,
	});
});

afterAll(async () => {
	await server?.dispose();
	fixture?.dispose();
});

test("check code reads the worktree for its own repository and the chosen checkout for another", () => {
	const made = cli(
		["semantic", "new", "orders", "--doing", "drawing the worktree's bindings"],
		JSON.stringify({
			level: "system",
			nodes: [
				{ name: "Worktree", kind: "service", binding: binding(ORDERS, "inTheWorktree") },
				{ name: "Main", kind: "service", binding: binding(ORDERS, "inTheMainCheckout") },
				{ name: "Billing", kind: "service", binding: binding(BILLING, "inBilling") },
				{ name: "Not billing", kind: "service", binding: binding(BILLING, "inTheWorktree") },
			],
		}),
	);
	expect(made.status, made.stderr).toBe(0);

	const checked = cli(["check", "code"]);
	const answer = JSON.parse(checked.stdout) as {
		code: { findings: { code: string; subject?: { name: string } }[] };
	};
	// The symbol that only the worktree defines is found, and the one that only
	// the chosen main checkout defines is not: the worktree is what is read. In
	// billing, read in its chosen checkout, its own symbol is found and the
	// worktree's is not; a repository that was not read would be skipped instead.
	expect(
		answer.code.findings
			.filter((finding) => finding.code === "BINDING_SYMBOL_MISSING")
			.map((finding) => finding.subject?.name)
			.toSorted(),
	).toEqual(["Main", "Not billing"]);
}, 120_000);
