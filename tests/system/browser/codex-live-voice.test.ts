import { expect, test } from "bun:test";

import {
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
} from "../support/timing.ts";
import { createJsonRequester } from "../support/http.ts";
import { createAgentBrowser, pollUntil, runServerCli } from "./support/agent-browser.ts";
import {
	RAW_COORDINATOR_THREAD_ID,
	readControlledVoiceMediaAudit,
	released,
	setControlledOutputSilent,
	talkWire,
	type FixtureRecord,
} from "./support/codex-live-voice.ts";
import {
	productionFixtureRecords,
	workbenchControlOperability,
} from "./support/codex-workbench-production.ts";
import {
	startModelWalkthrough,
	MODEL_STAGE,
	seedCanonicalModel,
	VOICE_PIPELINE,
} from "./support/canonical-page.ts";
import { drawnId } from "./support/drilling.ts";
import { roleAction } from "./support/opener-settings-interaction.ts";
import {
	AGENT_PANEL,
	MODEL_NAME_EXPRESSION,
	PANE_SECTIONS,
	openConversation,
	stageIsFullscreen,
} from "./support/shell-dom.ts";
import { emulateMedia } from "./support/shell-render-matrix.ts";
import {
	BAR_VOICE,
	BOX_UNMUTE,
	DOCK_MUTE,
	DOCK_SUBTITLES,
	DOCK_VOICE,
	focusIs,
	presentedStep,
	saidLines,
	subtitleSnapshot,
	voiceNow,
	voiceStill,
} from "./support/voice-page.ts";
import { SUBTITLES_IN_BOX, openForVoice, startVoiceServer } from "./support/voice-box-page.ts";

/** What the controlled session transcribes, as the fixture emits it. */
const USER_SAID = "Show the controlled voice context.";
const VOICE_SAID = "The controlled voice context is visible.";
/** Where the page keeps whether the person wants subtitles (packages/workbench/src/ui/state/subtitles/preference.ts). */
const SUBTITLES_KEY = "archboard.voice.subtitles";

test(
	"Talk starts a live voice in the dock, and the voice box and the presentation bar carry it",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { server, fixture } = await startVoiceServer(resources, "vault");
		const browser = resources.use(await createAgentBrowser());
		const api = createJsonRequester(server);
		const records = () => productionFixtureRecords<FixtureRecord>(fixture);
		const frames = (from: number, method: string) =>
			records()
				.slice(from)
				.filter((record) => record.kind === "frame" && record.method === method);

		const model = await seedCanonicalModel(server.vault, "workbench", VOICE_PIPELINE);
		await openForVoice(browser, server.base);
		// This person turned subtitles off on an earlier visit, and the page keeps that choice.
		await browser.eval<boolean>(`(localStorage.setItem('${SUBTITLES_KEY}', 'false'), true)`);
		await browser.run(["reload"]);
		await browser.run(["set", "viewport", "1920", "1080", "1"]);
		expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/iu);
		await pollUntil(
			() =>
				browser.eval<readonly [boolean, boolean]>(
					"[Boolean(globalThis.__archboardControlledVoiceMedia), String(navigator.mediaDevices?.getUserMedia).includes('audit.localTracks')]",
				),
			([installed, patched]) => installed && patched,
			"the controlled voice media to be installed in the reloaded page",
		);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					`document.querySelector('${PANE_SECTIONS} ${MODEL_STAGE}') !== null && document.querySelectorAll('${PANE_SECTIONS}').length === 1`,
				),
			Boolean,
			"the production shell and its one canvas pane to mount",
		);
		await pollUntil(
			() => api<{ panes: { paneId: string }[] }>("/api/panes"),
			(result) => result.body.panes.some((pane) => pane.paneId === "A"),
			"the canonical voice pane registration",
		);
		runServerCli(server, ["browser", "show", "workbench", "--pane", "primary"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(`(() => {
					const canvas = document.querySelector('${PANE_SECTIONS} ${MODEL_STAGE}');
					if (!canvas?.querySelector('[data-slot="model-diagram"] svg')) return false;
					globalThis.__codexLiveVoiceCanvas = canvas;
					return (${MODEL_NAME_EXPRESSION}) === 'workbench';
				})()`),
			Boolean,
			"the seeded board to render",
		);

		await browser.run(["console", "--clear"]);
		await browser.run(["errors", "--clear"]);

		// Nothing is set up: no conversation exists, and the dock offers Talk.
		const idle = await pollUntil(
			() => voiceNow(browser),
			(value) => value.state === "off" && value.enabled,
			"Talk to be offered in the agent dock",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(idle.form).toBe("key");
		expect(idle.lit).toBe(false);
		expect((await workbenchControlOperability(browser, DOCK_VOICE)).operable).toBe(true);
		const beforeTalk = records().length;
		// Nothing is started: Talk starts the coordinator, the workhorse and voice.
		expect(frames(0, "thread/start")).toEqual([]);
		expect(frames(0, "thread/realtime/start")).toEqual([]);

		// One gesture from the keyboard: Talk creates and links the conversation, then starts voice
		// over the media. With subtitles off the orb is lit in the dock's circle, which the Talk key
		// turns into.
		await browser.run(["focus", DOCK_VOICE]);
		expect(await focusIs(browser, DOCK_VOICE)).toEqual([true, false]);
		await browser.run(["press", "Enter"]);
		const speaking = await pollUntil(
			() => voiceNow(browser),
			(value) => value.state === "speaking" && value.orb === "dock" && value.lit,
			"Talk to set up the conversation and light the orb in the dock's circle as the model speaks",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(speaking.form).toBe("circle");
		expect(speaking.box).toBeNull();
		// The keyboard keeps its place on the key that turned into the circle.
		expect((await focusIs(browser, DOCK_VOICE))[0]).toBe(true);
		// From the circle the keyboard reaches mute and then the subtitles control. The dock's grid
		// places its parts, so only their order in the page keeps the keyboard in step with the eye.
		for (const control of [DOCK_MUTE, DOCK_SUBTITLES]) {
			await browser.run(["press", "Tab"]);
			expect(await focusIs(browser, control)).toEqual([true, false]);
			expect((await workbenchControlOperability(browser, control)).operable).toBe(true);
		}
		// The wire, in order: the coordinator and then the workhorse are created, the
		// conversation reads the workhorse as the tab's linked thread, voice starts on the
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
		// Voice never opens the conversation on its own.
		expect(await browser.eval<boolean>(`document.querySelector('${AGENT_PANEL}') === null`)).toBe(
			true,
		);

		// Microphone-only silence: the microphone stays live, the model goes quiet, and the
		// voice listens instead of speaking. It follows the model's output, never the microphone.
		await setControlledOutputSilent(browser, true);
		await pollUntil(
			() => voiceNow(browser),
			(value) => value.state === "listening",
			"silent model output to rest the voice while the microphone stays live",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect((await readControlledVoiceMediaAudit(browser)).localTracks).toEqual([
			{ enabled: true, stopCount: 0 },
		]);
		await setControlledOutputSilent(browser, false);
		await pollUntil(
			() => voiceNow(browser),
			(value) => value.state === "speaking",
			"model output to make the voice speak again",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);

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

		// Mute in the dock's voice line silences the microphone and nothing else.
		await browser.run(["click", DOCK_MUTE]);
		await pollUntil(
			() => voiceNow(browser),
			(value) => value.state === "muted",
			"the controlled microphone to render muted",
		);
		expect(await readControlledVoiceMediaAudit(browser)).toMatchObject({
			localTracks: [{ enabled: false, stopCount: 0 }],
			remoteTracks: [{ stopCount: 0 }],
			attachedAudioElements: 1,
			playCount: 1,
		});

		// Subtitles on carry the orb to the voice box over the pane voice runs for. The box shows the
		// same session, still muted, and the dock's key is the key that ends voice.
		await browser.run(["click", DOCK_SUBTITLES]);
		const boxed = await pollUntil(
			() => voiceNow(browser),
			(value) => value.box !== null && value.orb === "box" && value.lit,
			"subtitles on to carry the orb to the voice box",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(boxed.box).toMatchObject({ place: "free", state: "muted", pane: "Pane A" });
		expect(boxed.form).toBe("key");

		// Presented fullscreen, the bar's key ends the same session, and the voice box carries it
		// over the picture inside the presented stage, still muted.
		await roleAction(browser, "button", "Present fullscreen");
		const presented = await pollUntil(
			() => voiceNow(browser),
			(value) => value.bar?.mode === "live" && value.bar.enabled && value.box?.presented === true,
			"the presentation bar and the voice box to carry the live voice in fullscreen",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(await stageIsFullscreen(browser)).toBe(true);
		expect(presented.box).toMatchObject({ place: "free", state: "muted" });
		expect(presented.orb).toBe("box");
		// Fullscreen keeps the picture and hides the reader's navigation and inspection controls.
		expect(
			await browser.eval<
				boolean[]
			>(`['pane-header', 'model-navigation', 'model-inspector', 'model-breadcrumbs', 'model-selection-bar', 'model-state-details'].map(slot => {
				const element = document.querySelector('${PANE_SECTIONS} [data-slot="' + slot + '"]');
				return element !== null && !element.checkVisibility();
			})`),
		).toEqual([true, true, true, true, true, true]);
		// The bar's key and the keys at the end of the voice box over the picture can be pressed.
		for (const scale of ["1", "2"]) {
			await browser.run(["set", "viewport", "1920", "1080", scale]);
			for (const control of [BAR_VOICE, BOX_UNMUTE, SUBTITLES_IN_BOX]) {
				expect((await workbenchControlOperability(browser, control)).operable).toBe(true);
			}
		}
		await browser.run(["set", "viewport", "1920", "1080", "1"]);
		const releaseForcedColors = await emulateMedia(browser, "light", "forced-colors");
		try {
			expect(
				await browser.eval<readonly [boolean, string, string]>(`(() => {
					const end = document.querySelector(${JSON.stringify(BAR_VOICE)});
					const style = getComputedStyle(end);
					return [matchMedia('(forced-colors: active)').matches, style.forcedColorAdjust, style.borderTopStyle];
				})()`),
			).toEqual([true, "auto", "solid"]);
		} finally {
			await releaseForcedColors();
		}
		// The browser's wish for less motion reaches the voice: the voice box holds still.
		const releaseReduced = await emulateMedia(browser, "light", "reduced-motion");
		try {
			await pollUntil(
				() => voiceStill(browser),
				Boolean,
				"the voice box to hold still for a person who asked for less motion",
			);
		} finally {
			await releaseReduced();
		}
		const releaseNormal = await emulateMedia(browser, "light", "normal");
		await releaseNormal();
		await pollUntil(
			() => voiceStill(browser),
			(still) => !still,
			"the voice box to move again once motion is allowed",
		);

		// From the keyboard, the bar's key ends voice and releases the browser's media, then offers
		// Talk again. The key that read End voice is the key that reads Talk, so the keyboard keeps
		// its place on it.
		await browser.run(["focus", BAR_VOICE]);
		expect(await focusIs(browser, BAR_VOICE)).toEqual([true, false]);
		await browser.run(["press", "Enter"]);
		const ended = await pollUntil(
			async () => ({
				voice: await voiceNow(browser),
				media: await readControlledVoiceMediaAudit(browser),
			}),
			({ voice, media }) => voice.bar?.mode === "talk" && voice.bar.enabled && released(media, 0),
			"the bar's key to end voice and release the browser's media",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(ended.voice.box).toBeNull();
		expect(await focusIs(browser, BAR_VOICE)).toEqual([true, false]);

		// Talk on the bar's key starts one new session in fullscreen. The voice box carries it over
		// the picture, and the same key, still focused, reads End voice. Space on it ends that session
		// and releases its media.
		const barFrom = records().length;
		await browser.run(["press", "Enter"]);
		const barLive = await pollUntil(
			() => voiceNow(browser),
			(value) =>
				value.bar?.mode === "live" &&
				value.bar.enabled &&
				value.box?.presented === true &&
				value.orb === "box" &&
				value.lit,
			"Talk on the bar's key to start a voice that the box carries in fullscreen",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(barLive.box?.place).toBe("free");
		expect(await focusIs(browser, BAR_VOICE)).toEqual([true, false]);
		const barStarts = frames(barFrom, "thread/realtime/start");
		expect(barStarts).toHaveLength(1);
		const barCoordinator = barStarts[0]?.params?.["threadId"];
		await browser.run(["press", "Space"]);
		const barEnded = await pollUntil(
			async () => ({
				voice: await voiceNow(browser),
				media: await readControlledVoiceMediaAudit(browser),
			}),
			({ voice, media }) => voice.bar?.mode === "talk" && voice.bar.enabled && released(media, 1),
			"Space on the bar's key to end the session it started and release its media",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(barEnded.voice.box).toBeNull();
		expect(await focusIs(browser, BAR_VOICE)).toEqual([true, false]);
		await roleAction(browser, "button", "Exit presentation");
		const stopped = await pollUntil(
			async () => ({
				fullscreen: await stageIsFullscreen(browser),
				voice: await voiceNow(browser),
			}),
			({ fullscreen, voice }) => !fullscreen && voice.state === "off" && voice.enabled,
			"an ended session to leave an enabled Talk in the agent dock",
		);
		expect(stopped.voice.lit).toBe(false);
		expect(
			await browser.eval<boolean>(`(() => {
				const stage = document.querySelector('${PANE_SECTIONS} ${MODEL_STAGE}');
				return stage === globalThis.__codexLiveVoiceCanvas && Boolean(stage?.querySelector('[data-slot="model-diagram"] svg'));
			})()`),
		).toBe(true);

		// Narrate: the server opens the first step in the pane and, once the pane says it arrived,
		// hands it to the voice model as speech. The user then steps by hand, and leaves; each is
		// handed over the same way, and no coordinator turn is started for any of it. Narrating is a
		// new voice session, and a coordinator carries one voice session, so it runs on a fresh one
		// (TASK-301). Subtitles are still on, so the voice is in the box at the foot of the presented
		// walkthrough, with the model's words.
		const narrationFrom = records().length;
		const speeches = () =>
			frames(narrationFrom, "thread/realtime/appendSpeech").map(({ params }) => params?.["text"]);
		const spokenBy = (count: number, what: string) =>
			pollUntil(speeches, (spoken) => spoken.length === count, what, {
				timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS,
			});
		await startModelWalkthrough(browser, model.walkthroughs[0]!.id);
		await pollUntil(
			() => presentedStep(browser),
			(step) => step.index === "0" && !step.moving,
			"the captured walkthrough to draw before narration",
		);
		await browser.run(["click", "[data-slot='semantic-presentation-narrate']"]);
		await pollUntil(
			() => presentedStep(browser),
			(step) => step.index === "0" && !step.moving,
			"Narrate to open the walkthrough on its first step",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		const [first] = await spokenBy(1, "the first step to be handed to the voice model");
		expect(first).toContain("All of it");
		const footed = await pollUntil(
			() => voiceNow(browser),
			(value) => value.box?.place === "foot" && value.orb === "box" && value.lit,
			"the voice to be in the box at the foot of the presented walkthrough",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(footed.box?.pane).toBe("Pane A");
		const subtitled = await pollUntil(
			() => subtitleSnapshot(browser),
			(value) => value.text === VOICE_SAID,
			"the model's words to be subtitled in the voice box",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(subtitled.pane).toBe("Pane A");
		expect(subtitled.withinPane).toBe(true);
		// The step was opened by the server, so the pane credits nobody with what it lit.
		const context = await api<{ panes: { byUser?: string[] }[] }>("/api/panes/semantic-context");
		expect(context.body.panes[0]?.byUser).toBeUndefined();
		await browser.run(["press", "ArrowRight"]);
		const [, second] = await spokenBy(2, "the user's step to be handed to the voice model");
		expect(second).toContain("The warehouse");
		// A pick by hand mid-talk is speech too, naming what is now selected and never its id: the
		// voice is asked to stop and check in (TASK-293.05).
		const ingest = await drawnId(browser, "Ingest");
		await browser.run([
			"click",
			`[data-slot="model-walkthrough"] [data-slot="model-diagram"] [data-semantic-id="${ingest}"]`,
		]);
		const [, , picked] = await spokenBy(
			3,
			"the user's pick during the narration to be handed to the voice model as speech",
		);
		expect(picked).toContain("Ingest");
		expect(picked).not.toContain(ingest);
		expect((await presentedStep(browser)).index).toBe("1");
		await browser.run(["press", "Escape"]);
		await spokenBy(4, "leaving to be told to the voice model");
		expect((await presentedStep(browser)).index).toBeNull();
		const [narrationStart] = frames(narrationFrom, "thread/realtime/start");
		expect(narrationStart?.params?.["initialItems"]).toEqual([]);
		expect(frames(narrationFrom, "thread/start")).toHaveLength(1);
		const narrationCoordinator = narrationStart?.params?.["threadId"];
		// Each voice session ran on a coordinator of its own: Talk in the dock, Talk on the bar's
		// key, and the narration.
		expect(new Set([RAW_COORDINATOR_THREAD_ID, barCoordinator, narrationCoordinator]).size).toBe(3);
		expect(frames(narrationFrom, "turn/start")).toEqual([]);

		// The dock's key, which ends voice while the box has it, ends the narration and releases its media.
		const freed = await pollUntil(
			() => voiceNow(browser),
			(value) => value.box?.place === "free" && value.form === "key" && value.enabled,
			"the voice to be back in the box over the picture once the walkthrough is left",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		expect(freed.state).not.toBe("off");
		await browser.run(["click", DOCK_VOICE]);
		await pollUntil(
			async () => ({
				voice: await voiceNow(browser),
				media: await readControlledVoiceMediaAudit(browser),
			}),
			({ voice, media }) =>
				voice.state === "off" && voice.enabled && voice.box === null && released(media, 2),
			"the dock's key to end the narration and release the browser's media",
			{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
		);
		// Each End stops its session's realtime on the coordinator that session ran on.
		expect(
			await pollUntil(
				() => records().filter(({ kind }) => kind === "realtime_stop"),
				(stops) => stops.length === 3,
				"each ended session to stop on the coordinator",
				{ timeoutMs: TEST_PANE_MESSAGE_TIMEOUT_MS },
			),
		).toEqual([
			expect.objectContaining({ threadId: RAW_COORDINATOR_THREAD_ID }),
			expect.objectContaining({ threadId: barCoordinator }),
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
