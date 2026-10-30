import { expect, test } from "bun:test";
import { realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
} from "../support/timing.ts";
import { createJsonRequester } from "../support/http.ts";
import { prepareProductionFixture } from "../server-state/support/codex-production.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { holderOf, vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	runServerCli,
} from "./support/agent-browser.ts";
import {
	agentSurface,
	productionFixtureRecords,
	workbenchControlOperability,
} from "./support/codex-workbench-production.ts";
import { MODEL_STAGE, seedCanonicalModel } from "./support/canonical-page.ts";
import {
	AGENT_DOCK,
	AGENT_PANEL,
	MODEL_NAME_EXPRESSION,
	COMPOSER,
	PANE_SECTIONS,
	dockFocusOrder,
	openConversation,
} from "./support/shell-dom.ts";
import { productionServer } from "../server-state/support/production-server.ts";

const executableSource = join(import.meta.dir, "../server-state/fixtures/fake-codex-production.ts");

/** The provider page the fixture names for a ChatGPT sign-in. */
const LOGIN_URL = "https://example.test/login";
const MESSAGE = "Check the rendered workbench.";
const SEND = `${AGENT_PANEL} button[aria-label="Send"]`;

interface FixtureRecord {
	readonly kind?: string;
	readonly method?: string;
	readonly args?: readonly string[];
	readonly params?: { readonly threadId?: unknown; readonly input?: unknown };
	readonly result?: { readonly thread?: { readonly id?: unknown } };
	readonly frame?: { readonly id?: unknown; readonly result?: unknown };
}

type Browser = Awaited<ReturnType<typeof createAgentBrowser>>;

/** The pane's canvas, remembered once drawn (the loading stage is replaced) so its identity can be checked at the end. */
function paneCanvas(
	browser: Browser,
): Promise<{ panes: number; board: string | null; drawn: boolean }> {
	return browser.eval(`(() => {
		const canvas = document.querySelector('${PANE_SECTIONS} ${MODEL_STAGE}');
		const drawn = Boolean(canvas?.querySelector('[data-slot="model-diagram"] svg'));
		if (canvas && drawn && !window.__codexTextWorkbenchCanvas) window.__codexTextWorkbenchCanvas = canvas;
		return {
			panes: document.querySelectorAll('${PANE_SECTIONS}').length,
			board: ${MODEL_NAME_EXPRESSION},
			drawn,
		};
	})()`);
}

/** The thread ids Codex answered each thread/start with, oldest first. */
function startedThreads(records: readonly FixtureRecord[]): unknown[] {
	return records
		.filter(({ kind, method }) => kind === "response" && method === "thread/start")
		.map(({ result }) => result?.thread?.id);
}

/** The session's tabs, from agent-browser's machine-readable listing. */
async function browserTabs(
	browser: Browser,
): Promise<{ readonly active: boolean; readonly url: string }[]> {
	const listing = JSON.parse(await browser.run(["--json", "tab", "list"])) as {
		readonly data: { readonly tabs: { readonly active: boolean; readonly url: string }[] };
	};
	return listing.data.tabs;
}

function turnStarts(records: readonly FixtureRecord[]): FixtureRecord[] {
	return records.filter(({ kind, method }) => kind === "frame" && method === "turn/start");
}

test(
	"a message typed while signed out is held through sign-in, delivered, and its approvals decided",
	async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = prepareProductionFixture(resources, executableSource);
		writeFileSync(fixture.controlPath, JSON.stringify({ signedOut: true }));
		const { ownerRoot } = browserTestRoots();
		const vault = vaultIn(join(ownerRoot, "vault"));

		const server = await startOwnedServer({
			...productionServer,
			vault,
			env: serverTestEnvironment({
				ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
				ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
				ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
			}),
		});
		resources.defer(() => server.dispose());
		registerServerBase(server.base);
		const browser = resources.use(await createAgentBrowser());
		const api = createJsonRequester(server);
		const records = () => productionFixtureRecords<FixtureRecord>(fixture);

		await seedCanonicalModel(server.vault, "workbench");
		await browser.run(["open", server.base]);
		// The fake provider page must not depend on external DNS or a failed network navigation.
		await browser.run(["network", "route", LOGIN_URL, "--body", '{"fixture":"sign-in"}']);
		await browser.run(["set", "viewport", "1920", "1080", "1"]);
		expect(await browser.eval<[number, number]>("[innerWidth, innerHeight]")).toEqual([1920, 1080]);
		await pollUntil(
			() => api<{ panes: { paneId: string }[] }>("/api/panes"),
			(result) => result.body.panes.some((pane) => pane.paneId === "A"),
			"the workbench pane registration",
		);
		runServerCli(server, ["browser", "show", "workbench", "--pane", "primary"]);
		await pollUntil(
			() => paneCanvas(browser),
			(value) => value.panes === 1 && value.board === "workbench" && value.drawn,
			"the seeded board to draw in the one pane",
		);
		await browser.run(["console", "--clear"]);
		await browser.run(["errors", "--clear"]);

		// Signed out, the dock offers sign-in before anything is sent.
		await pollUntil(
			() => agentSurface(browser),
			(surface) => surface.dockButtons.includes("Sign in with ChatGPT"),
			"the signed-out agent to offer sign-in",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		// The keyboard reads the calm dock as the eye does: sign-in above, then the keys at its foot.
		const signInOrder = await dockFocusOrder(browser);
		expect(signInOrder.tabbed).toEqual(signInOrder.seen);
		// The composer is at the foot of the conversation, which opens through its toggle.
		await openConversation(browser);
		await pollUntil(
			() => browser.eval<boolean>(`document.querySelector('${COMPOSER}') !== null`),
			Boolean,
			"the composer to show at the foot of the conversation",
		);
		await browser.eval<boolean>(
			`(() => { const input = document.querySelector('${COMPOSER}'); input?.focus(); return document.activeElement === input; })()`,
		);
		// A person types into a field the page has drawn. Chrome leaves the caret before a key
		// typed into the conversation before its first frame, so the burst waits for one.
		await browser.eval<boolean>(
			"new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
		);
		await browser.run(["keyboard", "type", MESSAGE]);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					`document.querySelector('${COMPOSER}')?.value === ${JSON.stringify(MESSAGE)} && document.querySelector('${SEND}')?.disabled === false`,
				),
			Boolean,
			"the filled composer to enable Send",
		);
		for (const scale of ["1", "2"]) {
			await browser.run(["set", "viewport", "1920", "1080", scale]);
			expect(await workbenchControlOperability(browser, SEND)).toMatchObject({
				clipped: false,
				centerHit: true,
				operable: true,
			});
		}
		await browser.run(["set", "viewport", "1920", "1080", "1"]);
		await browser.eval<boolean>(
			`(() => { document.querySelector('${COMPOSER}')?.focus(); return true; })()`,
		);
		await browser.run(["press", "Enter"]);

		// The gesture opened the provider's page in its own tab; close it and read the canvas again.
		const provider = await pollUntil(
			() => browserTabs(browser),
			(tabs) => tabs.some(({ url }) => url === LOGIN_URL),
			"the send gesture's tab to open the provider's sign-in page",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(provider.find(({ active }) => active)?.url).toBe(LOGIN_URL);
		await browser.run(["tab", "close"]);
		expect(
			(await browserTabs(browser)).map(({ active, url }) => active && url.startsWith(server.base)),
		).toEqual([true]);

		// The message waits on the sign-in it started; nothing reaches a thread yet.
		const pending = await pollUntil(
			() => agentSurface(browser),
			(surface) =>
				surface.panelOpen &&
				surface.held.length === 1 &&
				surface.held[0]?.state === "waiting" &&
				surface.dockLinks.includes(LOGIN_URL),
			"the held message to wait on a pending sign-in",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(pending.held[0]?.text).toContain(MESSAGE);
		expect(pending.tone).toBe("attention");
		expect(pending.dockButtons).toContain("Cancel");
		expect(await browser.eval<string>(`document.querySelector('${COMPOSER}').value`)).toBe("");
		expect(startedThreads(records())).toEqual([]);
		expect(turnStarts(records())).toEqual([]);

		// Completing the sign-in delivers the held message with no further gesture.
		writeFileSync(fixture.controlPath, JSON.stringify({ completeLogin: true }));
		const delivered = await pollUntil(
			() => agentSurface(browser),
			(surface) =>
				surface.held.length === 0 && surface.prompts.some((text) => text.includes(MESSAGE)),
			"the held message to become the conversation's prompt",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(delivered.prompts).toHaveLength(1);
		const turns = turnStarts(records());
		expect(turns).toHaveLength(1);
		expect(JSON.stringify(turns[0]?.params?.input)).toContain(MESSAGE);
		const workhorse = turns[0]?.params?.threadId;
		expect(startedThreads(records()).filter((id) => id === workhorse)).toHaveLength(1);

		// Both approvals the turn raises wait at the conversation's foot, each with the model's decisions.
		const asked = await pollUntil(
			() => agentSurface(browser),
			(surface) => surface.cards.length === 2 && surface.cards.every(({ busy }) => !busy),
			"the ordinary and coordination approval cards",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		const [ordinary, coordination] = asked.cards;
		expect(ordinary?.details).toContain("bun test");
		expect(ordinary?.details).toContain("Prove the production approval route.");
		// The command's availableDecisions: accept, decline, cancel.
		expect(ordinary?.decisions).toHaveLength(3);
		expect(ordinary?.decisions).toContain("Decline");
		expect(coordination?.details).toContain("Create the production proof thread.");
		expect(coordination?.decisions).toHaveLength(2);
		expect(coordination?.decisions).toContain("Decline");
		for (const card of asked.cards) {
			expect(card.top).toBeGreaterThanOrEqual(asked.promptBottom ?? Number.POSITIVE_INFINITY);
		}
		expect(asked.tone).toBe("attention");
		expect(asked.dockButtons).toContain("Review");
		// The status line's control is read before the keys under it, by the keyboard as by the eye.
		const askedOrder = await dockFocusOrder(browser);
		expect(askedOrder.tabbed).toEqual(askedOrder.seen);

		expect(
			await browser.eval<boolean>(`(() => {
				const card = document.querySelector('${AGENT_PANEL} article[data-slot="approval"]');
				const decline = [...(card?.querySelectorAll('button') ?? [])].find(node => node.textContent.trim() === 'Decline');
				decline?.click();
				return decline !== undefined;
			})()`),
		).toBe(true);
		const settled = await pollUntil(
			async () => ({
				surface: await agentSurface(browser),
				response: records().find(
					({ frame, kind }) => kind === "reverse_response" && frame?.id === "ordinary-request-1",
				),
			}),
			({ surface, response }) => response !== undefined && surface.cards.length === 1,
			"the ordinary decline to settle",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(settled.response?.frame?.result).toEqual({ decision: "decline" });
		expect(settled.surface.cards[0]).toMatchObject({
			busy: false,
			details: coordination?.details,
			decisions: coordination?.decisions,
		});

		// The pane kept its canvas through the whole flow.
		expect(
			await browser.eval<boolean>(`(() => {
				const canvas = document.querySelector('${PANE_SECTIONS} ${MODEL_STAGE}');
				return canvas === window.__codexTextWorkbenchCanvas &&
					Boolean(canvas?.querySelector('[data-slot="model-diagram"] svg'));
			})()`),
		).toBe(true);

		const all = records();
		const versionProbes = all.filter(({ kind }) => kind === "version_probe");
		expect(versionProbes).toHaveLength(2);
		expect(versionProbes.every(({ args }) => args?.length === 1 && args[0] === "--version")).toBe(
			true,
		);
		expect(all.filter(({ kind }) => kind === "app_server_spawn")).toHaveLength(1);
		expect(all.some(({ kind }) => kind === "fixture_error")).toBe(false);
		expect(await browser.run(["console"])).toBe("");
		expect(await browser.run(["errors"])).toBe("");
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
);

/** The dock's list of the tab's workhorses: each checkout, and whether it is the one shown. */
function conversationList(browser: Browser): Promise<{ checkout: string; shown: boolean }[]> {
	return browser.eval(`[...document.querySelectorAll('${AGENT_DOCK} [aria-label="Conversations"] button')]
		.map(node => ({ checkout: node.title, shown: node.getAttribute('aria-pressed') === 'true' }))`);
}

/** Type a message into the open conversation and send it with Enter. */
async function sendMessage(browser: Browser, text: string): Promise<void> {
	await openConversation(browser);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const input = document.querySelector('${COMPOSER}'); input?.focus(); return document.activeElement === input; })()`,
			),
		Boolean,
		"the composer to take the keyboard",
	);
	await browser.eval<boolean>(
		"new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
	);
	await browser.run(["keyboard", "type", text]);
	await browser.run(["press", "Enter"]);
}

// The shown conversation (ADR 0050, TASK-472.11), as a person meets it: the dock shows the
// conversation of the checkout whose pane they last focused, an agent's show of that pane changes
// nothing, and the dock's list picks another conversation by keyboard.
test(
	"the dock follows the pane the person focuses, not an agent's show, and its list picks a conversation",
	async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = prepareProductionFixture(resources, executableSource);
		const { ownerRoot } = browserTestRoots();
		const shopVault = vaultIn(join(ownerRoot, "shop"));
		const ordersVault = vaultIn(join(ownerRoot, "orders"));
		const shop = realpathSync(holderOf(shopVault));
		const orders = realpathSync(holderOf(ordersVault));
		const server = await startOwnedServer({
			...productionServer,
			vault: shopVault,
			env: serverTestEnvironment({
				ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
				ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
				ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
			}),
		});
		resources.defer(() => server.dispose());
		registerServerBase(server.base);
		await seedCanonicalModel(shopVault, "storefront");
		await seedCanonicalModel(ordersVault, "ledger");
		const browser = resources.use(await createAgentBrowser());
		await browser.run(["open", server.base]);
		await browser.run(["set", "viewport", "1920", "1080", "1"]);
		await pollUntil(
			() => createJsonRequester(server)<{ panes: { paneId: string }[] }>("/api/panes"),
			(result) => result.body.panes.some((pane) => pane.paneId === "A"),
			"the first pane registration",
		);
		runServerCli(server, ["browser", "show", "storefront", "--pane", "primary"]);
		expect(
			await browser.eval<boolean>(
				`(() => { const add = document.querySelector('button[aria-label="Open a second pane"]'); add?.click(); return add !== null; })()`,
			),
		).toBe(true);
		await pollUntil(
			() => browser.eval<number>(`document.querySelectorAll('${PANE_SECTIONS}').length`),
			(count) => count === 2,
			"the second pane to open",
		);
		await pollUntil(
			() => createJsonRequester(server)<{ panes: { paneId: string }[] }>("/api/panes"),
			(result) => result.body.panes.some((pane) => pane.paneId === "B"),
			"the second pane registration before addressing it",
		);
		runServerCli(server, [
			"-C",
			holderOf(ordersVault),
			"browser",
			"show",
			"ledger",
			"--pane",
			"right",
		]);

		// The tab shows the first pane's checkout, so a message goes to the shop's workhorse.
		await sendMessage(browser, MESSAGE);
		await pollUntil(
			() => agentSurface(browser),
			(surface) => surface.prompts.some((text) => text.includes(MESSAGE)),
			"the message to become the shop conversation's prompt",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);

		// Opening the second pane focused it without activating it. Focusing the shop pane and then
		// the orders pane shows the orders conversation, and the list offers both.
		await browser.run(["click", `${PANE_SECTIONS}:first-of-type ${MODEL_STAGE}`]);
		await browser.run(["click", `${PANE_SECTIONS}:last-of-type ${MODEL_STAGE}`]);
		await pollUntil(
			() => conversationList(browser),
			(list) =>
				list.some(({ checkout, shown }) => checkout === orders && shown) && list.length === 2,
			"the dock to show the orders conversation and list both",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect((await agentSurface(browser)).prompts.some((text) => text.includes(MESSAGE))).toBe(
			false,
		);

		// An agent's show moves the focused pane into the shop, and the dock stays where the person put it.
		runServerCli(server, ["browser", "show", "storefront", "--pane", "focused"]);
		await pollUntil(
			() => browser.eval<string | null>(MODEL_NAME_EXPRESSION),
			(name) => name === "storefront",
			"the agent's show to reach the focused pane",
		);
		expect((await conversationList(browser)).find(({ shown }) => shown)?.checkout).toBe(orders);

		// A pick by keyboard shows the shop conversation again: an arrow moves from the shown one to
		// the other, and Enter picks it. The orders checkout has no workhorse and is no longer shown,
		// so the list then has nothing left to offer.
		await browser.run([
			"focus",
			`${AGENT_DOCK} [aria-label="Conversations"] button[title="${orders}"]`,
		]);
		await browser.run(["press", "ArrowDown"]);
		expect(
			await browser.eval<string | null>("document.activeElement?.getAttribute('title') ?? null"),
		).toBe(shop);
		await browser.run(["press", "Enter"]);
		await pollUntil(
			async () => ({ list: await conversationList(browser), surface: await agentSurface(browser) }),
			({ list, surface }) =>
				list.length === 0 && surface.prompts.some((text) => text.includes(MESSAGE)),
			"the pick to show the shop conversation",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		// Opening a repository is the person's act. Its pane, capture and conversation move together.
		await browser.run(["click", '[data-slot="repository-model-open"][title="Open ledger"]']);
		await pollUntil(
			() => conversationList(browser),
			(list) => list.some(({ checkout, shown }) => checkout === orders && shown),
			"the human repository open to activate its conversation",
			{ timeoutMs: 10_000 },
		);
		const placed = await pollUntil(
			() =>
				createJsonRequester(server)<{
					panes: { paneId: string; vault: string; architecture?: { vault: string } }[];
				}>("/api/panes"),
			(result) =>
				result.body.panes.some(
					(pane) => pane.paneId === "B" && pane.architecture?.vault === ordersVault,
				),
			"the foreign model capture in the addressed pane",
			{ timeoutMs: 10_000 },
		);
		expect(placed.body.panes.find((pane) => pane.paneId === "B")?.vault).toBe(ordersVault);
		expect(placed.body.panes.find((pane) => pane.paneId === "A")?.vault).toBe(shopVault);
		await browser.run(["reload"]);
		const restored = await pollUntil(
			() =>
				createJsonRequester(server)<{
					panes: { paneId: string; vault: string; architecture?: { vault: string } }[];
				}>("/api/panes"),
			(result) =>
				result.body.panes.some(
					(pane) => pane.paneId === "A" && pane.architecture?.vault === shopVault,
				) &&
				result.body.panes.some(
					(pane) => pane.paneId === "B" && pane.architecture?.vault === ordersVault,
				),
			"both restored pane connections to match their repository readings",
			{ timeoutMs: 10_000 },
		);
		expect(restored.body.panes.find((pane) => pane.paneId === "A")?.vault).toBe(shopVault);
		expect(restored.body.panes.find((pane) => pane.paneId === "B")?.vault).toBe(ordersVault);
		expect(await browser.run(["errors"])).toBe("");
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
);
