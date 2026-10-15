import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { packageBin } from "../cli/support/package-cli.ts";
import { createRepositoryFixture } from "../cli/support/repository-fixture.ts";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { holderOf, vaultIn } from "../support/test-vault.ts";
import { ensureSemanticVaultConfiguration } from "../support/semantic-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	runServerCli,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { seedSemanticBoard } from "./support/semantic-page.ts";
import { serverPath, servedRepository, type PanesBody } from "./support/navigator-support.ts";
import { PANE_SECTIONS, clickNavigatorRow, shellNotices } from "./support/shell-dom.ts";

/**
 * The search parameters the address bar is showing.
 * @param browser The page.
 * @returns The query string, without its leading question mark.
 */
const addressSearch = (browser: AgentBrowserSession): Promise<string> =>
	browser.eval<string>("window.location.search.replace(/^\\?/, '')");

/**
 * How many history entries this tab has.
 * @param browser The page.
 * @returns The length.
 */
const historyLength = (browser: AgentBrowserSession): Promise<number> =>
	browser.eval<number>("window.history.length");

/**
 * Go back the way a person does, and wait for the address to answer.
 * @param browser The page.
 * @param expected The search the address should end up showing.
 */
async function goBack(browser: AgentBrowserSession, expected: string): Promise<void> {
	await browser.eval("window.history.back()");
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === expected,
		`the address to go back to ${expected}`,
	);
}

/**
 * What the panes are showing, as the server reports it.
 * @param request The server's JSON requester.
 * @returns A reader of the pane inventory.
 */
function panesOf(request: <T>(path: string) => Promise<{ body: T }>): () => Promise<PanesBody> {
	return () => request<PanesBody>("/api/panes").then((reply) => reply.body);
}

test("a workspace opens from its address, and Back retraces the boards a person moved between", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = vaultIn(join(ownerRoot, "vault"));
	mkdirSync(vault, { recursive: true });
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const repo = await servedRepository(server.base);
	const request = createJsonRequester(server);
	const cli = (...args: string[]): string => runServerCli(server, args);

	await Promise.all(
		["payments", "billing", "ledger"].map((board) => seedSemanticBoard(request, board)),
	);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?paneA=payments&paneB=billing&pane=B`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	const panes = (): Promise<PanesBody> =>
		request<PanesBody>("/api/panes").then((reply) => reply.body);

	// A direct load restores the comparison: two panes, each on the board the
	// address names, without the address being rewritten to something else.
	const restored = await pollUntil(
		panes,
		(state) =>
			state.paneCount === 2 &&
			state.panes.some((pane) => pane.board === "payments") &&
			state.panes.some((pane) => pane.board === "billing"),
		"both panes to restore the boards the address named",
	);
	// The address names each pane's repository once that pane reports it, which
	// can come a moment after the server holds both boards.
	const settled = `paneA=payments&repoA=${repo}&paneB=billing&repoB=${repo}&pane=B`;
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === settled,
		"the address to name the repository of each restored pane",
	);
	const paneA = restored.panes.find((pane) => pane.board === "payments")!;
	const paneB = restored.panes.find((pane) => pane.board === "billing")!;

	// A person's open pushes a history entry, and the address says where they are.
	const before = await historyLength(browser);
	await clickNavigatorRow(browser, "ledger");
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=payments&repoA=${repo}&paneB=ledger&repoB=${repo}&pane=B`,
		"the address to record the board the person opened",
	);
	expect(await historyLength(browser)).toBe(before + 1);

	// An agent moving a pane is not the person's navigation: it is recorded
	// without a history entry of its own, so Back still retraces their moves.
	cli("browser", "show", "payments", "--pane", `${paneB.clientId}`);
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=payments&repoA=${repo}&paneB=payments&repoB=${repo}&pane=B`,
		"the address to follow the board an agent opened",
	);
	expect(await historyLength(browser)).toBe(before + 1);

	await goBack(browser, `paneA=payments&repoA=${repo}&paneB=billing&repoB=${repo}&pane=B`);
	await pollUntil(
		panes,
		(state) => state.panes.find((pane) => pane.clientId === paneB.clientId)?.board === "billing",
		"Back to put the pane on the board it came from",
	);

	// The panes were never remounted: their identity to the server is the one
	// they registered with, so the workbench and the picture rode through it.
	const afterBack = await panes();
	expect(afterBack.panes.map((pane) => pane.clientId).toSorted()).toEqual(
		[paneA.clientId, paneB.clientId].toSorted(),
	);

	await server.assertRunning();
}, 30_000);

test("an address naming a board that is not there says so and settles on what is shown", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = vaultIn(join(ownerRoot, "missing-vault"));
	mkdirSync(vault, { recursive: true });
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const repo = await servedRepository(server.base);
	const request = createJsonRequester(server);
	await seedSemanticBoard(request, "payments");

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?paneA=nowhere`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => shellNotices(browser),
		(notices) =>
			notices.some(
				(notice) =>
					notice.title.includes("nowhere") && notice.description.includes("Board navigation"),
			),
		"the missing board to be named rather than quietly swapped",
	);
	// The address is corrected to the workspace that is actually on screen, so
	// the two never disagree, and what it settled on is announced.
	const shown = await pollUntil(
		() => request<PanesBody>("/api/panes").then((reply) => reply.body),
		(state) => state.paneCount === 1,
		"the pane to register",
	);
	const board = shown.panes[0]?.board;
	expect(board).toBeDefined();
	expect(board).not.toBe("nowhere");
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=${board!}&repoA=${repo}`,
		"the address to settle on the workspace that is shown",
	);
	await server.assertRunning();
}, 30_000);

test("choosing a variant in the navigator moves the pane it was chosen for, and only that one", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = vaultIn(join(ownerRoot, "variant-vault"));
	mkdirSync(vault, { recursive: true });
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	await seedSemanticBoard(request, "payments");
	const branched = await request<{ board: { variants: Array<{ id: string; name: string }> } }>(
		"/api/semantic-boards/branch?expectVersion=1",
		{
			method: "POST",
			doing: "proposing the queue",
			body: { board: "payments", branch: { from: "current", name: "Queued ingest" } },
		},
	);
	expect(branched.status).toBe(200);
	const proposal = branched.body.board.variants.find((one) => one.name === "Queued ingest")!;
	expect(proposal).toBeDefined();

	const browser = resources.use(await createAgentBrowser());
	// Both panes on the same board, and the LEFT one active: the person is about
	// to move to the right one and choose a variant for it. A pane does not offer
	// its own board's states; the navigator does, for the active pane.
	await browser.run(["open", `${server.base}/?paneA=payments&paneB=payments&pane=A`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		panesOf(request),
		(state) => state.paneCount === 2 && state.panes.every((pane) => pane.board === "payments"),
		"both panes to settle on payments",
	);

	// The right-hand pane, then the proposal's row, pressed the way a person
	// presses them: a pointer pressed in a pane gives it focus.
	await browser.run(["click", `${PANE_SECTIONS}:last-of-type [data-slot="pane-board-name"]`]);
	await pollUntil(
		() => addressSearch(browser),
		(search) => search.endsWith("pane=B"),
		"the right-hand pane to become the active one",
	);
	const chosen = await pollUntil(
		() => clickNavigatorRow(browser, `payments@${proposal.id}`),
		(clicked) => clicked,
		"the proposal's row in the navigator",
	);
	expect(chosen).toBeTrue();

	// The pane they chose it for moved, and the other did not.
	const after = await pollUntil(
		panesOf(request),
		(state) => state.panes.some((pane) => pane.board === `payments@${proposal.id}`),
		"the pane the variant was chosen in to show the proposal",
	);
	expect(after.panes.map((pane) => pane.board)).toEqual(["payments", `payments@${proposal.id}`]);
	await server.assertRunning();
}, 30_000);

/** The repository identity whose two checkouts the next owner chooses between. */
const ORDERS = "github.com/acme/orders";

/**
 * A checkout's vault, made and configured.
 * @param checkout The checkout.
 * @returns The vault's real path.
 */
function checkoutVault(checkout: string): string {
	const vault = join(checkout, ".archboard", "vault");
	mkdirSync(vault, { recursive: true });
	ensureSemanticVaultConfiguration(vault);
	return realpathSync(vault);
}

/**
 * Whether one pane's picture says a word: which vault's board it drew.
 * @param browser The page.
 * @param letter The pane's letter.
 * @param word What the picture should say.
 * @returns True when the pane's picture says it.
 */
function paneSays(browser: AgentBrowserSession, letter: string, word: string): Promise<boolean> {
	return browser.eval<boolean>(
		`document.querySelector(${JSON.stringify(`${PANE_SECTIONS}[aria-label^="Pane ${letter}"] [data-slot="semantic-board-surface"]`)})?.textContent?.includes(${JSON.stringify(word)}) ?? false`,
	);
}

test("two panes show boards of two repositories, and choosing another checkout in the navigator moves the pane that read the old one", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = createRepositoryFixture();
	resources.defer(() => fixture.dispose());
	const main = fixture.repository("orders", ORDERS);
	const target = join(fixture.root, "orders-feature");
	execFileSync("git", ["worktree", "add", "-q", "-b", "feature", target], {
		cwd: main,
		stdio: "ignore",
	});
	const worktree = realpathSync.native(target);
	// The orders checkout, and the untracked vault the page opens in: it is first by name.
	for (const directory of [main, holderOf(fixture.vault)]) {
		const added = spawnSync(packageBin, ["repo", "add", directory], {
			cwd: fixture.nowhere,
			env: fixture.serverEnvironment,
			encoding: "utf8",
		});
		expect(added.status, added.stderr).toBe(0);
	}
	const server = await startOwnedServer({
		serverPath,
		vault: fixture.vault,
		env: serverTestEnvironment({ ARCHBOARD_REPOS: fixture.registry }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const served = await servedRepository(server.base);
	await seedSemanticBoard(createJsonRequester(server), "ledger");
	// One board of one name in both checkouts, each saying which checkout it is in.
	for (const [checkout, word] of [
		[main, "Main checkout"],
		[worktree, "Feature checkout"],
	] as const) {
		const request = createJsonRequester({ ...server, vault: checkoutVault(checkout) });
		await seedSemanticBoard(request, "payments", {
			nodes: [{ name: word, kind: "service", responsibility: "Says where it is" }],
		});
	}

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?paneA=ledger&paneB=payments&repoB=${ORDERS}&pane=A`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	// Each pane reads its own repository, and the address names both.
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=ledger&repoA=${served}&paneB=payments&repoB=${ORDERS}`,
		"the address to name each pane's repository",
	);
	await pollUntil(
		() => paneSays(browser, "B", "Main checkout"),
		Boolean,
		"the right-hand pane to draw the board of the chosen checkout",
	);

	// The repository's menu lists its checkouts; choosing the worktree moves
	// the pane that read the main checkout, and it keeps its board.
	await browser.run(["click", `button[aria-label="Checkouts of ${ORDERS}"]`]);
	const chose = await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
				const item = [...document.querySelectorAll('[role="menuitemradio"]')]
					.find((one) => one.textContent.includes(${JSON.stringify(worktree)}));
				if (!item) return false;
				item.click();
				return true;
			})()`),
		Boolean,
		"the menu to list the worktree",
	);
	expect(chose).toBe(true);
	await pollUntil(
		() => paneSays(browser, "B", "Feature checkout"),
		Boolean,
		"the right-hand pane to read the chosen checkout",
	);
	expect(await paneSays(browser, "A", "Ingest")).toBe(true);
	expect(await addressSearch(browser)).toBe(
		`paneA=ledger&repoA=${served}&paneB=payments&repoB=${ORDERS}`,
	);
	await server.assertRunning();
}, 45_000);
