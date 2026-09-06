import { EXCALIDRAW_APP_EXPRESSION } from "./support/page-scene.ts";
import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { prepareProductionFixture } from "../canvas-state/support/codex-production.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	runCanvasCli,
} from "./support/agent-browser.ts";
import {
	productionFixtureRecords,
	workbenchControlOperability,
} from "./support/codex-workbench-production.ts";
import {
	agentSettingsOpen,
	assertCoordinatorSettingsLayout,
	assertSignedOutAccount,
	openAgentSettings,
} from "./support/coordinator-settings-layout.ts";
import { seedBoard } from "./support/fullscreen-presentation.ts";
import { roleAction } from "./support/opener-settings-interaction.ts";
import { BOARD_NAME_EXPRESSION, PANE_SECTIONS, PANE_TABS, clickTab } from "./support/shell-dom.ts";

const serverPath = join(import.meta.dir, "../canvas-state/fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "../canvas-state/fixtures/fake-codex-production.ts");

interface FixtureRecord {
	readonly kind?: string;
	readonly args?: readonly string[];
	readonly frame?: { readonly id?: unknown; readonly result?: unknown };
}

/** One approval card as a person reads it: its family badge, its phase and its words. */
interface ApprovalCardSnapshot {
	readonly family: string | null;
	readonly busy: boolean;
	readonly text: string;
	readonly decisions: string[];
}

interface InitialRenderSnapshot {
	readonly hasCanvas: boolean;
	readonly paneCount: number;
	readonly board: string | null;
	readonly elementCount: number;
}

/** The workbench's approval cards, from the Approvals tab. */
const APPROVAL_CARDS = `[...document.querySelectorAll('section[aria-label="Agent workbench"] article')]
	.map(card => ({
		family: card.querySelector('header span')?.textContent?.trim() ?? null,
		busy: card.getAttribute('aria-busy') === 'true',
		text: card.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
		decisions: [...card.querySelectorAll('button')].map(node => node.textContent.trim()),
	}))`;

async function initialRender(
	browser: Awaited<ReturnType<typeof createAgentBrowser>>,
): Promise<InitialRenderSnapshot> {
	return browser.eval<InitialRenderSnapshot>(`(() => {
			const canvas = document.querySelector('${PANE_SECTIONS} .excalidraw');
			if (canvas) window.__codexTextWorkbenchCanvas = canvas;
			return {
				hasCanvas: !!canvas,
				paneCount: document.querySelectorAll('${PANE_TABS}').length,
				board: ${BOARD_NAME_EXPRESSION},
				elementCount: (${EXCALIDRAW_APP_EXPRESSION})?.scene.getElementsIncludingDeleted().filter(element => !element.isDeleted).length ?? 0,
			};
		})()`);
}

function approvalCards(
	browser: Awaited<ReturnType<typeof createAgentBrowser>>,
): Promise<ApprovalCardSnapshot[]> {
	return browser.eval<ApprovalCardSnapshot[]>(APPROVAL_CARDS);
}

/**
 * Whether the workbench dock is expanded; expand it when it is not.
 * @param browser The page.
 */
async function ensureDockExpanded(
	browser: Awaited<ReturnType<typeof createAgentBrowser>>,
): Promise<void> {
	const expanded = () =>
		browser.eval<boolean>(
			"document.querySelector('button[aria-label=\"Collapse workbench\"], button[aria-label=\"Expand workbench\"]')?.getAttribute('aria-expanded') === 'true'",
		);
	if (!(await expanded())) {
		await roleAction(browser, "button", "Expand workbench");
	}
	await pollUntil(expanded, Boolean, "the integrated workbench to expand");
}

test(
	"the production text workbench reaches its rendered browser controls",
	async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = prepareProductionFixture(resources, executableSource);
		writeFileSync(fixture.controlPath, JSON.stringify({ signedOut: true }));
		const { ownerRoot } = browserTestRoots();
		const vault = join(ownerRoot, "vault");
		mkdirSync(vault, { recursive: true });

		const canvas = await startOwnedCanvas({
			serverPath,
			vault,
			env: canvasTestEnvironment({
				ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
				ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
				ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
			}),
		});
		resources.defer(() => canvas.dispose());
		registerCanvasBase(canvas.base);
		const browser = resources.use(await createAgentBrowser());
		const api = createJsonRequester(canvas);

		await seedBoard(api, "workbench", "wb1");
		await browser.run(["open", canvas.base]);
		await browser.run(["set", "viewport", "1920", "1080", "1"]);
		expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
		expect(await browser.eval<[number, number]>("[innerWidth, innerHeight]")).toEqual([1920, 1080]);
		await pollUntil(
			() => initialRender(browser),
			(value) => value.hasCanvas && value.paneCount === 1,
			"the initial one-pane canvas shell",
		);
		runCanvasCli(canvas.base, vault, ["browser", "show", "workbench", "--pane", "primary"]);
		await pollUntil(
			() => initialRender(browser),
			(value) =>
				value.hasCanvas &&
				value.paneCount === 1 &&
				value.board === "workbench" &&
				value.elementCount === 1,
			"the seeded canvas and one-pane workbench to render",
		);

		await browser.run(["console", "--clear"]);
		await browser.run(["errors", "--clear"]);
		await ensureDockExpanded(browser);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					"document.querySelector('section[aria-label=\"Agent workbench\"]') !== null",
				),
			Boolean,
			"the agent workbench to mount in the dock",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		await openAgentSettings(browser);
		await assertSignedOutAccount(browser);
		await roleAction(browser, "button", "Sign in");
		const login = await pollUntil(
			() =>
				browser.eval<{ href: string | null; text: string; badge: string | null }>(`(() => {
					const dialog = [...document.querySelectorAll('[role="dialog"]')].find(node => /Agent settings/.test(node.textContent));
					const heading = [...(dialog?.querySelectorAll('h3') ?? [])].find(node => /^Account/.test(node.textContent.trim()));
					const section = heading?.closest('section');
					return {
						href: [...(section?.querySelectorAll('a') ?? [])].find(node => /sign-in page/.test(node.textContent))?.getAttribute('href') ?? null,
						text: dialog?.textContent ?? '',
						badge: heading?.querySelector('span')?.textContent?.trim() ?? null,
					};
				})()`),
			(value) => value.badge === "Signing in" && value.href !== null,
			"ChatGPT sign-in to become pending",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(login.href).toBe("https://example.test/login");
		expect(login.text).toContain("Cancel sign-in");
		expect(login.text).not.toContain("login completed");
		writeFileSync(fixture.controlPath, JSON.stringify({ completeLogin: true }));
		await pollUntil(
			() =>
				browser.eval<string | null>(`(() => {
					const dialog = [...document.querySelectorAll('[role="dialog"]')].find(node => /Agent settings/.test(node.textContent));
					const heading = [...(dialog?.querySelectorAll('h3') ?? [])].find(node => /^Account/.test(node.textContent.trim()));
					return heading?.querySelector('span')?.textContent?.trim() ?? null;
				})()`),
			(badge) => badge === "Signed in",
			"the completed login to read as signed in",
			{ timeoutMs: 5_000 },
		);
		// The dialog reads the coordinator state the model publishes; the fake's is ready.
		await assertCoordinatorSettingsLayout(browser, "ready");
		await browser.run(["press", "Escape"]);
		await pollUntil(
			async () =>
				!(await agentSettingsOpen(browser)) &&
				(await browser.eval<boolean>(
					"document.activeElement?.getAttribute('aria-label') === 'Settings'",
				)),
			Boolean,
			"Escape to close Agent settings and restore focus to Settings",
		);

		// A fresh workhorse thread from the workbench's own strip, then the composer.
		await pollUntil(
			() =>
				browser.eval<boolean>(`[...document.querySelectorAll('section[aria-label="Agent workbench"] button')]
					.some(button => button.textContent?.trim() === 'Link new thread' && !button.disabled)`),
			Boolean,
			"the workhorse creation control to become enabled",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		await roleAction(browser, "button", "Link new thread");
		await pollUntil(
			() =>
				browser.eval<boolean>(
					`document.querySelector('textarea[aria-label="Message input"]') instanceof HTMLTextAreaElement`,
				),
			Boolean,
			"the linked workhorse to open the composer",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		// The thread re-renders as it links; type only once the composer holds focus.
		await pollUntil(
			() =>
				browser.eval<boolean>(
					`(() => { const input = document.querySelector('textarea[aria-label="Message input"]'); if (!input) return false; if (document.activeElement !== input) input.focus(); return document.activeElement === input; })()`,
				),
			Boolean,
			"the composer to take focus",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		await browser.run(["keyboard", "type", "Check the rendered workbench."]);
		await pollUntil(
			() =>
				browser.eval<{ disabled: boolean | null; value: string }>(`(() => {
					const input = document.querySelector('textarea[aria-label="Message input"]');
					const send = document.querySelector('button[aria-label="Send message"]');
					return {
						disabled: send instanceof HTMLButtonElement ? send.disabled : null,
						value: input instanceof HTMLTextAreaElement ? input.value : '',
						inputDisabled: input instanceof HTMLTextAreaElement ? input.disabled || input.readOnly : null,
						focused: document.activeElement?.tagName ?? null,
						strip: document.querySelector('section[aria-label="Session state"]')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 240) ?? null,
					};
				})()`),
			(value) => value.value === "Check the rendered workbench." && value.disabled === false,
			"the filled composer to enable Send",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		const desktopSend = await workbenchControlOperability(
			browser,
			'button[aria-label="Send message"]',
		);
		expect(desktopSend).toMatchObject({ clipped: false, centerHit: true, operable: true });
		await browser.run(["set", "viewport", "1920", "1080", "2"]);
		expect(
			await workbenchControlOperability(browser, 'button[aria-label="Send message"]'),
		).toMatchObject({ clipped: false, centerHit: true, operable: true });
		await browser.run(["set", "viewport", "1920", "1080", "1"]);
		await roleAction(browser, "button", "Send message");

		expect(await clickTab(browser, "Approvals")).toBe(true);
		const pending = await pollUntil(
			() => approvalCards(browser),
			(cards) => cards.length === 2 && cards.every(({ busy }) => !busy),
			"the ordinary and dynamic approval cards",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(pending.map(({ family }) => family)).toEqual(["Command", "Coordination"]);
		expect(pending[1]?.text).toContain("Create thread");
		expect(pending[0]?.text).toContain("bun test");
		expect(pending[0]?.text).toContain("Prove the production approval route.");
		expect(pending[0]?.decisions).toContain("Decline");
		expect(pending[1]?.text).toContain("Create the production proof thread.");
		expect(pending[1]?.decisions).toEqual(["Approve", "Decline"]);

		await pollUntil(
			() =>
				browser.eval<boolean>(`[...document.querySelectorAll('section[aria-label="Agent workbench"] article button')]
					.some(button => button.textContent?.trim() === 'Decline' && !button.disabled)`),
			Boolean,
			"the ordinary Decline action to receive fresh command authority",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		await browser.eval<boolean>(`(() => {
			const card = document.querySelector('section[aria-label="Agent workbench"] article');
			const decline = [...(card?.querySelectorAll('button') ?? [])].find(node => node.textContent.trim() === 'Decline');
			decline?.click();
			return !!decline;
		})()`);
		const settled = await pollUntil(
			async () => ({
				cards: await approvalCards(browser),
				response: productionFixtureRecords<FixtureRecord>(fixture).find(
					({ frame, kind }) => kind === "reverse_response" && frame?.id === "ordinary-request-1",
				),
			}),
			({ cards, response }) =>
				response !== undefined && cards.length === 1 && cards[0]?.family === "Coordination",
			"the rendered ordinary decision to settle authoritatively",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(settled.response?.frame?.result).toEqual({ decision: "decline" });
		expect(settled.cards[0]).toMatchObject({ family: "Coordination", busy: false });
		expect(
			await browser.eval<boolean>(`(() => {
			const canvas = document.querySelector('${PANE_SECTIONS} .excalidraw');
			return canvas === window.__codexTextWorkbenchCanvas &&
				(${EXCALIDRAW_APP_EXPRESSION})?.scene.getElementsIncludingDeleted().filter(element => !element.isDeleted).length === 1;
		})()`),
		).toBe(true);

		const records = productionFixtureRecords<FixtureRecord>(fixture);
		const versionProbes = records.filter(({ kind }) => kind === "version_probe");
		expect(versionProbes).toHaveLength(2);
		expect(versionProbes.every(({ args }) => args?.length === 1 && args[0] === "--version")).toBe(
			true,
		);
		expect(records.filter(({ kind }) => kind === "app_server_spawn")).toHaveLength(1);
		expect(records.some(({ kind }) => kind === "fixture_error")).toBe(false);
		expect(await browser.run(["console"])).toBe("");
		expect(await browser.run(["errors"])).toBe("");
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
);
