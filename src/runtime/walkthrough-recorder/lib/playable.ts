// A recording that plays with sound wherever it is watched (TASK-305).
//
// A recording is most often an artifact on a pull request, watched in whatever
// browser the reviewer has. The page writes MP4 sound as Opus on Linux, where
// MediaRecorder has no AAC encoder (Chrome encodes AAC only through the
// operating system), and Safari does not play Opus in an MP4: a reviewer on a
// Mac would get the picture in silence. So the sound is converted to AAC by the
// ffmpeg the recorder resolved and probed before it started (TASK-381), the
// picture copied as it is, and the index moved to the front so a browser can
// start playing before the whole file has arrived. If the conversion fails the
// file is kept as recorded, and the recorder says what that means.

import { renameSync, rmSync, statSync } from "node:fs";

import { RECORDING_SOUND_CONVERT_MS } from "@/shared/timing/timing";

/** The media type of an MP4 whose sound is AAC. */
const AAC_MP4 = "video/mp4;codecs=avc1,mp4a.40.2";

/** A recording's file, as it will be handed over. */
interface Playable {
	readonly mimeType: string;
	readonly bytes: number;
	/** What the caller should be told about how the file plays; empty when nothing. */
	readonly notes: readonly string[];
}

/**
 * Start ffmpeg, or say why it could not be.
 * @param command The command line.
 * @param signal Cancels it.
 * @returns The process, or why it did not start.
 */
function started(
	command: readonly string[],
	signal: AbortSignal,
): Bun.Subprocess<"ignore", "ignore", "pipe"> | string {
	try {
		return Bun.spawn([...command], {
			stdin: "ignore",
			stdout: "ignore",
			stderr: "pipe",
			signal,
			timeout: RECORDING_SOUND_CONVERT_MS,
		});
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

/**
 * Convert an MP4's sound to AAC into another file, the picture copied untouched.
 * @param ffmpeg The executable.
 * @param from The recorded file.
 * @param to Where the converted file goes.
 * @param signal Cancels the conversion.
 * @returns Null when it worked, or what ffmpeg said when it did not.
 */
async function convertSound(
	ffmpeg: readonly string[],
	from: string,
	to: string,
	signal: AbortSignal,
): Promise<string | null> {
	const child = started(
		[
			...ffmpeg,
			"-v",
			"error",
			"-nostdin",
			"-y",
			"-i",
			from,
			"-map",
			"0",
			"-c:v",
			"copy",
			"-c:a",
			"aac",
			"-b:a",
			"160k",
			"-movflags",
			"+faststart",
			"-f",
			"mp4",
			to,
		],
		signal,
	);
	if (typeof child === "string") return child;
	const said = await new Response(child.stderr).text();
	const status = await child.exited;
	signal.throwIfAborted();
	return status === 0 ? null : said.trim().split("\n").slice(-3).join(" ") || `exit ${status}`;
}

/**
 * Make a recorded file play with sound everywhere it can: an MP4 whose sound is Opus has it
 * converted to AAC. The file is replaced in place.
 * @param path The recorded file.
 * @param mimeType What the page recorded it as.
 * @param options Which ffmpeg to use, and what cancels it.
 * @param options.ffmpeg The command line that runs it.
 * @param options.signal Cancels the conversion.
 * @returns The file's media type and size, and what the caller should be told.
 */
async function playableEverywhere(
	path: string,
	mimeType: string,
	options: { readonly ffmpeg: readonly string[]; readonly signal: AbortSignal },
): Promise<Playable> {
	const recorded: Playable = { mimeType, bytes: statSync(path).size, notes: [] };
	if (!mimeType.startsWith("video/mp4") || !mimeType.includes("opus")) return recorded;
	const converted = `${path}.aac`;
	try {
		const failed = await convertSound(options.ffmpeg, path, converted, options.signal);
		if (failed !== null) {
			return {
				...recorded,
				notes: [
					`Its sound is Opus, which Safari does not play in an MP4, so a reviewer on a Mac would hear nothing. ffmpeg could not convert it: ${failed}`,
				],
			};
		}
		renameSync(converted, path);
		return { mimeType: AAC_MP4, bytes: statSync(path).size, notes: [] };
	} finally {
		rmSync(converted, { force: true });
	}
}

export { playableEverywhere, type Playable };
