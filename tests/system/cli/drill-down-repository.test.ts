// `archboard check` over a drill-down into another repository (ADR 0049,
// TASK-472.12). A meta project's board opens the board of a product
// repository by its identity. The check follows it to the vault of the
// identity's chosen checkout and reports a link into a repository that this
// machine has no checkout of, and a link to a board that checkout does not
// hold. An owned server, with a registry, home and state directory of its own,
// serves both vaults: every call names the vault it means.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { packageBin } from "./support/package-cli.ts";
import { createRepositoryFixture, type RepositoryFixture } from "./support/repository-fixture.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const PRODUCT = "github.com/acme/product";
let fixture: RepositoryFixture;
let server: OwnedServer;
let metaVault = "";
let productVault = "";

/**
 * Run the archboard command of this package against the owned server.
 * @param vault The vault the command names.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
function cli(vault: string, args: readonly string[], input?: string) {
	return runServerCli({ repoRoot, server, vault, args, input });
}

/**
 * Make a board in a vault.
 * @param vault The vault.
 * @param name The board's name.
 * @param payload The board.
 */
function made(vault: string, name: string, payload: unknown): void {
	const result = cli(
		vault,
		["semantic", "new", name, "--doing", "drawing a drill-down"],
		JSON.stringify(payload),
	);
	expect(result.status, result.stderr).toBe(0);
}

/**
 * The part of a system board that opens a board.
 * @param name The part's name.
 * @param opens The board and, for another repository, its identity.
 * @returns The node.
 */
function opening(name: string, opens: { board: string; repo?: string }) {
	return { name, kind: "service", drillDown: { variant: { kind: "current" }, ...opens } };
}

beforeAll(async () => {
	fixture = createRepositoryFixture();
	const meta = fixture.repository("meta", "github.com/acme/meta");
	const product = fixture.repository("product", PRODUCT);
	metaVault = join(meta, ".archboard", "vault");
	productVault = join(product, ".archboard", "vault");
	mkdirSync(metaVault, { recursive: true });
	mkdirSync(productVault, { recursive: true });
	// Registering the product chooses it. The meta project is read as the vault's own checkout.
	const added = spawnSync(packageBin, ["repo", "add", product], {
		cwd: fixture.nowhere,
		env: fixture.serverEnvironment,
		encoding: "utf8",
	});
	if (added.status !== 0) throw new Error(`repo add ${product}: ${added.stderr}`);
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault: metaVault,
		env: fixture.serverEnvironment,
	});
});

afterAll(async () => {
	await server?.dispose();
	fixture?.dispose();
});

/**
 * The drill-down diagnostics the check reports for one vault.
 * @param vault The vault.
 * @returns The exit status and the code and part of each drill-down diagnostic.
 */
function drillFindings(vault: string) {
	const checked = cli(vault, ["check", "semantics"]);
	const { semantics: answer } = JSON.parse(checked.stdout) as {
		semantics: { diagnostics: { code: string; subject?: { name: string } }[] };
	};
	return {
		status: checked.status,
		findings: answer.diagnostics
			.filter((one) => one.code.startsWith("DRILL_DOWN_"))
			.map((one) => `${one.code} ${one.subject?.name}`)
			.toSorted(),
	};
}

test("check follows a drill-down into the chosen checkout's vault and reports what it cannot reach", () => {
	made(productVault, "Payments", { level: "service", nodes: [{ name: "Ledger", kind: "module" }] });
	made(metaVault, "Platform", {
		level: "system",
		nodes: [
			{ name: "Caller", kind: "app" },
			opening("Good", { board: "payments", repo: PRODUCT }),
			opening("No such board", { board: "Refunds", repo: PRODUCT }),
			opening("No such checkout", { board: "Payments", repo: "github.com/acme/unregistered" }),
			// Without a repository the board is looked for in this vault, which has no Payments.
			opening("Stays here", { board: "Payments" }),
		],
		edges: ["Good", "No such board", "No such checkout", "Stays here"].map((to) => ({
			from: "Caller",
			to,
			kind: "http",
		})),
	});
	expect(drillFindings(metaVault)).toEqual({
		status: 1,
		findings: [
			"DRILL_DOWN_UNKNOWN_BOARD No such board",
			"DRILL_DOWN_UNKNOWN_BOARD Stays here",
			"DRILL_DOWN_UNKNOWN_REPOSITORY No such checkout",
		],
	});
}, 120_000);
