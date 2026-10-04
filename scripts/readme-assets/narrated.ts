// The narrated videos: one walkthrough recorded by `archboard semantic record`, narrated by the
// Codex voice, on a server that has the machine's Archboard Codex sign-in. The MP4 stays in the
// scratch directory for a person to attach to the README's player: GitHub plays a video with
// sound only from a user attachment, uploaded through its editor. The README's silent loop and its
// index thumbnail are cut from the same recording, at the steps the kept talk says it reached.

import { rmSync } from "node:fs";
import { join } from "node:path";

import { readTalk } from "@/runtime/walkthrough-recorder";
import { TALK_SAMPLE_RATE, type Talk } from "@/shared/walkthrough-recording/talk";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { encodeExcerpt, encodeThumbnail, type Crop } from "./encode.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { inRepository, type MakeContext, type Producer } from "./producer.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { startServer, type TrackedVault } from "./server.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { scratch } from "./tools.ts";

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
	/** The README's silent loop: the steps it runs from and to (counted from nought), and its width. */
	readonly loop?: {
		readonly file: string;
		readonly from: number;
		readonly to: number;
		readonly width: number;
	};
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
 * Cut the loop and the thumbnail from a recording.
 * @param spec The video.
 * @param video The recording.
 * @param talk The kept talk.
 */
async function cutFrom(spec: NarratedSpec, video: string, talk: Talk): Promise<void> {
	const seconds = stepSeconds(talk);
	if (spec.loop !== undefined) {
		const { file, from, to, width } = spec.loop;
		await encodeExcerpt(
			video,
			secondOf(seconds, from),
			secondOf(seconds, to),
			width,
			inRepository(file),
		);
	}
	if (spec.thumbnail !== undefined) {
		const at = secondOf(seconds, spec.thumbnail.step) + 3;
		await encodeThumbnail({ video, at }, CAPTION_CROP, inRepository(spec.thumbnail.file));
	}
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
 * Record the walkthrough and cut what the README shows from it.
 * @param spec The video.
 * @param context What the producer is given.
 */
async function record(spec: NarratedSpec, context: MakeContext): Promise<void> {
	const work = scratch("narrated", spec.name);
	const talk = join(work, "talk");
	const video = join(work, `${spec.name}.mp4`);
	rmSync(talk, { recursive: true, force: true });
	const server = await startServer(`narrated-${spec.name}`, spec.vault, true);
	try {
		await server.cli([
			"semantic",
			"record",
			...walkthroughArguments(spec),
			"--theme",
			"dark",
			"--talk",
			talk,
			"--out",
			video,
		]);
	} finally {
		await server.stop();
	}
	await cutFrom(spec, video, readTalk(talk));
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
		files: [
			...(spec.loop === undefined ? [] : [spec.loop.file]),
			...(spec.thumbnail === undefined ? [] : [spec.thumbnail.file]),
		],
		needs: ["chromium", "ffmpeg", "codex"],
		plan: [
			`Start an Archboard server over a copy of ${spec.vault} that uses this machine's Archboard Codex sign-in.`,
			`Record "${spec.walkthrough}" on "${spec.board}"${variant} with archboard semantic record --theme dark, narrated by the Codex voice; this spends Codex usage. The MP4 stays in the scratch directory, to attach to the README by hand.`,
			...(spec.loop === undefined
				? []
				: [
						`Cut steps ${spec.loop.from + 1} to ${spec.loop.to} into ${spec.loop.file}, a silent ${spec.loop.width} px WebP loop.`,
					]),
			...(spec.thumbnail === undefined
				? []
				: [`Cut ${spec.thumbnail.file} from step ${spec.thumbnail.step + 1} and its caption.`]),
		],
		/**
		 * Record the walkthrough and cut the loop and thumbnail from it.
		 * @param context What the producer is given.
		 * @returns Once the files are written.
		 */
		make: async (context) => record(spec, context),
	};
}

export { narratedProducer };
