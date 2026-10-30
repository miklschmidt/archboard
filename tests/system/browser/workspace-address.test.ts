import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { packageBin } from "../cli/support/package-cli.ts";
import { createRepositoryFixture } from "../cli/support/repository-fixture.ts";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { holderOf, vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	runServerCli,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import {
	seedCanonicalModel,
	editCanonicalModel,
	openModelSidebar,
} from "./support/canonical-page.ts";
import { initializeSource } from "./support/canonical-model.ts";
import { serverPath, servedRepository, type PanesBody } from "./support/navigator-support.ts";
import { PANE_SECTIONS } from "./support/shell-dom.ts";

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

test("canonical workspace history preserves pane identity and isolates proposal choices", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "workspace-model");
	const vault = vaultIn(root);
	const model = await seedCanonicalModel(vault, "Payments", {
		nodes: [
			{ name: "Gateway", kind: "module" },
			{ name: "Handler", kind: "module", parent: "Gateway" },
			{ name: "Worker", kind: "module" },
		],
	});
	const id = (name: string): string => model.modules.find((module) => module.name === name)!.id;
	initializeSource(root);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const proposal = await editCanonicalModel(
		request,
		vault,
		"workspace-proposal",
		[{ type: "edit-module", subject: id("Gateway"), set: { name: "Queued gateway" } }],
		{ proposal: { type: "create", name: "Queued ingest", summary: "Queue accepted work" } },
	);
	const repo = await servedRepository(server.base);
	const browser = resources.use(await createAgentBrowser());
	const search = new URLSearchParams({
		modelA: model.manifest.id,
		scopeA: id("Worker"),
		modelB: model.manifest.id,
		scopeB: id("Gateway"),
		pane: "B",
	});
	await browser.run(["open", `${server.base}/?${search}`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	const panes = panesOf(request);
	const restored = await pollUntil(
		panes,
		(state) =>
			state.paneCount === 2 &&
			state.panes.some((pane) => pane.architecture?.reading.scope === id("Worker")) &&
			state.panes.some((pane) => pane.architecture?.reading.scope === id("Gateway")),
		"both addressed canonical panes",
	);
	const settled = await pollUntil(
		() => addressSearch(browser),
		(value) => {
			const fields = new URLSearchParams(value);
			return fields.get("repoA") === repo && fields.get("repoB") === repo;
		},
		"both addressed repositories",
	);
	const paneB = restored.panes.find((pane) => pane.paneId === "B")!;
	await openModelSidebar(browser, "board", '[data-pane="B"]');
	const before = await historyLength(browser);
	await browser.run([
		"click",
		'[data-pane="B"] [data-slot="model-breadcrumbs"] [data-scope-id=""]',
	]);
	await pollUntil(
		() => addressSearch(browser),
		(value) => !new URLSearchParams(value).has("scopeB"),
		"the root reading in browser history",
	);
	expect(await historyLength(browser)).toBe(before + 1);

	// An agent replaces the visible location without adding a user history entry.
	runServerCli(server, [
		"browser",
		"show",
		model.manifest.id,
		"--pane",
		paneB.clientId,
		"--scope",
		id("Worker"),
	]);
	await pollUntil(
		() => addressSearch(browser),
		(value) => new URLSearchParams(value).get("scopeB") === id("Worker"),
		"the agent-addressed scope",
	);
	expect(await historyLength(browser)).toBe(before + 1);
	await goBack(browser, settled);
	await pollUntil(
		panes,
		(state) =>
			state.panes.find((pane) => pane.clientId === paneB.clientId)?.architecture?.reading.scope ===
			id("Gateway"),
		"Back restoring the prior scope",
	);
	expect((await panes()).panes.map((pane) => pane.clientId).toSorted()).toEqual(
		restored.panes.map((pane) => pane.clientId).toSorted(),
	);

	// Choosing a state belongs to the pane whose control the reader uses.
	await browser.run(["click", '[data-pane="A"] [data-slot="pane-header"] h2']);
	await browser.run(["click", '[data-pane="B"] [data-slot="model-reading-selector"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
			const item = document.querySelector('[data-state-id="${proposal.target.state}"]');
			if (!item) return false;
			const box = item.getBoundingClientRect();
			return box.height > 0 && item.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
		})()`),
		Boolean,
		"the selected pane proposal choice to become clickable",
	);
	await browser.run(["click", `[data-state-id="${proposal.target.state}"]`]);
	const chosen = await pollUntil(
		() => addressSearch(browser),
		(value) => new URLSearchParams(value).get("stateB") === proposal.target.state,
		"the right pane proposal",
	);
	const fields = new URLSearchParams(chosen);
	expect(fields.get("stateA")).toBeNull();
	expect(fields.get("scopeA")).toBe(id("Worker"));
	expect(fields.get("pane")).toBe("B");
	await pollUntil(
		panes,
		(state) =>
			state.panes.find((pane) => pane.paneId === "B")?.architecture?.selection?.state ===
			proposal.target.state,
		"the selected proposal in the pane report",
	);
	await server.assertRunning();
}, 45_000);

/** The repository identity whose two checkouts the next owner chooses between. */
const ORDERS = "github.com/acme/orders";

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

test("choosing a checkout refreshes its canonical pane and preserves the other repository", async () => {
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
	const ledger = await seedCanonicalModel(fixture.vault, "Ledger");
	const mainVault = vaultIn(main);
	const payments = await seedCanonicalModel(mainVault, "Payments", {
		nodes: [{ name: "Main checkout", kind: "service", responsibility: "Says where it is" }],
	});
	const featureVault = vaultIn(worktree);
	cpSync(mainVault, featureVault, { recursive: true });
	const modulePath = join(featureVault, "module-0.module.json");
	const module = JSON.parse(readFileSync(modulePath, "utf8"));
	module.name = "Feature checkout";
	writeFileSync(modulePath, JSON.stringify(module));

	const browser = resources.use(await createAgentBrowser());
	await browser.run([
		"open",
		`${server.base}/?modelA=${ledger.manifest.id}&modelB=${payments.manifest.id}&repoB=${ORDERS}&pane=A`,
	]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	// Each pane reads its own repository, and the address names both.
	await pollUntil(
		() => addressSearch(browser),
		(search) => {
			const fields = new URLSearchParams(search);
			return (
				fields.get("repoA") === served &&
				fields.get("repoB") === ORDERS &&
				fields.get("modelA") === ledger.manifest.id &&
				fields.get("modelB") === payments.manifest.id
			);
		},
		"the address to name each pane's repository",
	);
	await pollUntil(
		() => paneSays(browser, "B", "Main checkout"),
		Boolean,
		"the right-hand pane to draw the board of the chosen checkout",
	);

	const before = await addressSearch(browser);
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
	expect(await addressSearch(browser)).toBe(before);
	await server.assertRunning();
}, 45_000);
