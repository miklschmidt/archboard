// Rendering a kept talk again (TASK-381): `archboard semantic replay` against a real Archboard
// server, in a real headless Chromium running the real replay page, with a fake ffmpeg that keeps
// each frame's hash. The talk is of a board the server made, served and then discarded, so the
// render can only have drawn it from the talk. No Codex and no voice are involved.
//
// What is guarded: one talk renders to the same frames every time, drawn on one page or split
// across two, which hand their frames on in order; the picture moves when a step is shown and is
// still once the step has arrived; every frame is 1920x1080, one per 1/30 s of the talk; the
// other theme is another picture from the first frame; and the receipt says what was rendered.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { askedTalkPlace, readTalk, renderTalk, writeTalk } from "@/runtime/walkthrough-recorder";
import { parseSemanticBoard } from "@/shared/semantic-board/index";
import { TalkSchema, type Talk } from "@/shared/walkthrough-recording/talk";

import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { TEST_RECORDING_CASE_MS, TEST_RECORDING_CLI_MS } from "../support/timing.ts";
import { frameManifest, prepareFakeFfmpeg } from "./support/fake-ffmpeg.ts";
import { createRequester } from "./support/http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const BOARD = "tour";

/** The frame step two is shown on, and the talk's last frame. */
const STEP_TWO_FRAME = 12;
const FRAMES = 60;

let root: string;
let server: OwnedServer;
let talkDirectory: string;
let ffmpeg: string;
/** The variant the talk was recorded on, the board's current one. */
let recordedVariant: string;

/**
 * A two-step talk of the board as the server served it: a word at the first step, then the
 * second step, which frames only the ledger.
 * @param document The board, as the server served it.
 * @param policy The vault check, as the server served it.
 * @returns The talk.
 */
function talkOf(document: unknown, policy: unknown): Talk {
	const parsed = parseSemanticBoard(document);
	if (!parsed.ok) throw new Error(parsed.problem);
	const { board } = parsed;
	const variant = board.variants.find((entry) => entry.id === board.current)!;
	recordedVariant = variant.id;
	const walkthrough = variant.content.walkthroughs![0]!;
	return TalkSchema.parse({
		format: "archboard-talk",
		version: 1,
		recordedAt: "2026-09-30T10:00:00.000Z",
		language: "en",
		theme: "light",
		board: {
			name: BOARD,
			variant: null,
			version: board.version,
			walkthrough: { id: walkthrough.id, name: walkthrough.name },
			steps: 2,
		},
		audio: {
			file: "voice.wav",
			sampleRate: 48_000,
			channels: 1,
			samples: FRAMES * 1600,
			baseLatencyMs: 0,
		},
		events: [
			{ kind: "drawn", at: 0, version: board.version },
			{ kind: "step", at: 3200, beat: 0 },
			{ kind: "said", at: 4800, itemId: "a1", text: "Every request enters", final: false },
			{ kind: "said", at: 8000, itemId: "a1", text: "Every request enters here.", final: true },
			{ kind: "step", at: STEP_TWO_FRAME * 1600, beat: 1 },
			{ kind: "end", at: FRAMES * 1600 },
		],
		document,
		policy,
	});
}

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), "archboard-replay-"));
	const vault = join(root, "vault");
	server = await startOwnedServer({
		serverPath: join(repoRoot, "src/server.ts"),
		vault,
		env: { LOG_FILE_PATH: join(root, "server.log") },
	});
	const request = createRequester(server);
	const created = await request("/api/semantic-boards/create", {
		method: "POST",
		doing: "making a board to replay",
		body: {
			board: BOARD,
			create: {
				level: "system",
				// No relationship, so no traffic: a picture at rest does not change from frame to frame.
				nodes: [
					{ name: "Gateway", kind: "service" },
					{ name: "Ledger", kind: "service" },
				],
				walkthroughs: [
					{
						name: "How a request lands",
						beats: [
							{ heading: "The front door", body: "Every request enters at the gateway." },
							{ heading: "One writer", body: "Only the ledger writes.", subjects: ["Ledger"] },
						],
					},
				],
			},
		},
	});
	expect(created.status).toBe(200);
	const served = await request<{ board: unknown }>(`/api/semantic-boards/board?board=${BOARD}`);
	const policy = await request("/api/vault/check");
	const talk = talkOf(served.body!.board, policy.body);
	const discarded = await request("/api/semantic-boards/discard", {
		method: "POST",
		doing: "discarding the replayed board",
		body: { board: BOARD, session: "replay" },
	});
	expect(discarded.status).toBe(200);
	talkDirectory = writeTalk({
		talk,
		voice: new Int16Array(talk.audio.samples),
		place: askedTalkPlace(join(root, "talk")),
	});
	ffmpeg = prepareFakeFfmpeg(root).executablePath;
}, TEST_RECORDING_CASE_MS);

afterAll(async () => {
	await server.dispose();
	rmSync(root, { recursive: true, force: true });
});

/**
 * Render the talk.
 * @param name The file's name, without its extension.
 * @param theme The theme to render it in, or the talk's.
 * @returns The receipt and the hash of each frame, in order.
 */
function replay(
	name: string,
	theme?: "light" | "dark",
): { receipt: Record<string, unknown>; frames: readonly string[] } {
	const out = join(root, `${name}.mp4`);
	const replayed = spawnSync(
		join(repoRoot, "bin/archboard"),
		["semantic", "replay", talkDirectory, "--out", out, ...(theme ? ["--theme", theme] : [])],
		{
			cwd: repoRoot,
			encoding: "utf8",
			timeout: TEST_RECORDING_CLI_MS,
			// A hung CLI tears its browser down on SIGTERM, which SIGKILL would leave running.
			killSignal: "SIGTERM",
			env: {
				...process.env,
				ARCHBOARD_URL: server.base,
				ARCHBOARD_NO_AUTOSTART: "1",
				ARCHBOARD_FFMPEG: ffmpeg,
			},
		},
	);
	expect({ status: replayed.status, stderr: replayed.stderr }).toMatchObject({ status: 0 });
	const manifest = frameManifest(out);
	expect([manifest.width, manifest.height]).toEqual([1920, 1080]);
	return {
		receipt: JSON.parse(replayed.stdout) as Record<string, unknown>,
		frames: manifest.frames,
	};
}

/**
 * Render the talk on two pages at once, each taking its own seconds' frames (TASK-382).
 * @returns The hash of each frame, in order.
 */
async function replayOnTwoPages(): Promise<readonly string[]> {
	const out = join(root, "two-pages.mp4");
	await renderTalk({
		serverUrl: server.base,
		talk: readTalk(talkDirectory),
		directory: talkDirectory,
		container: "mp4",
		theme: "light",
		out,
		signal: new AbortController().signal,
		say: () => undefined,
		ffmpeg: { argv: [ffmpeg], via: "ARCHBOARD_FFMPEG" },
		pages: 2,
	});
	return frameManifest(out).frames;
}

test(
	"a kept talk renders to the same frames every time, on one page or two, moving at its steps, and again in the other theme",
	async () => {
		const first = replay("first");
		const again = await replayOnTwoPages();
		const dark = replay("dark", "dark");
		expect(first.receipt).toMatchObject({
			success: true,
			board: BOARD,
			variant: recordedVariant,
			steps: 2,
			frames: FRAMES,
			durationMs: 2000,
			theme: "light",
		});
		expect(first.frames).toHaveLength(FRAMES);
		expect(again).toEqual(first.frames);
		// The second step moves the picture on from where the first left it...
		const { frames } = first;
		expect(frames[STEP_TWO_FRAME + 3]).not.toBe(frames[STEP_TWO_FRAME - 1]);
		// ...and once it has arrived, nothing moves until the talk ends.
		expect(new Set(frames.slice(FRAMES - 10)).size).toBe(1);
		expect(dark.receipt).toMatchObject({ theme: "dark", frames: FRAMES });
		expect(dark.frames[0]).not.toBe(frames[0]);
	},
	TEST_RECORDING_CASE_MS,
);
