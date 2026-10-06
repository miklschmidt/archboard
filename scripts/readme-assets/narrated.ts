// The narrated videos: one walkthrough recorded by `archboard semantic record`, narrated by the
// Codex voice, on a server that has the machine's Archboard Codex sign-in. The MP4 stays in the
// scratch directory for a person to attach to the README's player: GitHub plays a video with
// sound only from a user attachment, uploaded through its editor. The README's index thumbnail is
// cut from the same recording, at the step the kept talk says it reached.

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { readTalk } from "@/runtime/walkthrough-recorder";
import { TALK_SAMPLE_RATE, type Talk } from "@/shared/walkthrough-recording/talk";

import {
	encodeThumbnail,
	holding,
	inRepository,
	scratch,
	startServer,
	type Crop,
	type MakeContext,
	type Producer,
	type TrackedVault,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./kit.ts";

/** The lower-left 16:9 part of a 1920x1080 recording, where the step's caption sits. */
const CAPTION_CROP: Crop = { x: 0, y: 360, width: 1280, height: 720 };

/** One narrated video. */
interface NarratedSpec {
	/** The asset's name, which also names the MP4. */
	readonly name: string;
	readonly vault: TrackedVault;
	readonly board: string;
	readonly variant?: string;
	readonly walkthrough: string;
	/** The index thumbnail: the step it shows, a moment into it. */
	readonly thumbnail?: { readonly file: string; readonly step: number };
}

/**
 * The second each step of a talk starts at, and the second it ends.
 * @param talk The kept talk.
 * @returns The steps' starts, then the end of the talk.
 */
function stepSeconds(talk: Talk): readonly number[] {
	const starts = talk.events.flatMap((event) => (event.kind === "step" ? [event.at] : []));
	const end = talk.events.find((event) => event.kind === "end")?.at ?? talk.audio.samples;
	return [...starts, end].map((sample) => sample / TALK_SAMPLE_RATE);
}

/**
 * The second a step starts at.
 * @param seconds The steps' starts, then the end.
 * @param step The step, counted from nought; one past the last is the end.
 * @returns The second.
 * @throws {Error} When the talk has no such step.
 */
function secondOf(seconds: readonly number[], step: number): number {
	const second = seconds[step];
	if (second === undefined) throw new Error(`The talk reached no step ${step + 1}.`);
	return second;
}

/**
 * Cut the thumbnail from a recording.
 * @param spec The video.
 * @param video The recording.
 * @param talk The kept talk.
 */
async function cutThumbnail(spec: NarratedSpec, video: string, talk: Talk): Promise<void> {
	if (spec.thumbnail === undefined) return;
	const at = secondOf(stepSeconds(talk), spec.thumbnail.step) + 3;
	await encodeThumbnail({ video, at }, CAPTION_CROP, inRepository(spec.thumbnail.file));
}

/**
 * Where a video's recording is written: the scratch directory, to attach to the README by hand.
 * @param spec The video.
 * @returns The MP4's path.
 */
function videoOf(spec: NarratedSpec): string {
	return join(scratch("narrated", spec.name), `${spec.name}.mp4`);
}

/**
 * The CLI arguments that pick the walkthrough.
 * @param spec The video.
 * @returns The board, the variant and the walkthrough.
 */
function walkthroughArguments(spec: NarratedSpec): readonly string[] {
	return [
		spec.board,
		...(spec.variant === undefined ? [] : ["--variant", spec.variant]),
		"--walkthrough",
		spec.walkthrough,
	];
}

/**
 * Record the walkthrough, or render the talk its last recording kept again, and cut what the README
 * shows from the video. A replay draws the frames again with today's renderer and spends no Codex
 * usage, since the voice and the board are in the kept talk.
 * @param spec The video.
 * @param context What the producer is given.
 * @throws {Error} When a replay is asked for and no recording kept a talk.
 */
async function record(spec: NarratedSpec, context: MakeContext): Promise<void> {
	const work = scratch("narrated", spec.name);
	const talk = join(work, "talk");
	const video = videoOf(spec);
	if (context.replay && !existsSync(join(talk, "talk.json"))) {
		throw new Error(
			`No recording kept a talk of ${spec.name} in ${talk}. Make it without --replay once.`,
		);
	}
	if (!context.replay) rmSync(talk, { recursive: true, force: true });
	const server = await startServer(`narrated-${spec.name}`, spec.vault, !context.replay);
	await holding(server.stop, async () => {
		await server.cli(
			context.replay
				? ["semantic", "replay", talk, "--out", video]
				: [
						"semantic",
						"record",
						...walkthroughArguments(spec),
						"--theme",
						"dark",
						"--talk",
						talk,
						"--out",
						video,
					],
		);
	});
	await cutThumbnail(spec, video, readTalk(talk));
	context.say(`The narrated MP4 is ${video}. Attach it to the README's player by hand.`);
}

/**
 * The producer of one narrated video.
 * @param spec The video.
 * @returns The producer.
 */
function narratedProducer(spec: NarratedSpec): Producer {
	const variant = spec.variant === undefined ? "" : ` (${spec.variant})`;
	return {
		kind: "narrated",
		codex: true,
		files: spec.thumbnail === undefined ? [] : [spec.thumbnail.file],
		attachments: [videoOf(spec)],
		needs: ["chromium", "ffmpeg", "codex"],
		plan: [
			`Start an Archboard server over a copy of ${spec.vault} that uses this machine's Archboard Codex sign-in.`,
			`Record "${spec.walkthrough}" on "${spec.board}"${variant} with archboard semantic record --theme dark, narrated by the Codex voice; this spends Codex usage. With --replay, render the talk that the last recording kept again with archboard semantic replay instead, which spends none. The MP4 stays in the scratch directory, to attach to the README by hand with gh attach.`,
			...(spec.thumbnail === undefined
				? []
				: [`Cut ${spec.thumbnail.file} from step ${spec.thumbnail.step + 1} and its caption.`]),
		],
		/**
		 * Record the walkthrough and cut the thumbnail from it.
		 * @param context What the producer is given.
		 * @returns Once the files are written.
		 */
		make: async (context) => record(spec, context),
	};
}

export { narratedProducer };
