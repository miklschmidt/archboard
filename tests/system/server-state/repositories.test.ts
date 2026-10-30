import { canonicalCapture, seedCanonicalFixture } from "../support/canonical-fixture.ts";
// The repositories the navigator lists, and choosing a checkout from the page
// (ADR 0050, TASK-472.05). One owned server with a registry of its own knows a
// repository with two checkouts, each with a vault. A pane shows a board of the
// chosen checkout; choosing the other moves the pane there with its board, and
// a show of another vault's board moves a named pane into that vault.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { WebSocket, type RawData } from "ws";
import { readArchitectureModel } from "@archboard/board/store-read";

import {
	createRepositoryFixture,
	type RepositoryFixture,
} from "../cli/support/repository-fixture.ts";
import { packageBin } from "../cli/support/package-cli.ts";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { ensureSemanticVaultConfiguration } from "../support/semantic-vault.ts";
import { holderOf } from "../support/test-vault.ts";
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
	// The fixture's untracked vault, a repository of its own beside the checkouts.
	const holder = holderOf(fixture.vault);
	const untracked = spawnSync(packageBin, ["repo", "add", holder], {
		cwd: fixture.nowhere,
		env: fixture.serverEnvironment,
		encoding: "utf8",
	});
	if (untracked.status !== 0) throw new Error(`repo add ${holder}: ${untracked.stderr}`);
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

describe.serial("the repositories of the navigator", () => {
	test("choosing a checkout moves the panes that showed the old one, and a show moves a named pane", async () => {
		await using resources = new AsyncDisposableStack();
		const mainVault = vaultOf(main);
		const worktreeVault = vaultOf(worktree);
		const inMain = createRequester({ ...server, vault: mainVault });
		const inServed = createRequester(server);
		for (const [vault, name] of [
			[mainVault, "payments"],
			[worktreeVault, "ledger"],
			[fixture.vault, "notes"],
		] as const)
			seedCanonicalFixture(vault, name, []);

		// The repository is listed once, read from its chosen main checkout, beside the
		// untracked vault, which is in no checkout.
		const before = await listed();
		const orders = before.find((each) => each.name === ORDERS);
		expect(orders).toMatchObject({ vault: mainVault, state: "ready" });
		expect(orders?.checkouts.map((each) => [each.root, each.chosen, each.hasVault])).toEqual([
			[main, true, true],
			[worktree, false, true],
		]);

		const pane = await openPaneSession(server.base, inMain, {
			clientId: "pane-orders",
			board: "payments",
		});
		resources.defer(() => pane.close());
		// A pane of another tab, in a vault the choice does not touch.
		const elsewhere = await openPaneSession(server.base, inServed, {
			clientId: "pane-elsewhere",
			board: "notes",
		});
		resources.defer(() => elsewhere.close());

		// Choosing the worktree moves the pane into its vault and keeps its board,
		// which the worktree has not got, and every tab is told to list again.
		const mark = pane.mark();
		const elsewhereMark = elsewhere.mark();
		const chose = await fetch(`${server.base}/api/repositories/chosen`, {
			method: "PUT",
			headers: { ...pageHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ repository: ORDERS, root: worktree }),
		});
		expect(chose.status).toBe(200);
		const moved = await pane.waitFor("pane_board", mark);
		expect(moved).toMatchObject({ board: "payments", vault: worktreeVault, repository: ORDERS });
		await pane.waitFor("repositories_changed", mark);
		expect(await elsewhere.waitFor("repositories_changed", elsewhereMark)).toBeDefined();
		expect((await listed()).find((each) => each.name === ORDERS)?.vault).toBe(worktreeVault);

		// A show names the pane and the vault of another repository's board, and the
		// pane moves into that vault.
		const beforeShow = pane.mark();
		const shown = await inServed<{ board: string; repository: string | null }>("/api/panes/show", {
			method: "POST",
			doing: false,
			body: { reading: { model: "Fixture" }, pane: pane.clientId },
		});
		expect(shown.status).toBe(200);
		const arrived = await pane.waitFor("pane_model", beforeShow);
		expect(arrived).toMatchObject({ model: "Fixture", vault: realpathSync(fixture.vault) });
		// The answer and the pane name the repository the navigator lists the vault under.
		const servedName = (await listed()).find(
			(each) => each.vault === realpathSync(fixture.vault),
		)?.name;
		expect([shown.body.repository, arrived?.["repository"]]).toEqual([servedName, servedName]);

		// A checkout the repository has not got is refused, and nothing changes.
		const refused = await fetch(`${server.base}/api/repositories/chosen`, {
			method: "PUT",
			headers: { ...pageHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ repository: ORDERS, root: fixture.nowhere }),
		});
		expect(refused.status).toBe(404);
		expect((await listed()).find((each) => each.name === ORDERS)?.vault).toBe(worktreeVault);
	});

	test("a pane whose socket was down when its checkout was chosen comes back in the chosen checkout", async () => {
		await using resources = new AsyncDisposableStack();
		const mainVault = vaultOf(main);
		const inWorktree = createRequester({ ...server, vault: vaultOf(worktree) });
		seedCanonicalFixture(mainVault, "ledger", []);
		const away = await openPaneSession(server.base, inWorktree, {
			clientId: "pane-away",
			board: "ledger",
		});
		await away.close();

		const chose = await fetch(`${server.base}/api/repositories/chosen`, {
			method: "PUT",
			headers: { ...pageHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ repository: ORDERS, root: main }),
		});
		expect(chose.status).toBe(200);

		// The page never heard of the move, so its socket comes back naming the vault
		// it was in. The server puts it where it moved it, on the board it held.
		const endpoint = new URL(server.base);
		endpoint.protocol = "ws:";
		endpoint.search = new URLSearchParams({
			clientId: "pane-away",
			tabSession: "system-tab",
			vault: inWorktree.vault!,
		}).toString();
		const back = new WebSocket(endpoint);
		resources.defer(() => back.close());
		const first = await new Promise<unknown>((answer, fail) => {
			back.once("message", (data: RawData) => answer(JSON.parse(String(data))));
			back.once("error", fail);
		});
		expect(first).toMatchObject({
			type: "pane_board",
			board: "ledger",
			vault: mainVault,
			repository: ORDERS,
		});
	});

	test("a registry change nobody told this server of moves its panes, and a choice refuses a checkout with no vault", async () => {
		await using resources = new AsyncDisposableStack();
		const mainVault = vaultOf(main);
		const target = join(fixture.root, "orders-fix");
		execFileSync("git", ["worktree", "add", "-q", "-b", "fix", target], {
			cwd: main,
			stdio: "ignore",
		});
		const fix = realpathSync.native(target);
		cli("repo", "add", fix);
		const pane = await openPaneSession(
			server.base,
			createRequester({ ...server, vault: mainVault }),
			{
				clientId: "pane-left-behind",
				board: "payments",
			},
		);
		resources.defer(() => pane.close());
		// This `repo use` reaches no server, as one in another checkout reaches only
		// that checkout's server. This server follows the registry it reads all the same.
		const used = pane.mark();
		cli("repo", "use", worktree);
		expect(await pane.waitFor("pane_board", used)).toMatchObject({
			board: "payments",
			vault: vaultOf(worktree),
			repository: ORDERS,
		});

		// The fix worktree has no vault yet: choosing it is refused, and no pane moves.
		const mark = pane.mark();
		const refused = await choose(fix);
		expect(refused.status).toBe(422);
		expect(((await refused.json()) as { code: string }).code).toBe("CHECKOUT_UNUSABLE");
		await pane.sync();
		expect(pane.events.slice(mark).filter((event) => event.type === "pane_board")).toEqual([]);

		// With a vault it is chosen, and the pane moves there with its board.
		const fixVault = vaultOf(fix);
		expect((await choose(fix)).status).toBe(200);
		const moved = await pane.waitFor("pane_board", mark);
		expect(moved).toMatchObject({ board: "payments", vault: fixVault, repository: ORDERS });
	});

	test("a vault that a link leads out of the layout is not listed, and no page opens in it", async () => {
		// Every call naming it is refused (TASK-472.09). It sorts first, so a page would open there.
		const holder = join(fixture.root, "aaa-linked-out");
		const elsewhere = join(fixture.root, "boards-kept-elsewhere");
		mkdirSync(join(holder, ".archboard"), { recursive: true });
		mkdirSync(elsewhere);
		symlinkSync(elsewhere, join(holder, ".archboard", "vault"));
		cli("repo", "add", holder);
		expect((await listed()).map((each) => each.name)).not.toContain("aaa-linked-out");
		const opening = (await (await fetch(`${server.base}/api/served-vault`)).json()) as {
			vault: string | null;
		};
		expect(opening.vault).not.toBe(realpathSync.native(elsewhere));
	});

	test("choosing a checkout preserves the captured canonical reading and its filters", async () => {
		await using resources = new AsyncDisposableStack();
		const mainVault = vaultOf(main);
		const worktreeVault = vaultOf(worktree);
		for (const vault of [mainVault, worktreeVault]) {
			cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, {
				recursive: true,
			});
		}
		const model = readArchitectureModel(mainVault);
		if (!model.success) throw new Error(JSON.stringify(model));
		expect((await choose(main)).status).toBe(200);
		const inMain = createRequester({ ...server, vault: mainVault });
		const pane = await openPaneSession(server.base, inMain, { clientId: "canonical-checkout" });
		resources.defer(() => pane.close());
		const reading = {
			model: "Shop",
			grammar: "architecture",
			state: "Current",
			scope: "Shop#Gateway",
			focus: ["Shop#Gateway"],
			hideKinds: ["call"],
			hideGroups: ["public"],
		};
		const shown = await inMain("/api/panes/show", {
			method: "POST",
			doing: false,
			body: { pane: pane.clientId, reading },
		});
		expect(shown.status).toBe(200);
		const capture = canonicalCapture(mainVault, model, ["Shop#Gateway"]);
		const reported = await inMain("/api/panes/semantic-context", {
			method: "POST",
			doing: false,
			body: {
				clientId: pane.clientId,
				paneId: pane.clientId,
				board: null,
				variant: null,
				view: null,
				selection: [],
				version: null,
				at: new Date().toISOString(),
				sequence: 1,
				architecture: {
					...capture,
					reading: {
						...capture.reading,
						scope: reading.scope,
						relationshipKinds: [],
						groups: false,
					},
				},
			},
		});
		expect(reported.status).toBe(200);
		const mark = pane.mark();
		expect((await choose(worktree)).status).toBe(200);
		expect(await pane.waitFor("pane_model", mark)).toMatchObject({
			model: "Shop",
			vault: worktreeVault,
			repository: ORDERS,
			reading,
		});
	});
});

/**
 * Run the CLI against this server's registry, as a command that reaches no
 * server: whatever it changes, this server hears of only from the registry.
 * @param args Its arguments.
 */
function cli(...args: string[]): void {
	const ran = spawnSync(packageBin, args, {
		cwd: fixture.nowhere,
		env: { ...fixture.serverEnvironment, ARCHBOARD_URL: "http://127.0.0.1:9" },
		encoding: "utf8",
	});
	if (ran.status !== 0) throw new Error(`${args.join(" ")}: ${ran.stderr}`);
}

/**
 * Choose a checkout of the repository from the page.
 * @param root The checkout.
 * @returns The answer.
 */
function choose(root: string): Promise<globalThis.Response> {
	return fetch(`${server.base}/api/repositories/chosen`, {
		method: "PUT",
		headers: { ...pageHeaders(), "Content-Type": "application/json" },
		body: JSON.stringify({ repository: ORDERS, root }),
	});
}
