// The commit that removed a board from a vault, from the vault's Git history
// (ADR 0057): the newest commit that deleted a board file whose board had the
// id, or gave the file of the board's name to another board, as a commit does
// that removes a board and makes the one that takes its name. A rename moves a
// board's file, and Git reads that as a rename rather than a deletion, so only
// a board that is gone is found.

import path from "node:path";
import { normalizeBoardKey } from "@archboard/board/address";
import { isRecord, stringAt } from "@archboard/diagnostics/unknown-record";
import { gitOutput } from "#cli/clients/git/git-output.ts";

/** A commit of the vault's history. */
interface RemovingCommit {
	readonly commit: string;
	readonly subject: string;
}

/** The suffix of a board's file (ADR 0023). */
const BOARD_FILE_SUFFIX = ".semantic.json";

/**
 * Each commit that deleted a board file under the vault or changed the file of
 * a board name, newest first, with those files, named from the repository's root.
 * @param vault The vault directory.
 * @param name The name of the board, whose file a commit may have given to another board.
 * @param signal Cancels the reading.
 * @returns The commits, or none when the vault is in no repository.
 */
async function removals(
	vault: string,
	name: string,
	signal: AbortSignal,
): Promise<{ commit: RemovingCommit; files: string[] }[]> {
	const log = await gitOutput(
		vault,
		["log", "--diff-filter=DM", "-M", "--name-status", "-z", "--format=%x1e%H%x1f%s", "--", "."],
		signal,
	);
	if (log === undefined) return [];
	return log
		.toString("utf8")
		.split("\x1e")
		.filter((entry) => entry !== "")
		.map((entry) => {
			// The commit's line ends at a line break, and each status and file after it at a zero.
			const [head = "", ...changes] = entry.split(/\0\n?/u);
			const [commit = "", subject = ""] = head.split("\x1f");
			return { commit: { commit, subject: subject.trim() }, files: removalFiles(changes, name) };
		});
}

/**
 * The board files of one commit that can have removed a board: each one it
 * deleted, and the file of the board's name when it changed it.
 * @param changes Each change's status and then its file.
 * @param name The board's name.
 * @returns The files.
 */
function removalFiles(changes: readonly string[], name: string): string[] {
	const key = normalizeBoardKey(name);
	const files: string[] = [];
	for (let at = 0; at + 1 < changes.length; at += 2) {
		const [status, file = ""] = [changes[at], changes[at + 1]];
		const named = normalizeBoardKey(path.basename(file, BOARD_FILE_SUFFIX)) === key;
		if (file.endsWith(BOARD_FILE_SUFFIX) && (status === "D" || named)) files.push(file);
	}
	return files;
}

/**
 * The id of the board a file held at a revision.
 * @param vault The vault directory, where Git runs.
 * @param revision The revision.
 * @param file The file, named from the repository's root.
 * @param signal Cancels the reading.
 * @returns The id, or undefined when the file did not hold a board there.
 */
async function boardIdAt(
	vault: string,
	revision: string,
	file: string,
	signal: AbortSignal,
): Promise<string | undefined> {
	const shown = await gitOutput(vault, ["show", `${revision}:${file}`], signal);
	return shown === undefined ? undefined : boardIdIn(shown.toString("utf8"));
}

/**
 * Whether a commit took a board out of a file: the file held it before and not after.
 * @param vault The vault directory.
 * @param commit The commit.
 * @param file The file, named from the repository's root.
 * @param board The board's id.
 * @param signal Cancels the reading.
 * @returns True when the commit removed the board from the file.
 */
async function removedFrom(
	vault: string,
	commit: string,
	file: string,
	board: string,
	signal: AbortSignal,
): Promise<boolean> {
	return (
		(await boardIdAt(vault, `${commit}^`, file, signal)) === board &&
		(await boardIdAt(vault, commit, file, signal)) !== board
	);
}

/**
 * The id of the board a file's text holds.
 * @param text The text.
 * @returns The id, or undefined when the text is no board document.
 */
function boardIdIn(text: string): string | undefined {
	try {
		const held: unknown = JSON.parse(text);
		return isRecord(held) ? stringAt(held, "id") : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The commit that removed a board from a vault, when the vault's history has it.
 * @param vault The vault directory.
 * @param board The board, by id and by the name the recipe gives it.
 * @param board.id Its id.
 * @param board.name Its name.
 * @param signal Cancels the reading.
 * @returns The newest commit that deleted the board's file or gave it to
 * another board, or undefined when none did.
 */
async function removingCommit(
	vault: string,
	board: { readonly id: string; readonly name: string },
	signal: AbortSignal,
): Promise<RemovingCommit | undefined> {
	for (const { commit, files } of await removals(vault, board.name, signal)) {
		for (const file of files) {
			// oxlint-disable-next-line no-await-in-loop -- the newest removal of the board wins, so they are read in order
			if (await removedFrom(vault, commit.commit, file, board.id, signal)) return commit;
		}
	}
	return undefined;
}

export { removingCommit, type RemovingCommit };
