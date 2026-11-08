// The findings of the last code pass of each vault, kept for the panes (ADR 0046,
// TASK-367.24).
//
// A pane reads what a pass found and does not start one: a pass reads code and Git
// and takes seconds, and every open canvas would start one. So the server remembers
// what the last pass found, and a pane reads that. Only the code view of Measures
// starts a pass, once for a reading no pass read (ADR 0046, amendment of 2026-11-08). The memory holds one reading for each document and
// variant a pass has read: the version of the document it read, when it ran, and
// what it found on that document. A pass replaces the readings of the documents it
// read and leaves the others, so a pass over a named draft does not forget what
// the last pass found on the current variants. A reading belongs to the vault
// the pass read (ADR 0049): a document of one name in two vaults has two.
//
// It lives in memory and nowhere else. Nothing writes a finding into a document,
// the vault or any file (ADR 0015), and the memory goes with the process: a
// restarted server knows nothing until somebody runs the code check, with
// `archboard check`, `archboard check code` or the code view of Measures.
// It is no copy of a document either: it answers what the code said, never what is
// on a document, and a pane shows it only over the version it was found on.

import type { CodeCheckAnswer, RememberedFindings } from "@archboard/code-intel/code-check";

/** What the last pass found on one document at one variant. */
type RememberedReading =
	| RememberedFindings["readings"][number]
	| NonNullable<RememberedFindings["models"]>[number];

/** What the server remembers of its code passes. */
interface CodeFindingsMemory {
	/**
	 * Keep what one finished pass found, in place of what any earlier pass found
	 * on the same documents at the same variants.
	 * @param vault The vault the pass read.
	 * @param answer The pass's answer.
	 * @param checkedAt When the pass ran.
	 */
	remember(vault: string, answer: CodeCheckAnswer, checkedAt: Date): void;
	/**
	 * Everything remembered of one vault.
	 * @param vault The vault.
	 * @returns One reading for each document and variant a pass has read there.
	 */
	recall(vault: string): RememberedFindings;
}

/**
 * The key one reading is kept under.
 * @param vault The vault the document lives in.
 * @param document The document's name.
 * @param variant The variant's id.
 * @returns The key.
 */
function keyOf(vault: string, document: string, variant: string): string {
	return JSON.stringify([vault, document, variant]);
}

/**
 * A memory of code passes, empty until the first pass finishes.
 * @returns The memory.
 */
function createCodeFindingsMemory(): CodeFindingsMemory {
	const readings = new Map<string, { vault: string; reading: RememberedReading }>();
	/**
	 * Keep what one finished pass found on each document it read.
	 * @param vault The vault the pass read.
	 * @param answer The pass's answer.
	 * @param checkedAt When the pass ran.
	 */
	function remember(vault: string, answer: CodeCheckAnswer, checkedAt: Date): void {
		const at = checkedAt.toISOString();
		for (const read of answer.models ?? [])
			readings.set(keyOf(vault, read.model, read.state ?? ""), {
				vault,
				reading: {
					...read,
					checkedAt: at,
					findings: answer.findings.filter(
						(finding) => finding.model === read.model && finding.state === read.state,
					),
				},
			});
		for (const read of answer.states) {
			readings.set(keyOf(vault, read.model, read.variant), {
				vault,
				reading: {
					...read,
					checkedAt: at,
					findings: answer.findings.filter(
						(finding) => finding.model === read.model && finding.variant === read.variant,
					),
				},
			});
		}
	}
	/**
	 * Everything remembered of one vault.
	 * @param vault The vault.
	 * @returns One reading for each document and variant a pass has read there.
	 */
	function recall(vault: string): RememberedFindings {
		return {
			readings: [...readings.values()]
				.filter((kept) => kept.vault === vault)
				.map((kept) => kept.reading)
				.filter((reading) => "variant" in reading),
			models: [...readings.values()]
				.filter((kept) => kept.vault === vault)
				.map((kept) => kept.reading)
				.filter((reading) => "state" in reading),
		};
	}
	return { remember, recall };
}

export { type CodeFindingsMemory, createCodeFindingsMemory };
