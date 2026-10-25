// Recording one walkthrough of a semantic board to a video file, narrated by
// the Codex voice (TASK-304): the pane presents the walkthrough step by step
// at the reference size with no shell around it, the voice explains each step
// and the page moves on once it has finished. The page keeps the talk, and the
// picture is rendered from the talk frame by frame (TASK-381). With --discard,
// a board made only to be recorded is deleted once its recording is written.

import { z } from "zod";

import {
	DEFAULT_LAYOUT_ENGINE,
	DiagramThemeSchema,
	LayoutEngineSchema,
} from "@archboard/board/render-reply";
import type { SemanticBoard } from "@archboard/board/document";
import {
	DEFAULT_RECORDING_LANGUAGE,
	RecordingLanguageSchema,
} from "@archboard/walkthrough/recording";
import { statedInvocation } from "@archboard/server-lifecycle/server-client";
import { ARCHBOARD_URL } from "@archboard/server-lifecycle/config";
import { registeredRepositoryOfVault as repositoryOfVault } from "@archboard/workspace/checkouts";
import {
	checkSemanticVaultOnServer,
	discardSemanticBoardOnServer,
	readSemanticBoardOnServer,
} from "#cli/clients/server/semantic-boards.ts";
import { TalkFileError, freshTalkPlace, recordWalkthrough } from "@archboard/walkthrough/recorder";
import {
	CliUsageError,
	defineCommand,
	type CommandContext,
} from "#cli/protocol/contract/contract.ts";
import { doingRefusal, serverRefusal } from "#cli/protocol/contract/refusals.ts";
import {
	containerOf,
	encoderUnavailableRefusal,
	recorderUnavailableRefusal,
	renderFailedRefusal,
	requireWritableDirectory,
} from "#cli/rules/semantic/draw/recording-output.ts";
import { drawnAgainstNamed } from "#cli/rules/semantic/compare/read-against.ts";
import { AGAINST_OPTION } from "#cli/operations/semantic/draw/drawn-against.ts";
import {
	SelectorSchema,
	UNNAMED_VARIANT,
	askedVariant,
} from "#cli/operations/semantic/input/semantic-input.ts";
import type { VariantContent } from "@archboard/board/content";

type SemanticWalkthrough = VariantContent["walkthroughs"][number];

/** What the recording page says about its recording, as the recorder reports it. */
type RecordingState = Parameters<Parameters<typeof recordWalkthrough>[0]["onProgress"]>[0];

const THEMES = DiagramThemeSchema.options;
/** A video cannot follow its viewer's theme, so it is drawn dark unless asked otherwise (TASK-483). */
const DEFAULT_THEME = "dark" satisfies (typeof THEMES)[number];

const RecordInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema.optional(),
	against: SelectorSchema.optional(),
	walkthrough: z.string().optional(),
	theme: DiagramThemeSchema.default(DEFAULT_THEME),
	layout: LayoutEngineSchema.default(DEFAULT_LAYOUT_ENGINE),
	language: RecordingLanguageSchema.default(DEFAULT_RECORDING_LANGUAGE),
	out: z.string(),
	talk: z.string().optional(),
	discard: z.boolean().optional(),
});

const RecordReceiptSchema = z.object({
	success: z.literal(true),
	board: z.string(),
	variant: z.string(),
	/** The id of the variant every frame is read against, when --against named one. */
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
	talk: z.string(),
	discarded: z.boolean(),
});

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
		"The talk showed a step and did not finish, for example the voice said nothing about the next one, or the board changed while it was recorded. Nothing was written and the board was kept.",
};

const checkoutNotChosenRefusal = {
	code: "CHECKOUT_NOT_CHOSEN",
	exit: 2,
	stream: "stderr" as const,
	description:
		"The vault is in a checkout that is not the chosen checkout of its repository, and the recording's page reads the chosen one. Nothing was recorded.",
};

/**
 * The repository the recording's page opens the board in: the one whose vault
 * the command found. The page names a repository and reads its chosen
 * checkout, so a vault in another checkout of it would record another vault's
 * board, and is refused. A vault no registered directory holds names none, and
 * the page opens where the server opens a page.
 * @param vault The vault the command addressed.
 * @returns The repository's name, or null.
 * @throws {Error} With code CHECKOUT_NOT_CHOSEN when the vault's checkout is not the chosen one.
 */
function recordedRepository(vault: CommandContext["vault"]): string | null {
	const repository = vault === null ? undefined : repositoryOfVault(vault.path);
	if (repository === undefined) return null;
	if (!repository.chosen) {
		throw Object.assign(
			new Error(
				`${repository.root} is not the chosen checkout of ${repository.name}, and the recording's page reads the chosen one. ` +
					`Run \`archboard repo use ${repository.root}\` to read this checkout, then record again. Nothing was recorded.`,
			),
			{ code: checkoutNotChosenRefusal.code },
		);
	}
	return repository.name;
}

/**
 * Where the talk is kept: the directory asked for, or a new one in the state directory.
 * @param asked The --talk the command was given, resolved, if any.
 * @param board The board recorded, which names a talk kept in the state directory.
 * @returns The place, proven free.
 * @throws {CliUsageError} When the directory asked for exists or cannot be made.
 */
function talkPlaceOf(asked: string | undefined, board: string): ReturnType<typeof freshTalkPlace> {
	try {
		return freshTalkPlace(asked, board, new Date());
	} catch (error) {
		if (error instanceof TalkFileError) throw new CliUsageError(error.message);
		throw error;
	}
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
	if (discard && statedInvocation().doing === null) {
		throw Object.assign(
			new Error('--discard deletes the board, which is a board write: say why with --doing "…".'),
			{ code: "DOING_REQUIRED" },
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
	shared: ["url", "directory", "doing", "as-session"],
	summary: "Record a board's walkthrough to a video file, narrated by the voice",
	description:
		"Presents one walkthrough of a semantic board in a private headless Chromium at 1920x1080, " +
		"with no shell around the pane, while the Codex voice explains each step. Each step moves " +
		"on once the voice has finished explaining it, and the talk ends after the last. The talk " +
		"is kept, with the board as it was drawn, in the state directory's recordings (the newest " +
		"ten) or in --talk. Its picture is then rendered frame by frame at 30 frames a second, with " +
		"the voice, to an MP4 or WebM file (by the --out extension); a render that fails keeps the " +
		"talk for semantic replay. It runs on the Archboard server the CLI talks to, which must " +
		"have Codex signed in. A recording is a conversation of its own, so voice live in a browser " +
		"tab does not stop it. The voice speaks only the --language it is given, whatever language " +
		"the steps are written in. Every frame is laid out by the --layout engine, which the talk " +
		"keeps, so a replay draws the same layout. With --against every frame is drawn relative to " +
		"that variant, without the Planned frame, and the talk keeps it too. " +
		"--discard " +
		"deletes the board once the recording is written, for a board made only to be recorded; " +
		"a failed recording keeps it, and so does a board changed while it was " +
		"recorded, which the receipt says. Needs a Chromium or Google Chrome executable " +
		"on PATH or named by ARCHBOARD_RENDERER_CHROMIUM, and ffmpeg: the one named by " +
		"ARCHBOARD_FFMPEG, else on PATH, else nixpkgs#ffmpeg-headless run through Nix.",
	examples: [
		"archboard semantic record pipeline --out pipeline.mp4",
		'archboard semantic record pipeline --variant "TASK-2" --against "TASK-1" --out task-2.mp4',
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
			...AGAINST_OPTION,
			description:
				"Draw every frame relative to this variant, by id or name: each marks only what the recorded variant adds, " +
				"changes and removes over it, and none carries a Planned frame. It cannot be the recorded variant. The talk keeps it",
		},
		{
			kind: "option",
			key: "theme",
			spellings: ["--theme"],
			value: "required",
			placeholder: "theme",
			choices: THEMES,
			default: DEFAULT_THEME,
			description: "Which palette the pane draws in",
		},
		{
			kind: "option",
			key: "layout",
			spellings: ["--layout"],
			value: "required",
			placeholder: "engine",
			choices: LayoutEngineSchema.options,
			default: DEFAULT_LAYOUT_ENGINE,
			description: "Which layout engine lays the board out in every frame; the talk keeps it",
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
			key: "talk",
			spellings: ["--talk"],
			value: "required",
			placeholder: "dir",
			description:
				"Where to keep the talk, a directory that does not exist yet; a new one in the state directory's recordings when absent",
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
		encoderUnavailableRefusal,
		recordingRefusedRefusal,
		recordingFailedRefusal,
		renderFailedRefusal,
		checkoutNotChosenRefusal,
	],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/board",
			cardinality: "one",
			description: "Read the board and its walkthroughs",
		},
		{
			method: "GET",
			path: "/api/vault/check",
			cardinality: "one",
			description: "Read the vault check the board is drawn under, which the talk keeps",
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
		const repository = recordedRepository(context.vault);
		await context.require("server", "semantic record");
		const board = await readSemanticBoardOnServer(input.name);
		const variant = askedVariant(board, input.variant);
		const against =
			input.against === undefined ? null : drawnAgainstNamed(board, variant, input.against).id;
		const walkthrough = chosenWalkthrough(variant.content.walkthroughs, input.walkthrough);
		const talk = talkPlaceOf(
			input.talk === undefined ? undefined : context.resolvePath(input.talk),
			board.name,
		);
		const made = await recordWalkthrough({
			serverUrl: ARCHBOARD_URL,
			board,
			policy: await checkSemanticVaultOnServer(),
			variant: input.variant === undefined ? null : variant.id,
			against,
			repository,
			walkthrough: { id: walkthrough.id, name: walkthrough.name },
			language: input.language,
			container,
			theme: input.theme,
			layout: input.layout,
			out: file,
			talk,
			signal: context.signal,
			say: context.diagnostic,
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
		context.signal.throwIfAborted();
		const discarded = discard && (await discardRecorded(board, made.file, context.diagnostic));
		return {
			result: {
				success: true as const,
				board: board.name,
				variant: variant.id,
				against,
				walkthrough: { id: walkthrough.id, name: walkthrough.name },
				steps: made.steps,
				file: made.file,
				bytes: made.bytes,
				mimeType: made.mimeType,
				durationMs: made.durationMs,
				frames: made.frames,
				theme: input.theme,
				layout: input.layout,
				talk: made.talk,
				discarded,
			},
		};
	},
});

export { semanticRecordContract };
