// Recording a walkthrough end to end (TASK-304): `archboard semantic record` against a real Archboard server
// whose Codex is the production fixture, narrating, in a real headless Chromium running the real
// page. Only the voice is fake: it answers the browser's WebRTC offer with an answer nobody
// connects to, and speaks one line about every step it is handed.
//
// What is guarded: the command writes a video file that went through every step of the
// walkthrough, each handed to the voice in order and left only once the voice had finished it;
// the voice is started in the language --language named (TASK-380); the receipt says what was
// recorded; --discard removes the board once the file is written; and the recording is
// encoded by the ffmpeg ARCHBOARD_FFMPEG names, proven before the talk starts (TASK-381), which is
// a fake here.

import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { declareTestWallClockBudget } from "../repository-policy/support/test-wall-clock.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { TEST_RECORDING_CASE_MS, TEST_RECORDING_CLI_MS } from "../support/timing.ts";
import {
	prepareProductionFixture,
	productionRecords as records,
} from "./support/codex-production.ts";
import { ffmpegCalls, prepareFakeFfmpeg } from "./support/fake-ffmpeg.ts";
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
				"A recording is as long as its talk: the overview lead, two steps each glided to, spoken and paused after, and the tail, all on the wall clock the page paces by",
			outerBoundMs: TEST_RECORDING_CASE_MS,
			task: "TASK-304",
			evidence: "10.2 s on 2026-09-23, of which about 8 s is the recorded talk itself",
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
			const recorded = spawnSync(
				join(repoRoot, "bin/archboard"),
				[
					"semantic",
					"record",
					BOARD,
					"--out",
					out,
					"--language",
					"da",
					"--discard",
					"--doing",
					"recording the tour",
				],
				{
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
				},
			);
			expect({ status: recorded.status, stderr: recorded.stderr }).toMatchObject({ status: 0 });
			const receipt = JSON.parse(recorded.stdout) as {
				steps: number;
				bytes: number;
				mimeType: string;
				file: string;
				discarded: boolean;
			};
			expect(receipt).toMatchObject({ steps: 2, file: out, discarded: true });
			expect(receipt.mimeType.startsWith("video/mp4")).toBe(true);

			// An MP4 whose size is what the receipt says.
			const video = readFileSync(out);
			expect(video.byteLength).toBe(receipt.bytes);
			expect(video.subarray(4, 8).toString("latin1")).toBe("ftyp");

			// The named ffmpeg was asked what it can encode, then converted the recorded sound.
			const calls = ffmpegCalls(ffmpeg.logPath);
			expect(calls[0]).toContain("-encoders");
			expect(calls.slice(1).some((call) => call.includes("aac"))).toBe(true);

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
