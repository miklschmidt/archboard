// A kept talk, and the video an author renders from it again (TASK-381). A recording keeps its
// talk so `archboard semantic replay` can draw it again, in the other palette say, with no voice
// session. An author run has no voice session to record one, so its fixture keeps the talk as a
// recording would have, and the check reads back the video the author made of it: the file, its
// container, and the receipt the replay printed, against the talk it was rendered from.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { addressedVariant, type SemanticBoard } from "@archboard/board/document";
import { DiagramThemeSchema, type DiagramTheme } from "@archboard/board/render-reply";
import type { VaultCheck } from "@archboard/board/policy";
import { SKILL_EVAL_TALK_STEP_MS } from "@archboard/timing";
import type { RecordingContainer } from "@archboard/walkthrough/recording";
import {
	SAMPLES_PER_FRAME,
	TALK_SAMPLE_RATE,
	framesOf,
	talkFrom,
	type Talk,
	type TalkEvent,
} from "@archboard/walkthrough/talk";
import { readTalk, recordingContainerOf } from "@archboard/walkthrough/recorder";
import {
	finding,
	type Finding,
	type Reading,
	type VideoAttempt,
} from "#runtime/rules/outcomes/reading.ts";
import type { TalkFixture } from "#runtime/schemas/fixture.ts";
import type { OutcomeCheck } from "#runtime/schemas/suite.ts";

/** A video the harness must look for before the checks run. */
interface VideoRequest {
	readonly file: string;
	readonly talk: string;
}

/**
 * The part of a replay's receipt the check reads; the command's own result says more. Only these
 * fields are asked for, so an author who narrows the receipt to them, with jq say, still counts.
 */
const ReceiptSchema = z.object({
	talk: z.string(),
	file: z.string(),
	bytes: z.int(),
	frames: z.int(),
	theme: DiagramThemeSchema,
});

/** How many first bytes of a file say which container it is. */
const HEAD_BYTES = 64;

/** The first bytes of an EBML document, which a WebM is. */
const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

/**
 * Where a path spelled from the run's home is.
 * @param home The run's home.
 * @param spelled The path, starting `~/`.
 * @returns The absolute path.
 */
function inHome(home: string, spelled: string): string {
	return path.join(home, spelled.slice(2));
}

/**
 * An absolute path spelled from the run's home when it is inside it, as a check spells one.
 * @param home The run's home.
 * @param absolute The path.
 * @returns `~/…` for a path in the home, else the path itself.
 */
function spelledFromHome(home: string, absolute: string): string {
	const relative = path.relative(home, path.resolve(absolute));
	return relative.startsWith("..") || path.isAbsolute(relative) ? absolute : `~/${relative}`;
}

/**
 * The talk a fixture keeps: one walkthrough of the board as the CLI served it, each step shown
 * and said over the same stretch of voice, and the voice silent. The recorder's own schema reads
 * it, so a talk it would refuse fails the fixture rather than the author.
 * @param fixture What the fixture asks for.
 * @param board The board, as `semantic show` served it.
 * @param policy The vault check, as `archboard check` served it.
 * @returns The talk and its voice.
 * @throws {Error} When the board has no such variant or walkthrough.
 */
function talkOfFixture(
	fixture: TalkFixture,
	board: SemanticBoard,
	policy: VaultCheck,
): { readonly talk: Talk; readonly voice: Int16Array } {
	const address = addressedVariant(board, fixture.variant);
	if (!address.ok) throw new Error(`the fixture's talk: ${address.problem}`);
	const walkthrough = address.variant.content.walkthroughs.find(
		(entry) => entry.name === fixture.walkthrough,
	);
	if (walkthrough === undefined) {
		throw new Error(`the fixture's talk: no walkthrough "${fixture.walkthrough}" to present`);
	}
	const step = (SKILL_EVAL_TALK_STEP_MS / 1000) * TALK_SAMPLE_RATE;
	const samples = step * walkthrough.beats.length;
	const events: TalkEvent[] = [
		{ kind: "drawn", at: 0, version: board.version },
		...walkthrough.beats.flatMap((beat, index): TalkEvent[] => [
			{ kind: "step", at: index * step, beat: index },
			{
				kind: "said",
				at: index * step + SAMPLES_PER_FRAME,
				itemId: beat.id,
				text: beat.body,
				final: true,
			},
		]),
		{ kind: "end", at: samples },
	];
	const talk = talkFrom({
		recordedAt: new Date(),
		language: "en",
		theme: fixture.theme,
		board: {
			name: board.name,
			variant: fixture.variant === undefined ? null : address.variant.id,
			version: board.version,
			walkthrough: { id: walkthrough.id, name: walkthrough.name },
			steps: walkthrough.beats.length,
		},
		log: { samples, baseLatencyMs: 0, events },
		document: board,
		policy,
	});
	if (!talk.success) throw talk.error;
	return { talk: talk.data, voice: new Int16Array(samples) };
}

/**
 * The videos a scenario's checks ask about.
 * @param checks The scenario's checks.
 * @returns One request per video-rendered check.
 */
function videoRequests(checks: readonly OutcomeCheck[]): VideoRequest[] {
	return checks
		.filter((check) => check.check === "video-rendered")
		.map((check) => ({ file: check.file ?? "", talk: check.talk ?? "" }));
}

/**
 * Every JSON object a command's output holds whole, wherever it sits: a receipt comes after the
 * progress the command said on stderr, and a command's output holds both.
 * @param output The output.
 * @returns The objects, in order.
 */
function jsonObjectsIn(output: string): unknown[] {
	const lines = output.split("\n");
	// An object is one line, or its last line opens with the closing brace.
	const closers = lines.flatMap((line, index) => (line.startsWith("}") ? [index] : []));
	return lines.flatMap((line, start) => {
		if (!line.startsWith("{")) return [];
		// The longest span that parses, since an object's own lines may close inner ones.
		for (const end of [...closers.filter((index) => index > start).toReversed(), start]) {
			try {
				return [JSON.parse(lines.slice(start, end + 1).join("\n")) as unknown];
			} catch {
				// A shorter span, then.
			}
		}
		return [];
	});
}

/**
 * The last replay receipt any command printed for a file, since the last render is the file.
 * @param file The video, absolute.
 * @param outputs What each command printed, in order.
 * @param home The run's home, which the receipt's talk is spelled from.
 * @returns What it said, or null when none named the file.
 */
function lastReceipt(
	file: string,
	outputs: readonly string[],
	home: string,
): VideoAttempt["receipt"] {
	const receipts = outputs.flatMap(jsonObjectsIn).flatMap((value) => {
		const parsed = ReceiptSchema.safeParse(value);
		return parsed.success && path.resolve(parsed.data.file) === file ? [parsed.data] : [];
	});
	const last = receipts.at(-1);
	return last === undefined
		? null
		: {
				talk: spelledFromHome(home, last.talk),
				theme: last.theme,
				frames: last.frames,
				bytes: last.bytes,
			};
}

/**
 * Which container a file's first bytes are: a WebM is an EBML document whose type is webm, and an
 * MP4 opens with its ftyp box.
 * @param file The file.
 * @returns The container, or null for neither.
 */
function containerOf(file: string): RecordingContainer | null {
	const head = Buffer.alloc(HEAD_BYTES);
	const descriptor = fs.openSync(file, "r");
	try {
		fs.readSync(descriptor, head, 0, HEAD_BYTES, 0);
	} finally {
		fs.closeSync(descriptor);
	}
	if (head.subarray(0, EBML_MAGIC.length).equals(EBML_MAGIC) && head.includes("webm"))
		return "webm";
	return head.subarray(4, 8).toString("latin1") === "ftyp" ? "mp4" : null;
}

/**
 * How many frames a kept talk renders to.
 * @param directory The talk's directory.
 * @param spelled The talk as the check names it.
 * @returns The count, or why the talk could not be read.
 */
function talkFramesOf(directory: string, spelled: string): number | string {
	try {
		return framesOf(readTalk(directory));
	} catch (error) {
		return `the talk at ${spelled} cannot be read: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Looks for a video a check asked about, once the author has run.
 * @param request The video and the talk it is rendered from.
 * @param home The run's home, where the check's paths are.
 * @param outputs What each of the author's commands printed, in order.
 * @returns What was found.
 */
function inspectVideo(
	request: VideoRequest,
	home: string,
	outputs: readonly string[],
): VideoAttempt {
	const file = inHome(home, request.file);
	const bytes = fs.statSync(file, { throwIfNoEntry: false })?.size ?? null;
	return {
		...request,
		bytes,
		container: bytes === null ? null : containerOf(file),
		talkFrames: talkFramesOf(inHome(home, request.talk), request.talk),
		receipt: lastReceipt(file, outputs, home),
	};
}

/**
 * What is wrong with the file itself: missing, or not the container its name says.
 * @param video What was found.
 * @returns The problem, or null for a file of the container asked for.
 */
function fileProblem(video: VideoAttempt): string | null {
	if (video.bytes === null) return `${video.file} was not written`;
	const asked = recordingContainerOf(video.file);
	return asked !== null && video.container === asked
		? null
		: `${video.file} holds ${video.container ?? "neither an MP4 nor a WebM"}, not what its name says`;
}

/**
 * Where the receipt for the file says something other than what was asked.
 * @param video What was found.
 * @param talkFrames How many frames the kept talk renders to.
 * @param theme The palette asked for.
 * @returns The problems, none for a receipt of the video asked for.
 */
function receiptProblems(
	video: VideoAttempt,
	talkFrames: number,
	theme: DiagramTheme | undefined,
): string[] {
	const { receipt } = video;
	if (receipt === null) return [`no command printed a replay receipt for ${video.file}`];
	const held: readonly (readonly [boolean, string])[] = [
		[receipt.talk === video.talk, `rendered from ${receipt.talk}, not ${video.talk}`],
		[receipt.theme === theme, `rendered in the ${receipt.theme} theme, not ${theme}`],
		[receipt.frames === talkFrames, `${receipt.frames} frames, not the talk's ${talkFrames}`],
		[
			receipt.bytes === video.bytes,
			`the receipt says ${receipt.bytes} bytes, the file ${video.bytes}`,
		],
	];
	return held.flatMap(([same, problem]) => (same ? [] : [problem]));
}

/**
 * What is wrong with a video against what was asked of it.
 * @param video What was found.
 * @param theme The palette asked for.
 * @returns The problems, none for the video asked for.
 */
function videoProblems(video: VideoAttempt, theme: DiagramTheme | undefined): string[] {
	const problem = fileProblem(video);
	if (problem !== null) return [problem];
	return typeof video.talkFrames === "string"
		? [video.talkFrames]
		: receiptProblems(video, video.talkFrames, theme);
}

/**
 * Whether the video asked for was rendered from the kept talk: the file is there, is the
 * container its name says, and the last replay receipt for it names the talk, the palette asked
 * for, the talk's frame count and the file's size.
 * @param check The check.
 * @param reading The reading.
 * @returns The finding.
 */
function videoRendered(check: OutcomeCheck, reading: Reading): Finding {
	const video = reading.videos.find(
		(attempt) => attempt.file === check.file && attempt.talk === check.talk,
	);
	if (video === undefined) return finding(false, "the harness did not look for this video");
	const problems = videoProblems(video, check.theme);
	return finding(
		problems.length === 0,
		problems.length === 0
			? `a ${video.container} of the talk's ${video.talkFrames} frames in the ${check.theme} theme`
			: problems.join("; "),
	);
}

export { inHome, inspectVideo, talkOfFixture, videoRendered, videoRequests, type VideoRequest };
