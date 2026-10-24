// `--track` on a render to a file (ADR 0057): the board lists the file as a
// tracked embed, `{ repo, path }`, so that the board's side knows where its
// picture is shown. The file is named by the repository identity of the Git
// checkout that holds it and its path from that checkout's root.
//
// Tracking is a board write through the server's one write boundary: the
// lease, `--doing` for an agent and a version that rises. It is made before
// the file is written, so a refused write leaves no file that the board does
// not list. Every refusal of `--track` comes before the picture is drawn or
// written, except the one that needs the picture's recipe, which comes before
// anything is written.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
	SemanticBoardSchema,
	TrackedEmbedSchema,
	type TrackedEmbed,
} from "@archboard/board/document";
import type { RenderRecipe } from "@archboard/renderer/recipe";
import { requestJson } from "@archboard/server-lifecycle/server-client";
import { listRegistry, repoIdentityAt, repoRootOf } from "@archboard/workspace/checkouts";
import {
	CliUsageError,
	type CommandContext,
	type RestRelationship,
} from "#cli/protocol/contract/contract.ts";
import { gitOutput } from "#cli/clients/git/git-output.ts";

/** What a render to a file says it tracked: the embed and the board's version after it. */
const TrackedReceiptSchema = TrackedEmbedSchema.extend({ version: z.int() });

/** The refusal of `--track` for a file that no Git checkout holds, or that Git ignores. */
const trackOutsideCheckoutRefusal = {
	code: "TRACK_OUTSIDE_CHECKOUT",
	exit: 2,
	stream: "stderr" as const,
	description:
		"--track names a file that no Git checkout holds, or that Git ignores, so no repository keeps it as an embed. Nothing was drawn or written.",
};

/** The refusal of `--track` when this machine has no registered checkout of the vault's repository. */
const trackVaultUnregisteredRefusal = {
	code: "TRACK_VAULT_UNREGISTERED",
	exit: 2,
	stream: "stderr" as const,
	description:
		"--track needs a registered checkout of the repository that holds the vault, which a tracked embed's recipe names. Nothing was written. Register one with `archboard repo add <directory>`.",
};

/** A refusal of `--track`, with its code. */
class TrackRefusedError extends Error {
	readonly code: string;

	/**
	 * A refusal with the code its command declares.
	 * @param code The refusal's code.
	 * @param message What went wrong and what to do next.
	 */
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

/**
 * The refusal of a file that no repository keeps as an embed.
 * @param file The file.
 * @param why Where the file is, in words.
 * @returns The refusal.
 */
function outsideRefusal(file: string, why: string): TrackRefusedError {
	return new TrackRefusedError(
		trackOutsideCheckoutRefusal.code,
		`${file} ${why}, so no repository keeps it as an embed and --track cannot list it. Write it inside a checkout, where Git tracks it. Nothing was drawn or written.`,
	);
}

/**
 * The file to be written, through the real path of its directory, so a link
 * above the file cannot make the tracked path name another place. A board
 * cannot forget an embed it lists, so a file that cannot be written is refused
 * here, before the board lists it.
 * @param file The file, absolute.
 * @returns The same file through its real directory.
 * @throws {CliUsageError} When the file's directory does not exist, or the file is a directory.
 */
function realFile(file: string): string {
	const dir = path.dirname(file);
	if (fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() !== true) {
		throw new CliUsageError(
			`--track cannot list ${file}, because the directory ${dir} does not exist. Create it, or name a file in a directory that exists. Nothing was drawn or written.`,
		);
	}
	if (fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() === true) {
		throw new CliUsageError(
			`--track cannot list ${file}, because it is a directory. Name the file to write. Nothing was drawn or written.`,
		);
	}
	return path.join(fs.realpathSync.native(dir), path.basename(file));
}

/**
 * The tracked embed a file to be written is: the identity of the checkout that
 * holds it and its path there.
 * @param file The file, absolute.
 * @param signal Cancels the questions to Git.
 * @returns The embed.
 * @throws {TrackRefusedError} When no checkout holds the file, or Git ignores it.
 */
async function embedOfFile(file: string, signal: AbortSignal): Promise<TrackedEmbed> {
	const real = realFile(file);
	const top = await repoRootOf(path.dirname(real), { signal });
	if (top === undefined) throw outsideRefusal(file, "is in no Git checkout");
	// The checkout of the file's real directory holds it, so the path from its root goes down.
	const root = fs.realpathSync.native(top);
	const repoPath = path.relative(root, real).split(path.sep).join("/");
	if ((await gitOutput(root, ["check-ignore", "-q", "--", repoPath], signal)) !== undefined) {
		throw outsideRefusal(file, `is ignored by Git in ${root}`);
	}
	return { repo: await repoIdentityAt(root, { signal }), path: repoPath };
}

/** Where a drawing command writes, and the tracked embed `--track` makes of it. */
interface PlannedFile {
	/** The file, absolute, or undefined when the command writes none. */
	readonly file: string | undefined;
	/** The embed `--track` lists, or undefined when the command tracks nothing. */
	readonly embed: TrackedEmbed | undefined;
}

/**
 * Where a drawing command writes, and the embed it tracks, found before anything is drawn.
 * @param input What the command was given.
 * @param input.out The file it writes, if any.
 * @param input.track Whether it tracks the file.
 * @param context The command context.
 * @returns The file and the embed.
 * @throws {TrackRefusedError} When `--track` names a file no checkout keeps.
 */
async function plannedFile(
	input: { readonly out?: string | undefined; readonly track: boolean },
	context: Pick<CommandContext, "resolvePath" | "signal">,
): Promise<PlannedFile> {
	if (input.out === undefined) return { file: undefined, embed: undefined };
	const file = context.resolvePath(input.out);
	return { file, embed: input.track ? await embedOfFile(file, context.signal) : undefined };
}

/**
 * Refuse to track a picture whose vault has no registered checkout on this machine.
 * @param planned What the command writes and tracks.
 * @param recipe The recipe of the picture.
 * @throws {TrackRefusedError} When it tracks and no registered checkout of the vault's repository exists.
 */
function requireTrackable(planned: PlannedFile, recipe: RenderRecipe): void {
	const repo = recipe.vault.repo;
	const registered =
		repo !== null && listRegistry().checkouts.some((one) => one.repo === repo && one.exists);
	if (planned.embed === undefined || registered) return;
	throw new TrackRefusedError(
		trackVaultUnregisteredRefusal.code,
		repo === null
			? "The vault is in no Git repository, so its recipe names no repository that an embed's check could find. --track needs a vault in a registered checkout. Nothing was written."
			: `No registered checkout of ${repo}, the repository that holds the vault, exists on this machine. Register one with \`archboard repo add <directory>\`, then try again. Nothing was written.`,
	);
}

/** The track route's answer, as far as `--track` reads it. */
const TrackAnswerSchema = z.object({ success: z.literal(true), board: SemanticBoardSchema });

/**
 * List the file on the board as a tracked embed, through the server's write
 * boundary, when the command tracks it. A board that lists it already
 * answers unchanged.
 * @param board The board's name.
 * @param planned What the command writes and tracks.
 * @returns The receipt's `tracked` field, or nothing when it tracks nothing.
 */
async function trackedField(
	board: string,
	planned: PlannedFile,
): Promise<{ tracked?: z.infer<typeof TrackedReceiptSchema> }> {
	const { embed } = planned;
	if (embed === undefined) return {};
	const answer = TrackAnswerSchema.parse(
		await requestJson<unknown>("/api/semantic-boards/track-embed", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ board, track: embed }),
		}),
	);
	return { tracked: { ...embed, version: answer.board.version } };
}

/** The option every drawing command that writes a file offers. */
const TRACK_OPTION = {
	kind: "option",
	key: "track",
	spellings: ["--track"],
	value: "none",
	requiresShared: ["doing"],
	description:
		"List the file on the board as a tracked embed, { repo, path }, through a board write that needs --doing; the file must be in a Git checkout that does not ignore it. Needs --out",
} as const;

/** The board write a drawing command makes with `--track`. */
const TRACK_RELATIONSHIP: RestRelationship = {
	method: "POST",
	path: "/api/semantic-boards/track-embed",
	cardinality: "conditional",
	description: "With --track, list the file on the board",
};

/** The refinement of an input that tracks only a file. */
const TRACK_NEEDS_OUT = {
	message: "--track lists a file on the board, so it needs --out.",
	path: ["track"],
};

/**
 * Whether an input tracks only what it writes to a file.
 * @param input The input.
 * @param input.track Whether it asks to track.
 * @param input.out The file it writes, if any.
 * @returns True unless it asks to track without a file.
 */
function trackHasOut(input: {
	readonly track: boolean;
	readonly out?: string | undefined;
}): boolean {
	return !input.track || input.out !== undefined;
}

export {
	plannedFile,
	requireTrackable,
	TRACK_NEEDS_OUT,
	TRACK_OPTION,
	TRACK_RELATIONSHIP,
	TrackedReceiptSchema,
	trackedField,
	trackHasOut,
	trackOutsideCheckoutRefusal,
	trackVaultUnregisteredRefusal,
};
