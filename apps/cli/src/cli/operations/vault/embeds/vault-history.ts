// The commit that removed a board from a vault, from the vault's Git history
// (ADR 0057): the newest commit that deleted a board file whose board had the
// id. A rename moves a board's file, and Git reads that as a rename rather
// than a deletion, so only a board that is gone is found.

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
 * Each commit that deleted a board file under the vault, newest first, with
 * the files it deleted, named from the repository's root.
 * @param vault The vault directory.
 * @param signal Cancels the reading.
 * @returns The commits, or none when the vault is in no repository.
 */
async function deletions(
	vault: string,
	signal: AbortSignal,
): Promise<{ commit: RemovingCommit; files: string[] }[]> {
	const log = await gitOutput(
		vault,
		["log", "--diff-filter=D", "-M", "--name-only", "-z", "--format=%x1e%H%x1f%s", "--", "."],
		signal,
	);
	if (log === undefined) return [];
	return log
		.toString("utf8")
		.split("\x1e")
		.filter((entry) => entry !== "")
		.map((entry) => {
			// The commit's line ends at a line break, and each file after it at a zero.
			const [head = "", ...files] = entry.split(/\n|\0/u);
			const [commit = "", subject = ""] = head.split("\x1f");
			return {
				commit: { commit, subject: subject.trim() },
				files: files.filter((file) => file.endsWith(BOARD_FILE_SUFFIX)),
			};
		});
}

/**
 * The id of the board a file held just before a commit deleted it.
 * @param vault The vault directory, where Git runs.
 * @param commit The commit that deleted it.
 * @param file The file, named from the repository's root.
 * @param signal Cancels the reading.
 * @returns The id, or undefined when the file did not hold a board.
 */
async function boardIdBefore(
	vault: string,
	commit: string,
	file: string,
	signal: AbortSignal,
): Promise<string | undefined> {
	const shown = await gitOutput(vault, ["show", `${commit}^:${file}`], signal);
	return shown === undefined ? undefined : boardIdIn(shown.toString("utf8"));
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
 * @param board The board's id.
 * @param signal Cancels the reading.
 * @returns The newest commit that deleted the board's file, or undefined when none did.
 */
async function removingCommit(
	vault: string,
	board: string,
	signal: AbortSignal,
): Promise<RemovingCommit | undefined> {
	for (const { commit, files } of await deletions(vault, signal)) {
		for (const file of files) {
			// oxlint-disable-next-line no-await-in-loop -- the newest deletion of the board wins, so they are read in order
			if ((await boardIdBefore(vault, commit.commit, file, signal)) === board) return commit;
		}
	}
	return undefined;
}

export { removingCommit, type RemovingCommit };
