// The lines `archboard check --code` writes beside its JSON answer: what the
// code check skipped, one line for each reason with a count, and how far each
// board is behind its code, per board and per part (ADR 0045, ADR 0046).

import type { BoardBehind, CodeCheckAnswer } from "@/shared/code-check/index";

/**
 * Count entries by a key, in the order each key first appears.
 * @param keys One key per entry.
 * @returns Each key with its count.
 */
function counts(keys: readonly string[]): [string, number][] {
	const counted = new Map<string, number>();
	for (const key of keys) counted.set(key, (counted.get(key) ?? 0) + 1);
	return [...counted];
}

/**
 * A count with its noun.
 * @param count How many.
 * @param noun The singular noun.
 * @returns The phrase.
 */
function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Why the last change of a board cannot be found, in words. */
const UNKNOWN_REASON = {
	"vault-outside-git": "the vault is in no Git repository",
	"board-file-ignored": "Git ignores the board file",
} as const;

/**
 * The lines about how far one board is behind.
 * @param board One board's reading.
 * @returns Its lines.
 */
function behindLines(board: BoardBehind): string[] {
	const head = `behind: ${board.board}`;
	if (board.lastChange.kind === "unknown") {
		return [`${head}: cannot tell, because ${UNKNOWN_REASON[board.lastChange.reason]}`];
	}
	if (!("commits" in board)) return [];
	const since =
		board.lastChange.kind === "commit"
			? `since ${board.lastChange.commit.slice(0, 9)} (${board.lastChange.committedAt.slice(0, 10)})`
			: "since a change to its current variant that no commit holds yet";
	const large = board.commits.filter((commit) => commit.large).length;
	return [
		`${head}: ${plural(board.commits.length, "commit")} ${since}${large === 0 ? "" : `, ${large} large`}`,
		...board.parts
			.filter((part) => part.commits.length > 0)
			.map((part) => `behind:   ${part.subject.name} (${part.path}): ${part.commits.length}`),
		...counts(board.skipped.map((skip) => skip.reason)).map(
			([reason, count]) => `behind:   skipped ${plural(count, "part")}: ${reason}`,
		),
	];
}

/**
 * Every line the code check writes beside its answer.
 * @param answer The code check's answer.
 * @returns The lines.
 */
function codeCheckLines(answer: CodeCheckAnswer): string[] {
	return [
		...counts(answer.skipped.map((skip) => skip.reason)).map(
			([reason, count]) => `code check: skipped ${plural(count, "board")}: ${reason}`,
		),
		...answer.behind.flatMap(behindLines),
	];
}

export { codeCheckLines };
