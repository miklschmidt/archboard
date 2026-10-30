// The findings of the last code pass of each vault, kept for the panes (ADR 0046,
// TASK-367.24).
//
// A pane never starts a pass: a pass reads code and Git and takes seconds, and
// every open canvas would start one. So the server remembers what the last pass
// found, and a pane reads that. The memory holds one reading for each board and
// variant a pass has read: the version of the board it read, when it ran, and
// what it found on that board. A pass replaces the readings of the boards it
// read and leaves the others, so a pass over a named draft does not forget what
// the last pass found on the current variants. A reading belongs to the vault
// the pass read (ADR 0049): a board of one name in two vaults has two.
//
// A reading also keeps what the pass skipped on its board and what it skipped
// without naming a board, and the counts of each container it judged. The names
// behind those counts, with their users, are long, so a pane reads them only for
// the container somebody picks (`exposureOf`, TASK-539.01).
//
// It lives in memory and nowhere else. Nothing writes a finding into a board,
// the vault or any file (ADR 0015), and the memory goes with the process: a
// restarted server knows nothing until somebody runs the code check, with
// `archboard check` or `archboard check code`.
// It is no copy of a board either: it answers what the code said, never what is
// on a board, and a pane shows it only over the version it was found on.

import type {
	CodeCheckAnswer,
	RememberedExposureSchema,
	RememberedFindingsSchema,
} from "@archboard/code-intel/code-check";
import type { z } from "zod";

/** What the server remembers of every pass since it started. */
type RememberedFindings = z.infer<typeof RememberedFindingsSchema>;
/** What the last pass found on one board at one variant. */
type RememberedReading = RememberedFindings["readings"][number];
/** What one judged container exposes. */
type ContainerExposure = NonNullable<CodeCheckAnswer["exposures"]>[number];
/** What one container exposed in the last pass, with when it was read. */
type RememberedExposure = z.infer<typeof RememberedExposureSchema>;

/** What the server remembers of its code passes. */
interface CodeFindingsMemory {
	/**
	 * Keep what one finished pass found, in place of what any earlier pass found
	 * on the same boards at the same variants.
	 * @param vault The vault the pass read.
	 * @param pass The pass's answer, and what each container it judged exposes.
	 * @param checkedAt When the pass ran.
	 */
	remember(vault: string, pass: CodeCheckAnswer, checkedAt: Date): void;
	/**
	 * Everything remembered of one vault.
	 * @param vault The vault.
	 * @returns One reading for each board and variant a pass has read there, and
	 * when its last pass ran.
	 */
	recall(vault: string): RememberedFindings;
	/**
	 * What one container of one board and variant exposed in the last pass that read it.
	 * @param vault The vault.
	 * @param board The board's name.
	 * @param variant The variant's id.
	 * @param container The container's part id.
	 * @returns The names with their users, or undefined when no pass judged it.
	 */
	exposureOf(
		vault: string,
		board: string,
		variant: string,
		container: string,
	): RememberedExposure | undefined;
}

/**
 * The key one reading is kept under.
 * @param vault The vault the board lives in.
 * @param board The board's name.
 * @param variant The variant's id.
 * @returns The key.
 */
function keyOf(vault: string, board: string, variant: string): string {
	return JSON.stringify([vault, board, variant]);
}

/** The board and variant something names. */
type Place = Pick<RememberedReading, "board" | "variant">;

/**
 * Whether something the pass reported is about one board at one variant.
 * @param about What it names, which may name no board.
 * @param read The board and variant the pass read.
 * @returns True when it names that board and variant.
 */
function isAbout(about: { [Key in keyof Place]?: Place[Key] | undefined }, read: Place): boolean {
	return about.board === read.board && about.variant === read.variant;
}

/**
 * A memory of code passes, empty until the first pass finishes.
 * @returns The memory.
 */
function createCodeFindingsMemory(): CodeFindingsMemory {
	const readings = new Map<
		string,
		{ vault: string; reading: RememberedReading; exposures: readonly ContainerExposure[] }
	>();
	// When each vault's last pass ran, also a pass that read no board.
	const lastChecked = new Map<string, string>();
	/**
	 * Keep what one finished pass found on each board it read.
	 * @param vault The vault the pass read.
	 * @param pass The pass's answer, and what each container it judged exposes.
	 * @param checkedAt When the pass ran.
	 */
	function remember(vault: string, pass: CodeCheckAnswer, checkedAt: Date): void {
		const at = checkedAt.toISOString();
		lastChecked.set(vault, at);
		for (const read of pass.boards) {
			const exposures = (pass.exposures ?? []).filter((each) => isAbout(each, read));
			readings.set(keyOf(vault, read.board, read.variant), {
				vault,
				exposures,
				reading: {
					...read,
					checkedAt: at,
					findings: pass.findings.filter((finding) => isAbout(finding, read)),
					// A skip that names no board holds for every board the pass read.
					skipped: pass.skipped.filter((skip) => skip.board === undefined || isAbout(skip, read)),
					containers: exposures.map(({ container, module, exposed, usedOutside }) => ({
						container,
						module,
						exposed,
						usedOutside,
					})),
				},
			});
		}
	}
	/**
	 * Everything remembered of one vault.
	 * @param vault The vault.
	 * @returns One reading for each board and variant a pass has read there.
	 */
	function recall(vault: string): RememberedFindings {
		const lastCheckedAt = lastChecked.get(vault);
		return {
			readings: [...readings.values()]
				.filter((kept) => kept.vault === vault)
				.map((kept) => kept.reading),
			...(lastCheckedAt === undefined ? {} : { lastCheckedAt }),
		};
	}
	/**
	 * What one container exposed in the last pass that read its board and variant.
	 * @param vault The vault.
	 * @param board The board's name.
	 * @param variant The variant's id.
	 * @param container The container's part id.
	 * @returns The names with their users, or undefined.
	 */
	function exposureOf(
		vault: string,
		board: string,
		variant: string,
		container: string,
	): RememberedExposure | undefined {
		const kept = readings.get(keyOf(vault, board, variant));
		const exposure = kept?.exposures.find((each) => each.container === container);
		if (kept === undefined || exposure === undefined) return undefined;
		return { version: kept.reading.version, checkedAt: kept.reading.checkedAt, exposure };
	}
	return { remember, recall, exposureOf };
}

export { type CodeFindingsMemory, createCodeFindingsMemory };
