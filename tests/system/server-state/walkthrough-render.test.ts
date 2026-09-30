// Rendering a talk frame by frame (TASK-381): `renderTalk` in a real headless Chromium against a
// stand-in for the replay page, which only paints a colour that names the frame it was asked for,
// with a fake ffmpeg that keeps what it was fed. The real page is the replay test's business;
// what is guarded here is the render loop around any page that keeps the replay contract.
//
// What is guarded: every frame the talk has is asked for once, in order, and reaches ffmpeg as a
// 1920x1080 JPEG that shows that frame; progress is told once a second of video and at the end;
// ffmpeg is handed the talk's voice and the sound padded to the frames' length; the file is where
// it was asked for only after ffmpeg finished it; and a page that cannot draw a frame fails the
// render as RENDER_FAILED, naming the kept talk, with no file and no partial file written.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import { TalkSchema, framesOf } from "@/shared/walkthrough-recording/talk";
import { renderTalk, writeTalk, askedTalkPlace } from "@/runtime/walkthrough-recorder";

import { frameManifest, prepareFakeFfmpeg } from "./support/fake-ffmpeg.ts";

const SAMPLES = 72_000;
const FRAMES = 45;
let root: string;
let server: ReturnType<typeof Bun.serve>;
let failAt: number | null = null;
let asked: number[] = [];

/** A board of one part with a walkthrough of two steps: all the talk's schema asks of a board. */
const BOARD = {
	schemaVersion: "2.0.0",
	kind: "semantic-board",
	id: "bd1",
	name: "Pipeline",
	level: "system",
	version: 1,
	createdAt: "2026-09-30T00:00:00.000Z",
	updatedAt: "2026-09-30T00:00:00.000Z",
	views: [],
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "Initial",
			lifecycle: "current",
			content: {
				nodes: [{ id: "srv", name: "Server", kind: "service", order: 1000 }],
				edges: [],
				walkthroughs: [
					{
						id: "wk",
						name: "Tour",
						beats: [
							{ id: "b1", heading: "One", body: "First." },
							{ id: "b2", heading: "Two", body: "Second." },
						],
					},
				],
			},
		},
	],
};

/** The stand-in page: it counts frames as the contract says and paints a colour per frame. */
const PAGE = `<!doctype html><html><body style="margin:0"><script>
window.archboardReplay = {
	load: async (talk) => ({ frames: Math.ceil(talk.audio.samples / 1600) }),
	frame: async (n) => {
		await fetch("/asked?n=" + n);
		document.body.style.background = "rgb(" + ((n * 5) % 256) + "," + ((n * 11) % 256) + ",40)";
		const failing = await (await fetch("/failing")).text();
		if (String(n) === failing) throw new Error("frame " + n + " never became ready");
	},
};
</script></body></html>`;

const talk = TalkSchema.parse({
	format: "archboard-talk",
	version: 1,
	recordedAt: "2026-09-30T10:00:00.000Z",
	language: "en",
	theme: "light",
	board: {
		name: "Pipeline",
		variant: null,
		version: 1,
		walkthrough: { id: "wk", name: "Tour" },
		steps: 2,
	},
	audio: { file: "voice.wav", sampleRate: 48_000, channels: 1, samples: SAMPLES, baseLatencyMs: 0 },
	events: [
		{ kind: "step", at: 1, beat: 0 },
		{ kind: "step", at: 40_000, beat: 1 },
		{ kind: "end", at: SAMPLES },
	],
	document: BOARD,
	policy: {
		policy: DEFAULT_SEMANTIC_POLICY,
		configurationValid: true,
		configurationFile: "config.yaml",
		fingerprint: "f1",
		diagnostics: [],
	},
});

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "archboard-render-"));
	server = Bun.serve({
		port: 0,
		fetch(request) {
			const url = new URL(request.url);
			if (url.pathname === "/asked") {
				asked.push(Number(url.searchParams.get("n")));
				return new Response("ok");
			}
			if (url.pathname === "/failing") return new Response(String(failAt));
			return new Response(PAGE, { headers: { "content-type": "text/html" } });
		},
	});
});

afterAll(async () => {
	await server.stop(true);
	rmSync(root, { recursive: true, force: true });
});

/**
 * Render the talk to a file in the temporary directory.
 * @param name The file's name.
 * @returns What it took, and how the render came out.
 */
async function render(name: string) {
	const directory = writeTalk({
		talk,
		voice: new Int16Array(SAMPLES),
		place: askedTalkPlace(join(root, `talk-${name}`)),
	});
	const ffmpeg = prepareFakeFfmpeg(mkdtempSync(join(root, "tools-")));
	asked = [];
	const lines: string[] = [];
	const out = join(root, `${name}.mp4`);
	const outcome = await renderTalk({
		serverUrl: `http://127.0.0.1:${server.port}`,
		talk,
		directory,
		container: "mp4",
		theme: "light",
		out,
		signal: new AbortController().signal,
		say: (line) => lines.push(line),
		ffmpeg: { argv: [ffmpeg.executablePath], via: "ARCHBOARD_FFMPEG" },
	}).then(
		(made) => ({ made }),
		(error: unknown) => ({ error }),
	);
	return { outcome, out, directory, lines };
}

test("every frame is asked for once in order, and reaches ffmpeg as a 1920x1080 picture of that frame", async () => {
	expect(framesOf(talk)).toBe(FRAMES);
	const { outcome, out, directory, lines } = await render("whole");
	if (!("made" in outcome)) throw outcome.error;
	expect(asked).toEqual(Array.from({ length: FRAMES }, (_, n) => n));
	expect(outcome.made.frames).toBe(FRAMES);
	expect(outcome.made.durationMs).toBe(1500);
	expect(outcome.made.mimeType).toContain("video/mp4");
	expect(outcome.made.leftBehind).toEqual([]);
	// The file is what ffmpeg made, moved into place, with no partial file beside it.
	const manifest = frameManifest(out);
	expect(manifest.frames).toHaveLength(FRAMES);
	expect(new Set(manifest.frames).size).toBe(FRAMES);
	expect([manifest.width, manifest.height]).toEqual([1920, 1080]);
	expect(manifest.argv).toContain(join(directory, "voice.wav"));
	expect(manifest.argv).toContain(`apad=whole_len=${FRAMES * 1600}`);
	expect(readdirSync(root).filter((name) => name.endsWith(".partial"))).toEqual([]);
	// Progress once a second of video, and at the end.
	expect(lines).toHaveLength(2);
});

test("a page that cannot draw a frame fails the render as RENDER_FAILED, naming the kept talk, and writes nothing", async () => {
	failAt = 3;
	try {
		const { outcome, out, directory } = await render("failing");
		if (!("error" in outcome)) throw new Error("It did not fail.");
		expect((outcome.error as { code?: unknown }).code).toBe("RENDER_FAILED");
		expect((outcome.error as Error).message).toContain(directory);
		expect(existsSync(out)).toBe(false);
		expect(readdirSync(root).filter((name) => name.endsWith(".partial"))).toEqual([]);
		// The talk is kept.
		expect(existsSync(join(directory, "talk.json"))).toBe(true);
		// Frames 0 to 3 were asked for, and no frame after the one that failed.
		expect(asked).toEqual([0, 1, 2, 3]);
	} finally {
		failAt = null;
	}
});
