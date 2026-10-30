// The lines `archboard check code` writes beside its JSON answer: each
// finding as a diagnostic line with the evidence it rests on, what the code
// check skipped, one line for each reason with a count, one line for each
// container whose exposed names were asked for (`--exposed`), and how far each
// board is behind its code, per board and per part (ADR 0045, ADR 0046).

import type { CodeCheckAnswer } from "@archboard/code-intel/code-check";
import { diagnosticLine } from "@archboard/board/policy";

/** How far one board is behind its code. */
type BoardBehind = CodeCheckAnswer["behind"][number];

/** One subject the code check skipped, and why. */
type CodeCheckSkip = CodeCheckAnswer["skipped"][number];

/** One finding of the code check. */
type CodeFinding = CodeCheckAnswer["findings"][number];

/** What one judged container exposes. */
type ContainerExposure = NonNullable<CodeCheckAnswer["exposures"]>[number];

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
 * One finding, then each piece of evidence it rests on: its kind, its
 * resolution and its place in code.
 * @param finding The finding.
 * @returns Its lines.
 */
function findingLines(finding: CodeFinding): string[] {
	return [
		diagnosticLine({ ...finding, file: `${finding.code}: ${finding.file}` }),
		...(finding.evidence ?? []).map(
			(evidence) => `  ${evidence.kind}, ${evidence.resolution}, ${evidence.path}:${evidence.line}`,
		),
	];
}

/**
 * What a skip is about: a subject, a whole draft, a whole board, a whole
 * checkout, or a whole language that no checkout names.
 * @param skip The skip.
 * @returns The noun.
 */
function skippedNoun(skip: CodeCheckSkip): string {
	if (skip.subject !== undefined) return "subject";
	if (skip.variant !== undefined) return "draft";
	if (skip.board !== undefined) return "board";
	return skip.repo === undefined ? "language" : "checkout";
}

/**
 * What a line names for the skips of one reason: each checkout once, since a
 * reason can be said once for each project of a checkout, such as a Swift
 * package with no index; or each language with why. A checkout with no server
 * for a language says which language and what configures one, since that is
 * its whole answer. A draft is named with its board, its repository and why,
 * since which drafts were not read is the answer. Skips of subjects and boards
 * name nothing.
 * @param same The skips of one reason.
 * @param noun What they are about.
 * @returns The names.
 */
function namesOf(same: readonly CodeCheckSkip[], noun: string): string[] {
	if (noun === "language") return same.flatMap((skip) => skip.detail ?? []);
	if (noun === "draft") {
		return same.map(
			(skip) => `${skip.board} ${skip.variant} in ${skip.repo}: ${skip.detail ?? ""}`,
		);
	}
	if (noun !== "checkout") return [];
	if (same.every((skip) => skip.reason === "language-server-missing")) {
		return same.map((skip) => `${skip.repo}: ${skip.detail}`);
	}
	return [...new Set(same.flatMap((skip) => skip.repo ?? []))];
}

/**
 * One line for each reason the check skipped something, with a count. A
 * reason that holds for whole checkouts names them, and one that holds for a
 * whole language says which and why, since it names no subject.
 * @param skipped What the check skipped.
 * @returns The lines.
 */
function skippedLines(skipped: readonly CodeCheckSkip[]): string[] {
	const byReason = new Map<string, CodeCheckSkip[]>();
	for (const skip of skipped) {
		const key = `${skippedNoun(skip)} ${skip.reason}`;
		byReason.set(key, [...(byReason.get(key) ?? []), skip]);
	}
	return [...byReason.values()].map((same) => {
		const [first] = same;
		const noun = first === undefined ? "" : skippedNoun(first);
		const named = namesOf(same, noun);
		const count = noun === "checkout" ? new Set(same.map((skip) => skip.repo)).size : same.length;
		const list = named.length > 0 ? ` (${named.join("; ")})` : "";
		return `code check: skipped ${plural(count, noun)}: ${first?.reason}${list}`;
	});
}

/**
 * One line for a container's exposure: the counts the pane shows. The names
 * and their users are in the JSON answer.
 * @param exposure What one judged container exposes.
 * @returns Its line.
 */
function exposureLine(exposure: ContainerExposure): string {
	const listed =
		exposure.names.length < exposure.exposed ? `, ${exposure.names.length} listed` : "";
	return `exposed: ${exposure.module}: ${plural(exposure.exposed, "name")}, ${exposure.usedOutside} used outside${listed} (${exposure.board}@${exposure.variant}, container ${exposure.container})`;
}

/**
 * Every line the code check writes beside its answer.
 * @param answer The code check's answer.
 * @returns The lines.
 */
function codeCheckLines(answer: CodeCheckAnswer | undefined): string[] {
	if (answer === undefined) return [];
	return [
		...answer.findings.flatMap(findingLines),
		...skippedLines(answer.skipped),
		...(answer.exposures ?? []).map(exposureLine),
		...answer.behind.flatMap(behindLines),
	];
}

export { codeCheckLines };
