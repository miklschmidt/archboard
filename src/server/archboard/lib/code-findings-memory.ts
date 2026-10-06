// The findings of the last code pass, kept for the panes (ADR 0046, TASK-367.24).
//
// A pane never starts a pass: a pass reads code and Git and takes seconds, and
// every open canvas would start one. So the server remembers what the last pass
// found, and a pane reads that. The memory holds one reading for each board and
// variant a pass has read: the version of the board it read, when it ran, and
// what it found on that board. A pass replaces the readings of the boards it
// read and leaves the others, so a pass over a named draft does not forget what
// the last pass found on the current variants.
//
// It lives in memory and nowhere else. Nothing writes a finding into a board,
// the vault or any file (ADR 0015), and the memory goes with the process: a
// restarted server knows nothing until somebody runs `archboard check --code`.
// It is no copy of a board either: it answers what the code said, never what is
// on a board, and a pane shows it only over the version it was found on.

import type {
	CodeCheckAnswer,
	RememberedFindings,
	RememberedReading,
} from "@/shared/code-check/index";

/** What the server remembers of its code passes. */
interface CodeFindingsMemory {
	/**
	 * Keep what one finished pass found, in place of what any earlier pass found
	 * on the same boards at the same variants.
	 * @param answer The pass's answer.
	 * @param checkedAt When the pass ran.
	 */
	remember(answer: CodeCheckAnswer, checkedAt: Date): void;
	/**
	 * Everything remembered.
	 * @returns One reading for each board and variant a pass has read.
	 */
	recall(): RememberedFindings;
}

/**
 * The key one reading is kept under.
 * @param board The board's name.
 * @param variant The variant's id.
 * @returns The key.
 */
function keyOf(board: string, variant: string): string {
	return JSON.stringify([board, variant]);
}

/**
 * A memory of code passes, empty until the first pass finishes.
 * @returns The memory.
 */
function createCodeFindingsMemory(): CodeFindingsMemory {
	const readings = new Map<string, RememberedReading>();
	/**
	 * Keep what one finished pass found on each board it read.
	 * @param answer The pass's answer.
	 * @param checkedAt When the pass ran.
	 */
	function remember(answer: CodeCheckAnswer, checkedAt: Date): void {
		const at = checkedAt.toISOString();
		for (const read of answer.boards) {
			readings.set(keyOf(read.board, read.variant), {
				...read,
				checkedAt: at,
				findings: answer.findings.filter(
					(finding) => finding.board === read.board && finding.variant === read.variant,
				),
			});
		}
	}
	/**
	 * Everything remembered.
	 * @returns One reading for each board and variant a pass has read.
	 */
	function recall(): RememberedFindings {
		return { readings: [...readings.values()] };
	}
	return { remember, recall };
}

export { type CodeFindingsMemory, createCodeFindingsMemory };
