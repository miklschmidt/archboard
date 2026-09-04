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
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import {
	openWithControlledVoiceMedia,
	readControlledVoiceMediaAudit,
} from "./support/codex-live-voice.ts";
import {
	claimRenderedWorkbenchLease,
	productionFixtureRecords,
} from "./support/codex-workbench-production.ts";
import { seedBoard } from "./support/fullscreen-presentation.ts";
import { roleAction } from "./support/opener-settings-interaction.ts";
import { emulateMedia } from "./support/shell-render-matrix.ts";

const serverPath = join(import.meta.dir, "../canvas-state/fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "../canvas-state/fixtures/fake-codex-production.ts");
const RAW_COORDINATOR_THREAD_ID = "thread-1";
const RENDERED_COORDINATOR_THREAD_ID = "archboard:thread:s7468726561642d31";
const RENDERED_WORKHORSE_THREAD_ID = "archboard:thread:s7468726561642d32";
const VOICE_CONTROL_IDENTITY = `pane pane-1, thread link ${RENDERED_WORKHORSE_THREAD_ID}, coordinator ${RENDERED_COORDINATOR_THREAD_ID}`;
const PRESTART_NAME = "Start voice on this pane";
const MUTE_NAME = `Mute the microphone on ${VOICE_CONTROL_IDENTITY}`;
const STOP_NAME = `Stop voice on ${VOICE_CONTROL_IDENTITY}`;
const CONTROL_GEOMETRY_SOURCE = String.raw`
	const rect = node => node?.getBoundingClientRect() ?? new DOMRect(), overlaps = (left, right) => left.width > 0 && left.height > 0 && right.width > 0 && right.height > 0 && left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
	const geometry = node => { const bounds = rect(node), visible = { left: Math.max(0, bounds.left), top: Math.max(0, bounds.top), right: Math.min(innerWidth, bounds.right), bottom: Math.min(innerHeight, bounds.bottom) };
		for (let owner = node.parentElement; owner; owner = owner.parentElement) { const style = getComputedStyle(owner), clip = rect(owner);
			if (/^(auto|clip|hidden|scroll)$/.test(style.overflowX)) { visible.left = Math.max(visible.left, clip.left); visible.right = Math.min(visible.right, clip.right); }
			if (/^(auto|clip|hidden|scroll)$/.test(style.overflowY)) { visible.top = Math.max(visible.top, clip.top); visible.bottom = Math.min(visible.bottom, clip.bottom); }
		}
		const visibleWidth = Math.max(0, visible.right - visible.left), visibleHeight = Math.max(0, visible.bottom - visible.top), clipped = visibleWidth < bounds.width || visibleHeight < bounds.height, requestOverlap = overlaps(bounds, rect(document.querySelector('[data-workbench-region="app-global-request"]'))), centerHit = node.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
		return { width: bounds.width, height: bounds.height, visibleWidth, visibleHeight, clipped, requestOverlap, centerHit, operable: visibleWidth >= 44 && visibleHeight >= 44 && !clipped && !requestOverlap && centerHit };
	};`;

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
	readonly coordinator: string | null;
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
	readonly canvasHeight: number;
	readonly workbenchHeight: number;
	readonly targetSizes: readonly {
		readonly command: string | null;
		readonly visibleWidth: number;
		readonly visibleHeight: number;
		readonly clipped: boolean;
		readonly requestOverlap: boolean;
		readonly centerHit: boolean;
		readonly operable: boolean;
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
		readonly clipped: boolean;
		readonly requestOverlap: boolean;
		readonly centerHit: boolean;
	};
	readonly insideViewport: boolean;
	readonly avoidsWorkbench: boolean;
	readonly sourceFits: boolean;
	readonly excalidrawChromeHidden: boolean;
}

function focusedButton(browser: AgentBrowserSession) {
	return browser.eval<readonly [string, string | null, boolean, boolean]>(
		"[document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? '', document.activeElement?.getAttribute('data-voice-command') ?? null, document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled, document.querySelector('[data-voice-command=start]') instanceof HTMLButtonElement && document.querySelector('[data-voice-command=start]').disabled]",
	);
}

function voiceSnapshot(browser: AgentBrowserSession): Promise<VoiceSnapshot> {
	return browser.eval<VoiceSnapshot>(`(() => {
		const voice = document.querySelector('[data-workbench-voice="present"]');
		const announcer = voice?.querySelector('[data-voice-announcer]');
		return {
			state: voice?.querySelector('[data-voice-controls]')?.getAttribute('data-voice-state') ?? null,
			sourcePane: voice?.getAttribute('data-workbench-voice-source-pane') ?? null,
			sourceThread: voice?.querySelector('[data-workbench-voice-source-thread]')?.textContent?.trim() ?? null,
			coordinator: voice?.querySelector('[data-voice-bound="coordinator"]')?.textContent?.trim() ?? null,
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
		${CONTROL_GEOMETRY_SOURCE}
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
			canvasHeight: rect(canvas).height,
			workbenchHeight: frameRect.height,
			targetSizes: [...voice.querySelectorAll('[data-voice-command]')].map(node => {
				return { command: node.getAttribute('data-voice-command'), ...geometry(node) };
			}),
		};
	})()`);
}

function dockSnapshot(browser: AgentBrowserSession): Promise<DockSnapshot> {
	return browser.eval<DockSnapshot>(`(() => {
		${CONTROL_GEOMETRY_SOURCE}
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
				...geometry(stop),
			},
			insideViewport: dockRect.left >= 0 && dockRect.top >= 0 &&
				dockRect.right <= innerWidth && dockRect.bottom <= innerHeight,
			avoidsWorkbench: dockRect.bottom <= workbenchRect.top,
			sourceFits: !!sourceContainer && sourceContainer.scrollWidth <= sourceContainer.clientWidth,
			excalidrawChromeHidden: chrome.length > 0 && chrome.every(node => getComputedStyle(node).display === 'none'),
		};
	})()`);
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

		await browser.run(["focus", 'button[aria-label="Pane A"]']);
		expect(await focusedButton(browser)).toEqual(["Pane A", null, false, false]);
		await browser.run(["press", "Tab"]);
		expect(await focusedButton(browser)).toEqual(["Collapse", null, false, false]);
		await browser.run(["press", "Tab"]);
		expect(await focusedButton(browser)).toEqual([PRESTART_NAME, "start", false, false]);
		const desktop = await layoutSnapshot(browser);
		expect(desktop.viewport).toEqual([1440, 900, 1]);
		expect(desktop.pageOverflow).toBe(false);
		expect(desktop.voiceInsideWorkbench).toBe(true);
		expect(desktop.voiceOverlapsCanvas).toBe(false);
		expect(desktop.canvasHeight).toBeGreaterThan(desktop.workbenchHeight);
		expect(desktop.targetSizes.map(({ command }) => command)).toEqual(["start", "mute", "stop"]);
		expect(desktop.targetSizes.every(({ operable }) => operable)).toBe(true);
		await roleAction(browser, "button", PRESTART_NAME);
		const listening = await pollUntil(
			() => voiceSnapshot(browser),
			(value) =>
				value.state === "listening" &&
				value.sourcePane === "pane-1" &&
				value.sourceThread === RENDERED_WORKHORSE_THREAD_ID &&
				value.coordinator === RENDERED_COORDINATOR_THREAD_ID &&
				value.transcript.includes("The controlled voice context is visible.") &&
				value.context.includes("workbench"),
			"the live source, transcript, and captured context to render",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(listening.sourcePane).toBe("pane-1");
		expect(listening.sourceThread).toBe(RENDERED_WORKHORSE_THREAD_ID);
		expect(listening.coordinator).toBe(RENDERED_COORDINATOR_THREAD_ID);
		expect(listening.announcer).toMatchObject({ role: "status", live: "polite" });
		expect(listening.announcer.text).toMatch(/listening/iu);
		expect(listening.transcript).toContain("Show the controlled voice context.");

		await browser.run(["focus", 'button[aria-label="Pane A"]']);
		await browser.run(["press", "Tab"]);
		expect(await focusedButton(browser)).toEqual(["Collapse", null, false, true]);
		await browser.run(["press", "Tab"]);
		expect(await focusedButton(browser)).toEqual([MUTE_NAME, "mute", false, true]);
		await browser.run(["press", "Tab"]);
		expect(await focusedButton(browser)).toEqual([STOP_NAME, "stop", false, true]);

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

		await roleAction(browser, "button", MUTE_NAME);
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

		await browser.run(["set", "viewport", "1920", "1080", "2"]);
		const flipLive = await layoutSnapshot(browser);
		expect(flipLive.viewport).toEqual([1920, 1080, 2]);
		expect(flipLive.pageOverflow).toBe(false);
		expect(flipLive.voiceInsideWorkbench).toBe(true);
		expect(flipLive.voiceOverlapsCanvas).toBe(false);
		expect(flipLive.canvasHeight).toBeGreaterThan(flipLive.workbenchHeight);
		expect(flipLive.targetSizes.map(({ command }) => command)).toEqual(["start", "unmute", "stop"]);
		expect(flipLive.targetSizes.every(({ operable }) => operable)).toBe(true);
		await browser.run(["set", "viewport", "1440", "900", "1"]);

		await roleAction(browser, "button", "Present Pane A fullscreen");
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
		expect(desktopDock.stop.width).toBeGreaterThanOrEqual(44);
		expect(desktopDock.stop.height).toBeGreaterThanOrEqual(44);
		expect(desktopDock.stop).toMatchObject({
			clipped: false,
			requestOverlap: false,
			centerHit: true,
		});
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
		expect(flipDock.stop).toMatchObject({ clipped: false, requestOverlap: false, centerHit: true });
		expect(flipDock.insideViewport).toBe(true);
		expect(flipDock.avoidsWorkbench).toBe(true);
		expect(flipDock.sourceFits).toBe(true);

		await roleAction(browser, "button", "Stop");
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
		await roleAction(browser, "button", "Exit");
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

		const records = productionFixtureRecords<FixtureRecord>(fixture);
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
			threadId: RAW_COORDINATOR_THREAD_ID,
			transport: { type: "webrtc", sdp: "controlled-offer-sdp" },
			version: "v3",
		});
		expect(realtimeStart?.params?.realtimeSessionId).toMatch(
			/^archboard:realtime-session:h[a-f0-9]{32}$/u,
		);
		expect(realtimeStart?.params?.realtimeSessionId).not.toBe(desktopDock.sessionId);
		const realtimeStop = records.find(
			({ kind, method }) => kind === "frame" && method === "thread/realtime/stop",
		);
		expect(realtimeStop?.params).toEqual({ threadId: RAW_COORDINATOR_THREAD_ID });
		expect(records.filter(({ kind }) => kind === "realtime_stop")).toEqual([
			expect.objectContaining({ threadId: RAW_COORDINATOR_THREAD_ID }),
		]);
		expect(records.some(({ kind }) => kind === "fixture_rejection")).toBe(false);
		expect(records.some(({ kind }) => kind === "fixture_error")).toBe(false);
		expect(await browser.run(["console"])).toBe("");
		expect(await browser.run(["errors"])).toBe("");
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
);
