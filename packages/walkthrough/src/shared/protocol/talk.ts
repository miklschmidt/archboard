// A talk: what the live pass of a recording heard and did, for the second pass
// to render frame by frame (TASK-381).
//
// The live pass paces a walkthrough on the voice and keeps no picture. It keeps
// the voice, sample by sample, and what happened while the voice spoke, stamped
// in samples of that same audio: each step shown, each change to what the voice
// was saying, each picture drawn, and the end. With it go the board and the
// vault policy the picture was drawn from, so rendering needs nothing but the
// talk: no Archboard board, no Codex, no voice.
//
// A talk is a directory of two files: `talk.json`, which this schema reads, and
// the voice as a WAV file beside it. The command renders it through the
// Archboard server's own page, opened as a replay: the page publishes one
// global, is given the talk, and draws it one frame at a time when asked.

import { z } from "zod";

import {
	DEFAULT_LAYOUT_ENGINE,
	DiagramThemeSchema,
	LayoutEngineSchema,
	type DiagramTheme,
	type LayoutEngineName,
} from "@archboard/board/render-reply";
import {
	addressedVariant,
	type SemanticBoard,
	parseSemanticBoard,
} from "@archboard/board/document";
import { VaultCheckSchema } from "@archboard/board/policy";
import { RecordingLanguageSchema } from "#shared/schemas/recording-language.ts";

/** What a talk's file says it is. */
const TALK_FORMAT = "archboard-talk";

/** The version of the talk format this schema reads. */
const TALK_VERSION = 1;

/** The voice's samples per second, which is also the clock every event is stamped on. */
const TALK_SAMPLE_RATE = 48_000;

/** The frames per second a talk is rendered at. */
const TALK_FRAME_RATE = 30;

/** Samples per frame: a frame is exactly this many samples of the voice. */
const SAMPLES_PER_FRAME = TALK_SAMPLE_RATE / TALK_FRAME_RATE;

/** The name of the voice's file beside `talk.json`. */
const TALK_VOICE_FILE = "voice.wav";

/** A moment of the talk, in samples of the voice from its start. */
const SampleSchema = z.int().nonnegative();

/** Something that happened during the talk, at a moment of it. */
const TalkEventSchema = z.discriminatedUnion("kind", [
	/** A step of the walkthrough was shown: its beat, counted from nought. */
	z.object({ kind: z.literal("step"), at: SampleSchema, beat: z.int().nonnegative() }).strict(),
	/** What the voice was saying in one utterance changed: its whole text so far. */
	z
		.object({
			kind: z.literal("said"),
			at: SampleSchema,
			itemId: z.string().min(1),
			text: z.string(),
			final: z.boolean(),
		})
		.strict(),
	/** The pane drew the board at a version. */
	z.object({ kind: z.literal("drawn"), at: SampleSchema, version: z.int().nonnegative() }).strict(),
	/** The talk ended; nothing after this is rendered. */
	z.object({ kind: z.literal("end"), at: SampleSchema.min(1) }).strict(),
]);
type TalkEvent = z.infer<typeof TalkEventSchema>;

/** What the live pass's page hands over: the log of the talk, stamped on the voice's clock. */
const TalkLogSchema = z
	.object({
		/** How many samples of voice there are, which is where `end` is. */
		samples: SampleSchema,
		/** How far the voice's clock ran behind what was heard, in milliseconds, as the page measured it. */
		baseLatencyMs: z.number().nonnegative(),
		events: z.array(TalkEventSchema),
	})
	.strict();
type TalkLog = z.infer<typeof TalkLogSchema>;

/** The board a talk is of, as it was when the talk was recorded. */
const TalkBoardSchema = z
	.object({
		/** The board, by name. */
		name: z.string().min(1),
		/** The variant presented, by id, or null for the variant that was current. */
		variant: z.string().min(1).nullable(),
		/**
		 * The variant every picture of the talk is read against, by id (TASK-478.01). A talk
		 * kept without it reads against the variant the board ordinarily reads it against, as
		 * before, so the format version stays 1.
		 */
		against: z.string().min(1).optional(),
		/** The version the board was at, which every picture of it was drawn from. */
		version: z.int().nonnegative(),
		/** The walkthrough presented. */
		walkthrough: z.object({ id: z.string().min(1), name: z.string() }).strict(),
		/** How many steps it has. */
		steps: z.int().min(1),
	})
	.strict();

/** A talk, as `talk.json` holds it. */
const TalkSchema = z
	.object({
		format: z.literal(TALK_FORMAT),
		version: z.literal(TALK_VERSION),
		/** When the talk was recorded. */
		recordedAt: z.iso.datetime(),
		/** The language the voice spoke. */
		language: RecordingLanguageSchema,
		/** The theme the talk is rendered in unless another is asked for. */
		theme: DiagramThemeSchema,
		/**
		 * The layout engine the talk is rendered with unless another is asked for (TASK-469). A talk
		 * kept before it was stated was drawn with the default engine, and reads as that.
		 */
		layout: LayoutEngineSchema.default(DEFAULT_LAYOUT_ENGINE),
		board: TalkBoardSchema,
		/** The voice, beside `talk.json`: mono 16-bit PCM at the talk's sample rate. */
		audio: z
			.object({
				file: z.literal(TALK_VOICE_FILE),
				sampleRate: z.literal(TALK_SAMPLE_RATE),
				channels: z.literal(1),
				samples: SampleSchema,
				baseLatencyMs: z.number().nonnegative(),
			})
			.strict(),
		events: z.array(TalkEventSchema),
		/** The board's document as the Archboard server served it. */
		document: z.unknown(),
		/** The vault's checked policy the board was drawn under. */
		policy: VaultCheckSchema,
	})
	.strict()
	.superRefine((talk, context) => {
		for (const problem of talkProblems(talk))
			context.addIssue({ code: "custom", message: problem });
	});
type Talk = z.infer<typeof TalkSchema>;

/** What a talk is made of: what was recorded, how it is drawn, and the log of what was heard. */
interface TalkParts {
	/** When the talk was recorded. */
	readonly recordedAt: Date;
	/** The language the voice spoke, as a BCP 47 tag. */
	readonly language: string;
	/** The theme the talk is rendered in unless another is asked for. */
	readonly theme: DiagramTheme;
	/** The layout engine the talk is rendered with; the default engine when absent. */
	readonly layout?: LayoutEngineName;
	/** The board presented, as it was when the talk was recorded. */
	readonly board: z.input<typeof TalkBoardSchema>;
	/** The voice's length and what happened while it spoke. */
	readonly log: TalkLog;
	/** The board's document as the Archboard server served it. */
	readonly document: unknown;
	/** The vault's checked policy the board was drawn under. */
	readonly policy: z.input<typeof VaultCheckSchema>;
}

/**
 * The talk of its parts, in the format `talk.json` holds, with its voice as the file beside it.
 * @param parts What the talk is made of.
 * @returns The talk, or why it cannot be rendered.
 */
function talkFrom(parts: TalkParts): ReturnType<typeof TalkSchema.safeParse> {
	return TalkSchema.safeParse({
		format: TALK_FORMAT,
		version: TALK_VERSION,
		recordedAt: parts.recordedAt.toISOString(),
		language: parts.language,
		theme: parts.theme,
		layout: parts.layout,
		board: parts.board,
		audio: {
			file: TALK_VOICE_FILE,
			sampleRate: TALK_SAMPLE_RATE,
			channels: 1,
			samples: parts.log.samples,
			baseLatencyMs: parts.log.baseLatencyMs,
		},
		events: parts.log.events,
		document: parts.document,
		policy: parts.policy,
	});
}

/**
 * What is wrong with a talk whose parts each read well.
 * @param talk The talk.
 * @returns The problems, none for a talk that can be rendered.
 */
function talkProblems(talk: z.infer<typeof TalkSchema>): readonly string[] {
	return [
		...orderProblems(talk.events),
		...stepProblems(talk.events, talk.board.steps),
		...endProblems(talk.events, talk.audio.samples),
		...boardProblems(talk),
	];
}

/**
 * Whether the events are in the order they happened.
 * @param events The events.
 * @returns The problems.
 */
function orderProblems(events: readonly TalkEvent[]): readonly string[] {
	const late = events.findIndex((event, index) => index > 0 && event.at < events[index - 1]!.at);
	return late === -1 ? [] : [`Event ${late} happened before the event logged ahead of it.`];
}

/**
 * Whether every step was shown once, in order.
 * @param events The events.
 * @param steps How many steps the walkthrough has.
 * @returns The problems.
 */
function stepProblems(events: readonly TalkEvent[], steps: number): readonly string[] {
	const beats = events.flatMap((event) => (event.kind === "step" ? [event.beat] : []));
	const inOrder = beats.length === steps && beats.every((beat, index) => beat === index);
	return inOrder
		? []
		: [`The steps shown were [${beats.join(", ")}], not 0 to ${steps - 1} in order.`];
}

/**
 * Whether the talk ends once, last, where the voice ends.
 * @param events The events.
 * @param samples How many samples of voice there are.
 * @returns The problems.
 */
function endProblems(events: readonly TalkEvent[], samples: number): readonly string[] {
	const ends = events.filter((event) => event.kind === "end");
	const last = events.at(-1);
	if (ends.length !== 1 || last?.kind !== "end") return ["A talk ends exactly once, last."];
	return last.at === samples
		? []
		: [`The talk ends at sample ${last.at} but its voice has ${samples}.`];
}

/**
 * Whether the board is one the picture was drawn from.
 * @param talk The talk.
 * @returns The problems.
 */
function boardProblems(talk: z.infer<typeof TalkSchema>): readonly string[] {
	const parsed = parseSemanticBoard(talk.document);
	if (!parsed.ok) return [`The talk's board cannot be read: ${parsed.problem}`];
	const problems: string[] = [];
	if (parsed.board.version !== talk.board.version) {
		problems.push(
			`The talk's board is at version ${parsed.board.version}, not ${talk.board.version}.`,
		);
	}
	problems.push(...againstProblems(talk, parsed.board));
	for (const event of talk.events) {
		if (event.kind === "drawn" && event.version !== talk.board.version) {
			problems.push(
				`The board was drawn at version ${event.version} while it was recorded at ${talk.board.version}.`,
			);
		}
	}
	return problems;
}

/**
 * Whether the variant a talk is read against is one its board has, other than the one drawn.
 * @param talk The talk.
 * @param board The talk's board, as read.
 * @returns The problems.
 */
function againstProblems(
	talk: z.infer<typeof TalkSchema>,
	board: SemanticBoard,
): readonly string[] {
	const { against } = talk.board;
	if (against === undefined) return [];
	if (!board.variants.some((variant) => variant.id === against)) {
		return [`The talk is read against variant ${against}, which its board does not have.`];
	}
	const drawn = addressedVariant(board, talk.board.variant ?? undefined);
	return drawn.ok && drawn.variant.id === against
		? ["The talk is read against the variant it draws."]
		: [];
}

/** The search parameter that opens the page as the renderer of a talk. */
const REPLAY_SEARCH_PARAM = "replay";

/** The global the replay page publishes itself on. */
const REPLAY_PAGE_GLOBAL = "archboardReplay";

/**
 * How many samples the shell's voice meter reads a level from: the window of a Web Audio analyser
 * left at its default size, which is what the meter the orb follows live is
 * (`packages/workbench/src/ui/clients/output-level`).
 */
const LEVEL_WINDOW_SAMPLES = 2048;

/** The largest magnitude of a 16-bit sample, which is full scale. */
const FULL_SCALE = 32_768;

/**
 * How loud the voice is at a moment, as the shell's meter reads it then: the root mean square of
 * the window of samples heard by that moment, where nothing was heard before the first.
 * @param samples The voice: 16-bit mono at the talk's sample rate.
 * @param end The moment, in samples from the start.
 * @returns The level, 0..1.
 */
function levelAt(samples: Int16Array, end: number): number {
	let sum = 0;
	for (let index = Math.max(0, end - LEVEL_WINDOW_SAMPLES); index < end; index += 1) {
		const value = samples[index]! / FULL_SCALE;
		sum += value * value;
	}
	return Math.min(1, Math.sqrt(sum / LEVEL_WINDOW_SAMPLES));
}

/**
 * How loud the voice is on each frame of a talk: its level at the frame's moment, which is what
 * the voice's orb follows. It is the voice's alone, so a talk renders to the same frames every time.
 * @param samples The voice: 16-bit mono at the talk's sample rate.
 * @returns One level for each frame the voice renders to, 0..1, from frame nought.
 */
function voiceLevels(samples: Int16Array): number[] {
	const frames = Math.ceil(samples.length / SAMPLES_PER_FRAME);
	return Array.from({ length: frames }, (_, frame) => levelAt(samples, frame * SAMPLES_PER_FRAME));
}

/**
 * How a talk is rendered: in which theme, with which layout engine, and how loud its voice is on
 * each frame (`voiceLevels`).
 */
const ReplayOptionsSchema = z
	.object({
		theme: DiagramThemeSchema,
		layout: LayoutEngineSchema,
		levels: z.array(z.number().min(0).max(1)),
	})
	.strict();
type ReplayOptions = z.infer<typeof ReplayOptionsSchema>;

/**
 * The replay page's side of the contract, published on `window[REPLAY_PAGE_GLOBAL]`.
 *
 * `load` puts a talk on the page and resolves once its first frame could be
 * drawn, with how many frames the talk renders to. `frame` draws the next
 * frame, in order from nought, and resolves once it is fully drawn; it rejects
 * with what never became ready or what moved outside the frame clock.
 */
interface ReplayPage {
	readonly load: (talk: unknown, options: ReplayOptions) => Promise<{ readonly frames: number }>;
	readonly frame: (index: number) => Promise<void>;
}

/**
 * Whether a page's address asks it to render a talk.
 * @param search The address's search string, with or without its leading `?`.
 * @returns True for a replay page.
 */
function replayAskedOf(search: string): boolean {
	return new URLSearchParams(search).has(REPLAY_SEARCH_PARAM);
}

/**
 * How many frames a talk renders to: every frame that begins before it ends.
 * @param talk The talk.
 * @returns The count.
 */
function framesOf(talk: Pick<Talk, "audio">): number {
	return Math.ceil(talk.audio.samples / SAMPLES_PER_FRAME);
}

export {
	REPLAY_PAGE_GLOBAL,
	REPLAY_SEARCH_PARAM,
	ReplayOptionsSchema,
	SAMPLES_PER_FRAME,
	TALK_FORMAT,
	TALK_FRAME_RATE,
	TALK_SAMPLE_RATE,
	TALK_VERSION,
	TALK_VOICE_FILE,
	TalkEventSchema,
	TalkLogSchema,
	TalkSchema,
	framesOf,
	replayAskedOf,
	talkFrom,
	voiceLevels,
	type ReplayOptions,
	type ReplayPage,
	type Talk,
	type TalkEvent,
	type TalkLog,
};
