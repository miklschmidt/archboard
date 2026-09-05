import { EXCALIDRAW_APP_EXPRESSION } from "./support/page-scene.ts";
import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
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
import { seedBoard } from "./support/fullscreen-presentation.ts";
import { fillLabel, roleAction } from "./support/opener-settings-interaction.ts";

const serverPath = join(import.meta.dir, "../canvas-state/fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "../canvas-state/fixtures/fake-codex-production.ts");

interface FixtureRecord {
	readonly kind?: string;
	readonly args?: readonly string[];
	readonly frame?: { readonly id?: unknown; readonly result?: unknown };
}

interface ApprovalCardSnapshot {
	readonly kind: string | null;
	readonly family: string | null;
	readonly phase: string | null;
	readonly text: string;
}

interface InitialRenderSnapshot {
	readonly hasCanvas: boolean;
	readonly paneCount: string | null;
	readonly board: string | null;
	readonly elementCount: number;
}

async function initialRender(
	browser: Awaited<ReturnType<typeof createAgentBrowser>>,
): Promise<InitialRenderSnapshot> {
	return browser.eval<InitialRenderSnapshot>(`(() => {
			const canvas = document.querySelector('.pane .excalidraw');
			const frame = document.querySelector('[data-workbench-frame]');
			if (canvas) window.__codexTextWorkbenchCanvas = canvas;
			return {
				hasCanvas: !!canvas,
				paneCount: frame?.getAttribute('data-pane-count') ?? null,
				board: document.querySelector('.board-name')?.textContent?.trim() ?? null,
				elementCount: (${EXCALIDRAW_APP_EXPRESSION})?.scene.getElementsIncludingDeleted().filter(element => !element.isDeleted).length ?? 0,
			};
		})()`);
}

function approvalCards(
	browser: Awaited<ReturnType<typeof createAgentBrowser>>,
): Promise<ApprovalCardSnapshot[]> {
	return browser.eval<
		ApprovalCardSnapshot[]
	>(`[...document.querySelectorAll('[data-approval-kind]')]
		.map(card => ({
			kind: card.getAttribute('data-approval-kind'),
			family: card.getAttribute('data-approval-family'),
			phase: card.getAttribute('data-approval-phase'),
			text: card.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
		}))`);
}

test(
	"the production text workbench reaches its rendered browser controls",
	async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = prepareProductionFixture(resources, executableSource);
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
			(value) => value.hasCanvas && value.paneCount === "1",
			"the initial one-pane canvas shell",
		);
		runCanvasCli(canvas.base, vault, ["browser", "show", "workbench", "--pane", "primary"]);
		await pollUntil(
			() => initialRender(browser),
			(value) =>
				value.hasCanvas &&
				value.paneCount === "1" &&
				value.board === "workbench" &&
				value.elementCount === 1,
			"the seeded canvas and one-pane workbench to render",
		);

		await browser.run(["console", "--clear"]);
		await browser.run(["errors", "--clear"]);
		await roleAction(browser, "button", "Expand");
		await pollUntil(
			() =>
				browser.eval<boolean>(
					"document.querySelector('[data-workbench-frame]')?.getAttribute('data-workbench-disclosure') === 'expanded'",
				),
			Boolean,
			"the integrated workbench to expand",
		);
		await roleAction(browser, "button", "Settings");
		await pollUntil(
			() =>
				browser.eval<boolean>(`[...document.querySelectorAll('button')]
					.some(button => button.textContent?.trim() === 'Start agent' && !button.disabled)`),
			Boolean,
			"the workhorse creation control to become enabled",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);

		await browser.run(["press", "Escape"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					`!document.querySelector('[data-workbench-settings]') && document.activeElement?.textContent?.trim() === 'Settings'`,
				),
			Boolean,
			"Escape to close Agent settings and restore focus to Settings",
		);
		await roleAction(browser, "button", "Settings");
		await browser.run(["screenshot", "/tmp/archboard-149-agent-settings.png"]);
		await roleAction(browser, "button", "Start agent");
		await pollUntil(
			() =>
				browser.eval<boolean>(
					`!document.querySelector('[data-workbench-settings]') && document.activeElement?.matches('textarea[aria-label="Message the Codex workhorse"]') === true`,
				),
			Boolean,
			"starting an agent to close settings and focus the composer",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		await browser.run(["screenshot", "/tmp/archboard-149-agent-connected.png"]);
		await fillLabel(browser, "Message the Codex workhorse", "Check the rendered workbench.");
		await pollUntil(
			() =>
				browser.eval<{ disabled: boolean | null; value: string }>(`(() => {
					const input = document.querySelector('textarea[aria-label="Message the Codex workhorse"]');
					const send = [...document.querySelectorAll('button')]
						.find(button => button.textContent?.trim() === 'Send');
					return {
						disabled: send instanceof HTMLButtonElement ? send.disabled : null,
						value: input instanceof HTMLTextAreaElement ? input.value : '',
					};
				})()`),
			(value) => value.value === "Check the rendered workbench." && value.disabled === false,
			"the filled composer to enable Send",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		const desktopSend = await workbenchControlOperability(browser, '[data-composer-send="start"]');
		expect(desktopSend).toMatchObject({
			clipped: false,
			requestOverlap: false,
			centerHit: true,
			operable: true,
		});
		await browser.run(["set", "viewport", "1920", "1080", "2"]);
		expect(
			await workbenchControlOperability(browser, '[data-composer-send="start"]'),
		).toMatchObject({
			clipped: false,
			requestOverlap: false,
			centerHit: true,
			operable: true,
		});
		await browser.run(["set", "viewport", "1920", "1080", "1"]);
		await roleAction(browser, "button", "Send");

		const pending = await pollUntil(
			() => approvalCards(browser),
			(cards) => cards.length === 2 && cards.every(({ phase }) => phase === "pending"),
			"the ordinary and dynamic approval cards",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(pending.map(({ kind, family }) => ({ kind, family }))).toEqual([
			{ kind: "ordinary", family: "command_execution" },
			{ kind: "dynamic", family: "create_thread" },
		]);
		expect(pending[0]?.text).toContain("bun test");
		expect(pending[0]?.text).toContain("Prove the production approval route.");
		expect(pending[1]?.text).toContain("Create a new Codex thread");
		expect(pending[1]?.text).toContain("Create the production proof thread.");
		expect(pending[1]?.text).toContain("Approve this effect");
		expect(pending[1]?.text).toContain("Decline this effect");

		await pollUntil(
			() =>
				browser.eval<boolean>(`[...document.querySelectorAll('button')]
					.some(button => button.textContent?.trim() === 'Decline' && !button.disabled)`),
			Boolean,
			"the ordinary Decline action to receive fresh command authority",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		await roleAction(browser, "button", "Decline");
		const settled = await pollUntil(
			async () => ({
				cards: await approvalCards(browser),
				response: productionFixtureRecords<FixtureRecord>(fixture).find(
					({ frame, kind }) => kind === "reverse_response" && frame?.id === "ordinary-request-1",
				),
			}),
			({ cards, response }) =>
				response !== undefined && cards.length === 1 && cards[0]?.kind === "dynamic",
			"the rendered ordinary decision to settle authoritatively",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(settled.response?.frame?.result).toEqual({ decision: "decline" });
		expect(settled.cards[0]).toMatchObject({ kind: "dynamic", phase: "pending" });
		expect(
			await browser.eval<boolean>(`(() => {
			const canvas = document.querySelector('.pane .excalidraw');
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
