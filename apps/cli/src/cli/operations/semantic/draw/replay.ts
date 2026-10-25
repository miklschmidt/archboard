// Rendering a recorded talk to a video file again (TASK-381): the picture of a recording is drawn
// after the talk, frame by frame, from what the talk recorded, so a talk that is kept can be
// rendered in the other theme, or again after a renderer fix, without a new voice session.

import { z } from "zod";

import { DiagramThemeSchema, LayoutEngineSchema } from "@archboard/board/render-reply";
import { parseSemanticBoard } from "@archboard/board/document";
import { ARCHBOARD_URL } from "@archboard/server-lifecycle/config";
import { TalkFileError, readTalk, renderTalk } from "@archboard/walkthrough/recorder";
import { CliUsageError, defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import {
	containerOf,
	encoderUnavailableRefusal,
	recorderUnavailableRefusal,
	renderFailedRefusal,
	requireWritableDirectory,
} from "#cli/rules/semantic/draw/recording-output.ts";

const THEMES = DiagramThemeSchema.options;

const ReplayInputSchema = z.object({
	talk: z.string(),
	out: z.string(),
	theme: DiagramThemeSchema.optional(),
	layout: LayoutEngineSchema.optional(),
});

const ReplayReceiptSchema = z.object({
	success: z.literal(true),
	talk: z.string(),
	board: z.string(),
	variant: z.string().nullable(),
	/** The id of the variant every frame is read against, when the talk was recorded with --against. */
	against: z.string().nullable(),
	walkthrough: z.object({ id: z.string(), name: z.string() }),
	steps: z.int(),
	file: z.string(),
	bytes: z.int(),
	mimeType: z.string(),
	durationMs: z.int(),
	frames: z.int(),
	theme: DiagramThemeSchema,
	layout: LayoutEngineSchema,
});

/**
 * The variant that was current on the board a talk kept, which a talk of the current variant
 * was recorded on, so the receipt names it by id as `semantic record` does.
 * @param document The board the talk kept, which reading the talk proved readable.
 * @returns The variant's id, or null for a board with no current variant.
 */
function currentVariantOf(document: unknown): string | null {
	const parsed = parseSemanticBoard(document);
	return parsed.ok ? (parsed.board.current ?? null) : null;
}

/**
 * Read a talk, refusing one that cannot be rendered as a usage error.
 * @param directory The talk's directory.
 * @returns The talk.
 * @throws {CliUsageError} When it is unreadable, of another version, or its voice disagrees.
 */
function readTalkOrRefuse(directory: string): ReturnType<typeof readTalk> {
	try {
		return readTalk(directory);
	} catch (error) {
		if (error instanceof TalkFileError) throw new CliUsageError(error.message);
		throw error;
	}
}

const semanticReplayContract = defineCommand({
	path: ["semantic", "replay"],
	shared: ["url"],
	summary: "Render a recorded talk to a video file, frame by frame",
	description: [
		"Renders the picture of a talk that a recording kept to an MP4 or WebM file, chosen by the --out extension.",
		"",
		"The talk directory holds:",
		"- talk.json: the board as it was recorded and when each step and subtitle line came.",
		"- voice.wav: the voice.",
		"",
		"How it renders:",
		"- The Archboard server's own page draws each frame of the video in a private headless Chromium, in software at 1920x1080.",
		"- The command encodes the frames at 30 frames a second with the voice.",
		"- No Codex or voice is used, and the board need not exist.",
		"- So a talk can be rendered again in the other theme with --theme, with the other layout engine with --layout, or after a renderer fix.",
		"",
		"Needs:",
		"- A Chromium or Google Chrome executable on PATH or named by ARCHBOARD_RENDERER_CHROMIUM.",
		"- ffmpeg: the one named by ARCHBOARD_FFMPEG, else on PATH, else nixpkgs#ffmpeg-headless run through Nix.",
	].join("\n"),
	examples: [
		"archboard semantic replay ~/.local/state/archboard/recordings/20260930T101500Z-pipeline --out pipeline.mp4",
		"archboard semantic replay ./pr-1234-talk --theme dark --out pr-1234-dark.webm",
	],
	parameters: [
		{
			kind: "positional",
			key: "talk",
			name: "talk",
			required: true,
			description: "The talk's directory, as a recording wrote it",
		},
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			placeholder: "file.mp4",
			required: true,
			description: "Where to write the video: a .mp4 or .webm file",
		},
		{
			kind: "option",
			key: "theme",
			spellings: ["--theme"],
			value: "required",
			placeholder: "theme",
			choices: THEMES,
			description:
				"Which palette the pane draws in; the palette the talk was recorded in when absent",
		},
		{
			kind: "option",
			key: "layout",
			spellings: ["--layout"],
			value: "required",
			placeholder: "engine",
			choices: LayoutEngineSchema.options,
			description:
				"Which layout engine lays the board out; the engine the talk was recorded with when absent",
		},
	],
	input: { ingress: ReplayInputSchema },
	result: ReplayReceiptSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The video that was written",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the video.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["local-read", "local-write"],
	refusals: [
		serverRefusal,
		recorderUnavailableRefusal,
		encoderUnavailableRefusal,
		renderFailedRefusal,
	],
	relationships: [],
	/**
	 * Render the talk.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The video that was written.
	 */
	async handler(input, context) {
		const container = containerOf(input.out);
		const file = context.resolvePath(input.out);
		requireWritableDirectory(input.out, file);
		const directory = context.resolvePath(input.talk);
		// A talk that cannot be rendered is refused before anything starts.
		const talk = readTalkOrRefuse(directory);
		await context.require("server", "semantic replay");
		const theme = input.theme ?? talk.theme;
		const layout = input.layout ?? talk.layout;
		const made = await renderTalk({
			serverUrl: ARCHBOARD_URL,
			talk,
			directory,
			container,
			theme,
			layout,
			out: file,
			signal: context.signal,
			say: context.diagnostic,
		});
		if (made.leftBehind.length > 0) {
			context.diagnostic(
				`The render's browser could not be proved gone: ${made.leftBehind.join("; ")}`,
			);
		}
		return {
			result: {
				success: true as const,
				talk: directory,
				board: talk.board.name,
				variant: talk.board.variant ?? currentVariantOf(talk.document),
				against: talk.board.against ?? null,
				walkthrough: talk.board.walkthrough,
				steps: talk.board.steps,
				file: made.file,
				bytes: made.bytes,
				mimeType: made.mimeType,
				durationMs: made.durationMs,
				frames: made.frames,
				theme,
				layout,
			},
		};
	},
});

export { semanticReplayContract };
