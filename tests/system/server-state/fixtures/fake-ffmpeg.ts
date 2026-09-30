#!/usr/bin/env bun
// A fake ffmpeg for the recording tests (TASK-381). Every call's argv is appended to the log, one
// JSON array per line. It then does what the call asks for:
//  - `-encoders`: it lists the four encoders a recording needs.
//  - `-f image2pipe`: it reads its input to the end, splits it into JPEGs at their start and end
//    markers, and writes at the last argument, the output path, a JSON manifest: its argv, the
//    SHA-256 of each frame in order, and the first frame's width and height from its SOF marker.
//  - otherwise (the sound conversion): it writes a small MP4-shaped file at the output path.
import { createHash } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";

const logPath = "__ARCHBOARD_TEST_FFMPEG_LOG__";
const args = process.argv.slice(2);
appendFileSync(logPath, `${JSON.stringify(args)}\n`);

/**
 * Split a byte stream of JPEGs into its frames: each runs from a start-of-image marker (FF D8) to
 * the next end-of-image marker (FF D9). Entropy-coded data stuffs every FF byte, so neither marker
 * occurs inside one.
 * @param bytes The stream.
 * @returns The frames, in order.
 */
function framesIn(bytes: Buffer): Buffer[] {
	const frames: Buffer[] = [];
	for (let start = bytes.indexOf(Buffer.from([0xff, 0xd8])); start !== -1;) {
		const end = bytes.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
		if (end === -1) break;
		frames.push(bytes.subarray(start, end + 2));
		start = bytes.indexOf(Buffer.from([0xff, 0xd8]), end + 2);
	}
	return frames;
}

/**
 * The size a JPEG's first start-of-frame marker states.
 * @param frame The JPEG.
 * @returns Its width and height, or null when it has no such marker.
 */
function sizeOf(frame: Buffer): { width: number; height: number } | null {
	for (let at = 2; at + 4 <= frame.length;) {
		const marker = frame[at + 1] ?? 0;
		const length = frame.readUInt16BE(at + 2);
		// SOF0 to SOF15, but not DHT (C4), JPG (C8) or DAC (CC).
		if (
			frame[at] === 0xff &&
			marker >= 0xc0 &&
			marker <= 0xcf &&
			![0xc4, 0xc8, 0xcc].includes(marker)
		) {
			return { height: frame.readUInt16BE(at + 5), width: frame.readUInt16BE(at + 7) };
		}
		at += 2 + length;
	}
	return null;
}

if (args.includes("-encoders")) {
	const rows = ["libx264", "aac", "libvpx-vp9", "libopus"].map(
		(name) => ` V....D ${name.padEnd(20)} ${name} encoder`,
	);
	process.stdout.write(`${["Encoders:", " ------", ...rows].join("\n")}\n`);
} else {
	const out = args.at(-1);
	if (out === undefined) process.exit(1);
	if (args.join(" ").includes("-f image2pipe")) {
		const frames = framesIn(Buffer.from(await Bun.stdin.arrayBuffer()));
		const first = frames[0];
		const manifest = {
			argv: args,
			frames: frames.map((frame) => createHash("sha256").update(frame).digest("hex")),
			...(first === undefined ? {} : (sizeOf(first) ?? {})),
		};
		writeFileSync(out, JSON.stringify(manifest));
	} else {
		// An MP4's first box: 24 bytes, size then "ftyp" and its brand.
		writeFileSync(out, Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex"));
	}
}
