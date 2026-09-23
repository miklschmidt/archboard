// Recording one walkthrough of a semantic board to a video file, narrated by
// the Codex voice (TASK-304): the pane presents the walkthrough step by step
// at the reference size with no shell around it, the voice explains each step
// and the page moves on once it has finished, and the file is the page's own
// capture of its tab with the voice in it. With --discard, a board made only
// to be recorded is deleted once its recording is written.

import { extname } from "node:path";
import { z } from "zod";

import {
	addressedVariant,
	DiagramThemeSchema,
	type SemanticBoard,
	type SemanticWalkthrough,
} from "@/shared/semantic-board/index";
import { RecordingContainerSchema, type RecordingState } from "@/shared/walkthrough-recording";
import { currentWriteDoing } from "@/runtime/engine/canvas-client";
import { EXPRESS_SERVER_URL } from "@/runtime/engine/config";
import {
	discardSemanticBoardOnCanvas,
	readSemanticBoardOnCanvas,
} from "@/runtime/semantic-board-client/index";
import { recordWalkthrough } from "@/runtime/walkthrough-recorder";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import { doingRefusal, serverRefusal } from "@/cli/command-contract/common";
import { SelectorSchema, UNNAMED_VARIANT } from "@/cli/commands/lib/semantic-input";

const THEMES = DiagramThemeSchema.options;

const RecordInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema.optional(),
	walkthrough: z.string().optional(),
	theme: DiagramThemeSchema.default("light"),
	out: z.string(),
	discard: z.boolean().optional(),
});

const RecordReceiptSchema = z.object({
	success: z.literal(true),
	board: z.string(),
	variant: z.string(),
	walkthrough: z.object({ id: z.string(), name: z.string() }),
	steps: z.int(),
	file: z.string(),
	bytes: z.int(),
	mimeType: z.string(),
	durationMs: z.int(),
	theme: DiagramThemeSchema,
	discarded: z.boolean(),
});

const recorderUnavailableRefusal = {
	code: "RECORDER_UNAVAILABLE",
	exit: 4,
	stream: "stderr" as const,
	description:
		"No Chromium or Google Chrome executable was found, or the one named could not start.",
};
const recordingRefusedRefusal = {
	code: "RECORDING_REFUSED",
	exit: 4,
	stream: "stderr" as const,
	description:
		"The canvas could not start the recording: Codex not signed in, voice unavailable or already live, or the board not drawn. Nothing was written.",
};
const recordingFailedRefusal = {
	code: "RECORDING_FAILED",
	exit: 1,
	stream: "stderr" as const,
	description:
		"The recording started and did not finish, for example the voice said nothing about a step. Nothing was written and the board was kept.",
};

/**
 * The container a file name asks for.
 * @param out The file name.
 * @returns The container.
 * @throws {CliUsageError} When the name ends in neither .mp4 nor .webm.
 */
function containerOf(out: string): z.infer<typeof RecordingContainerSchema> {
	const parsed = RecordingContainerSchema.safeParse(extname(out).slice(1).toLowerCase());
	if (!parsed.success) {
		throw new CliUsageError(`--out ${out} must name a .mp4 or .webm file.`);
	}
	return parsed.data;
}

/**
 * How a variant's walkthroughs are named in a refusal.
 * @param offered The variant's walkthroughs.
 * @returns Their names, quoted, or "none".
 */
function namesOf(offered: readonly SemanticWalkthrough[]): string {
	return offered.length === 0 ? "none" : offered.map((one) => `"${one.name}"`).join(", ");
}

/**
 * The walkthrough a variant states when none was named: its only one.
 * @param offered The variant's walkthroughs.
 * @returns The walkthrough.
 * @throws {CliUsageError} When the variant states none, or several.
 */
function onlyWalkthrough(offered: readonly SemanticWalkthrough[]): SemanticWalkthrough {
	const [only, ...others] = offered;
	if (only === undefined) {
		throw new CliUsageError("That variant states no walkthrough, so there is nothing to record.");
	}
	if (others.length > 0) {
		throw new CliUsageError(
			`That variant states ${offered.length} walkthroughs (${namesOf(offered)}); name one with --walkthrough.`,
		);
	}
	return only;
}

/**
 * The walkthrough to record, of those a variant states: the one named, or the only one.
 * @param offered The variant's walkthroughs.
 * @param asked The id or name asked for, if any.
 * @returns The walkthrough.
 * @throws {CliUsageError} When none matches, or none was named and there is not exactly one.
 */
function chosenWalkthrough(
	offered: readonly SemanticWalkthrough[],
	asked: string | undefined,
): SemanticWalkthrough {
	if (asked === undefined) return onlyWalkthrough(offered);
	const wanted = asked.toLowerCase();
	const found = offered.find((one) => one.id === asked || one.name.toLowerCase() === wanted);
	if (found === undefined) {
		throw new CliUsageError(
			`No walkthrough "${asked}" on that variant. It states: ${namesOf(offered)}.`,
		);
	}
	return found;
}

/**
 * The variant and walkthrough to record.
 * @param board The board.
 * @param input What the command was given.
 * @returns The variant's id and the walkthrough.
 * @throws {CliUsageError} When the variant or the walkthrough does not exist.
 */
function recorded(
	board: SemanticBoard,
	input: z.infer<typeof RecordInputSchema>,
): { readonly variant: string; readonly walkthrough: SemanticWalkthrough } {
	const opened = addressedVariant(board, input.variant);
	if (!opened.ok) {
		throw new CliUsageError(`No variant "${input.variant ?? ""}" on board "${board.name}".`);
	}
	return {
		variant: opened.variant.id,
		walkthrough: chosenWalkthrough(opened.variant.content.walkthroughs, input.walkthrough),
	};
}

/**
 * A progress line for one moment of the talk.
 * @param state The page's state.
 * @returns The line, or null when there is nothing new worth saying.
 */
function progressLine(state: RecordingState): string | null {
	if (state.phase !== "recording") return null;
	if (state.step === null) return "Recording: voice is starting.";
	return `Recording step ${state.step}${state.of === null ? "" : ` of ${state.of}`}.`;
}

/**
 * Refuse a discard that states no doing before anything is recorded: the delete at the end
 * is a board write, and it would be refused only after the whole talk.
 * @param discard Whether the board is to be discarded.
 * @throws {Error} With code DOING_REQUIRED when --discard comes without --doing.
 */
function requireDoingForDiscard(discard: boolean): void {
	if (discard && currentWriteDoing() === null) {
		throw Object.assign(
			new Error('--discard deletes the board, which is a board write: say why with --doing "…".'),
			{ code: "DOING_REQUIRED" },
		);
	}
}

const semanticRecordContract = defineCommand({
	path: ["semantic", "record"],
	shared: ["url", "doing", "as-session"],
	summary: "Record a board's walkthrough to a video file, narrated by the voice",
	description:
		"Presents one walkthrough of a semantic board in a private headless Chromium at 1920x1080, " +
		"with no shell around the pane, and records it to an MP4 or WebM file (by the --out " +
		"extension) together with the Codex voice explaining each step. Each step moves on once " +
		"the voice has finished explaining it, and the recording ends after the last. It runs on " +
		"the canvas the CLI talks to, which must have Codex signed in and must not have voice " +
		"live. --discard deletes the board once the recording is written, for a board made only " +
		"to be recorded; a failed recording keeps it. Needs a Chromium or Google Chrome executable " +
		"on PATH or named by ARCHBOARD_RENDERER_CHROMIUM.",
	examples: [
		"archboard semantic record pipeline --out pipeline.mp4",
		'archboard semantic record pr-1234-talk --walkthrough "What changes" --out talk.mp4 --discard --doing "recording the PR talk"',
	],
	parameters: [
		{
			kind: "positional",
			key: "name",
			name: "name",
			required: true,
			description: "The board's name",
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
			key: "walkthrough",
			spellings: ["--walkthrough"],
			value: "required",
			placeholder: "walkthrough",
			description: "Which walkthrough to record, by id or name; the variant's only one when absent",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "variant",
			description: `Which variant's walkthrough to record, by id or name; ${UNNAMED_VARIANT}`,
		},
		{
			kind: "option",
			key: "theme",
			spellings: ["--theme"],
			value: "required",
			placeholder: "theme",
			choices: THEMES,
			default: "light",
			description: "Which palette the pane draws in",
		},
		{
			kind: "option",
			key: "discard",
			spellings: ["--discard"],
			value: "none",
			description:
				"Delete the board once its recording is written, for a board made only to be recorded; needs --doing",
		},
	],
	input: { ingress: RecordInputSchema },
	result: RecordReceiptSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The recording that was written",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the recording.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read", "local-write", "server-state-write"],
	refusals: [
		serverRefusal,
		doingRefusal,
		recorderUnavailableRefusal,
		recordingRefusedRefusal,
		recordingFailedRefusal,
	],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/board",
			cardinality: "one",
			description: "Read the board and its walkthroughs",
		},
		{
			method: "POST",
			path: "/api/semantic-boards/discard",
			cardinality: "conditional",
			description: "Discard the board once it is recorded, with --discard",
		},
	],
	/**
	 * Record the walkthrough, and discard the board when asked.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The recording that was written.
	 */
	async handler(input, context) {
		const container = containerOf(input.out);
		const discard = input.discard === true;
		requireDoingForDiscard(discard);
		await context.require("server", "semantic record");
		const board = await readSemanticBoardOnCanvas(input.name);
		const { variant, walkthrough } = recorded(board, input);
		const file = context.resolvePath(input.out);
		let said: string | null = null;
		const made = await recordWalkthrough({
			canvasUrl: EXPRESS_SERVER_URL,
			boardKey: input.variant === undefined ? board.name : `${board.name}@${variant}`,
			walkthrough: walkthrough.id,
			container,
			theme: input.theme,
			out: file,
			signal: context.signal,
			/**
			 * Say each new step of the talk as it is reached.
			 * @param state The page's state.
			 */
			onProgress: (state) => {
				const line = progressLine(state);
				if (line !== null && line !== said) context.diagnostic(line);
				said = line;
			},
		});
		if (discard) await discardSemanticBoardOnCanvas(board.name);
		return {
			result: {
				success: true as const,
				board: board.name,
				variant,
				walkthrough: { id: walkthrough.id, name: walkthrough.name },
				steps: made.steps,
				file: made.file,
				bytes: made.bytes,
				mimeType: made.mimeType,
				durationMs: made.durationMs,
				theme: input.theme,
				discarded: discard,
			},
		};
	},
});

export { semanticRecordContract };
