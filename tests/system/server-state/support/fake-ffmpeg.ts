import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const source = join(import.meta.dir, "../fixtures/fake-ffmpeg.ts");

interface FakeFfmpeg {
	/** The executable, for ARCHBOARD_FFMPEG. */
	readonly executablePath: string;
	/** Where it logs each call's argv, one JSON array per line. */
	readonly logPath: string;
}

/**
 * Prepare the fake ffmpeg fixture as an executable in a directory, the way the fake Codex is.
 * @param root A directory the caller removes.
 * @returns Where the fake is and where it logs.
 */
function prepareFakeFfmpeg(root: string): FakeFfmpeg {
	const executablePath = join(root, "ffmpeg-fixture");
	const logPath = join(root, "ffmpeg.ndjson");
	writeFileSync(logPath, "");
	writeFileSync(
		executablePath,
		readFileSync(source, "utf8")
			.replace(/^#!.*\n/, `#!${process.execPath}\n`)
			.replaceAll("__ARCHBOARD_TEST_FFMPEG_LOG__", logPath),
	);
	chmodSync(executablePath, 0o700);
	return { executablePath, logPath };
}

/**
 * What the fake ffmpeg was called with, in order.
 * @param logPath Its log.
 * @returns Each call's arguments.
 */
function ffmpegCalls(logPath: string): string[][] {
	return readFileSync(logPath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as string[]);
}

/** What the fake ffmpeg wrote instead of a video when it was given frames. */
interface FrameManifest {
	/** Its arguments. */
	readonly argv: readonly string[];
	/** The SHA-256 of each frame it read, in order. */
	readonly frames: readonly string[];
	/** The first frame's size, from its SOF marker; absent when there was no frame. */
	readonly width?: number;
	readonly height?: number;
}

/**
 * What the fake ffmpeg made of the frames written to it.
 * @param path The output file it was told to write.
 * @returns Its manifest.
 */
function frameManifest(path: string): FrameManifest {
	return JSON.parse(readFileSync(path, "utf8")) as FrameManifest;
}

export { ffmpegCalls, frameManifest, prepareFakeFfmpeg, type FrameManifest };
