import { canonicalCapture, seedCanonicalFixture } from "../support/canonical-fixture.ts";
// The repositories the navigator lists, and choosing a checkout from the page
// (ADR 0050, TASK-472.05). One owned server with a registry of its own knows a
// repository with two checkouts, each with a vault. A pane shows a model of the
// chosen checkout; choosing the other moves the pane there with its model, and
// a show of another vault's model moves a named pane into that vault.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { WebSocket, type RawData } from "ws";
import { readArchitectureModel } from "@archboard/model/store-read";

import {
	createRepositoryFixture,
	type RepositoryFixture,
} from "../cli/support/repository-fixture.ts";
import { packageBin } from "../cli/support/package-cli.ts";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { ensureSemanticVaultConfiguration } from "../support/semantic-vault.ts";
import { holderOf } from "../support/test-vault.ts";
import { openRepositoryFeed, type RepositoriesFrame } from "../support/architecture-feed.ts";
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

/** The answer to a choice: the listing that follows it. */
type Answer = Omit<RepositoriesFrame, "type">;

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
	test("a reader's open moves a pane into a repository with no model, and an agent's is refused", async () => {
		await using resources = new AsyncDisposableStack();
		const vault = vaultOf(main);
		mkdirSync(vault, { recursive: true });
		seedCanonicalFixture(fixture.vault, "notes", []);
		const pane = await openPaneSession(server.base, createRequester(server), {
			clientId: "pane-unread",
			model: "notes",
		});
		resources.defer(() => pane.close());
		const inMain = createRequester({ ...server, vault });
		const body = { reading: {}, pane: pane.clientId };
		const agent = await inMain("/api/panes/show", {
			method: "POST",
			doing: false,
			body: { ...body, agent: true },
		});
		expect(agent.status).toBe(404);
		const mark = pane.mark();
		const reader = await inMain("/api/panes/show", { method: "POST", doing: false, body });
		expect(reader.status).toBe(200);
		const moved = await pane.waitFor("pane_place", mark);
		expect(moved).toMatchObject({ paneKey: null, vault, repository: ORDERS });
	});

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
			model: "payments",
		});
		resources.defer(() => pane.close());
		// A pane of another tab, in a vault the choice does not touch.
		// A tab that follows the repositories, in no vault the choice touches.
		const tab = resources.use(await openRepositoryFeed(server.base));
		const snapshot = await tab.next();

		// Choosing the worktree moves the pane into its vault and keeps its model,
		// which the worktree has not got. The answer is the new listing, and every
		// tab that follows the repositories is sent it.
		const mark = pane.mark();
		const chose = await choose(worktree);
		expect(chose.status).toBe(200);
		const { revision, repositories } = (await chose.json()) as Answer;
		expect(revision).toBeGreaterThan(snapshot.revision);
		expect(ordersVault(repositories)).toBe(worktreeVault);
		const moved = await pane.waitFor("pane_place", mark);
		expect(moved).toMatchObject({ paneKey: "payments", vault: worktreeVault, repository: ORDERS });
		expect(await tab.next()).toEqual({ type: "repositories", revision, repositories });
		expect((await listed()).find((each) => each.name === ORDERS)?.vault).toBe(worktreeVault);

		// A show names the pane and the vault of another repository's model, and the
		// pane moves into that vault.
		const beforeShow = pane.mark();
		const shown = await inServed<{ model: string; repository: string | null }>("/api/panes/show", {
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
			model: "ledger",
		});
		await away.close();

		const chose = await fetch(`${server.base}/api/repositories/chosen`, {
			method: "PUT",
			headers: { ...pageHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ repository: ORDERS, root: main }),
		});
		expect(chose.status).toBe(200);

		// The page never heard of the move, so its socket comes back naming the vault
		// it was in. The server puts it where it moved it, on the model it held.
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
			type: "pane_place",
			paneKey: "ledger",
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
				model: "payments",
			},
		);
		resources.defer(() => pane.close());
		// This `repo use` reaches no server, as one in another checkout reaches only
		// that checkout's server. This server follows the registry it reads all the same.
		const used = pane.mark();
		cli("repo", "use", worktree);
		expect(await pane.waitFor("pane_place", used)).toMatchObject({
			paneKey: "payments",
			vault: vaultOf(worktree),
			repository: ORDERS,
		});

		// The fix worktree has no vault yet: choosing it is refused, and no pane moves.
		const mark = pane.mark();
		const refused = await choose(fix);
		expect(refused.status).toBe(422);
		expect(((await refused.json()) as { code: string }).code).toBe("CHECKOUT_UNUSABLE");
		await pane.sync();
		expect(pane.events.slice(mark).filter((event) => event.type === "pane_place")).toEqual([]);

		// The CLI can choose a checkout before it has a vault. Once the vault appears,
		// the same disk recheck that updates the listing also moves the pane.
		const tab = resources.use(await openRepositoryFeed(server.base));
		await tab.next();
		cli("repo", "use", fix);
		await tab.until((listing) =>
			listing.repositories.some((entry) => entry.name === ORDERS && entry.state === "no-vault"),
		);
		await pane.sync();
		const beforeVault = pane.mark();
		const fixVault = vaultOf(fix);
		await tab.until((listing) => ordersVault(listing.repositories) === fixVault);
		const moved = await pane.waitFor("pane_place", beforeVault);
		expect(moved).toMatchObject({ paneKey: "payments", vault: fixVault, repository: ORDERS });
	});

	test("a tab is sent a vault that leaves the disk while the registry stays, and a returning tab the listing as it is", async () => {
		await using resources = new AsyncDisposableStack();
		const holder = join(fixture.root, "zz-scratch");
		const vault = vaultOf(holder);
		cli("repo", "add", holder);
		{
			using tab = await openRepositoryFeed(server.base);
			expect(names(await tab.next())).toContain("zz-scratch");
			const pane = await openPaneSession(server.base, createRequester({ ...server, vault }), {
				clientId: "scratch-pane",
			});
			resources.defer(() => pane.close());
			// Nothing writes the registry: the server finds the change on its own look at the disk.
			rmSync(holder, { recursive: true, force: true });
			await tab.until((listing) => !names(listing).includes("zz-scratch"));

			// Forgetting an already missing vault leaves the listing alone but removes the pane's name.
			await pane.sync();
			const mark = pane.mark();
			cli("repo", "forget", holder);
			expect(await pane.waitFor("pane_place", mark)).toMatchObject({ vault, repository: null });
		}
		// While no tab follows, a choice changes the listing; a tab that comes back is sent it.
		expect((await choose(main)).status).toBe(200);
		using back = await openRepositoryFeed(server.base);
		const snapshot = await back.next();
		expect(names(snapshot)).not.toContain("zz-scratch");
		expect(ordersVault(snapshot.repositories)).toBe(vaultOf(main));
	});

	test("two choices at once are each answered with the listing that follows them, in order", async () => {
		const other = realpathSync.native(join(fixture.root, "orders-fix"));
		expect((await choose(other)).status).toBe(200);
		using tab = await openRepositoryFeed(server.base);
		const snapshot = await tab.next();
		expect(ordersVault(snapshot.repositories)).toBe(vaultOf(other));
		const answers = await Promise.all(
			[main, worktree].map(async (root) => {
				const response = await choose(root);
				expect(response.status).toBe(200);
				const listing = (await response.json()) as Answer;
				expect(ordersVault(listing.repositories)).toBe(vaultOf(root));
				return listing;
			}),
		);
		const [first, last] = answers.toSorted((a, b) => a.revision - b.revision);
		expect(first!.revision).toBe(snapshot.revision + 1);
		expect(last!.revision).toBe(snapshot.revision + 2);
		expect(await tab.next()).toEqual({
			type: "repositories",
			revision: first!.revision,
			repositories: first!.repositories,
		});
		expect(await tab.next()).toEqual({
			type: "repositories",
			revision: last!.revision,
			repositories: last!.repositories,
		});
		const now = (await listed()).find((each) => each.name === ORDERS);
		expect(now?.vault).toBe(ordersVault(last!.repositories));
	});

	test("a vault that a link leads out of the layout is not listed", async () => {
		// Every call naming it is refused (TASK-472.09), so no page may open there.
		const holder = join(fixture.root, "aaa-linked-out");
		const elsewhere = join(fixture.root, "boards-kept-elsewhere");
		mkdirSync(join(holder, ".archboard"), { recursive: true });
		mkdirSync(elsewhere);
		symlinkSync(elsewhere, join(holder, ".archboard", "vault"));
		cli("repo", "add", holder);
		expect((await listed()).map((each) => each.name)).not.toContain("aaa-linked-out");
	});

	test("choosing a checkout preserves the captured canonical reading and its filters", async () => {
		await using resources = new AsyncDisposableStack();
		const mainVault = vaultOf(main);
		const worktreeVault = vaultOf(worktree);
		for (const vault of [mainVault, worktreeVault]) {
			cpSync(join(repoRoot, "tests/fixtures/current-format-vault"), vault, {
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
			hideKinds: ["sync"],
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
				model: null,
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
						// The kinds the reading shows: every kind but the one it hides.
						relationshipKinds: Object.keys(model.policy.relationshipKinds).filter(
							(kind) => !reading.hideKinds.includes(kind),
						),
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
 * The names a listing lists.
 * @param listing The listing.
 * @returns The names.
 */
function names(listing: RepositoriesFrame): string[] {
	return listing.repositories.map((each) => each.name);
}

/**
 * The vault the fixture's repository reads in a listing.
 * @param repositories The listing.
 * @returns The vault of its chosen checkout.
 */
function ordersVault(repositories: RepositoriesFrame["repositories"]): string | null | undefined {
	return repositories.find((each) => each.name === ORDERS)?.vault;
}

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
