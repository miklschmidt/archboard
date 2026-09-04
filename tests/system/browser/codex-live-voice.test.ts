import { expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import {
	prepareProductionFixture,
	type ProductionFixture,
} from "../canvas-state/support/codex-production.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	runCanvasCli,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import {
	openWithControlledVoiceMedia,
	readControlledVoiceMediaAudit,
} from "./support/codex-live-voice.ts";
import { seedBoard } from "./support/fullscreen-presentation.ts";
import { roleAction } from "./support/opener-settings-interaction.ts";
import { emulateMedia } from "./support/shell-render-matrix.ts";

const serverPath = join(import.meta.dir, "../canvas-state/fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "../canvas-state/fixtures/fake-codex-production.ts");

interface FixtureRecord {
	readonly kind?: string;
	readonly method?: string;
	readonly args?: readonly string[];
	readonly params?: Record<string, unknown>;
}

interface VoiceSnapshot {
	readonly state: string | null;
	readonly sourcePane: string | null;
	readonly sourceThread: string | null;
	readonly transcript: string;
	readonly context: string;
	readonly announcer: {
		readonly role: string | null;
		readonly live: string | null;
		readonly text: string;
	};
}

interface LayoutSnapshot {
	readonly viewport: readonly [number, number, number];
	readonly pageOverflow: boolean;
	readonly voiceInsideWorkbench: boolean;
	readonly voiceOverlapsCanvas: boolean;
	readonly targetSizes: readonly {
		readonly command: string | null;
		readonly width: number;
		readonly height: number;
	}[];
}

interface DockSnapshot {
	readonly fullscreen: boolean;
	readonly sessionId: string | null;
	readonly sourceText: string;
	readonly status: {
		readonly role: string | null;
		readonly live: string | null;
		readonly text: string;
	};
	readonly stop: {
		readonly enabled: boolean;
		readonly sessionId: string | null;
		readonly width: number;
		readonly height: number;
	};
	readonly insideViewport: boolean;
	readonly avoidsWorkbench: boolean;
	readonly sourceFits: boolean;
	readonly excalidrawChromeHidden: boolean;
}

function fixtureRecords(fixture: ProductionFixture): FixtureRecord[] {
	return readFileSync(fixture.logPath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as FixtureRecord);
}

async function claimRenderedWorkbenchLease(browser: AgentBrowserSession): Promise<void> {
	const lease = await browser.eval<{
		readonly kind: string;
		readonly state: string;
	}>(`(async () => {
		const frame = document.querySelector('[data-workbench-frame]');
		const key = frame && Object.keys(frame).find(candidate => candidate.startsWith('__reactFiber$'));
		let fiber = key ? frame[key] : null;
		for (let depth = 0; fiber && depth < 30; depth += 1, fiber = fiber.return) {
			const transport = fiber.memoizedProps?.view?.panes?.[0]?.transport;
			if (typeof transport?.claimLease === 'function') return transport.claimLease();
		}
		throw new Error('The rendered workbench exposed no pane transport for controlled lease setup.');
	})()`);
	expect(lease).toMatchObject({ kind: "command_lease", state: "active" });
}

function voiceSnapshot(browser: AgentBrowserSession): Promise<VoiceSnapshot> {
	return browser.eval<VoiceSnapshot>(`(() => {
		const voice = document.querySelector('[data-workbench-voice="present"]');
		const announcer = voice?.querySelector('[data-voice-announcer]');
		return {
			state: voice?.querySelector('[data-voice-controls]')?.getAttribute('data-voice-state') ?? null,
			sourcePane: voice?.getAttribute('data-workbench-voice-source-pane') ?? null,
			sourceThread: voice?.querySelector('[data-workbench-voice-source-thread]')?.textContent?.trim() ?? null,
			transcript: voice?.querySelector('[data-voice-transcript]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
			context: voice?.querySelector('[data-voice-context]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
			announcer: {
				role: announcer?.getAttribute('role') ?? null,
				live: announcer?.getAttribute('aria-live') ?? null,
				text: announcer?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
			},
		};
	})()`);
}

function layoutSnapshot(browser: AgentBrowserSession): Promise<LayoutSnapshot> {
	return browser.eval<LayoutSnapshot>(`(() => {
		const rect = node => node?.getBoundingClientRect() ?? new DOMRect();
		const overlaps = (left, right) => left.width > 0 && left.height > 0 && right.width > 0 &&
			right.height > 0 && left.left < right.right && left.right > right.left &&
			left.top < right.bottom && left.bottom > right.top;
		const voice = document.querySelector('[data-workbench-voice="present"]');
		const frame = document.querySelector('[data-workbench-frame]');
		const canvas = document.querySelector('.canvas-stage');
		const voiceRect = rect(voice);
		const frameRect = rect(frame);
		return {
			viewport: [innerWidth, innerHeight, devicePixelRatio],
			pageOverflow: document.documentElement.scrollWidth > innerWidth ||
				document.documentElement.scrollHeight > innerHeight,
			voiceInsideWorkbench: voiceRect.left >= frameRect.left && voiceRect.right <= frameRect.right &&
				voiceRect.top >= frameRect.top && voiceRect.bottom <= frameRect.bottom,
			voiceOverlapsCanvas: overlaps(voiceRect, rect(canvas)),
			targetSizes: [...voice.querySelectorAll('[data-voice-command]')].map(node => {
				const bounds = rect(node);
				return { command: node.getAttribute('data-voice-command'), width: bounds.width, height: bounds.height };
			}),
		};
	})()`);
}

function dockSnapshot(browser: AgentBrowserSession): Promise<DockSnapshot> {
	return browser.eval<DockSnapshot>(`(() => {
		const rect = node => node?.getBoundingClientRect() ?? new DOMRect();
		const dock = document.querySelector('.presentation-dock');
		const source = dock?.querySelector('[aria-label="Active voice session"]');
		const status = dock?.querySelector('[data-presentation-voice-status]');
		const stop = dock?.querySelector('.presentation-stop');
		const workbench = document.querySelector('.shell-workbench');
		const dockRect = rect(dock);
		const workbenchRect = rect(workbench);
		const stopRect = rect(stop);
		const sourceContainer = dock?.querySelector('.presentation-sources');
		const chrome = [...document.querySelectorAll(
			'.presentation-current .layer-ui__wrapper, ' +
			'.presentation-current .App-menu, ' +
			'.presentation-current .App-toolbar-container'
		)];
		return {
			fullscreen: document.fullscreenElement === document.querySelector('.shell'),
			sessionId: source?.getAttribute('data-voice-session-id') ?? null,
			sourceText: source?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
			status: {
				role: status?.getAttribute('role') ?? null,
				live: status?.getAttribute('aria-live') ?? null,
				text: status?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
			},
			stop: {
				enabled: stop instanceof HTMLButtonElement && !stop.disabled,
				sessionId: stop?.getAttribute('data-voice-session-id') ?? null,
				width: stopRect.width,
				height: stopRect.height,
			},
			insideViewport: dockRect.left >= 0 && dockRect.top >= 0 &&
				dockRect.right <= innerWidth && dockRect.bottom <= innerHeight,
			avoidsWorkbench: dockRect.bottom <= workbenchRect.top,
			sourceFits: !!sourceContainer && sourceContainer.scrollWidth <= sourceContainer.clientWidth,
			excalidrawChromeHidden: chrome.length > 0 && chrome.every(node => getComputedStyle(node).display === 'none'),
		};
	})()`);
}

async function revealVoiceCommand(
	browser: AgentBrowserSession,
	command: "start" | "mute" | "stop",
): Promise<void> {
	const revealed = await browser.eval<boolean>(`(() => {
		const control = document.querySelector('[data-voice-command="${command}"]');
		if (!(control instanceof HTMLButtonElement)) return false;
		control.scrollIntoView({ block: 'center', inline: 'nearest' });
		return true;
	})()`);
	expect(revealed).toBe(true);
}

test(
	"controlled live voice remains operable through the production browser composition",
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

		await seedBoard(api, "workbench", "voice-board-element");
		await openWithControlledVoiceMedia(
			browser,
			canvas.base,
			join(ownerRoot, "controlled-voice-media.js"),
		);
		await browser.run(["set", "viewport", "1440", "900", "1"]);
		expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/iu);
		expect(
			await browser.eval<readonly [boolean, boolean]>(
				"[Boolean(globalThis.__archboardControlledVoiceMedia), String(navigator.mediaDevices?.getUserMedia).includes('audit.localTracks')]",
			),
		).toEqual([true, true]);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					"document.querySelector('.pane .excalidraw') !== null && document.querySelector('[data-workbench-frame]')?.getAttribute('data-pane-count') === '1'",
				),
			Boolean,
			"the production shell, canvas pane, and workbench frame to mount",
		);
		runCanvasCli(canvas.base, vault, ["browser", "show", "workbench", "--pane", "primary"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(`(() => {
					const canvas = document.querySelector('.pane .excalidraw');
					if (!canvas || !document.querySelector('.statusbar')?.textContent?.includes('1 elements')) return false;
					globalThis.__codexLiveVoiceCanvas = canvas;
					return document.querySelector('.board-name')?.textContent?.trim() === 'workbench';
				})()`),
			Boolean,
			"the seeded Excalidraw board to render",
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
		await claimRenderedWorkbenchLease(browser);
		await pollUntil(
			() =>
				browser.eval<boolean>(`[...document.querySelectorAll('button')]
					.some(button => button.textContent?.trim() === 'Create a workhorse thread' && !button.disabled)`),
			Boolean,
			"the workhorse creation control to become enabled",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		await roleAction(browser, "button", "Create a workhorse thread");
		await pollUntil(
			() =>
				browser.eval<boolean>(`(() => {
					const start = document.querySelector('[data-voice-command="start"]');
					return start instanceof HTMLButtonElement && !start.disabled;
				})()`),
			Boolean,
			"the production voice registration to expose Start",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);

		await revealVoiceCommand(browser, "start");
		await browser.run(["click", '[data-voice-command="start"]']);
		const listening = await pollUntil(
			() => voiceSnapshot(browser),
			(value) =>
				value.state === "listening" &&
				value.sourcePane !== null &&
				value.sourceThread !== null &&
				value.transcript.includes("The controlled voice context is visible.") &&
				value.context.includes("workbench"),
			"the live source, transcript, and captured context to render",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(listening.sourcePane).toMatch(/^pane-/u);
		expect(listening.announcer).toMatchObject({ role: "status", live: "polite" });
		expect(listening.announcer.text).toMatch(/listening/iu);
		expect(listening.transcript).toContain("Show the controlled voice context.");

		const desktop = await layoutSnapshot(browser);
		expect(desktop.viewport).toEqual([1440, 900, 1]);
		expect(desktop.pageOverflow).toBe(false);
		expect(desktop.voiceInsideWorkbench).toBe(true);
		expect(desktop.voiceOverlapsCanvas).toBe(false);
		expect(desktop.targetSizes.map(({ command }) => command)).toEqual(["start", "mute", "stop"]);
		expect(desktop.targetSizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(
			true,
		);

		await revealVoiceCommand(browser, "mute");
		await browser.run(["focus", '[data-voice-command="mute"]']);
		await browser.run(["press", "Tab"]);
		expect(
			await browser.eval<string | null>(
				"document.activeElement?.getAttribute('data-voice-command') ?? null",
			),
		).toBe("stop");

		const releaseReduced = await emulateMedia(browser, "light", "reduced-motion");
		try {
			await pollUntil(
				() =>
					browser.eval<readonly [boolean, boolean]>(
						"[matchMedia('(prefers-reduced-motion: reduce)').matches, document.querySelector('[data-voice-meter]') === null]",
					),
				(value) => value[0] && value[1],
				"the rendered live voice meter to honor reduced motion",
			);
		} finally {
			await releaseReduced();
		}
		const releaseNormal = await emulateMedia(browser, "light", "normal");
		await releaseNormal();

		await revealVoiceCommand(browser, "mute");
		await browser.run(["click", '[data-voice-command="mute"]']);
		await pollUntil(
			() => voiceSnapshot(browser),
			(value) => value.state === "muted",
			"the controlled microphone to render muted",
		);
		expect(await readControlledVoiceMediaAudit(browser)).toMatchObject({
			localTracks: [{ enabled: false, stopCount: 0 }],
			remoteTracks: [{ stopCount: 0 }],
			attachedAudioElements: 1,
			playCount: 1,
		});

		await browser.run(["click", 'button[aria-label="Present Pane A fullscreen"]']);
		const desktopDock = await pollUntil(
			() => dockSnapshot(browser),
			(value) => value.fullscreen && value.sessionId !== null && value.stop.enabled,
			"the immutable active voice source to reach the fullscreen dock",
		);
		expect(desktopDock.sourceText).toContain("Pane A");
		expect(desktopDock.sourceText).toContain(listening.sourceThread!);
		expect(desktopDock.sourceText).toContain("Muted");
		expect(desktopDock.status).toMatchObject({ role: "status", live: "polite" });
		expect(desktopDock.status.text).toMatch(/muted/iu);
		expect(desktopDock.stop.sessionId).toBe(desktopDock.sessionId);
		expect(desktopDock.stop.height).toBeGreaterThanOrEqual(44);
		expect(desktopDock.insideViewport).toBe(true);
		expect(desktopDock.avoidsWorkbench).toBe(true);
		expect(desktopDock.sourceFits).toBe(true);
		expect(desktopDock.excalidrawChromeHidden).toBe(true);

		const releaseForcedColors = await emulateMedia(browser, "light", "forced-colors");
		try {
			expect(
				await browser.eval<readonly [boolean, string, string]>(`(() => {
					const stop = document.querySelector('.presentation-stop');
					const style = getComputedStyle(stop);
					return [matchMedia('(forced-colors: active)').matches, style.forcedColorAdjust, style.borderTopStyle];
				})()`),
			).toEqual([true, "auto", "solid"]);
		} finally {
			await releaseForcedColors();
		}
		const releaseNormalAgain = await emulateMedia(browser, "light", "normal");
		await releaseNormalAgain();

		await browser.run(["set", "viewport", "1920", "1080", "2"]);
		const flipDock = await pollUntil(
			() => dockSnapshot(browser),
			(value) => value.fullscreen && value.sessionId === desktopDock.sessionId,
			"the same active voice source at the Samsung Flip scaled viewport",
		);
		expect(
			await browser.eval<readonly [number, number, number]>(
				"[innerWidth, innerHeight, devicePixelRatio]",
			),
		).toEqual([1920, 1080, 2]);
		expect(flipDock.stop.sessionId).toBe(desktopDock.sessionId);
		expect(flipDock.stop.width).toBeGreaterThanOrEqual(44);
		expect(flipDock.stop.height).toBeGreaterThanOrEqual(44);
		expect(flipDock.insideViewport).toBe(true);
		expect(flipDock.avoidsWorkbench).toBe(true);
		expect(flipDock.sourceFits).toBe(true);

		await browser.run(["click", ".presentation-stop"]);
		await pollUntil(
			async () => ({
				voicePresent: await browser.eval<boolean>(
					"document.querySelector('[aria-label=\"Active voice session\"]') !== null",
				),
				media: await readControlledVoiceMediaAudit(browser),
			}),
			(value) =>
				!value.voicePresent &&
				value.media.localTracks[0]?.stopCount === 1 &&
				value.media.remoteTracks[0]?.stopCount === 1 &&
				value.media.peers[0]?.closeCount === 1 &&
				value.media.contexts[0]?.closeCount === 1 &&
				value.media.attachedAudioElements === 0,
			"the fullscreen Stop to retire voice and release browser media",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		await browser.run(["click", ".presentation-exit"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(`document.fullscreenElement === null &&
					document.querySelector('[data-workbench-voice]') === null &&
					document.querySelector('[data-workbench-frame]') !== null`),
			Boolean,
			"authoritative stop to restore the text-only workbench",
		);
		expect(
			await browser.eval<boolean>(`document.querySelector('.pane .excalidraw') ===
				globalThis.__codexLiveVoiceCanvas &&
				document.querySelector('.statusbar')?.textContent?.includes('1 elements') === true`),
		).toBe(true);

		const records = fixtureRecords(fixture);
		const versionProbes = records.filter(({ kind }) => kind === "version_probe");
		expect(versionProbes).toHaveLength(2);
		expect(versionProbes.every(({ args }) => args?.length === 1 && args[0] === "--version")).toBe(
			true,
		);
		expect(records.filter(({ kind }) => kind === "app_server_spawn")).toHaveLength(1);
		const realtimeStart = records.find(
			({ kind, method }) => kind === "frame" && method === "thread/realtime/start",
		);
		expect(realtimeStart?.params).toMatchObject({
			threadId: expect.any(String),
			transport: { type: "webrtc", sdp: "controlled-offer-sdp" },
			version: "v3",
		});
		expect(realtimeStart?.params?.realtimeSessionId).toMatch(
			/^archboard:realtime-session:h[a-f0-9]{32}$/u,
		);
		expect(realtimeStart?.params?.realtimeSessionId).not.toBe(desktopDock.sessionId);
		expect(records.filter(({ kind }) => kind === "realtime_stop")).toHaveLength(1);
		expect(records.some(({ kind }) => kind === "fixture_error")).toBe(false);
		expect(await browser.run(["console"])).toBe("");
		expect(await browser.run(["errors"])).toBe("");
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
);
