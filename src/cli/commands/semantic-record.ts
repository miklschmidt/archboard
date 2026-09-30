// Recording one walkthrough of a semantic board to a video file, narrated by
// the Codex voice (TASK-304): the pane presents the walkthrough step by step
// at the reference size with no shell around it, the voice explains each step
// and the page moves on once it has finished, and the file is the page's own
// capture of its tab with the voice in it. With --discard, a board made only
// to be recorded is deleted once its recording is written.

import { accessSync, constants, statSync } from "node:fs";
import { dirname, extname } from "node:path";
import { z } from "zod";

import {
	DiagramThemeSchema,
	type SemanticBoard,
	type SemanticWalkthrough,
} from "@/shared/semantic-board/index";
import {
	DEFAULT_RECORDING_LANGUAGE,
	RecordingContainerSchema,
	RecordingLanguageSchema,
	type RecordingState,
} from "@/shared/walkthrough-recording";
import { currentWriteDoing } from "@/runtime/engine/server-client";
import { ARCHBOARD_URL } from "@/runtime/engine/config";
import {
	discardSemanticBoardOnServer,
	readSemanticBoardOnServer,
} from "@/runtime/semantic-board-client/index";
import { recordWalkthrough } from "@/runtime/walkthrough-recorder";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import { doingRefusal, serverRefusal } from "@/cli/command-contract/common";
import { SelectorSchema, UNNAMED_VARIANT, askedVariant } from "@/cli/commands/lib/semantic-input";

const THEMES = DiagramThemeSchema.options;

const RecordInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema.optional(),
	walkthrough: z.string().optional(),
	theme: DiagramThemeSchema.default("light"),
	language: RecordingLanguageSchema.default(DEFAULT_RECORDING_LANGUAGE),
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
		"The Archboard server could not start the recording, or it failed before showing a step: Codex not signed in, voice unavailable, the board not drawn, or a frontend built without recording. Nothing was written.",
};
const recordingFailedRefusal = {
	code: "RECORDING_FAILED",
	exit: 1,
	stream: "stderr" as const,
	description:
		"The recording showed a step and did not finish, for example the voice said nothing about the next one. Nothing was written and the board was kept.",
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

/**
 * Refuse an --out whose directory is missing or cannot be written before anything starts: the
 * file is first written there only after the whole talk.
 * @param out The --out the command was given.
 * @param file Where it resolves to.
 * @throws {CliUsageError} When its directory is not one this process can write in.
 */
function requireWritableDirectory(out: string, file: string): void {
	const directory = dirname(file);
	try {
		if (!statSync(directory).isDirectory()) throw new Error(`${directory} is not a directory`);
		accessSync(directory, constants.W_OK);
	} catch (error) {
		const why = error instanceof Error ? error.message : String(error);
		throw new CliUsageError(
			`--out ${out} must be in a directory that exists and can be written (${why}). Create it, or name another.`,
		);
	}
}

/**
 * Discard the board that was recorded, at the version it was recorded at: a board somebody
 * changed meanwhile is kept. A discard that fails only keeps the board, and says so; the
 * recording is written either way.
 * @param board The board as it was read before recording.
 * @param file The recording.
 * @param say Writes one diagnostic line.
 * @returns Whether the board went.
 */
async function discardRecorded(
	board: SemanticBoard,
	file: string,
	say: (line: string) => void,
): Promise<boolean> {
	try {
		await discardSemanticBoardOnServer(board.name, board.version);
		return true;
	} catch (error) {
		say(
			`The recording is written to ${file}, but the board "${board.name}" was kept: discarding it failed (${failureOf(error)}).`,
		);
		return false;
	}
}

/**
 * What a failure says, with its code when it carries one.
 * @param error What was thrown.
 * @returns Its code and message.
 */
function failureOf(error: unknown): string {
	const why = error instanceof Error ? error.message : String(error);
	const code = error instanceof Error && "code" in error ? error.code : undefined;
	return typeof code === "string" ? `${code}: ${why}` : why;
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
		"the Archboard server the CLI talks to, which must have Codex signed in. A recording is a " +
		"conversation of its own, so voice live in a browser tab does not stop it. The voice " +
		"speaks only the --language it is given, whatever language the steps are written in. " +
		"--discard " +
		"deletes the board once the recording is written, for a board made only to be recorded; " +
		"a failed recording keeps it, and so does a board changed while it was " +
		"recorded, which the receipt says. Needs a Chromium or Google Chrome executable " +
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
			key: "language",
			spellings: ["--language"],
			value: "required",
			placeholder: "tag",
			default: DEFAULT_RECORDING_LANGUAGE,
			description:
				"Which language the voice narrates in, as a BCP 47 language tag such as en, da, fr or pt-BR",
		},
		{
			kind: "option",
			key: "discard",
			spellings: ["--discard"],
			value: "none",
			requiresShared: ["doing"],
			description:
				"Delete the board once its recording is written, for a board made only to be recorded",
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
		const file = context.resolvePath(input.out);
		requireWritableDirectory(input.out, file);
		const discard = input.discard === true;
		requireDoingForDiscard(discard);
		await context.require("server", "semantic record");
		const board = await readSemanticBoardOnServer(input.name);
		const variant = askedVariant(board, input.variant);
		const walkthrough = chosenWalkthrough(variant.content.walkthroughs, input.walkthrough);
		const made = await recordWalkthrough({
			serverUrl: ARCHBOARD_URL,
			boardKey: input.variant === undefined ? board.name : `${board.name}@${variant.id}`,
			walkthrough: walkthrough.id,
			language: input.language,
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
				if (line !== null) context.diagnostic(line);
			},
		});
		if (made.leftBehind.length > 0) {
			context.diagnostic(
				`The recording's browser could not be proved gone: ${made.leftBehind.join("; ")}`,
			);
		}
		for (const note of made.notes) context.diagnostic(note);
		context.signal.throwIfAborted();
		const discarded = discard && (await discardRecorded(board, made.file, context.diagnostic));
		return {
			result: {
				success: true as const,
				board: board.name,
				variant: variant.id,
				walkthrough: { id: walkthrough.id, name: walkthrough.name },
				steps: made.steps,
				file: made.file,
				bytes: made.bytes,
				mimeType: made.mimeType,
				durationMs: made.durationMs,
				theme: input.theme,
				discarded,
			},
		};
	},
});

export { semanticRecordContract };
