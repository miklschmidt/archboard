#!/usr/bin/env bun
// A fake ffmpeg for the recording tests (TASK-381). It lists the four encoders a recording needs
// when asked for its encoders, and otherwise writes a small MP4-shaped file at the last argument,
// the output path. Every call's argv is appended to the log, one JSON array per line.
import { appendFileSync, writeFileSync } from "node:fs";

const logPath = "__ARCHBOARD_TEST_FFMPEG_LOG__";
const args = process.argv.slice(2);
appendFileSync(logPath, `${JSON.stringify(args)}\n`);

if (args.includes("-encoders")) {
	const rows = ["libx264", "aac", "libvpx-vp9", "libopus"].map(
		(name) => ` V....D ${name.padEnd(20)} ${name} encoder`,
	);
	process.stdout.write(`${["Encoders:", " ------", ...rows].join("\n")}\n`);
} else {
	const out = args.at(-1);
	if (out === undefined) process.exit(1);
	// An MP4's first box: 24 bytes, size then "ftyp" and its brand.
	writeFileSync(out, Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex"));
}
