// A render that cannot finish (TASK-381): `renderTalk` in a real headless Chromium against a
// stand-in for the replay page that fails one frame, with a fake ffmpeg. The real page's success
// path is walkthrough-replay.test.ts; what is guarded here is what a failed render leaves: it is
// RENDER_FAILED, names the kept talk to render again, asks for no frame after the one that failed,
// and writes no file and no partial file, whether one page draws the talk or one of several fails
// and stops the others (TASK-382).

import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { keepTalk, renderTalk } from "@archboard/walkthrough/recorder";

import { prepareFakeFfmpeg } from "./support/fake-ffmpeg.ts";

const SAMPLES = 72_000;
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

/** The talk, as keepTalk takes it. */
const talkParts: Omit<Parameters<typeof keepTalk>[0], "voice" | "directory"> = {
	recordedAt: new Date("2026-09-30T10:00:00.000Z"),
	language: "en",
	theme: "light",
	board: {
		name: "Pipeline",
		variant: null,
		version: 1,
		walkthrough: { id: "wk", name: "Tour" },
		steps: 2,
	},
	log: {
		samples: SAMPLES,
		baseLatencyMs: 0,
		events: [
			{ kind: "step", at: 1, beat: 0 },
			{ kind: "step", at: 40_000, beat: 1 },
			{ kind: "end", at: SAMPLES },
		],
	},
	document: BOARD,
	policy: {
		policy: DEFAULT_SEMANTIC_POLICY,
		configurationValid: true,
		configurationFile: "config.yaml",
		fingerprint: "f1",
		diagnostics: [],
	},
};

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
 * @param pages How many pages draw it at once.
 * @returns What it took, and how the render came out.
 */
async function render(name: string, pages: number) {
	const directory = join(root, `talk-${name}`);
	const talk = keepTalk({ ...talkParts, voice: new Int16Array(SAMPLES), directory });
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
		layout: "track",
		out,
		signal: new AbortController().signal,
		say: (line) => lines.push(line),
		ffmpeg: { argv: [ffmpeg.executablePath], via: "ARCHBOARD_FFMPEG" },
		pages,
	}).then(
		(made) => ({ made }),
		(error: unknown) => ({ error }),
	);
	return { outcome, out, directory, lines };
}

/**
 * Render with a frame that cannot be drawn, and prove the render failed as a whole: RENDER_FAILED
 * naming the kept talk, no file and no partial file, and no frame asked for after the failing one.
 * @param name The file's name.
 * @param pages How many pages draw it at once.
 * @param failing The frame no page can draw.
 */
async function failsAt(name: string, pages: number, failing: number): Promise<void> {
	failAt = failing;
	try {
		const { outcome, out, directory } = await render(name, pages);
		if (!("error" in outcome)) throw new Error("It did not fail.");
		expect((outcome.error as { code?: unknown }).code).toBe("RENDER_FAILED");
		expect((outcome.error as Error).message).toContain(directory);
		expect(existsSync(out)).toBe(false);
		expect(readdirSync(root).filter((file) => file.endsWith(".partial"))).toEqual([]);
		// The talk is kept.
		expect(existsSync(join(directory, "talk.json"))).toBe(true);
		expect(Math.max(...asked)).toBe(failing);
	} finally {
		failAt = null;
	}
}

test("a page that cannot draw a frame fails the render as RENDER_FAILED, naming the kept talk, and writes nothing", async () => {
	await failsAt("failing", 1, 3);
	// One page asks for frames 0 to 3, in order, and none after the one that failed.
	expect(asked).toEqual([0, 1, 2, 3]);
});

test("a page that fails stops the others, and the render fails as a whole", async () => {
	// Frame 40 is in the second page's first second; every page draws it on the way to its own.
	await failsAt("failing-on-two-pages", 2, 40);
});
