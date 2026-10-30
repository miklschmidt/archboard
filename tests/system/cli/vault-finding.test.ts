import { seedCanonicalFixture } from "../support/canonical-fixture.ts";
// How a command finds its vault, as the shipped bin does it (ADR 0049,
// TASK-472.06): from the working directory or -C, at the checkout root inside a
// git checkout and at the nearest enclosing vault outside one. Every answer
// names the vault and how it was found, and the first command in a checkout or
// untracked vault the registry does not know registers it. The commands run
// against an owned server, with a registry, home and state directory of their own.

import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
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
	seedCanonicalFixture(join(holder, ".archboard/vault"), holder.split("/").at(-1), []);
	return realpathSync.native(holder);
}

/**
 * Run the shipped bin against the owned server.
 * @param args The command line.
 * @param cwd Where it runs.
 * @param env What this invocation's environment changes.
 * @param input What to put on standard input.
 * @returns How it exited and what it printed.
 */
function archboard(
	args: readonly string[],
	cwd: string,
	env: Readonly<Record<string, string | undefined>> = {},
	input?: string,
) {
	const result = spawnSync(packageBin, [...args], {
		cwd,
		input,
		encoding: "utf8",
		env: {
			...fixture.serverEnvironment,
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
	const result = archboard(["model", "read", ...args], cwd, env);
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
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
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
	const leading = archboard(["-C", shop, "model", "read"], fixture.nowhere);
	expect(leading.status, leading.failure).toBe(0);
	expect(AnswerSchema.parse(JSON.parse(leading.stdout)).vault).toEqual({
		path: join(shop, ".archboard", "vault"),
		origin: "-C",
	});
});

test("the server lists a vault a command registered under the path and name that command answered", async () => {
	// Reached through a symbolic link, by a relative -C with a trailing slash.
	const holder = holdingVault(join(fixture.root, "linked-target"));
	symlinkSync(holder, join(fixture.root, "linked"));
	const { vault } = listed(fixture.root, ["-C", "linked/"]);
	expect(vault.path).toBe(join(holder, ".archboard", "vault"));
	const response = await fetch(`${server.base}/api/repositories`, {
		headers: { Origin: server.base, "Sec-Fetch-Site": "same-origin" },
	});
	const { repositories } = z
		.object({ repositories: z.array(z.object({ name: z.string(), vault: z.string().nullable() })) })
		.parse(await response.json());
	const { name } = z.object({ name: z.string() }).parse(vault.registered);
	expect(repositories.filter((each) => each.vault === vault.path).map((each) => each.name)).toEqual(
		[name],
	);
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

test("model record refuses in a checkout that is not the chosen one of its repository", () => {
	// The page names the repository and reads its chosen checkout, which is shop.
	const clone = fixture.repository("shop-clone", `https://${SHOP}.git`);
	holdingVault(clone);
	expect(listed(clone).vault.registered).toMatchObject({ root: clone, chosen: false });
	const out = join(fixture.nowhere, "tour.mp4");
	const refused = archboard(["model", "record", "--walkthrough", "Tour", "--out", out], clone);
	expect(refused.status, refused.failure).toBe(2);
	expect(refused.stdout).toBe("");
	expect(existsSync(out)).toBe(false);
});

test("inside a checkout without a vault a command refuses, and creates and registers nothing", () => {
	const before = existsSync(fixture.registry) ? readFileSync(fixture.registry) : null;
	const refused = archboard(["model", "read"], join(billing, "src"));
	expect(refused.status, refused.failure).toBe(2);
	expect(refused.stdout).toBe("");
	expect(existsSync(join(billing, ".archboard"))).toBe(false);
	expect(existsSync(fixture.registry) ? readFileSync(fixture.registry) : null).toEqual(before);
});

test("a checkout without a vault is told which known vault holds boards of its code, and nothing is created", () => {
	// Another directory keeps the architecture of the billing checkout's code.
	const architecture = holdingVault(join(fixture.root, "architecture"));
	seedCanonicalFixture(join(architecture, ".archboard/vault"), "Billing flow", [
		{
			name: "Invoices",
			kind: "service",
			binding: { repo: "github.com/acme/billing", path: "src/invoices.ts" },
		},
	]);
	const drawn = archboard(["model", "read"], architecture);
	expect(drawn.status, drawn.failure).toBe(0);
	const before = readFileSync(fixture.registry);
	const refused = archboard(["model", "read"], join(billing, "src"));
	expect(refused.status, refused.failure).toBe(2);
	expect(refused.stdout).toBe("");
	expect(refused.stderr).toContain(architecture);
	expect(refused.stderr).toContain("Billing flow");
	expect(existsSync(join(billing, ".archboard"))).toBe(false);
	expect(readFileSync(fixture.registry)).toEqual(before);
	// A checkout whose code no known vault binds is not sent there.
	const ledger = fixture.repository("ledger", "https://github.com/acme/ledger.git");
	const unbound = archboard(["model", "read"], ledger);
	expect(unbound.status, unbound.failure).toBe(2);
	expect(unbound.stderr).not.toContain(architecture);
});

test("outside any checkout and any vault a command refuses before it starts a server", async () => {
	const port = await availablePort();
	const refused = archboard(["model", "read"], fixture.nowhere, {
		ARCHBOARD_URL: `http://127.0.0.1:${port}`,
		ARCHBOARD_NO_AUTOSTART: undefined,
	});
	expect(refused.status, refused.failure).toBe(2);
	expect(await portIsReusable(port)).toBe(true);
});

test("autostart starts a server without a vault, and the server serves the vault each command names", async () => {
	const port = await availablePort();
	// Nothing in this environment names a vault: the server starts without one.
	const started = { ARCHBOARD_URL: `http://127.0.0.1:${port}`, ARCHBOARD_NO_AUTOSTART: undefined };
	try {
		seedCanonicalFixture(join(shop, ".archboard/vault"), "Checkout", []);
		const drawn = archboard(["model", "read"], shop, started);
		expect(drawn.status, drawn.failure).toBe(0);
		const boards = (cwd: string, args: readonly string[] = []) => {
			const result = archboard(["model", "read", ...args], cwd, started);
			expect(result.status, result.failure).toBe(0);
			return z.object({ manifest: z.object({ name: z.string() }) }).parse(JSON.parse(result.stdout))
				.manifest.name;
		};
		expect(boards(shop)).toBe("Checkout");
		expect(boards(fixture.nowhere, ["-C", plans])).toBe("plans");
	} finally {
		archboard(["stop"], fixture.nowhere, started);
	}
	expect(await portIsReusable(port)).toBe(true);
}, 60_000);
