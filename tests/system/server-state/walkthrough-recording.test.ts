// Recording a walkthrough end to end (TASK-304): `archboard semantic record` against a real Archboard server
// whose Codex is the production fixture, narrating, in a real headless Chromium running the real
// page. Only the voice is fake: it answers the browser's WebRTC offer with an answer nobody
// connects to, and speaks one line about every step it is handed.
//
// What is guarded: the command keeps a talk that went through every step of the walkthrough,
// each handed to the voice in order and left only once the voice had finished it, with the
// voice's words stamped on it and the voice itself as long as the talk; the voice is started in
// the language --language named (TASK-380); the picture is rendered from the talk frame by frame
// and encoded by the ffmpeg ARCHBOARD_FFMPEG names, proven before the talk starts, which is a fake
// here (TASK-381); the talk keeps the --layout engine its picture was rendered with (TASK-469);
// the receipt says what was recorded; and --discard removes the board once the file is written.
// Rendering a kept talk again is walkthrough-replay.test.ts's.

import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { readTalk } from "@/runtime/walkthrough-recorder";

import { declareTestWallClockBudget } from "../repository-policy/support/test-wall-clock.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { TEST_RECORDING_CASE_MS, TEST_RECORDING_CLI_MS } from "../support/timing.ts";
import {
	prepareProductionFixture,
	productionRecords as records,
} from "./support/codex-production.ts";
import { ffmpegCalls, frameManifest, prepareFakeFfmpeg } from "./support/fake-ffmpeg.ts";
import { createRequester } from "./support/http.ts";

const serverPath = join(import.meta.dir, "fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");
const repoRoot = join(import.meta.dir, "../../..");
const BOARD = "tour";

/** The steps the walkthrough tells, in order. */
const HEADINGS = ["The front door", "One writer"];

const RECORDED =
	"a walkthrough is recorded to a video with every step narrated, and --discard removes the board";

test(
	RECORDED,
	async () => {
		declareTestWallClockBudget({
			test: RECORDED,
			reason:
				"A recording is as long as its talk: the overview lead, two steps each glided to, spoken and paused after, and the tail, all on the wall clock the page paces by; then the talk's picture is rendered frame by frame",
			outerBoundMs: TEST_RECORDING_CASE_MS,
			task: "TASK-381",
			evidence: "30.0 s on 2026-09-30: the talk is about 8 s and rendering its frames about 20 s",
		});
		const resources = new AsyncDisposableStack();
		try {
			const fixture = prepareProductionFixture(resources, executableSource);
			writeFileSync(fixture.controlPath, JSON.stringify({ narrates: true }));
			const server = await startOwnedServer({
				serverPath,
				vault: fixture.vault,
				env: {
					ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
					ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
					ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
					XDG_STATE_HOME: join(fixture.root, "state"),
				},
			});
			resources.defer(() => server.dispose());
			const ffmpeg = prepareFakeFfmpeg(fixture.root);
			const request = createRequester(server);
			// Another board first, so a new pane's first board is not the one recorded: the
			// recording page has to ask for its board by its own client id.
			const other = await request("/api/semantic-boards/create", {
				method: "POST",
				doing: "making a board that is not recorded",
				body: {
					board: "Alpha",
					create: { level: "system", nodes: [{ name: "Elsewhere", kind: "service" }] },
				},
			});
			expect(other.status).toBe(200);
			const created = await request("/api/semantic-boards/create", {
				method: "POST",
				doing: "making a board to record",
				body: {
					board: BOARD,
					create: {
						level: "system",
						nodes: [
							{ name: "Gateway", kind: "service" },
							{ name: "Ledger", kind: "service" },
						],
						edges: [{ from: "Gateway", to: "Ledger", kind: "call" }],
						walkthroughs: [
							{
								name: "How a request lands",
								beats: [
									{ heading: HEADINGS[0], body: "Every request enters at the gateway." },
									{ heading: HEADINGS[1], body: "Only the ledger writes.", subjects: ["Ledger"] },
								],
							},
						],
					},
				},
			});
			expect(created.status).toBe(200);

			const out = join(fixture.root, "tour.mp4");
			const kept = join(fixture.root, "tour-talk");
			/**
			 * Run the CLI against the server, with the fake ffmpeg.
			 * @param args Its arguments.
			 * @returns How it ended.
			 */
			const cli = (args: readonly string[]) =>
				spawnSync(join(repoRoot, "bin/archboard"), args, {
					cwd: repoRoot,
					encoding: "utf8",
					timeout: TEST_RECORDING_CLI_MS,
					// A hung CLI tears its browser down on SIGTERM, which SIGKILL would leave running.
					killSignal: "SIGTERM",
					env: {
						...process.env,
						ARCHBOARD_VAULT: fixture.vault,
						ARCHBOARD_URL: server.base,
						ARCHBOARD_NO_AUTOSTART: "1",
						ARCHBOARD_FFMPEG: ffmpeg.executablePath,
					},
				});
			const recorded = cli([
				"semantic",
				"record",
				BOARD,
				"--out",
				out,
				"--talk",
				kept,
				"--language",
				"da",
				"--layout",
				"blocks",
				"--discard",
				"--doing",
				"recording the tour",
			]);
			expect({ status: recorded.status, stderr: recorded.stderr }).toMatchObject({ status: 0 });
			const receipt = JSON.parse(recorded.stdout) as {
				steps: number;
				bytes: number;
				mimeType: string;
				file: string;
				discarded: boolean;
				frames: number;
				talk: string;
			};
			expect(receipt).toMatchObject({
				steps: 2,
				file: out,
				discarded: true,
				talk: kept,
				layout: "blocks",
			});
			expect(receipt.mimeType.startsWith("video/mp4")).toBe(true);

			// The talk went through both steps in order, with the voice's words on it, and ended
			// last; reading it proves its voice is as long as the talk.
			const talk = readTalk(kept);
			// It keeps the engine its picture was laid out with, which a replay draws again.
			expect(talk.layout).toBe("blocks");
			const shown = talk.events.flatMap((event) => (event.kind === "step" ? [event.beat] : []));
			expect(shown).toEqual([0, 1]);
			expect(
				talk.events.some(
					(event) => event.kind === "said" && event.final && event.text.includes(HEADINGS[0]!),
				),
			).toBe(true);
			expect(talk.events[0]).toEqual({ kind: "drawn", at: 0, version: talk.board.version });
			expect(talk.events.at(-1)?.kind).toBe("end");

			// The picture was rendered from the talk, one 1920x1080 frame per 1/30 s, by the named
			// ffmpeg, which was asked what it can encode before anything started.
			expect(readFileSync(out).byteLength).toBe(receipt.bytes);
			const video = frameManifest(out);
			expect(video.frames).toHaveLength(receipt.frames);
			expect(receipt.frames).toBe(Math.ceil(talk.audio.samples / 1600));
			expect([video.width, video.height]).toEqual([1920, 1080]);
			expect(video.argv).toContain(join(kept, "voice.wav"));
			expect(ffmpegCalls(ffmpeg.logPath)[0]).toContain("-encoders");

			// The voice was started in the language the command named, whatever language the steps
			// are written in.
			const frames = records(fixture.logPath);
			const starts = frames.filter(
				(frame) => frame.kind === "frame" && frame.method === "thread/realtime/start",
			);
			expect(starts).toHaveLength(1);
			expect(String(starts[0]?.params?.["prompt"])).toContain("Danish");

			// Every step reached the voice, in order, and the next only after the voice had finished
			// the one before: its line was completed before the next step was handed over.
			const handed = frames.filter(
				(frame) => frame.kind === "frame" && frame.method === "thread/realtime/appendSpeech",
			);
			expect(
				handed.map((frame) =>
					HEADINGS.find((heading) => String(frame.params?.["text"]).includes(heading)),
				),
			).toEqual(HEADINGS);
			const secondHanded = frames.indexOf(handed[1] ?? handed[0]!);
			const firstExplained = frames.findIndex(
				(frame) =>
					frame.kind === "notification" &&
					frame.method === "thread/realtime/item/completed" &&
					(frame.params?.["item"] as { id?: string } | undefined)?.id === "narrated-step-1",
			);
			expect(firstExplained).toBeGreaterThan(-1);
			expect(firstExplained).toBeLessThan(secondHanded);

			// Discarded once the file was written.
			expect(existsSync(join(fixture.vault, `${BOARD}.semantic.json`))).toBe(false);
		} finally {
			await resources.disposeAsync();
		}
	},
	TEST_RECORDING_CASE_MS,
);
