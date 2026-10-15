import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { packageBin } from "../cli/support/package-cli.ts";
import { createRepositoryFixture } from "../cli/support/repository-fixture.ts";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import {
	DRILL_OPEN,
	WAIT,
	addressSearch,
	drawnId,
	pick,
	press,
	readThrough,
	shownBoard,
	stageState,
} from "./support/drilling.ts";
import { serverPath, servedRepository } from "./support/navigator-support.ts";
import { seedSemanticBoard } from "./support/semantic-page.ts";
import { ensureSemanticVaultConfiguration } from "../support/semantic-vault.ts";

// The address of a board read a level down.
//
// A board and the view it is read through are one answer, and a view id is a
// subject of one variant's content. So an address that paired the board
// somebody followed a link INTO with the view they had chosen on the board they
// came FROM would name a view that board has not got: the link a person sends
// would not open, and neither would their own reload. This is the owner for
// that pairing, through a real drill-down in a real browser.

/** A board with one named way of reading it, and two nodes to read. */
const withAView = (
	view: string,
	nodes: readonly Record<string, unknown>[],
): Record<string, unknown> => ({
	level: "system",
	nodes,
	edges: [],
	views: [{ name: view, grammar: "architecture", scope: { kind: "all" } }],
});

test("the address names the view of the board on screen, down a level and back", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = vaultIn(join(ownerRoot, "drill-address-vault"));
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const repo = await servedRepository(server.base);
	const request = createJsonRequester(server);

	for (const [board, create] of [
		[
			"engine",
			withAView("One write", [
				{ name: "atomic-write", kind: "module" },
				{ name: "board-version", kind: "module" },
			]),
		],
		[
			"pipeline",
			withAView("Where writes go", [
				{
					name: "board-io",
					kind: "module",
					drillDown: { board: "engine", variant: { kind: "current" } },
				},
				{ name: "Write Lease", kind: "module" },
			]),
		],
	] as const) {
		const made = await request<{ success: boolean }>("/api/semantic-boards/create", {
			method: "POST",
			doing: `drawing ${board}`,
			body: { board, origin: "agent", create },
		});
		expect(made.status).toBe(200);
	}

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?paneA=pipeline`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the board the pane was opened on to be drawn",
		WAIT,
	);

	// A way of reading the board the pane was opened on, chosen and addressed.
	const above = await readThrough(browser, "Where writes go");
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=pipeline&repoA=${repo}&viewA=${above}`,
		"the address to name the way the opened board is being read",
		WAIT,
	);

	// Down a level. The view goes with the board it belonged to: its id is a
	// subject of the level above's content and names nothing here, so an address
	// that carried it down would be an address that cannot be reopened.
	await pick(browser, await drawnId(browser, "board-io"));
	await press(browser, DRILL_OPEN);
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=engine&repoA=${repo}`,
		"the address to name the board below, read whole",
		WAIT,
	);

	// And the level below's own way of reading it is addressed the same way,
	// against the board it belongs to.
	const below = await readThrough(browser, "One write");
	expect(below).not.toBe(above);
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=engine&repoA=${repo}&viewA=${below}`,
		"the address to name the way the board below is being read",
		WAIT,
	);

	// Which is the whole point: that address reopens what is on screen. A person
	// who sends it, or reloads, lands where they were.
	await browser.run(["open", `${server.base}/?paneA=engine&viewA=${below}`]);
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the addressed board below to be drawn again",
		WAIT,
	);
	expect(await shownBoard(browser)).toBe("engine");
	expect(
		await browser.eval<string | null>(
			`document.querySelector("[data-slot='semantic-view-choice'][aria-pressed='true']")` +
				`?.getAttribute("data-semantic-view") ?? null`,
		),
	).toBe(below);

	// A board name is read without its case (ADR 0010), so a link that spells the
	// board another way still lands on the same view and keeps naming it.
	await browser.run(["open", `${server.base}/?paneA=Engine&viewA=${below}`]);
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=engine&repoA=${repo}&viewA=${below}`,
		"the address to keep naming the view when the board was spelled in another case",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector("[data-slot='semantic-view-choice'][aria-pressed='true']")` +
				`?.getAttribute("data-semantic-view") ?? null`,
		),
	).toBe(below);

	await server.assertRunning();
}, 90_000);

// A drill-down into another repository (ADR 0050, TASK-472.13).
//
// A link that names another repository's identity is read in the vault of that
// repository's chosen checkout on this machine. Following it moves the pane
// into that repository, so the address, the inventory and every later read
// name the vault the board is in. The breadcrumb keeps the way back, and says
// which repository each run of it is in. A link into a repository this machine
// does not list says how to register one, and opens nothing.

const SHOP = "github.com/acme/shop";
const ORDERS = "github.com/acme/orders";

/**
 * A checkout's vault, made and configured.
 * @param checkout The checkout.
 * @returns The vault's real path.
 */
function configuredVaultIn(checkout: string): string {
	const vault = join(checkout, ".archboard", "vault");
	mkdirSync(vault, { recursive: true });
	ensureSemanticVaultConfiguration(vault);
	return realpathSync(vault);
}

/**
 * The repository labels the breadcrumb shows, first to last.
 * @param browser The page.
 * @returns Their texts.
 */
const crumbRepositories = (browser: AgentBrowserSession): Promise<string[]> =>
	browser.eval<string[]>(
		`[...document.querySelectorAll("[data-slot='pane-crumb-repository']")].map((one) => one.textContent.trim())`,
	);

test("a drill-down into another repository moves the pane there, and the breadcrumb leads back", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = createRepositoryFixture();
	resources.defer(() => fixture.dispose());
	const shop = fixture.repository("shop", SHOP);
	const orders = fixture.repository("orders", ORDERS);
	for (const checkout of [shop, orders]) {
		configuredVaultIn(checkout);
		const added = spawnSync(packageBin, ["repo", "add", checkout], {
			cwd: fixture.nowhere,
			env: fixture.serverEnvironment,
			encoding: "utf8",
		});
		expect(added.status).toBe(0);
	}
	const server = await startOwnedServer({
		serverPath,
		vault: fixture.vault,
		env: serverTestEnvironment({ ARCHBOARD_REPOS: fixture.registry }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	await seedSemanticBoard(
		createJsonRequester({ ...server, vault: configuredVaultIn(orders) }),
		"ledger",
		{
			nodes: [{ name: "Posting", kind: "service" }],
		},
	);
	const created = await createJsonRequester({ ...server, vault: configuredVaultIn(shop) })<{
		success: boolean;
	}>("/api/semantic-boards/create", {
		method: "POST",
		doing: "drawing the storefront",
		body: {
			board: "storefront",
			origin: "agent",
			create: {
				level: "system",
				nodes: [
					{
						name: "Checkout",
						kind: "service",
						drillDown: { board: "ledger", variant: { kind: "current" }, repo: ORDERS },
					},
					{
						name: "Elsewhere",
						kind: "service",
						drillDown: {
							board: "anything",
							variant: { kind: "current" },
							repo: "github.com/acme/unlisted",
						},
					},
				],
				edges: [],
			},
		},
	});
	expect(created.status).toBe(200);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?paneA=storefront&repoA=${SHOP}`]);
	await browser.run(["set", "viewport", "1920", "1080"]);

	// A repository this machine does not list opens nothing, and says how to register one.
	await pick(browser, await drawnId(browser, "Elsewhere"));
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`!!document.querySelector("[data-slot='semantic-drill-unregistered']")`,
			),
		Boolean,
		"the link into an unlisted repository to say it cannot be read",
		WAIT,
	);
	expect(await browser.eval<boolean>(`!!document.querySelector("${DRILL_OPEN}")`)).toBe(false);

	// A listed one is followed into its vault: the pane moves there.
	await pick(browser, await drawnId(browser, "Checkout"));
	await pollUntil(
		() => browser.eval<boolean>(`!!document.querySelector("${DRILL_OPEN}")`),
		Boolean,
		"the link into the other repository to offer the way down",
		WAIT,
	);
	await press(browser, DRILL_OPEN);
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=ledger&repoA=${ORDERS}`,
		"the address to name the board and the repository the pane moved into",
		WAIT,
	);
	await drawnId(browser, "Posting");
	// Each run of the trail names its repository: the board left, and the board on screen.
	expect(await crumbRepositories(browser)).toEqual([SHOP, ORDERS]);

	// The crumb of the board the reader came from takes the pane back into its repository.
	const back = await browser.eval<boolean>(`(() => {
		const crumb = [...document.querySelectorAll("[data-slot='pane-crumb']")]
			.find((one) => one.textContent.includes("storefront"));
		if (!crumb) return false;
		crumb.click();
		return true;
	})()`);
	expect(back).toBe(true);
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=storefront&repoA=${SHOP}`,
		"the address to name the board and repository the pane went back to",
		WAIT,
	);
	await pollUntil(
		() => shownBoard(browser),
		(board) => board === "storefront",
		"the pane to draw the board it went back to",
		WAIT,
	);
	expect(await crumbRepositories(browser)).toEqual([]);
	await server.assertRunning();
}, 45_000);

const ARCHIVE = "github.com/acme/archive";

/** The dialog that moves a board, once it is open. */
const MOVE_DIALOG = `[role='dialog']`;

/**
 * Whether the move dialog shows a refusal, and how many drill-downs it lists.
 * @param browser The page.
 * @returns What the dialog shows, or null while it is closed.
 */
const moveDialog = (
	browser: AgentBrowserSession,
): Promise<{ refused: boolean; rewrites: string[]; movable: boolean } | null> =>
	browser.eval(`(() => {
		const dialog = document.querySelector("${MOVE_DIALOG}");
		if (!dialog) return null;
		const move = [...dialog.querySelectorAll("button")].find((one) => one.textContent.trim() === "Move");
		return {
			refused: !!dialog.querySelector("[role='alert']"),
			rewrites: [...dialog.querySelectorAll("section li")].map((one) => one.textContent),
			movable: !!move && !move.disabled,
		};
	})()`);

// A person moves a board to another repository (ADR 0051): a target that
// already has the board says why it refuses, the one chosen instead lists the
// drill-down it rewrites, and the pane follows the board to where it is now.
test("a person moves a board by keyboard to another repository, and the pane follows it", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = createRepositoryFixture();
	resources.defer(() => fixture.dispose());
	const shopCheckout = fixture.repository("shop", SHOP);
	const archiveCheckout = fixture.repository("archive", ARCHIVE);
	for (const checkout of [shopCheckout, fixture.repository("orders", ORDERS), archiveCheckout]) {
		configuredVaultIn(checkout);
		const added = spawnSync(packageBin, ["repo", "add", checkout], {
			cwd: fixture.nowhere,
			env: fixture.serverEnvironment,
			encoding: "utf8",
		});
		expect(added.status).toBe(0);
	}
	const server = await startOwnedServer({
		serverPath,
		vault: fixture.vault,
		env: serverTestEnvironment({ ARCHBOARD_REPOS: fixture.registry }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const inShop = createJsonRequester({ ...server, vault: configuredVaultIn(shopCheckout) });
	await seedSemanticBoard(inShop, "ledger", { nodes: [{ name: "Posting", kind: "service" }] });
	await seedSemanticBoard(inShop, "storefront", {
		nodes: [
			{
				name: "Checkout",
				kind: "service",
				drillDown: { board: "ledger", variant: { kind: "current" } },
			},
		],
	});
	await seedSemanticBoard(
		createJsonRequester({ ...server, vault: configuredVaultIn(archiveCheckout) }),
		"ledger",
		{
			nodes: [{ name: "Kept", kind: "service" }],
		},
	);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?paneA=ledger&repoA=${SHOP}`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await drawnId(browser, "Posting");

	// The control opens from the keyboard, and the dialog starts on the first target.
	await browser.run(["focus", `button[aria-label='Move ledger to another repository']`]);
	await browser.run(["press", "Enter"]);
	await pollUntil(() => moveDialog(browser), Boolean, "the move dialog to open", WAIT);
	await browser.run(["press", "Space"]);
	await pollUntil(
		() => moveDialog(browser),
		(dialog) => dialog?.refused === true && !dialog.movable,
		"a target that already has the board to say the move would be refused",
		WAIT,
	);

	await browser.run(["press", "ArrowDown"]);
	const ready = await pollUntil(
		() => moveDialog(browser),
		(dialog) => dialog?.refused === false && dialog.movable,
		"the other target to list what the move rewrites",
		WAIT,
	);
	expect(ready?.rewrites).toHaveLength(1);
	expect(ready?.rewrites[0]).toContain("storefront");

	// Tab past Cancel to Move.
	await browser.run(["press", "Tab"]);
	await browser.run(["press", "Tab"]);
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=ledger&repoA=${ORDERS}`,
		"the pane to show the board in the repository it moved to",
		WAIT,
	);
	await pollUntil(
		() => moveDialog(browser),
		(dialog) => dialog === null,
		"the dialog to close",
		WAIT,
	);
	await drawnId(browser, "Posting");
	await server.assertRunning();
}, 45_000);
