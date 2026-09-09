// The board dialogs: open, create and save-as; destructive confirmation; the
// two recovery choices of ADR 0006; and library installation. Every dialog is
// an official Dialog or AlertDialog composition with typed inputs and
// callbacks. Product validation, submission and recovery are wired by the host.

export { BoardDialog } from "@/ui/board-dialogs/components/BoardDialog";
export {
	boardDialogCopy,
	buildBoardDialogRequest,
	buildOpenRequest,
	draftHasBoardName,
	issuesFor,
	type BoardDialogCopy,
} from "@/ui/board-dialogs/lib/board-request";
export { ConfirmDialog } from "@/ui/board-dialogs/components/ConfirmDialog";
export { ConflictDialog } from "@/ui/board-dialogs/components/ConflictDialog";
export {
	describeConflictOutcomes,
	describeConflictReason,
	describeElsewhereOutcomes,
	describeVersionMove,
	formatVersion,
	isBusyOutcome,
	type ElsewhereOutcomeChoice,
} from "@/ui/board-dialogs/lib/conflict-outcomes";
export type {
	BoardDialogDraft,
	BoardDialogField,
	BoardDialogIssue,
	BoardDialogMode,
	BoardDialogProps,
	BoardDialogRequest,
	ConfirmDialogProps,
	ConflictDialogProps,
	ConflictOutcome,
	ConflictOutcomeChoice,
	ElsewhereOutcome,
	InstallLibraryDialogProps,
	InstallLibraryRequest,
	LibrarySourceCheck,
	NoteWrittenElsewhereDialogProps,
} from "@/ui/board-dialogs/types/contracts";
export { NoteWrittenElsewhereDialog } from "@/ui/board-dialogs/components/NoteWrittenElsewhereDialog";
export { InstallLibraryDialog } from "@/ui/board-dialogs/components/InstallLibraryDialog";
export { checkLibrarySource } from "@/ui/board-dialogs/lib/library-source";
