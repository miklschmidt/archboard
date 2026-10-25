// Finding an ffmpeg that can encode a recording, and proving it can before a browser starts
// (TASK-381).
//
// The recorder's encoder is ffmpeg. It uses the one the environment names, else the one on PATH,
// else runs nixpkgs' through Nix, and refuses when there is none of these: a recording is minutes
// of a live voice session, and a machine that cannot encode it should find out first.

import { RECORDER_MS } from "@archboard/timing";
import type { RecordingContainer } from "#shared/protocol/recording-page.ts";

/** The variable that names an ffmpeg executable. */
const FFMPEG_VARIABLE = "ARCHBOARD_FFMPEG";

/** A command line that runs ffmpeg: append ffmpeg's own arguments. */
interface FfmpegCommand {
	readonly argv: readonly string[];
	/** Where the command line came from. */
	readonly via: typeof FFMPEG_VARIABLE | "PATH" | "nix";
}

/** The lookups resolution reads, injected so resolution stays pure. */
interface FfmpegLookups {
	/** The environment. */
	readonly env: Readonly<Record<string, string | undefined>>;
	/**
	 * The executable a name resolves to on PATH.
	 * @param name The executable's name.
	 * @returns Its path, or null when there is none.
	 */
	readonly which: (name: string) => string | null;
}

/** Why no ffmpeg can encode the recording. */
class EncoderUnavailableError extends Error {
	readonly code = "ENCODER_UNAVAILABLE";

	/**
	 * Refuse a recording for want of an encoder.
	 * @param message What is missing and how to have it.
	 */
	constructor(message: string) {
		super(message);
		this.name = "EncoderUnavailableError";
	}
}

/**
 * The encoders each container's recording needs: picture, then sound.
 * The MP4 is what Safari plays, so its sound is AAC; the WebM is VP9 and Opus.
 */
const REQUIRED_ENCODERS: Readonly<Record<RecordingContainer, readonly string[]>> = {
	mp4: ["libx264", "aac"],
	webm: ["libvpx-vp9", "libopus"],
};

/**
 * Nix runs nixpkgs' ffmpeg-headless from the machine's registry, not a pinned revision. Its
 * `meta.mainProgram` is ffmpeg, and the two experimental features are what a default Nix
 * install needs for `nix run`. ffmpeg-headless has libx264, libvpx, opus and the native AAC.
 */
const NIX_ARGV: readonly string[] = [
	"--extra-experimental-features",
	"nix-command flakes",
	"run",
	"nixpkgs#ffmpeg-headless",
	"--",
];

/**
 * The ffmpeg to encode with: the one ARCHBOARD_FFMPEG names, else the one on PATH, else nixpkgs'
 * run through Nix. Nothing here runs the command; `probeFfmpeg` does.
 * @param lookups The environment and the PATH lookup.
 * @param lookups.env The environment.
 * @param lookups.which The PATH lookup.
 * @returns The command line.
 * @throws {EncoderUnavailableError} When there is no ffmpeg and no Nix.
 */
function findFfmpeg({ env, which }: FfmpegLookups): FfmpegCommand {
	const named = env[FFMPEG_VARIABLE];
	// A named ffmpeg is never passed over: if it is broken, the probe refuses naming it.
	if (named !== undefined && named !== "") return { argv: [named], via: FFMPEG_VARIABLE };
	const onPath = which("ffmpeg");
	if (onPath !== null) return { argv: [onPath], via: "PATH" };
	if (which("nix") !== null) return { argv: ["nix", ...NIX_ARGV], via: "nix" };
	throw new EncoderUnavailableError(
		`Recording needs ffmpeg and this machine has neither ffmpeg nor Nix. Put ffmpeg on PATH or name it with ${FFMPEG_VARIABLE}, or install Nix so the recorder can run nixpkgs#ffmpeg-headless.`,
	);
}

/**
 * What a command is called in a refusal.
 * @param command The command.
 * @returns Its name, with the variable that named it when one did.
 */
function labelOf(command: FfmpegCommand): string {
	if (command.via === FFMPEG_VARIABLE) return `${FFMPEG_VARIABLE} (${command.argv.join(" ")})`;
	return command.via === "nix" ? "nixpkgs#ffmpeg-headless run through nix" : "ffmpeg on PATH";
}

/**
 * The encoder names an `ffmpeg -encoders` listing offers. Each row is six flag characters, then
 * the name, then a description.
 * @param listing ffmpeg's output.
 * @returns The names.
 */
function encodersIn(listing: string): ReadonlySet<string> {
	const names = new Set<string>();
	for (const line of listing.split("\n")) {
		const name = /^\s*[VAS][A-Z.]{5}\s+(\S+)/.exec(line)?.[1];
		if (name !== undefined) names.add(name);
	}
	return names;
}

/**
 * The last lines of what a program said, on one line.
 * @param text Its output.
 * @returns The tail.
 */
function tailOf(text: string): string {
	return text.trim().split("\n").slice(-5).join(" ").trim();
}

/** What running a command for its encoders came to. */
interface ProbeRun {
	readonly listing: string;
	readonly said: string;
	readonly status: number;
	/** Whether it was stopped for taking longer than it had. */
	readonly timedOut: boolean;
}

/**
 * Run a command line for the encoders it lists.
 * @param command The command line.
 * @param limitMs How long it may take.
 * @param signal Cancels it.
 * @returns What it printed and how it ended.
 * @throws {Error} When it could not be started; the signal's reason when cancelled.
 */
async function runForEncoders(
	command: FfmpegCommand,
	limitMs: number,
	signal: AbortSignal,
): Promise<ProbeRun> {
	const child = Bun.spawn([...command.argv, "-hide_banner", "-encoders"], {
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		signal,
		timeout: limitMs,
	});
	const [listing, said, status] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	signal.throwIfAborted();
	return { listing, said, status, timedOut: child.signalCode !== null };
}

/**
 * Prove a command line runs an ffmpeg with the encoders a container needs, before a browser
 * starts. The first run through Nix fetches the package, so it has minutes rather than seconds.
 * @param command The command line.
 * @param container What the recording is written as.
 * @param signal Cancels the probe.
 * @throws {EncoderUnavailableError} When it does not run, times out, or lacks an encoder.
 */
async function probeFfmpeg(
	command: FfmpegCommand,
	container: RecordingContainer,
	signal: AbortSignal,
): Promise<void> {
	const label = labelOf(command);
	const limitMs = command.via === "nix" ? RECORDER_MS.nixFetch : RECORDER_MS.encoderProbe;
	const ran = await runForEncoders(command, limitMs, signal).catch((error: unknown) => {
		if (signal.aborted) throw error;
		const why = error instanceof Error ? error.message : String(error);
		throw new EncoderUnavailableError(`${label} could not be run: ${why}`);
	});
	const tail = tailOf(ran.said);
	if (ran.timedOut) {
		throw new EncoderUnavailableError(
			`${label} did not answer within ${limitMs / 1000} s. ${tail}`,
		);
	}
	if (ran.status !== 0) {
		throw new EncoderUnavailableError(
			`${label} failed (exit ${ran.status}): ${tail || "it said nothing"}`,
		);
	}
	const offered = encodersIn(ran.listing);
	const needed = REQUIRED_ENCODERS[container];
	const missing = needed.filter((name) => !offered.has(name));
	if (missing.length > 0) {
		throw new EncoderUnavailableError(
			`${label} lacks the ${missing.join(" and ")} encoder a ${container} recording needs. Use an ffmpeg built with ${needed.join(" and ")}.`,
		);
	}
}

export {
	EncoderUnavailableError,
	findFfmpeg,
	probeFfmpeg,
	tailOf,
	type FfmpegCommand,
	type FfmpegLookups,
};
