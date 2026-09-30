// Encoding a recording's frames with the voice (TASK-381).
//
// What is guarded: every frame written reaches ffmpeg's input whole and in order, and the
// arguments carry what the container needs (its codecs, and the sound padded to exactly the
// frames' length so picture and voice stay aligned); an ffmpeg that fails is refused with what it
// said and leaves no partial file, whether it fails after the last frame or while frames are
// still being written; and an aborted encoding stops ffmpeg and removes what it had begun.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SAMPLES_PER_FRAME } from "@/shared/walkthrough-recording/talk";
import { openVideoEncoder, type FfmpegCommand } from "@/runtime/video-encoder";

let root: string;
let counter = 0;

/**
 * A fake ffmpeg as a shell script: it may start the output, and it takes the last argument as
 * the output path.
 * @param body What it does with `$out`, the output path, and its arguments.
 * @returns The command line that runs it.
 */
function fake(body: string): FfmpegCommand {
	const path = join(root, `ffmpeg-${counter++}`);
	writeFileSync(path, `#!/bin/sh\nfor out; do :; done\n${body}\n`);
	chmodSync(path, 0o700);
	return { argv: [path], via: "PATH" };
}

/** A fake that keeps the frames it reads as the output, and its arguments beside it. */
const keeping = (): FfmpegCommand => fake('printf "%s\\n" "$@" > "$out.args"\ncat > "$out"');

/**
 * Open an encoder whose output is in the temporary directory.
 * @param command The fake ffmpeg.
 * @param container What is written.
 * @param frames How many frames will be written.
 * @param signal Stops it.
 * @returns The encoder and where its output goes.
 */
function open(
	command: FfmpegCommand,
	container: "mp4" | "webm",
	frames: number,
	signal = new AbortController().signal,
) {
	const out = join(root, `out-${counter++}.${container}`);
	const encoder = openVideoEncoder({
		command,
		container,
		frames,
		voice: join(root, "voice.wav"),
		out,
		signal,
	});
	return { encoder, out };
}

/**
 * The code a refused promise carries.
 * @param attempt What refuses.
 * @returns Its code and message.
 */
async function refusal(attempt: Promise<unknown>): Promise<{ code: unknown; message: string }> {
	try {
		await attempt;
	} catch (error) {
		return { code: (error as { code?: unknown }).code, message: String(error) };
	}
	throw new Error("It did not refuse.");
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "archboard-encoder-"));
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

test("every frame reaches ffmpeg whole and in order, and the MP4's arguments carry its codecs and the padded sound", async () => {
	const { encoder, out } = open(keeping(), "mp4", 3);
	const frames = [1, 2, 3].map((n) => new Uint8Array(70_000).fill(n));
	for (const frame of frames) await encoder.writeFrame(frame);
	const made = await encoder.finish();
	expect(made.mimeType).toBe("video/mp4;codecs=avc1.640028,mp4a.40.2");
	expect(made.bytes).toBe(3 * 70_000);
	const written = readFileSync(out);
	expect(Buffer.compare(written, Buffer.concat(frames))).toBe(0);
	const argv = readFileSync(`${out}.args`, "utf8").split("\n");
	expect(argv).toContain("libx264");
	expect(argv).toContain("aac");
	expect(argv).toContain(`apad=whole_len=${3 * SAMPLES_PER_FRAME}`);
	expect(argv).toContain("+faststart");
});

test("a WebM is VP9 and Opus, with the same padding", async () => {
	const { encoder, out } = open(keeping(), "webm", 2);
	await encoder.writeFrame(new Uint8Array(10));
	const made = await encoder.finish();
	expect(made.mimeType).toBe("video/webm;codecs=vp9,opus");
	const argv = readFileSync(`${out}.args`, "utf8").split("\n");
	expect(argv).toContain("libvpx-vp9");
	expect(argv).toContain("libopus");
	expect(argv).toContain(`apad=whole_len=${2 * SAMPLES_PER_FRAME}`);
});

test("an ffmpeg that fails after its input closes is refused with what it said, and leaves no file", async () => {
	const { encoder, out } = open(
		fake('echo partial > "$out"\ncat > /dev/null\necho "no such codec" >&2\nexit 1'),
		"mp4",
		1,
	);
	await encoder.writeFrame(new Uint8Array(10));
	const refused = await refusal(encoder.finish());
	expect(refused.code).toBe("ENCODING_FAILED");
	expect(refused.message).toContain("no such codec");
	expect(existsSync(out)).toBe(false);
});

test("an ffmpeg that stops while frames are still being written refuses the write in flight", async () => {
	const { encoder } = open(fake('echo "cannot read the voice" >&2\nexit 1'), "mp4", 500);
	const writing = (async () => {
		for (let frame = 0; frame < 500; frame++) {
			await encoder.writeFrame(new Uint8Array(64 * 1024));
		}
	})();
	const refused = await refusal(writing);
	expect(refused.code).toBe("ENCODING_FAILED");
	expect(refused.message).toContain("cannot read the voice");
});

test("aborting stops ffmpeg and removes the partial file", async () => {
	const controller = new AbortController();
	const { encoder, out } = open(
		fake('echo partial > "$out"\nexec sleep 30'),
		"mp4",
		1,
		controller.signal,
	);
	while (!existsSync(out)) {
		await Bun.sleep(10);
	}
	controller.abort();
	expect(existsSync(out)).toBe(false);
	await expect(encoder.finish()).rejects.toBeDefined();
	expect(existsSync(out)).toBe(false);
});
