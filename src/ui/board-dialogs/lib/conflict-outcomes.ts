// Pure helpers behind the two recovery dialogs: the three outcomes of a write
// conflict as buttons, and the words for a note written elsewhere.

import type {
	ConflictOutcome,
	ConflictOutcomeChoice,
	ElsewhereOutcome,
} from "@/ui/board-dialogs/types/contracts";
import type { BoardWriteConflict, NoteWrittenElsewhere } from "@/ui/types";

/**
 * The three outcomes, in the order ADR 0006 names them. Their labels are the
 * product's; their commands come from the conflict itself, so the dialog and
 * the CLI never disagree about what an outcome does.
 * @param conflict The refused write.
 * @returns Reload, overwrite and save elsewhere.
 */
function describeConflictOutcomes(conflict: BoardWriteConflict): readonly ConflictOutcomeChoice[] {
	return [
		{
			outcome: "reload",
			label: "Reload from note",
			consequence: "Take the note and discard what is on the canvas.",
			command: conflict.outcomes.reload,
			destructive: true,
		},
		{
			outcome: "overwrite",
			label: "Overwrite",
			consequence: "Keep the canvas and discard the other editor's change to the note.",
			command: conflict.outcomes.overwrite,
			destructive: true,
		},
		{
			outcome: "elsewhere",
			label: "Save elsewhere",
			consequence: "Keep both by writing the canvas under another name.",
			command: conflict.outcomes.saveAs,
			destructive: false,
		},
	];
}

/**
 * Why the write was refused, in one sentence.
 * @param reason The conflict's reason.
 * @returns The sentence.
 */
function describeConflictReason(reason: BoardWriteConflict["reason"]): string {
	return reason === "changed"
		? "The note changed on disk after archboard read it, so saving would delete that change."
		: "There is already a note at this path that archboard has never read, so it cannot tell what saving would delete.";
}

/** One outcome for a note written elsewhere, as a button. */
interface ElsewhereOutcomeChoice {
	outcome: ElsewhereOutcome;
	label: string;
	consequence: string;
	destructive: boolean;
}

const ELSEWHERE_OUTCOMES: readonly ElsewhereOutcomeChoice[] = [
	{
		outcome: "reload",
		label: "Reload",
		consequence: "Take the note and discard what is on the canvas.",
		destructive: true,
	},
	{
		outcome: "keep",
		label: "Keep mine",
		consequence: "Continue editing; the next save will be refused until you choose.",
		destructive: false,
	},
	{
		outcome: "elsewhere",
		label: "Save elsewhere",
		consequence: "Keep both by writing the canvas under another name.",
		destructive: false,
	},
];

/**
 * The outcomes offered for a note written elsewhere, in a fixed order.
 * @returns Reload, keep mine and save elsewhere.
 */
function describeElsewhereOutcomes(): readonly ElsewhereOutcomeChoice[] {
	return ELSEWHERE_OUTCOMES;
}

const VERSION_MOVE_WORDS: Readonly<Record<NoteWrittenElsewhere["versionMove"], string>> = {
	ahead:
		"Another archboard wrote the note after this pane last did; the note is ahead of the canvas.",
	behind: "The note was rolled back to an earlier version; this pane holds the later work.",
	unchanged: "An editor that keeps no version wrote the note; how much changed is unknown.",
	unknown: "The note carries no version archboard can compare.",
};

/**
 * Which side is newer, in words (TASK-091). The versions themselves are shown
 * beside it in the mono face.
 * @param notice The note written elsewhere.
 * @returns One sentence.
 */
function describeVersionMove(notice: NoteWrittenElsewhere): string {
	return VERSION_MOVE_WORDS[notice.versionMove];
}

/**
 * A version for display: the number, or a dash when the note carries none.
 * @param version The version, or null.
 * @returns The text to set in mono.
 */
function formatVersion(version: number | null): string {
	return version === null ? "—" : String(version);
}

/**
 * Whether the outcome in flight is the one being rendered.
 * @param busy The outcome in flight, or null.
 * @param outcome The outcome being rendered.
 * @returns True when this outcome is the busy one.
 */
function isBusyOutcome<Outcome extends ConflictOutcome | ElsewhereOutcome>(
	busy: Outcome | null,
	outcome: Outcome,
): boolean {
	return busy === outcome;
}

export {
	describeConflictOutcomes,
	describeConflictReason,
	describeElsewhereOutcomes,
	describeVersionMove,
	formatVersion,
	isBusyOutcome,
	type ElsewhereOutcomeChoice,
};
