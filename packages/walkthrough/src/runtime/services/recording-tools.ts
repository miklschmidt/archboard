// The tools a recording runs on: an ffmpeg proven able to encode, and a private Chromium started
// with the flags its page needs. Both are found before anything is recorded (TASK-381).

import type { RecordingContainer } from "#shared/protocol/recording-page.ts";
import { RECORDER_MS } from "@archboard/timing";
import {
	HeadlessChromiumError,
	discoveredChromiumPath,
	launchHeadlessChromium,
	type HeadlessChromium,
} from "@archboard/renderer/headless-chromium";
import { findFfmpeg, probeFfmpeg, type FfmpegCommand } from "#runtime/services/ffmpeg.ts";
import { WalkthroughRecordingError } from "#runtime/operations/recording-errors.ts";

/**
 * The ffmpeg a file is encoded with, proven before anything starts.
 * @param container What is written.
 * @param say Told what is happening when it takes long: the first run through Nix fetches ffmpeg.
 * @param signal Cancels the proof.
 * @returns Its command line.
 * @throws {EncoderUnavailableError} With code ENCODER_UNAVAILABLE when there is none that can.
 */
async function resolveEncoder(
	container: RecordingContainer,
	say: (line: string) => void,
	signal: AbortSignal,
): Promise<FfmpegCommand> {
	const command = findFfmpeg({ env: process.env, which: Bun.which });
	// The first run through Nix fetches ffmpeg, which takes minutes and is silent.
	if (command.via === "nix") say("Fetching ffmpeg through nix.");
	await probeFfmpeg(command, container, signal);
	return command;
}

/**
 * Start a private Chromium for a recording or a render.
 * @param options Which browser, with which flags, and what cancels it.
 * @param options.chromiumPath The browser; the one the environment names or this machine has when absent.
 * @param options.flags The flags of the caller's own.
 * @param options.tempRootPrefix How the browser's temporary root is named.
 * @param options.signal Cancels the start.
 * @returns The browser.
 * @throws {WalkthroughRecordingError} When there is no browser, or it would not start.
 */
async function startBrowser(options: {
	readonly chromiumPath?: string | undefined;
	readonly flags: readonly string[];
	readonly tempRootPrefix: string;
	readonly signal: AbortSignal;
}): Promise<HeadlessChromium> {
	try {
		return await launchHeadlessChromium({
			chromiumPath: options.chromiumPath ?? discoveredChromiumPath(),
			extraArgs: options.flags,
			startupTimeoutMs: RECORDER_MS.browserStart,
			cleanupTimeoutMs: RECORDER_MS.browserStop,
			tempRootPrefix: options.tempRootPrefix,
			signal: options.signal,
		});
	} catch (error) {
		if (!(error instanceof HeadlessChromiumError)) throw error;
		throw new WalkthroughRecordingError("RECORDER_UNAVAILABLE", error.message, error);
	}
}

export { resolveEncoder, startBrowser };
