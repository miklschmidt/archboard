// Encoding a recording's frames and voice into one video file with one ffmpeg (TASK-381).
//
// The renderer writes each frame as a JPEG to ffmpeg's input, in order, and the talk's voice is
// its second input. Frame n is at n/30 s and sample s of the voice at s/48000 s, and the sound is
// padded to exactly the frames' length, so picture and voice are aligned by construction.

import { rmSync, statSync } from "node:fs";

import { RECORDER_MS } from "@archboard/timing";
import type { RecordingContainer } from "#shared/protocol/recording-page.ts";
import { SAMPLES_PER_FRAME, TALK_FRAME_RATE, TALK_SAMPLE_RATE } from "#shared/protocol/talk.ts";

import { tailOf, type FfmpegCommand } from "#runtime/services/ffmpeg.ts";

/** Why ffmpeg did not make the file. */
class VideoEncodingError extends Error {
	readonly code = "ENCODING_FAILED";

	/**
	 * Fail an encoding.
	 * @param message What happened, with the tail of what ffmpeg said.
	 */
	constructor(message: string) {
		super(message);
		this.name = "VideoEncodingError";
	}
}

/** A video being encoded from frames written to it. */
interface VideoEncoder {
	/**
	 * Hand ffmpeg the next frame, and wait until it has taken it, so a slow encoder slows the
	 * caller rather than filling memory.
	 * @param jpeg The frame, as a JPEG.
	 * @throws {VideoEncodingError} When ffmpeg has stopped.
	 */
	readonly writeFrame: (jpeg: Uint8Array) => Promise<void>;
	/**
	 * Close the input, and wait for ffmpeg to finish the file.
	 * @returns The file's size and what it is.
	 * @throws {VideoEncodingError} When ffmpeg fails or takes longer than it has; no file is left.
	 */
	readonly finish: () => Promise<{ readonly bytes: number; readonly mimeType: string }>;
	/** Stop ffmpeg and remove the partial file. */
	readonly abort: () => void;
}

/** What opening an encoder takes. */
interface VideoEncoderOptions {
	/** The command line that runs ffmpeg. */
	readonly command: FfmpegCommand;
	readonly container: RecordingContainer;
	/** How many frames will be written. */
	readonly frames: number;
	/** The voice: a WAV file. */
	readonly voice: string;
	/** Where the file is written. */
	readonly out: string;
	/** Stops the encoding, as `abort` does. */
	readonly signal: AbortSignal;
}

/**
 * What each container's file is, as its `type` says.
 * The MP4 is H.264 High at level 4.0 with AAC-LC; the WebM is VP9 with Opus.
 */
const MIME_TYPES: Readonly<Record<RecordingContainer, string>> = {
	mp4: "video/mp4;codecs=avc1.640028,mp4a.40.2",
	webm: "video/webm;codecs=vp9,opus",
};

/**
 * Chrome's JPEGs are full-range BT.601. The picture is converted to limited-range BT.709 here,
 * rather than only tagged, so a player that trusts the tags shows what the page drew. The frames
 * are then tagged BT.709 as well: ffmpeg 9 takes the stream's primaries and transfer from its
 * frames, which the conversion leaves unset, over the encoder's options (measured 2026-09-30).
 */
const PICTURE_FILTER =
	"scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p," +
	"setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv";

/** The picture and sound codecs of each container. */
const CODECS: Readonly<
	Record<
		RecordingContainer,
		{
			readonly picture: readonly string[];
			readonly sound: readonly string[];
			readonly tail: readonly string[];
		}
	>
> = {
	mp4: {
		picture: [
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"18",
			"-profile:v",
			"high",
			"-level:v",
			"4.0",
		],
		sound: ["-c:a", "aac", "-b:a", "160k"],
		tail: ["-movflags", "+faststart", "-f", "mp4"],
	},
	webm: {
		picture: [
			"-c:v",
			"libvpx-vp9",
			"-row-mt",
			"1",
			"-deadline",
			"good",
			"-cpu-used",
			"4",
			"-crf",
			"30",
			"-b:v",
			"0",
		],
		sound: ["-c:a", "libopus", "-b:a", "128k"],
		tail: ["-cues_to_front", "1", "-f", "webm"],
	},
};

/**
 * The arguments that follow the ffmpeg command line.
 * @param options What is encoded, and how.
 * @returns The arguments.
 */
function argumentsOf(options: VideoEncoderOptions): readonly string[] {
	const { picture, sound, tail } = CODECS[options.container];
	const rate = String(TALK_FRAME_RATE);
	const padded = `apad=whole_len=${options.frames * SAMPLES_PER_FRAME}`;
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-f",
		"image2pipe",
		"-framerate",
		rate,
		"-c:v",
		"mjpeg",
		"-i",
		"pipe:0",
		"-i",
		options.voice,
		"-map",
		"0:v:0",
		"-map",
		"1:a:0",
		"-vf",
		PICTURE_FILTER,
		...picture,
		"-fps_mode",
		"cfr",
		"-r",
		rate,
		"-colorspace",
		"bt709",
		"-color_primaries",
		"bt709",
		"-color_trc",
		"bt709",
		"-color_range",
		"tv",
		"-af",
		padded,
		...sound,
		"-ar",
		String(TALK_SAMPLE_RATE),
		...tail,
		options.out,
	];
}

/**
 * Start ffmpeg on the arguments.
 * @param options What to encode, and where.
 * @returns The running process.
 * @throws {VideoEncodingError} When ffmpeg could not be started.
 */
function spawned(options: VideoEncoderOptions) {
	try {
		return Bun.spawn([...options.command.argv, ...argumentsOf(options)], {
			stdin: "pipe",
			stdout: "ignore",
			stderr: "pipe",
		});
	} catch (error) {
		const why = error instanceof Error ? error.message : String(error);
		throw new VideoEncodingError(`ffmpeg (${options.command.via}) could not be started: ${why}`);
	}
}

/** One ffmpeg running, fed frames and finished once. */
class FfmpegEncoder implements VideoEncoder {
	readonly #options: VideoEncoderOptions;
	readonly #child: ReturnType<typeof spawned>;
	// ffmpeg is told to say errors only, and its pipe is read as it fills so it never blocks on it.
	readonly #said: Promise<string>;
	/** Rejects once ffmpeg has exited, so a write in flight fails when ffmpeg dies, not later. */
	readonly #died: Promise<never>;
	#overdue = false;

	/**
	 * Start ffmpeg, stopping it when the signal aborts.
	 * @param options What to encode, and where.
	 */
	constructor(options: VideoEncoderOptions) {
		this.#options = options;
		this.#child = spawned(options);
		this.#said = new Response(this.#child.stderr).text();
		this.#died = this.#child.exited.then(async (status) => {
			throw await this.#stopped(status);
		});
		// Nobody is waiting on it when the encoding ends well.
		this.#died.catch(() => undefined);
		options.signal.addEventListener("abort", this.abort, { once: true });
	}

	/**
	 * The failure of an ffmpeg that stopped, with what it said.
	 * @param status Its exit status.
	 * @returns The failure.
	 */
	async #stopped(status: number): Promise<VideoEncodingError> {
		const said = tailOf(await this.#said) || "it said nothing";
		return new VideoEncodingError(
			`ffmpeg (${this.#options.command.via}) stopped with exit ${status}: ${said}`,
		);
	}

	/**
	 * Hand ffmpeg a frame, and wait until it has taken it.
	 * @param jpeg The frame.
	 */
	async #feed(jpeg: Uint8Array): Promise<void> {
		await Promise.resolve(this.#child.stdin.write(jpeg));
		await this.#child.stdin.flush();
	}

	/**
	 * Hand ffmpeg the next frame, and wait until it has taken it.
	 * @param jpeg The frame, as a JPEG.
	 * @throws {VideoEncodingError} When ffmpeg has stopped.
	 */
	async writeFrame(jpeg: Uint8Array): Promise<void> {
		try {
			await Promise.race([this.#feed(jpeg), this.#died]);
		} catch (error) {
			if (error instanceof VideoEncodingError) throw error;
			// A write to a closed pipe: ffmpeg stopped, and its exit and its stderr say why.
			throw await this.#stopped(await this.#child.exited);
		}
	}

	/**
	 * Close ffmpeg's input, and wait for it to exit.
	 * @returns Its exit status.
	 */
	async #closed(): Promise<number> {
		// An ffmpeg that already died has closed its input; its exit status says why.
		await Promise.resolve(this.#child.stdin.end()).catch(() => undefined);
		return await this.#child.exited;
	}

	/**
	 * Refuse an ffmpeg that did not finish the file.
	 * @param status Its exit status.
	 * @throws {VideoEncodingError} When it was stopped for taking too long, or failed.
	 */
	async #requireFinished(status: number): Promise<void> {
		if (this.#overdue) {
			throw new VideoEncodingError(
				`ffmpeg did not finish the file within ${RECORDER_MS.encodeFinish / 1000} s. ${tailOf(await this.#said)}`,
			);
		}
		if (status !== 0) throw await this.#stopped(status);
	}

	/**
	 * Close the input, and wait for ffmpeg to finish the file.
	 * @returns The file's size and what it is.
	 * @throws {VideoEncodingError} When ffmpeg fails or takes longer than it has; no file is left.
	 */
	async finish(): Promise<{ readonly bytes: number; readonly mimeType: string }> {
		const { out, container, signal } = this.#options;
		const timeout = setTimeout(() => {
			this.#overdue = true;
			this.#child.kill();
		}, RECORDER_MS.encodeFinish);
		try {
			const status = await this.#closed();
			signal.throwIfAborted();
			await this.#requireFinished(status);
			return { bytes: statSync(out).size, mimeType: MIME_TYPES[container] };
		} catch (error) {
			rmSync(out, { force: true });
			throw error;
		} finally {
			clearTimeout(timeout);
			signal.removeEventListener("abort", this.abort);
		}
	}

	/** Stop ffmpeg and remove the partial file. */
	readonly abort = (): void => {
		this.#child.kill();
		rmSync(this.#options.out, { force: true });
	};
}

/**
 * Start one ffmpeg that encodes frames written to it, with the voice, into a file.
 * @param options What to encode, and where.
 * @returns The encoder.
 * @throws {VideoEncodingError} When ffmpeg could not be started.
 */
function openVideoEncoder(options: VideoEncoderOptions): VideoEncoder {
	return new FfmpegEncoder(options);
}

export { VideoEncodingError, openVideoEncoder, type VideoEncoder, type VideoEncoderOptions };
