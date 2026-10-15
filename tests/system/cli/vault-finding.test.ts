// How a command finds its vault, as the shipped bin does it (ADR 0049,
// TASK-472.06): from the working directory or -C, at the checkout root inside a
// git checkout and at the nearest enclosing vault outside one, or the vault a
// set ARCHBOARD_VAULT names. Every answer names the vault and how it was found,
// and the first command in a checkout or untracked vault the registry does not
// know registers it. The commands run with ARCHBOARD_VAULT unset against an
// owned server, with a registry, home and state directory of their own.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { z } from "zod";
import { availablePort, portIsReusable } from "../process-contracts/support/process-http.ts";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { packageBin } from "./support/package-cli.ts";
import { createRepositoryFixture, type RepositoryFixture } from "./support/repository-fixture.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const SHOP = "github.com/acme/shop";
const AnswerSchema = z.object({
	vault: z.object({
		path: z.string(),
		origin: z.string(),
		registered: z.record(z.string(), z.unknown()).optional(),
	}),
});
let fixture: RepositoryFixture;
let server: OwnedServer;
let shop = "";
let plans = "";
let billing = "";

/**
 * Make a directory with a vault in it.
 * @param holder The directory.
 * @returns The directory, as its real path.
 */
function holdingVault(holder: string): string {
	mkdirSync(join(holder, ".archboard", "vault"), { recursive: true });
	return realpathSync.native(holder);
}

/**
 * Run the shipped bin with ARCHBOARD_VAULT unset, against the owned server.
 * @param args The command line.
 * @param cwd Where it runs.
 * @param env What this invocation's environment changes.
 * @returns How it exited and what it printed.
 */
function archboard(
	args: readonly string[],
	cwd: string,
	env: Readonly<Record<string, string | undefined>> = {},
) {
	const result = spawnSync(packageBin, [...args], {
		cwd,
		encoding: "utf8",
		env: {
			...fixture.serverEnvironment,
			ARCHBOARD_VAULT: undefined,
			ARCHBOARD_URL: server.base,
			...env,
		},
	});
	const failure = `${args.join(" ")} in ${cwd}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
	return { status: result.status, stdout: result.stdout, stderr: result.stderr, failure };
}

/**
 * List the boards and read the vault the answer names.
 * @param cwd Where the command runs.
 * @param args What else the command line holds.
 * @param env What this invocation's environment changes.
 * @returns The answer's vault and what the command wrote to stderr.
 */
function listed(
	cwd: string,
	args: readonly string[] = [],
	env: Readonly<Record<string, string | undefined>> = {},
) {
	const result = archboard(["semantic", ...args], cwd, env);
	expect(result.status, result.failure).toBe(0);
	return { vault: AnswerSchema.parse(JSON.parse(result.stdout)).vault, stderr: result.stderr };
}

/**
 * The roots the registry knows, checkouts and untracked vaults together.
 * @returns The roots.
 */
function registeredRoots(): string[] {
	const result = archboard(["repo", "list"], fixture.nowhere);
	const answer = z
		.object({
			repos: z.array(z.object({ root: z.string() })),
			vaults: z.array(z.object({ root: z.string() })),
		})
		.parse(JSON.parse(result.stdout));
	return [...answer.repos, ...answer.vaults].map((entry) => entry.root);
}

beforeAll(async () => {
	fixture = createRepositoryFixture();
	shop = fixture.repository("shop", `https://${SHOP}.git`);
	holdingVault(shop);
	plans = holdingVault(join(fixture.root, "plans"));
	mkdirSync(join(plans, "q3"), { recursive: true });
	// A checkout inside a directory that holds a vault, with no vault of its own.
	billing = fixture.repository(join("plans", "billing"), "https://github.com/acme/billing.git");
	server = await startOwnedServer({
		serverPath: join(repoRoot, "src/server.ts"),
		vault: fixture.vault,
		env: fixture.serverEnvironment,
	});
});

afterAll(async () => {
	await server?.dispose();
	fixture?.dispose();
});

test("inside a checkout the vault is the one at its root, and the first command registers the checkout", () => {
	const first = listed(join(shop, "src"));
	expect(first.vault).toEqual({
		path: join(shop, ".archboard", "vault"),
		origin: "working-directory",
		registered: { kind: "checkout", repository: SHOP, root: shop, chosen: true, worktrees: [] },
	});
	expect(first.stderr.trim().split("\n")).toHaveLength(1);
	const second = listed(shop);
	expect(second.vault).toEqual({
		path: join(shop, ".archboard", "vault"),
		origin: "working-directory",
	});
	expect(second.stderr).toBe("");
	expect(registeredRoots()).toContain(shop);
});

test("-C finds the vault from the directory it names, before or after the command name", () => {
	const untracked = listed(fixture.nowhere, ["-C", join(plans, "q3")]);
	expect(untracked.vault).toEqual({
		path: join(plans, ".archboard", "vault"),
		origin: "-C",
		registered: { kind: "untracked", name: "plans", root: plans },
	});
	const leading = archboard(["-C", shop, "semantic"], fixture.nowhere);
	expect(leading.status, leading.failure).toBe(0);
	expect(AnswerSchema.parse(JSON.parse(leading.stdout)).vault).toEqual({
		path: join(shop, ".archboard", "vault"),
		origin: "-C",
	});
});

test("a vault ARCHBOARD_VAULT names is used as it is and never registers", () => {
	const loose = holdingVault(join(fixture.root, "loose"));
	const named = listed(fixture.nowhere, [], {
		ARCHBOARD_VAULT: join(loose, ".archboard", "vault"),
	});
	expect(named.vault).toEqual({ path: join(loose, ".archboard", "vault"), origin: "environment" });
	expect(named.stderr).toBe("");
	expect(registeredRoots()).not.toContain(loose);
});

test("a registry that cannot be written is a warning, and the command still answers", () => {
	const orders = fixture.repository("orders", "https://github.com/acme/orders.git");
	holdingVault(orders);
	const blocker = join(fixture.root, "not-a-directory");
	writeFileSync(blocker, "");
	const answered = listed(orders, [], { ARCHBOARD_REPOS: join(blocker, "repos.json") });
	expect(answered.vault).toEqual({
		path: join(orders, ".archboard", "vault"),
		origin: "working-directory",
	});
	expect(answered.stderr).not.toBe("");
});

test("inside a checkout without a vault a command refuses, and creates and registers nothing", () => {
	const before = existsSync(fixture.registry) ? readFileSync(fixture.registry) : null;
	const refused = archboard(["semantic"], join(billing, "src"));
	expect(refused.status, refused.failure).toBe(2);
	expect(refused.stdout).toBe("");
	expect(existsSync(join(billing, ".archboard"))).toBe(false);
	expect(existsSync(fixture.registry) ? readFileSync(fixture.registry) : null).toEqual(before);
});

test("outside any checkout and any vault a command refuses before it starts a server", async () => {
	const port = await availablePort();
	const refused = archboard(["semantic"], fixture.nowhere, {
		ARCHBOARD_URL: `http://127.0.0.1:${port}`,
		ARCHBOARD_NO_AUTOSTART: undefined,
	});
	expect(refused.status, refused.failure).toBe(2);
	expect(await portIsReusable(port)).toBe(true);
});
