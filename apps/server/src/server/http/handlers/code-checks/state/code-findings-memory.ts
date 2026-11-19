// The findings of the last code pass of each vault, kept for the panes (ADR 0046,
// TASK-367.24).
//
// A pane reads what a pass found and does not start one: a pass reads code and Git
// and takes seconds, and every open canvas would start one. So the server remembers
// what the last pass found, and a pane reads that. Only the code view of Measures
// starts a pass, once for a reading no pass read (ADR 0046). The memory holds one reading for each document and
// variant a pass has read: the version of the document it read, when it ran, and
// what it found on that document. A pass replaces the readings of the documents it
// read and leaves the others, so a pass over a named draft does not forget what
// the last pass found on the current variants. A reading belongs to the vault
// the pass read (ADR 0049): a document of one name in two vaults has two.
//
// A canonical reading also keeps each module the pass measured, those with no
// findings included, and what the pass skipped, so a pane tells a clean module
// from one the pass did not read (TASK-646.07). It keeps the names of each module's exports too,
// but every canvas reads `recall`, and a module's names are for its About page alone, so `recall`
// leaves them out and `exportsOf` answers them for one module (TASK-646.08).
//
// It lives in memory and nowhere else. Nothing writes a finding into a document,
// the vault or any file (ADR 0015), and the memory goes with the process: a
// restarted server knows nothing until somebody runs the code check, with
// `archboard check`, `archboard check code` or the code view of Measures.
// It is no copy of a document either: it answers what the code said, never what is
// on a document, and a pane shows it only over the version it was found on.

import type {
	CodeCheckAnswer,
	RememberedExports,
	RememberedFindings,
} from "@archboard/code-intel/code-check";

type RememberedModel = NonNullable<RememberedFindings["models"]>[number];

/** What the last pass found on one canonical reading, with the names of each module's exports. */
type KeptModel = Omit<RememberedModel, "depth"> & {
	readonly depth: NonNullable<CodeCheckAnswer["depth"]>;
};

/** What the last pass found on one document at one variant. */
type RememberedReading = RememberedFindings["readings"][number] | KeptModel;

/** The exact reading and the module whose exports are asked for. */
interface ExportsAsked {
	readonly model: string;
	readonly state: string | null;
	/** The digest of the version of the reading. */
	readonly revision: string;
	readonly module: string;
}

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
	/**
	 * The exports of one module that the last pass over one exact reading counted.
	 * @param vault The vault.
	 * @param asked The reading, by its model, state and the digest of its version, and the module.
	 * @returns The exports, or null when no remembered pass measured the module on that version.
	 */
	exportsOf(vault: string, asked: ExportsAsked): RememberedExports | null;
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
 * Whether an entry of an answer belongs to one canonical reading.
 * @param read The reading, by its model and state.
 * @param read.model The model.
 * @param read.state The state, or null.
 * @returns The test of an entry by the model and state it names.
 */
function ofReading(read: { readonly model: string; readonly state: string | null }) {
	return (entry: {
		readonly model?: string | undefined;
		readonly state?: string | null | undefined;
	}): boolean => entry.model === read.model && entry.state === read.state;
}

/**
 * A memory of code passes, empty until the first pass finishes.
 * @returns The memory.
 */
function createCodeFindingsMemory(): CodeFindingsMemory {
	const readings = new Map<string, { vault: string; reading: RememberedReading }>();
	const models = (vault: string): KeptModel[] =>
		[...readings.values()]
			.filter((kept) => kept.vault === vault)
			.map((kept) => kept.reading)
			.filter((reading) => "state" in reading);
	/**
	 * Keep what one finished pass found on each document it read.
	 * @param vault The vault the pass read.
	 * @param answer The pass's answer.
	 * @param checkedAt When the pass ran.
	 */
	function remember(vault: string, answer: CodeCheckAnswer, checkedAt: Date): void {
		const at = checkedAt.toISOString();
		for (const read of answer.models ?? []) {
			const mine = ofReading(read);
			readings.set(keyOf(vault, read.model, read.state ?? ""), {
				vault,
				reading: {
					...read,
					checkedAt: at,
					findings: answer.findings.filter(mine),
					depth: (answer.depth ?? []).filter(mine),
					// A skip that names no model holds for a whole checkout or language, so for every reading.
					skipped: answer.skipped.filter((skip) => skip.model === undefined || mine(skip)),
				},
			});
		}
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
			models: models(vault).map((reading) => ({
				...reading,
				depth: reading.depth.map(({ names: _names, ...counts }) => counts),
			})),
		};
	}
	/**
	 * The exports of one module that the last pass over one exact reading counted.
	 * @param vault The vault.
	 * @param asked The reading and the module.
	 * @returns The exports, or null when no remembered pass measured the module on that version.
	 */
	function exportsOf(vault: string, asked: ExportsAsked): RememberedExports | null {
		const reading = models(vault).find(
			(kept) =>
				kept.model === asked.model &&
				kept.state === asked.state &&
				kept.revision.digest === asked.revision,
		);
		const depth = reading?.depth.find((module) => module.subject.id === asked.module);
		if (reading === undefined || depth === undefined) return null;
		return { checkedAt: reading.checkedAt, repo: depth.repo, names: depth.names };
	}
	return { remember, recall, exportsOf };
}

export { type CodeFindingsMemory, createCodeFindingsMemory };
