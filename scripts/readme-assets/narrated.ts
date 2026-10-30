// The narrated videos: one walkthrough recorded by `archboard model record`, narrated by the
// Codex voice, on a server that has the machine's Archboard Codex sign-in. The MP4 stays in the
// scratch directory for a person to attach to the README's player: GitHub plays a video with
// sound only from a user attachment, uploaded through its editor. The README's index thumbnail is
// cut from the same recording, at the step the kept talk says it reached.

import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

import { ArchitectureCheckpointRetainSchema } from "@archboard/board/model";

import { readTalk } from "@archboard/walkthrough/recorder";
import { TALK_SAMPLE_RATE, type Talk } from "@archboard/walkthrough/talk";

import {
	encodeThumbnail,
	holding,
	inRepository,
	scratch,
	scratchRoot,
	startServer,
	type Crop,
	type MakeContext,
	type Producer,
	type TrackedVault,
	type TakeServer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { readModel, modelResult } from "./model-authoring.ts";

/** The lower-left 16:9 part of a 1920x1080 recording, where the step's caption sits. */
const CAPTION_CROP: Crop = { x: 0, y: 360, width: 1280, height: 720 };

/** One narrated video. */
interface NarratedSpec {
	/** The asset's name, which also names the MP4. */
	readonly name: string;
	readonly vault: TrackedVault;
	/** A retained proposal, or omit to capture current architecture before recording. */
	readonly checkpoint?: string;
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
	return join(scratchRoot(), "narrated", spec.name, `${spec.name}.mp4`);
}

/**
 * Capture current architecture unless the recipe already names an immutable proposal.
 * @param server The copied vault and its restored archive.
 * @param spec The exact recording recipe.
 * @returns The checkpoint that the recorder must read.
 */
async function recordingCheckpoint(server: TakeServer, spec: NarratedSpec): Promise<string> {
	if (spec.checkpoint !== undefined) return spec.checkpoint;
	const model = await readModel(server);
	const retained = ArchitectureCheckpointRetainSchema.parse(
		modelResult(
			await server.cli([
				"model",
				"retain",
				"--operation-id",
				crypto.randomUUID(),
				"--writer",
				"readme",
				"--expect-revision",
				model.revision.digest,
				"--doing",
				"Retain the narrated README reading",
			]),
		),
	);
	if (!retained.success) throw new Error(JSON.stringify(retained));
	return retained.checkpoint.id;
}

/**
 * Record the walkthrough, or render the talk its last recording kept again, and cut what the README
 * shows from the video. A replay draws the frames again with today's renderer and spends no Codex
 * usage, because the kept talk contains the voice and architecture. A new recording is made beside the kept
 * talk and replaces it only once it is whole, so a refused or failed recording keeps the old one.
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
	const next = join(work, "talk-next");
	rmSync(next, { recursive: true, force: true });
	const recorded = context.replay ? talk : next;
	const server = await startServer(`narrated-${spec.name}`, spec.vault, !context.replay);
	await holding(server.stop, async () => {
		await server.cli(
			context.replay
				? ["model", "replay", talk, "--out", video]
				: [
						"model",
						"record",
						"--checkpoint",
						await recordingCheckpoint(server, spec),
						"--walkthrough",
						spec.walkthrough,
						"--theme",
						"dark",
						"--talk",
						recorded,
						"--out",
						video,
					],
		);
	});
	if (!context.replay) {
		rmSync(talk, { recursive: true, force: true });
		renameSync(recorded, talk);
	}
	await cutThumbnail(spec, video, readTalk(talk));
}

/**
 * The producer of one narrated video.
 * @param spec The video.
 * @returns The producer.
 */
function narratedProducer(spec: NarratedSpec): Producer {
	return {
		kind: "narrated",
		codex: true,
		files: spec.thumbnail === undefined ? [] : [spec.thumbnail.file],
		attachments: [videoOf(spec)],
		needs: ["chromium", "ffmpeg", "codex"],
		plan: [
			`Start an Archboard server over a copy of ${spec.vault} that uses this machine's Archboard Codex sign-in unless it is a --replay, which uses none.`,
			`Record "${spec.walkthrough}" from its exact retained canonical checkpoint with archboard model record --theme dark, narrated by the Codex voice; this spends Codex usage. With --replay, render the talk that the last recording kept again with archboard model replay instead, which spends none. The MP4 stays in the scratch directory, to attach to the README by hand with gh attach.`,
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
