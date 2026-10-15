// The repositories the navigator lists, and choosing a checkout from the page
// (ADR 0050, TASK-472.05). One owned server with a registry of its own knows a
// repository with two checkouts, each with a vault. A pane shows a board of the
// chosen checkout; choosing the other moves the pane there with its board, and
// a show of another vault's board moves a named pane into that vault.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
	createRepositoryFixture,
	type RepositoryFixture,
} from "../cli/support/repository-fixture.ts";
import { packageBin } from "../cli/support/package-cli.ts";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { ensureSemanticVaultConfiguration } from "../support/semantic-vault.ts";
import { createRequester } from "./support/http.ts";
import { openPaneSession } from "./support/pane-session.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const ORDERS = "github.com/acme/orders";

interface Listed {
	name: string;
	vault: string | null;
	state: string;
	checkouts: { root: string; chosen: boolean; hasVault: boolean }[];
}

let fixture: RepositoryFixture;
let server: OwnedServer;
let main = "";
let worktree = "";

/**
 * The vault of a checkout, made and configured.
 * @param checkout The checkout.
 * @returns The vault's real path.
 */
function vaultOf(checkout: string): string {
	const vault = join(checkout, ".archboard", "vault");
	mkdirSync(vault, { recursive: true });
	ensureSemanticVaultConfiguration(vault);
	return realpathSync(vault);
}

/** The headers a page of this server sends. */
function pageHeaders(): Record<string, string> {
	return { Origin: server.base, "Sec-Fetch-Site": "same-origin" };
}

/**
 * The repositories the page is told about.
 * @returns The repositories.
 */
async function listed(): Promise<Listed[]> {
	const response = await fetch(`${server.base}/api/repositories`, { headers: pageHeaders() });
	expect(response.status).toBe(200);
	const body = (await response.json()) as { repositories: Listed[] };
	return body.repositories;
}

beforeAll(async () => {
	fixture = createRepositoryFixture();
	main = fixture.repository("orders", ORDERS);
	const target = join(fixture.root, "orders-feature");
	execFileSync("git", ["worktree", "add", "-q", "-b", "feature", target], {
		cwd: main,
		stdio: "ignore",
	});
	worktree = realpathSync.native(target);
	const added = spawnSync(packageBin, ["repo", "add", main], {
		cwd: fixture.nowhere,
		env: fixture.serverEnvironment,
		encoding: "utf8",
	});
	if (added.status !== 0) throw new Error(`repo add ${main}: ${added.stderr}`);
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

describe.serial("the repositories of the navigator", () => {
	test("choosing a checkout moves the panes that showed the old one, and a show moves a named pane", async () => {
		await using resources = new AsyncDisposableStack();
		const mainVault = vaultOf(main);
		const worktreeVault = vaultOf(worktree);
		const inMain = createRequester({ ...server, vault: mainVault });
		const inWorktree = createRequester({ ...server, vault: worktreeVault });
		const inServed = createRequester(server);
		for (const [request, board] of [
			[inMain, "payments"],
			[inWorktree, "ledger"],
			[inServed, "notes"],
		] as const) {
			const made = await request("/api/semantic-boards/create", {
				method: "POST",
				doing: "starting a board",
				body: { board, create: { level: "system", nodes: [] } },
			});
			expect(made.status).toBe(200);
		}

		// The repository is listed once, read from its chosen main checkout, beside the
		// served vault, which is in no registered checkout.
		const before = await listed();
		const orders = before.find((each) => each.name === ORDERS);
		expect(orders).toMatchObject({ vault: mainVault, state: "ready" });
		expect(orders?.checkouts.map((each) => [each.root, each.chosen, each.hasVault])).toEqual([
			[main, true, true],
			[worktree, false, true],
		]);
		expect(before.some((each) => each.vault === realpathSync(fixture.vault))).toBe(true);

		const pane = await openPaneSession(server.base, inMain, {
			clientId: "pane-orders",
			board: "payments",
		});
		resources.defer(() => pane.close());

		// Choosing the worktree moves the pane into its vault and keeps its board,
		// which the worktree has not got, and every tab is told to list again.
		const mark = pane.mark();
		const chose = await fetch(`${server.base}/api/repositories/chosen`, {
			method: "PUT",
			headers: { ...pageHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ repository: ORDERS, root: worktree }),
		});
		expect(chose.status).toBe(200);
		const moved = await pane.waitFor("pane_board", mark);
		expect(moved).toMatchObject({ board: "payments", vault: worktreeVault, repository: ORDERS });
		await pane.waitFor("repositories_changed", mark);
		expect((await listed()).find((each) => each.name === ORDERS)?.vault).toBe(worktreeVault);

		// A show names the pane and the vault of another repository's board, and the
		// pane moves into that vault.
		const beforeShow = pane.mark();
		const shown = await inServed<{ board: string }>("/api/panes/show", {
			method: "POST",
			doing: false,
			body: { board: "notes", pane: pane.clientId },
		});
		expect(shown.status).toBe(200);
		const arrived = await pane.waitFor("pane_board", beforeShow);
		expect(arrived).toMatchObject({ board: "notes", vault: realpathSync(fixture.vault) });

		// A checkout the repository has not got is refused, and nothing changes.
		const refused = await fetch(`${server.base}/api/repositories/chosen`, {
			method: "PUT",
			headers: { ...pageHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ repository: ORDERS, root: fixture.nowhere }),
		});
		expect(refused.status).toBe(404);
		expect((await listed()).find((each) => each.name === ORDERS)?.vault).toBe(worktreeVault);
	});
});
