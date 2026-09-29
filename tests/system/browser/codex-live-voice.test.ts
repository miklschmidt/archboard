import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { waveStateText } from "@/ui/voice-wave/wave-state";

import {
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
} from "../support/timing.ts";
import { createJsonRequester } from "../support/http.ts";
import { prepareProductionFixture } from "../server-state/support/codex-production.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	runServerCli,
} from "./support/agent-browser.ts";
import {
	RAW_COORDINATOR_THREAD_ID,
	openWithControlledVoiceMedia,
	readControlledVoiceMediaAudit,
	setControlledOutputSilent,
	talkWire,
	type FixtureRecord,
} from "./support/codex-live-voice.ts";
import {
	productionFixtureRecords,
	workbenchControlOperability,
} from "./support/codex-workbench-production.ts";
import { SEMANTIC_STAGE, seedSemanticBoard } from "./support/semantic-page.ts";
import { roleAction } from "./support/opener-settings-interaction.ts";
import {
	AGENT_PANEL,
	BOARD_NAME_EXPRESSION,
	PANE_SECTIONS,
	PANE_TABS,
	openConversation,
	stageIsFullscreen,
} from "./support/shell-dom.ts";
import { emulateMedia } from "./support/shell-render-matrix.ts";
import {
	BAR_VOICE,
	PRESENTATION_VOICE,
	endButton,
	focusIs,
	layoutSnapshot,
	liveButton,
	presentationSnapshot,
	presentedStep,
	saidLines,
	subtitleSnapshot,
	voiceSnapshot,
} from "./support/voice-page.ts";

const serverPath = join(import.meta.dir, "../server-state/fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "../server-state/fixtures/fake-codex-production.ts");
/** What the controlled session transcribes, as the fixture emits it. */
const USER_SAID = "Show the controlled voice context.";
const VOICE_SAID = "The controlled voice context is visible.";

/** WCAG 2.5.8 target size floor. */
const MIN_TARGET = 24;

test(
	"Talk carries itself through to live voice in the agent bar and the presentation bar",
	async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = prepareProductionFixture(resources, executableSource);
		const { ownerRoot } = browserTestRoots();
		const vault = join(ownerRoot, "vault");
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
		const frames = (from: number, method: string) =>
			records()
				.slice(from)
				.filter((record) => record.kind === "frame" && record.method === method);

		await seedSemanticBoard(api, "workbench", {
			nodes: [
				{ name: "Ingest", kind: "service" },
				{ name: "Warehouse", kind: "datastore" },
			],
			edges: [{ from: "Ingest", to: "Warehouse", kind: "data" }],
			walkthroughs: [
				{
					name: "Where rows go",
					beats: [
						{ heading: "All of it", body: "Two parts, one direction." },
						{ heading: "The warehouse", body: "Where the rows land." },
					],
				},
			],
		});
		await openWithControlledVoiceMedia(
			browser,
			server.base,
			join(ownerRoot, "controlled-voice-media.js"),
		);
		await browser.run(["set", "viewport", "1920", "1080", "1"]);
		expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/iu);
		expect(
			await browser.eval<readonly [boolean, boolean]>(
				"[Boolean(globalThis.__archboardControlledVoiceMedia), String(navigator.mediaDevices?.getUserMedia).includes('audit.localTracks')]",
			),
		).toEqual([true, true]);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					`document.querySelector('${PANE_SECTIONS} ${SEMANTIC_STAGE}') !== null && document.querySelectorAll('${PANE_TABS}').length === 0`,
				),
			Boolean,
			"the production shell and its one canvas pane to mount",
		);
		runServerCli(server.base, vault, ["browser", "show", "workbench", "--pane", "primary"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(`(() => {
					const canvas = document.querySelector('${PANE_SECTIONS} ${SEMANTIC_STAGE}');
					if (!canvas || canvas.getAttribute('data-state') !== 'drawn') return false;
					globalThis.__codexLiveVoiceCanvas = canvas;
					return (${BOARD_NAME_EXPRESSION}) === 'workbench';
				})()`),
			Boolean,
			"the seeded board to render",
		);

		await browser.run(["console", "--clear"]);
		await browser.run(["errors", "--clear"]);

		// Nothing is set up: no conversation exists, and Talk is the one voice control.
		const idle = await pollUntil(
			() => voiceSnapshot(browser),
			(value) => value.mode === "talk" && value.talkEnabled,
			"Talk to be offered in the agent bar",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(idle.controls).toEqual([]);
		const desktop = await layoutSnapshot(browser);
		expect(desktop.viewport).toEqual([1920, 1080, 1]);
		expect(desktop.pageOverflow).toBe(false);
		expect(desktop.voiceInsideBar).toBe(true);
		expect(desktop.voiceOverlapsStage).toBe(false);
		expect((await workbenchControlOperability(browser, BAR_VOICE)).operable).toBe(true);
		const beforeTalk = records().length;
		// Nothing is started: Talk starts the coordinator, the workhorse and voice.
		expect(frames(0, "thread/start")).toEqual([]);
		expect(frames(0, "thread/realtime/start")).toEqual([]);

		// One gesture: Talk creates and links the conversation, then starts voice over the media.
		await browser.run(["focus", BAR_VOICE]);
		expect(await focusIs(browser, BAR_VOICE)).toEqual([true, false]);
		await browser.run(["press", "Enter"]);
		// The model is audible from the first frame: the wave follows its output.
		const speaking = await pollUntil(
			() => voiceSnapshot(browser),
			(value) => value.mode === "live" && value.waveText === waveStateText("speaking"),
			"Talk to set up the conversation, start voice and follow the model's output",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(speaking.wavePresentation).toBe("animated");
		expect(speaking.controls).toContain("Mute");
		// The wire, in order: the coordinator and then the workhorse are created, the
		// conversation reads the workhorse as the server's linked thread, voice starts on the
		// coordinator, and the coordinator is given the board catalogue this voice session
		// speaks about.
		const wire = await pollUntil(
			() => talkWire(records().slice(beforeTalk), "workbench"),
			(value) => value.catalogueAt >= 0,
			"the coordinator to be given the board catalogue voice speaks about",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(wire.threadStarts).toBe(2);
		expect(wire.realtimeStarts).toBe(1);
		expect(wire.workhorse).not.toBeNull();
		expect(wire.coordinatorAt).toBeGreaterThanOrEqual(0);
		expect(wire.createdAt).toBeGreaterThan(wire.coordinatorAt);
		expect(wire.readAt).toBeGreaterThan(wire.createdAt);
		expect(wire.voiceAt).toBeGreaterThan(wire.readAt);
		expect(wire.catalogueAt).toBeGreaterThan(wire.voiceAt);
		// Voice never opens the conversation on its own, and the bar never grows.
		expect(await browser.eval<boolean>(`document.querySelector('${AGENT_PANEL}') === null`)).toBe(
			true,
		);
		const live = await layoutSnapshot(browser);
		expect(live.barHeight).toBe(desktop.barHeight);
		expect(live.voiceInsideBar).toBe(true);
		expect(live.voiceOverlapsStage).toBe(false);
		expect(live.pageOverflow).toBe(false);

		// What the model says is subtitled over the pane voice runs for, as its words arrive.
		const subtitled = await pollUntil(
			() => subtitleSnapshot(browser),
			(value) => value.text !== null && value.text.length > 0,
			"the model's words to be subtitled over the picture",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(VOICE_SAID).toStartWith(subtitled.text ?? "?");
		const whole = await pollUntil(
			() => subtitleSnapshot(browser),
			(value) => value.text === VOICE_SAID,
			"the whole sentence to be subtitled",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(whole.pane).toBe("Pane A");
		expect(whole.withinPane).toBe(true);

		// What was said stays in the conversation, both sides, once the panel is opened.
		await openConversation(browser);
		const said = await pollUntil(
			() => saidLines(browser),
			(lines) =>
				lines.some((line) => line.speaker === "user" && line.text === USER_SAID) &&
				lines.some((line) => line.speaker === "assistant" && line.text === VOICE_SAID),
			"what was said aloud to land in the conversation",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(said.every((line) => !line.partial)).toBe(true);
		await roleAction(browser, "button", "Close the conversation");
		await pollUntil(
			() => browser.eval<boolean>(`document.querySelector('${AGENT_PANEL}') === null`),
			Boolean,
			"the conversation to close",
		);

		// Microphone-only silence: the microphone stays live, the model goes quiet,
		// and the wave rests in listening instead of speaking.
		await setControlledOutputSilent(browser, true);
		const silent = await pollUntil(
			() => voiceSnapshot(browser),
			(value) => value.waveText === waveStateText("listening"),
			"silent model output to rest the wave while the microphone stays live",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(silent.mode).toBe("live");
		expect((await readControlledVoiceMediaAudit(browser)).localTracks).toEqual([
			{ enabled: true, stopCount: 0 },
		]);
		await setControlledOutputSilent(browser, false);
		await pollUntil(
			() => voiceSnapshot(browser),
			(value) => value.waveText === waveStateText("speaking"),
			"model output to drive the wave again",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);

		// The live controls are reached in order from the keyboard: Mute, subtitles, End.
		await browser.run(["focus", liveButton(BAR_VOICE, "Mute")]);
		expect(await focusIs(browser, liveButton(BAR_VOICE, "Mute"))).toEqual([true, false]);
		await browser.run(["press", "Tab"]);
		expect(await focusIs(browser, `${BAR_VOICE} [data-slot="voice-subtitles-toggle"]`)).toEqual([
			true,
			false,
		]);
		await browser.run(["press", "Tab"]);
		expect(await focusIs(browser, endButton(BAR_VOICE))).toEqual([true, false]);

		// Reduced motion: the wave becomes a static rule with the same state text.
		const releaseReduced = await emulateMedia(browser, "light", "reduced-motion");
		try {
			const reduced = await pollUntil(
				() => voiceSnapshot(browser),
				(value) => value.wavePresentation === "static",
				"the rendered output wave to honor reduced motion",
			);
			expect([waveStateText("speaking"), waveStateText("listening")]).toContain(
				reduced.waveText ?? "",
			);
		} finally {
			await releaseReduced();
		}
		const releaseNormal = await emulateMedia(browser, "light", "normal");
		await releaseNormal();
		await pollUntil(
			() => voiceSnapshot(browser),
			(value) => value.wavePresentation === "animated",
			"the animated wave to return with motion allowed",
		);

		await browser.run(["click", liveButton(BAR_VOICE, "Mute")]);
		await pollUntil(
			() => voiceSnapshot(browser),
			(value) => value.controls.includes("Unmute"),
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
		expect(flipLive.voiceInsideBar).toBe(true);
		expect(flipLive.voiceOverlapsStage).toBe(false);
		expect(flipLive.buttons.map(({ name }) => name)).toContain("Unmute");
		expect(flipLive.buttons).toHaveLength(3);
		expect(flipLive.buttons.every(({ height }) => height >= MIN_TARGET)).toBe(true);
		await browser.run(["set", "viewport", "1920", "1080", "1"]);

		// Presented fullscreen, the pane carries the same live control in its bar.
		await roleAction(browser, "button", "Present pane A fullscreen");
		const presented = await pollUntil(
			() => presentationSnapshot(browser),
			(value) => value.fullscreen && value.voice.mode === "live",
			"the live voice control to reach the fullscreen presentation bar",
		);
		expect(presented.voice.controls).toEqual((await voiceSnapshot(browser)).controls);
		expect(presented.voice.controls).toContain("Unmute");
		expect(presented.insideStage).toBe(true);
		expect(presented.paneChromeHidden).toBe(true);
		expect(await workbenchControlOperability(browser, endButton(PRESENTATION_VOICE))).toMatchObject(
			{ clipped: false, centerHit: true, operable: true },
		);

		const releaseForcedColors = await emulateMedia(browser, "light", "forced-colors");
		try {
			expect(
				await browser.eval<readonly [boolean, string, string]>(`(() => {
					const end = document.querySelector(${JSON.stringify(endButton(PRESENTATION_VOICE))});
					const style = getComputedStyle(end);
					return [matchMedia('(forced-colors: active)').matches, style.forcedColorAdjust, style.borderTopStyle];
				})()`),
			).toEqual([true, "auto", "solid"]);
		} finally {
			await releaseForcedColors();
		}
		const releaseNormalAgain = await emulateMedia(browser, "light", "normal");
		await releaseNormalAgain();

		await browser.run(["set", "viewport", "1920", "1080", "2"]);
		const scaled = await pollUntil(
			() => presentationSnapshot(browser),
			(value) => value.fullscreen && value.voice.mode === "live",
			"the same voice control at the desktop scaled viewport",
		);
		expect(
			await browser.eval<readonly [number, number, number]>(
				"[innerWidth, innerHeight, devicePixelRatio]",
			),
		).toEqual([1920, 1080, 2]);
		expect(scaled.insideStage).toBe(true);
		expect(await workbenchControlOperability(browser, endButton(PRESENTATION_VOICE))).toMatchObject(
			{ clipped: false, centerHit: true, operable: true },
		);
		await browser.run(["set", "viewport", "1920", "1080", "1"]);

		// End from the presentation bar retires voice and releases the browser's media;
		// the bar offers Talk again.
		await browser.run(["click", endButton(PRESENTATION_VOICE)]);
		await pollUntil(
			async () => ({
				snapshot: await presentationSnapshot(browser),
				media: await readControlledVoiceMediaAudit(browser),
			}),
			(value) =>
				value.snapshot.voice.mode === "talk" &&
				value.snapshot.voice.talkEnabled &&
				value.media.localTracks[0]?.stopCount === 1 &&
				value.media.remoteTracks[0]?.stopCount === 1 &&
				value.media.peers[0]?.closeCount === 1 &&
				value.media.contexts[0]?.closeCount === 1 &&
				value.media.attachedAudioElements === 0,
			"the fullscreen End to retire voice and release browser media",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		await roleAction(browser, "button", "Exit presentation");
		const stopped = await pollUntil(
			async () => ({
				fullscreen: await stageIsFullscreen(browser),
				voice: await voiceSnapshot(browser),
				subtitle: await subtitleSnapshot(browser),
			}),
			(value) => !value.fullscreen && value.voice.mode === "talk" && value.voice.talkEnabled,
			"an ended session to leave an enabled Talk in the agent bar",
		);
		expect(stopped.subtitle.text).toBeNull();
		expect(
			await browser.eval<boolean>(`(() => {
				const stage = document.querySelector('${PANE_SECTIONS} ${SEMANTIC_STAGE}');
				return stage === globalThis.__codexLiveVoiceCanvas && stage?.getAttribute('data-state') === 'drawn';
			})()`),
		).toBe(true);

		// Narrate: the server opens the first step in the pane and, once the pane says it arrived,
		// hands it to the voice model as speech. The user then steps by hand, and leaves; each is
		// handed over the same way, and no coordinator turn is started for any of it. Narrating is a
		// new voice session, and the talk before it carried the first coordinator, so it runs on a
		// fresh one (TASK-301).
		const narrationFrom = records().length;
		const speeches = () =>
			frames(narrationFrom, "thread/realtime/appendSpeech").map(({ params }) =>
				String(params?.["text"] ?? ""),
			);
		await browser.run(["click", "[data-slot='semantic-walkthrough-narrate']"]);
		await pollUntil(
			() => presentedStep(browser),
			(step) => step.index === "0" && !step.moving,
			"Narrate to open the walkthrough on its first step",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		const [first] = await pollUntil(
			speeches,
			(spoken) => spoken.length === 1,
			"the first step to be handed to the voice model",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(first).toContain("All of it");
		// The step was opened by the server, so the pane credits nobody with what it lit.
		const context = await api<{ panes: { byUser?: string[] }[] }>("/api/panes/semantic-context");
		expect(context.body.panes[0]?.byUser).toBeUndefined();
		await browser.run(["press", "ArrowRight"]);
		const [, second] = await pollUntil(
			speeches,
			(spoken) => spoken.length === 2,
			"the user's step to be handed to the voice model",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(second).toContain("The warehouse");
		await browser.run(["press", "Escape"]);
		await pollUntil(
			speeches,
			(spoken) => spoken.length === 3,
			"leaving to be told to the voice model",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect((await presentedStep(browser)).index).toBeNull();
		const [narrationStart] = frames(narrationFrom, "thread/realtime/start");
		expect(narrationStart?.params?.["initialItems"]).toEqual([]);
		expect(frames(narrationFrom, "thread/start")).toHaveLength(1);
		const narrationCoordinator = narrationStart?.params?.["threadId"];
		expect(narrationCoordinator).not.toBe(RAW_COORDINATOR_THREAD_ID);
		expect(frames(narrationFrom, "turn/start")).toEqual([]);
		await browser.run(["click", endButton(BAR_VOICE)]);
		await pollUntil(
			() => voiceSnapshot(browser),
			(value) => value.mode === "talk" && value.talkEnabled,
			"the narration to end",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		// Each End stops its session's realtime on the coordinator that session ran on.
		expect(
			await pollUntil(
				() => records().filter(({ kind }) => kind === "realtime_stop"),
				(stops) => stops.length === 2,
				"each ended session to stop on the coordinator",
				{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
			),
		).toEqual([
			expect.objectContaining({ threadId: RAW_COORDINATOR_THREAD_ID }),
			expect.objectContaining({ threadId: narrationCoordinator }),
		]);

		const all = records();
		const versionProbes = all.filter(({ kind }) => kind === "version_probe");
		expect(versionProbes).toHaveLength(2);
		expect(versionProbes.every(({ args }) => args?.length === 1 && args[0] === "--version")).toBe(
			true,
		);
		expect(all.filter(({ kind }) => kind === "app_server_spawn")).toHaveLength(1);
		const [realtimeStart] = frames(0, "thread/realtime/start");
		expect(realtimeStart?.params).toMatchObject({
			threadId: RAW_COORDINATOR_THREAD_ID,
			transport: { type: "webrtc", sdp: "controlled-offer-sdp" },
			version: "v3",
		});
		expect(realtimeStart?.params?.["realtimeSessionId"]).toMatch(
			/^archboard:realtime-session:h[a-f0-9]{32}$/u,
		);
		const [realtimeStop] = frames(0, "thread/realtime/stop");
		expect(realtimeStop?.params).toEqual({ threadId: RAW_COORDINATOR_THREAD_ID });
		expect(all.some(({ kind }) => kind === "fixture_rejection")).toBe(false);
		expect(all.some(({ kind }) => kind === "fixture_error")).toBe(false);
		expect(await browser.run(["console"])).toBe("");
		expect(await browser.run(["errors"])).toBe("");
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
);
