import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
} from "../support/timing.ts";
import { createJsonRequester } from "../support/http.ts";
import { prepareProductionFixture } from "../server-state/support/codex-production.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	runServerCli,
} from "./support/agent-browser.ts";
import {
	productionFixtureRecords,
	workbenchControlOperability,
} from "./support/codex-workbench-production.ts";
import { SEMANTIC_STAGE, seedSemanticBoard } from "./support/semantic-page.ts";
import {
	AGENT_DOCK,
	AGENT_PANEL,
	BOARD_NAME_EXPRESSION,
	COMPOSER,
	PANE_SECTIONS,
	dockFocusOrder,
	openConversation,
} from "./support/shell-dom.ts";

const serverPath = join(import.meta.dir, "../server-state/fixtures/codex-production-server.ts");
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

/** What the agent dock and the conversation show, read through their hooks. */
interface AgentSurface {
	/** How the dock lights the agent's state: quiet, working, attention or failed. */
	readonly tone: string | null;
	readonly panelOpen: boolean;
	readonly held: { readonly state: string | null; readonly text: string }[];
	readonly prompts: string[];
	/** Links and buttons the dock offers, by href or accessible name. */
	readonly dockLinks: (string | null)[];
	readonly dockButtons: string[];
	readonly cards: {
		readonly busy: boolean;
		readonly details: string;
		readonly decisions: string[];
		readonly top: number;
	}[];
	/** The bottom edge of the conversation's last prompt, for the cards' place. */
	readonly promptBottom: number | null;
}

function agentSurface(browser: Browser): Promise<AgentSurface> {
	return browser.eval<AgentSurface>(`(() => {
		const panel = document.querySelector('${AGENT_PANEL}');
		const dock = document.querySelector('${AGENT_DOCK}');
		const named = node => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim();
		const prompts = [...(panel?.querySelectorAll('[data-slot="prompt"]') ?? [])];
		return {
			tone: dock?.getAttribute('data-agent-tone') ?? null,
			panelOpen: panel !== null,
			held: [...(panel?.querySelectorAll('[data-slot="held-prompt"]') ?? [])].map(node => ({
				state: node.getAttribute('data-state'),
				text: node.textContent ?? '',
			})),
			prompts: prompts.map(node => node.textContent ?? ''),
			dockLinks: [...(dock?.querySelectorAll('a') ?? [])].map(node => node.getAttribute('href')),
			dockButtons: [...(dock?.querySelectorAll('button') ?? [])].map(named),
			cards: [...(panel?.querySelectorAll('article[data-slot="approval"]') ?? [])].map(card => ({
				busy: card.getAttribute('aria-busy') === 'true',
				details: [...card.querySelectorAll('dd')].map(node => node.textContent).join('\\n'),
				decisions: [...card.querySelectorAll('button')].map(named),
				top: card.getBoundingClientRect().top,
			})),
			promptBottom: prompts.at(-1)?.getBoundingClientRect().bottom ?? null,
		};
	})()`);
}

/** The pane's canvas, remembered on first sight so its identity can be checked at the end. */
function paneCanvas(
	browser: Browser,
): Promise<{ panes: number; board: string | null; drawn: boolean }> {
	return browser.eval(`(() => {
		const canvas = document.querySelector('${PANE_SECTIONS} ${SEMANTIC_STAGE}');
		if (canvas && !window.__codexTextWorkbenchCanvas) window.__codexTextWorkbenchCanvas = canvas;
		return {
			panes: document.querySelectorAll('${PANE_SECTIONS}').length,
			board: ${BOARD_NAME_EXPRESSION},
			drawn: canvas?.getAttribute('data-state') === 'drawn',
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
		mkdirSync(vault, { recursive: true });

		const server = await startOwnedServer({
			serverPath,
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

		await seedSemanticBoard(api, "workbench");
		await browser.run(["open", server.base]);
		await browser.run(["set", "viewport", "1920", "1080", "1"]);
		expect(await browser.eval<[number, number]>("[innerWidth, innerHeight]")).toEqual([1920, 1080]);
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
				const canvas = document.querySelector('${PANE_SECTIONS} ${SEMANTIC_STAGE}');
				return canvas === window.__codexTextWorkbenchCanvas &&
					canvas?.getAttribute('data-state') === 'drawn';
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
