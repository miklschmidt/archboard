// What `semantic record` and `semantic replay` share about the video file they write, and the
// refusals of the browser and ffmpeg that write it.

import { accessSync, constants, statSync } from "node:fs";
import { dirname } from "node:path";

import {
	recordingContainerOf,
	TalkFileError,
	freshTalkPlace,
} from "@archboard/walkthrough/recorder";
import { CliUsageError } from "#cli/protocol/contract/contract.ts";

const recorderUnavailableRefusal = {
	code: "RECORDER_UNAVAILABLE",
	exit: 4,
	stream: "stderr" as const,
	description:
		"No Chromium or Google Chrome executable was found, or the one named could not start.",
};
const encoderUnavailableRefusal = {
	code: "ENCODER_UNAVAILABLE",
	exit: 4,
	stream: "stderr" as const,
	description:
		"No ffmpeg with the encoders the file needs (libx264 and aac for MP4, libvpx-vp9 and libopus for WebM) is on PATH or named by ARCHBOARD_FFMPEG, and Nix is not there to run nixpkgs#ffmpeg-headless, or running it failed. Checked before a browser starts, so nothing was started.",
};
const renderFailedRefusal = {
	code: "RENDER_FAILED",
	exit: 1,
	stream: "stderr" as const,
	description:
		"The picture could not be rendered to a file: the page did not draw a frame in time, the browser stopped, or ffmpeg failed. No video was written and the talk was kept, to render again with semantic replay.",
};

/**
 * The container a file name asks for.
 * @param out The file name.
 * @returns The container.
 * @throws {CliUsageError} When the name ends in neither .mp4 nor .webm.
 */
function containerOf(out: string): NonNullable<ReturnType<typeof recordingContainerOf>> {
	const container = recordingContainerOf(out);
	if (container === null) {
		throw new CliUsageError(`--out ${out} must name a .mp4 or .webm file.`);
	}
	return container;
}

/**
 * Refuse an --out whose directory is missing or cannot be written before anything starts: the
 * file is first written there only after the whole talk.
 * @param out The --out the command was given.
 * @param file Where it resolves to.
 * @throws {CliUsageError} When its directory is not one this process can write in.
 */
function requireWritableDirectory(out: string, file: string): void {
	const directory = dirname(file);
	try {
		if (!statSync(directory).isDirectory()) throw new Error(`${directory} is not a directory`);
		accessSync(directory, constants.W_OK);
	} catch (error) {
		const why = error instanceof Error ? error.message : String(error);
		throw new CliUsageError(
			`--out ${out} must be in a directory that exists and can be written (${why}). Create it, or name another.`,
		);
	}
}

/**
 * Where the talk is kept: the directory asked for, or a new one in the state directory.
 * @param asked The --talk the command was given, resolved, if any.
 * @param board The board recorded, which names a talk kept in the state directory.
 * @returns The place, proven free.
 * @throws {CliUsageError} When the directory asked for exists or cannot be made.
 */
function talkPlaceOf(asked: string | undefined, board: string): ReturnType<typeof freshTalkPlace> {
	try {
		return freshTalkPlace(asked, board, new Date());
	} catch (error) {
		if (error instanceof TalkFileError) throw new CliUsageError(error.message);
		throw error;
	}
}

export {
	encoderUnavailableRefusal,
	recorderUnavailableRefusal,
	renderFailedRefusal,
	containerOf,
	talkPlaceOf,
	requireWritableDirectory,
};
