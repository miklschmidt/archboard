// Rendering a kept talk again (TASK-381): `archboard semantic replay` against a real Archboard
// server, in a real headless Chromium running the real replay page, with a fake ffmpeg that keeps
// each frame's hash. The talk is of a board the server made, served and then discarded, so the
// render can only have drawn it from the talk. No Codex and no voice are involved.
//
// What is guarded: one talk renders to the same frames every time, drawn on one page or split
// across two, which hand their frames on in order, with the voice's orb in the walkthrough box
// following a voice that speaks and falls silent; the orb moves on every frame once it is shown;
// every frame is 1920x1080, one per 1/30 s of the talk; the other theme is another picture from
// the first frame; a talk recorded with Blocks is drawn with Blocks unless --layout names the other
// engine, which is another picture (TASK-469); a talk read against a variant draws that comparison
// and no planned frame, which is another picture from the one it draws without it (TASK-478.01);
// and the receipt says what was rendered.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { keepTalk, readTalk, renderTalk } from "@archboard/walkthrough/recorder";
import { parseSemanticBoard } from "@archboard/board/document";
import type { LayoutEngineName } from "@archboard/board/render-reply";
import { TalkSchema, type Talk } from "@archboard/walkthrough/talk";

import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import { TEST_RECORDING_CASE_MS, TEST_RECORDING_CLI_MS } from "../support/timing.ts";
import { frameManifest, prepareFakeFfmpeg } from "./support/fake-ffmpeg.ts";
import { createRequester } from "./support/http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const BOARD = "tour";

/** The frame step two is shown on. */
const STEP_TWO_FRAME = 12;
const FRAMES = 60;
/** The Blocks talk ends after it shows step two. */
const BLOCKS_FRAMES = STEP_TWO_FRAME + 1;

/**
 * A voice that speaks and falls silent by turns, a third of a second each: a tone at a quarter of
 * full scale, so the orb has a level to follow and the voice box turns between speaking and not.
 * @param samples How many samples it has.
 * @returns The voice.
 */
function voiceOf(samples: number): Int16Array {
	return Int16Array.from({ length: samples }, (_, index) =>
		Math.floor(index / 16_000) % 2 === 0
			? Math.round(8192 * Math.sin((2 * Math.PI * 220 * index) / 48_000))
			: 0,
	);
}

let root: string;
let server: OwnedServer;
let talkDirectory: string;
/** The same talk, recorded with Blocks. */
let blocksTalkDirectory: string;
/** The talk of a proposal on an unbuilt board, read against the variant below it, and the same without. */
let againstTalkDirectory: string;
let plainTalkDirectory: string;
/** The id of the variant the talk is read against. */
let againstVariant: string;
let ffmpeg: string;
/** The variant the talk was recorded on, the board's current one. */
let recordedVariant: string;

/**
 * A two-step talk of the board as the server served it: a word at the first step, then the
 * second step, which frames only the ledger.
 * @param document The board, as the server served it.
 * @param policy The vault check, as the server served it.
 * @param layout The layout engine it was recorded with.
 * @returns The talk.
 */
function talkOf(
	document: unknown,
	policy: unknown,
	layout: LayoutEngineName,
	frames = FRAMES,
): Talk {
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
		layout,
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
			samples: frames * 1600,
			baseLatencyMs: 0,
		},
		events: [
			{ kind: "drawn", at: 0, version: board.version },
			{ kind: "step", at: 3200, beat: 0 },
			{ kind: "said", at: 4800, itemId: "a1", text: "Every request enters", final: false },
			{ kind: "said", at: 8000, itemId: "a1", text: "Every request enters here.", final: true },
			{ kind: "step", at: STEP_TWO_FRAME * 1600, beat: 1 },
			{ kind: "end", at: frames * 1600 },
		],
		document,
		policy,
	});
}

/**
 * A talk of the proposal on a board nobody has built, drawn as the server served it.
 * @param served The board and the vault check, as the server served them.
 * @param served.document The board.
 * @param served.policy The vault check.
 * @param against Whether the talk is read against the variant below the proposal.
 * @returns The talk.
 */
function proposalTalk(served: { document: unknown; policy: unknown }, against: boolean): Talk {
	const parsed = parseSemanticBoard(served.document);
	if (!parsed.ok) throw new Error(parsed.problem);
	const { board } = parsed;
	const proposal = board.variants.find((entry) => entry.name === "one")!;
	againstVariant = board.variants.find((entry) => entry.name === "base")!.id;
	const walkthrough = proposal.content.walkthroughs![0]!;
	return TalkSchema.parse({
		format: "archboard-talk",
		version: 1,
		recordedAt: "2026-09-30T10:00:00.000Z",
		language: "en",
		theme: "light",
		board: {
			name: "stacked",
			variant: proposal.id,
			...(against ? { against: againstVariant } : {}),
			version: board.version,
			walkthrough: { id: walkthrough.id, name: walkthrough.name },
			steps: 1,
		},
		audio: {
			file: "voice.wav",
			sampleRate: 48_000,
			channels: 1,
			samples: 12 * 1600,
			baseLatencyMs: 0,
		},
		events: [
			{ kind: "drawn", at: 0, version: board.version },
			{ kind: "step", at: 3200, beat: 0 },
			{ kind: "end", at: 12 * 1600 },
		],
		document: served.document,
		policy: served.policy,
	});
}

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), "archboard-replay-"));
	const vault = vaultIn(join(root, "vault"));
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
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
				// A container, so Track and Blocks lay it out differently: a row, and a column.
				// The overview closes it, so the beats are told through a view that opens it.
				nodes: [
					{ name: "Edge", kind: "service" },
					{ name: "Gateway", kind: "service", parent: "Edge" },
					{ name: "Ledger", kind: "service" },
				],
				views: [
					{
						name: "Inside the edge",
						grammar: "architecture",
						scope: { kind: "selection", nodes: ["Gateway", "Ledger"] },
					},
				],
				walkthroughs: [
					{
						name: "How a request lands",
						beats: [
							{
								heading: "The front door",
								body: "Every request enters at the gateway.",
								view: "Inside the edge",
							},
							{
								heading: "One writer",
								body: "Only the ledger writes.",
								subjects: ["Ledger"],
								view: "Inside the edge",
							},
						],
					},
				],
			},
		},
	});
	expect(created.status).toBe(200);
	const served = await request<{ board: unknown }>(`/api/semantic-boards/board?board=${BOARD}`);
	const policy = await request("/api/vault/check");
	const talk = talkOf(served.body!.board, policy.body, "track");
	const discarded = await request("/api/semantic-boards/discard", {
		method: "POST",
		doing: "discarding the replayed board",
		body: { board: BOARD, session: "replay" },
	});
	expect(discarded.status).toBe(200);
	talkDirectory = keepTalk({
		talk,
		voice: voiceOf(talk.audio.samples),
		directory: join(root, "talk"),
	});
	const blocksTalk = talkOf(served.body!.board, policy.body, "blocks", BLOCKS_FRAMES);
	blocksTalkDirectory = keepTalk({
		talk: blocksTalk,
		voice: voiceOf(blocksTalk.audio.samples),
		directory: join(root, "blocks-talk"),
	});
	await keepStackedTalks(request);
	ffmpeg = prepareFakeFfmpeg(root).executablePath;
}, TEST_RECORDING_CASE_MS);

/**
 * Make a board of two unbuilt variants, the second a part larger than the first, keep a talk of
 * the second read against the first and one read as the board reads it, and discard the board.
 * @param request The requester of the owned server.
 */
async function keepStackedTalks(request: ReturnType<typeof createRequester>): Promise<void> {
	const created = await request("/api/semantic-boards/create", {
		method: "POST",
		doing: "making a stack to replay",
		body: {
			board: "stacked",
			create: {
				level: "system",
				lifecycle: "draft",
				variant: "base",
				nodes: [
					{ name: "Gateway", kind: "service" },
					{ name: "Ledger", kind: "service" },
				],
				walkthroughs: [
					{ name: "What changes", beats: [{ heading: "A worker", body: "The worker is new." }] },
				],
			},
		},
	});
	expect(created.status).toBe(200);
	const branched = await request("/api/semantic-boards/branch?expectVersion=1", {
		method: "POST",
		doing: "proposing a worker",
		body: { board: "stacked", branch: { from: "base", name: "one" } },
	});
	expect(branched.status).toBe(200);
	const edited = await request("/api/semantic-boards/edit?expectVersion=2", {
		method: "POST",
		doing: "adding the worker",
		body: {
			board: "stacked",
			edit: { variant: "one", nodes: [{ name: "Worker", kind: "service" }] },
		},
	});
	expect(edited.status).toBe(200);
	const served = await request<{ board: unknown }>("/api/semantic-boards/board?board=stacked");
	const policy = (await request("/api/vault/check")).body;
	const from = { document: served.body!.board, policy };
	const voice = voiceOf(12 * 1600);
	againstTalkDirectory = keepTalk({
		talk: proposalTalk(from, true),
		voice,
		directory: join(root, "against-talk"),
	});
	plainTalkDirectory = keepTalk({
		talk: proposalTalk(from, false),
		voice,
		directory: join(root, "plain-talk"),
	});
	const discarded = await request("/api/semantic-boards/discard", {
		method: "POST",
		doing: "discarding the replayed stack",
		body: { board: "stacked", session: "replay" },
	});
	expect(discarded.status).toBe(200);
}

afterAll(async () => {
	await server.dispose();
	rmSync(root, { recursive: true, force: true });
});

/**
 * Render a talk.
 * @param name The file's name, without its extension.
 * @param options What to render, and how.
 * @param options.talk The talk's directory; the one recorded with Track when absent.
 * @param options.theme The theme to render it in, or the talk's.
 * @param options.layout The layout engine to render it with, or the talk's.
 * @returns The receipt and the hash of each frame, in order.
 */
function replay(
	name: string,
	options: {
		readonly talk?: string;
		readonly theme?: "light" | "dark";
		readonly layout?: LayoutEngineName;
	} = {},
): { receipt: Record<string, unknown>; frames: readonly string[] } {
	const out = join(root, `${name}.mp4`);
	const { theme, layout } = options;
	const replayed = spawnSync(
		join(repoRoot, "bin/archboard"),
		[
			"semantic",
			"replay",
			options.talk ?? talkDirectory,
			"--out",
			out,
			...(theme ? ["--theme", theme] : []),
			...(layout ? ["--layout", layout] : []),
		],
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
		layout: "track",
		out,
		signal: new AbortController().signal,
		say: () => undefined,
		ffmpeg: { argv: [ffmpeg], via: "ARCHBOARD_FFMPEG" },
		pages: 2,
	});
	return frameManifest(out).frames;
}

test(
	"a kept talk renders to the same frames every time, on one page or two, with its voice's orb moving, and again in the other theme",
	async () => {
		const first = replay("first");
		const again = await replayOnTwoPages();
		const dark = replay("dark", { theme: "dark" });
		expect(first.receipt).toMatchObject({
			success: true,
			board: BOARD,
			variant: recordedVariant,
			steps: 2,
			frames: FRAMES,
			durationMs: 2000,
			theme: "light",
			layout: "track",
		});
		expect(first.frames).toHaveLength(FRAMES);
		expect(again).toEqual(first.frames);
		// Once the walkthrough is presented, its voice box holds the orb, which never stands still.
		const lit = first.frames.slice(FRAMES - 10);
		expect(new Set(lit).size).toBe(lit.length);
		expect(dark.receipt).toMatchObject({ theme: "dark", frames: FRAMES });
		expect(dark.frames[0]).not.toBe(first.frames[0]);
	},
	TEST_RECORDING_CASE_MS,
);

test(
	"a talk recorded with Blocks is drawn with Blocks, and --layout draws it with the other engine",
	() => {
		const blocks = replay("blocks", { talk: blocksTalkDirectory });
		const track = replay("blocks-as-track", { talk: blocksTalkDirectory, layout: "track" });
		expect(blocks.receipt).toMatchObject({ layout: "blocks", frames: BLOCKS_FRAMES });
		expect(track.receipt).toMatchObject({ layout: "track", frames: BLOCKS_FRAMES });
		// The talk opens on the overview, which the two engines draw alike; the
		// beats' view opens the container, which they lay out differently.
		expect(blocks.frames.at(-1)).not.toBe(track.frames.at(-1));
	},
	TEST_RECORDING_CASE_MS,
);

test(
	"a talk read against a variant draws that comparison without the planned frame, and the receipt names it",
	() => {
		const against = replay("against", { talk: againstTalkDirectory });
		const plain = replay("against-plain", { talk: plainTalkDirectory });
		expect(against.receipt).toMatchObject({ against: againstVariant, frames: 12 });
		expect(plain.receipt).toMatchObject({ against: null, frames: 12 });
		// The plain talk is drawn framed as planned, the other is not: they are not one picture.
		expect(against.frames[11]).not.toBe(plain.frames[11]);
	},
	TEST_RECORDING_CASE_MS,
);
