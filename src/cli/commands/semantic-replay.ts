// Rendering a recorded talk to a video file again (TASK-381): the picture of a recording is drawn
// after the talk, frame by frame, from what the talk recorded, so a talk that is kept can be
// rendered in the other theme, or again after a renderer fix, without a new voice session.

import { z } from "zod";

import { DiagramThemeSchema } from "@/shared/semantic-board/index";
import { ARCHBOARD_URL } from "@/runtime/engine/config";
import { TalkFileError, readTalk, renderTalk } from "@/runtime/walkthrough-recorder";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import { serverRefusal } from "@/cli/command-contract/common";
import { containerOf, requireWritableDirectory } from "@/cli/commands/lib/recording-output";

const THEMES = DiagramThemeSchema.options;

const ReplayInputSchema = z.object({
	talk: z.string(),
	out: z.string(),
	theme: DiagramThemeSchema.optional(),
});

const ReplayReceiptSchema = z.object({
	success: z.literal(true),
	talk: z.string(),
	board: z.string(),
	variant: z.string().nullable(),
	walkthrough: z.object({ id: z.string(), name: z.string() }),
	steps: z.int(),
	file: z.string(),
	bytes: z.int(),
	mimeType: z.string(),
	durationMs: z.int(),
	frames: z.int(),
	theme: DiagramThemeSchema,
});

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
		"No ffmpeg with the encoders the file needs (libx264 and aac for MP4, libvpx-vp9 and libopus for WebM) is on PATH or named by ARCHBOARD_FFMPEG, and Nix is not there to run nixpkgs#ffmpeg-headless, or running it failed. Checked before a browser starts, so nothing was rendered.",
};
const renderFailedRefusal = {
	code: "RENDER_FAILED",
	exit: 1,
	stream: "stderr" as const,
	description:
		"The picture could not be rendered to a file: the page did not draw a frame in time, the browser stopped, or ffmpeg failed. Nothing was written and the talk was kept.",
};

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
	description:
		"Renders the picture of a talk that a recording kept: a directory holding talk.json, which " +
		"has the board as it was recorded and when each step and subtitle line came, and voice.wav, " +
		"the voice. Each frame of the video is drawn by the Archboard server's own page in a private " +
		"headless Chromium, in software at 1920x1080, then encoded at 30 frames a second with the " +
		"voice into an MP4 or WebM file (by the --out extension). No Codex or voice is used and " +
		"the board need not exist, so a talk can be rendered again in the other theme with " +
		"--theme, or after a renderer fix. Needs a Chromium " +
		"or Google Chrome executable on PATH or named by ARCHBOARD_RENDERER_CHROMIUM, and ffmpeg: " +
		"the one named by ARCHBOARD_FFMPEG, else on PATH, else nixpkgs#ffmpeg-headless run through " +
		"Nix.",
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
		const made = await renderTalk({
			serverUrl: ARCHBOARD_URL,
			talk,
			directory,
			container,
			theme,
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
				variant: talk.board.variant,
				walkthrough: talk.board.walkthrough,
				steps: talk.board.steps,
				file: made.file,
				bytes: made.bytes,
				mimeType: made.mimeType,
				durationMs: made.durationMs,
				frames: made.frames,
				theme,
			},
		};
	},
});

export { semanticReplayContract };
