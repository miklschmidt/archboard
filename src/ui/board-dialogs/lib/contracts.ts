// The typed inputs and outputs of the board dialogs. A dialog renders what the
// host hands it and reports what the person chose; it never assumes the
// outcome of a request, because the server decides that (ADR 0006, ADR 0012).

import type {
	BoardHold,
	BoardWriteConflict,
	NoteWrittenElsewhere,
	PersistedBoardListing,
} from "@/ui/types";

/**
 * A failure the host reports into a dialog. It stays visible until the host
 * clears it, because a dialog that loses its error loses the reason to retry.
 */
interface DialogError {
	title: string;
	message: string;
}

/** Which act the board dialog is performing. */
type BoardDialogMode = "open" | "create" | "save-as";

/** The fields the board dialog edits. */
type BoardDialogField = "board" | "variant" | "level";

/** A validation message, placed under one field or under the whole form. */
interface BoardDialogIssue {
	field: BoardDialogField | "form";
	message: string;
}

/** What the board dialog starts with. An empty string means "not given". */
interface BoardDialogDraft {
	board: string;
	variant: string;
	/** The chosen level, or null for none. */
	level: string | null;
}

/**
 * What the person asked for. `variant` and `level` are absent when they left
 * them empty, so the host applies its own defaults rather than reading "".
 */
interface BoardDialogRequest {
	mode: BoardDialogMode;
	board: string;
	variant?: string;
	level?: string;
}

/** Inputs for the board dialog. */
interface BoardDialogProps {
	mode: BoardDialogMode;
	open: boolean;
	/** The persisted boards the open mode lists, or null while unknown. */
	boards: PersistedBoardListing | null;
	/** The levels the host knows, listed by the level select. */
	levels: readonly string[];
	initial: BoardDialogDraft;
	issues: readonly BoardDialogIssue[];
	/** The request is in flight: submission is disabled and progress is shown. */
	busy: boolean;
	error: DialogError | null;
	onSubmit: (request: BoardDialogRequest) => void;
	onOpenChange: (open: boolean) => void;
	/** Where focus returns once the dialog closes: the control that opened it. */
	finalFocus?: (() => HTMLElement | null) | undefined;
}

/** Inputs for a destructive confirmation. */
interface ConfirmDialogProps {
	open: boolean;
	title: string;
	body: string;
	confirmLabel: string;
	/** Defaults to "Cancel". */
	cancelLabel?: string;
	/** A destructive confirmation styles its action as such. */
	destructive: boolean;
	busy: boolean;
	error: DialogError | null;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	/** Where focus returns once the dialog closes: the control that opened it. */
	finalFocus?: (() => HTMLElement | null) | undefined;
}

/**
 * The three ways out of a write conflict (ADR 0006). `elsewhere` does not
 * finish here: the host answers it by opening the board dialog in `save-as`
 * mode.
 */
type ConflictOutcome = "reload" | "overwrite" | "elsewhere";

/** One conflict outcome, as a button and its equivalent command. */
interface ConflictOutcomeChoice {
	outcome: ConflictOutcome;
	label: string;
	/** What choosing it costs, in the words of ADR 0006. */
	consequence: string;
	/** The CLI command that does the same thing, from the conflict itself. */
	command: string;
	destructive: boolean;
}

/** Inputs for the conflict dialog. */
interface ConflictDialogProps {
	open: boolean;
	conflict: BoardWriteConflict;
	/** The hold the conflict started, or null when the board never stopped saving. */
	hold: BoardHold | null;
	/** The outcome in flight, or null. Every outcome is disabled while one runs. */
	busy: ConflictOutcome | null;
	error: DialogError | null;
	onOutcome: (outcome: ConflictOutcome) => void;
	onOpenChange: (open: boolean) => void;
	/** Where focus returns once the dialog closes: the control that opened it. */
	finalFocus?: (() => HTMLElement | null) | undefined;
}

/**
 * The ways out of a note written elsewhere (TASK-062). Nothing has been
 * refused yet, so `keep` is simply to go on editing what is on screen.
 */
type ElsewhereOutcome = "reload" | "keep" | "elsewhere";

/** Inputs for the note-written-elsewhere dialog. */
interface NoteWrittenElsewhereDialogProps {
	open: boolean;
	notice: NoteWrittenElsewhere;
	busy: ElsewhereOutcome | null;
	error: DialogError | null;
	onOutcome: (outcome: ElsewhereOutcome) => void;
	onOpenChange: (open: boolean) => void;
	/** Where focus returns once the dialog closes: the control that opened it. */
	finalFocus?: (() => HTMLElement | null) | undefined;
}

/** What the person asked to install. The source is never fetched here. */
interface InstallLibraryRequest {
	source: string;
}

/** The result of checking a library source before it is offered. */
type LibrarySourceCheck = { ok: true; url: string } | { ok: false; message: string };

/** Inputs for the library installation dialog. */
interface InstallLibraryDialogProps {
	open: boolean;
	/** The library source as the `#addLibrary` request supplied it. */
	source: string;
	/** How many items the library carries, when the host knows. */
	itemCount: number | null;
	busy: boolean;
	error: DialogError | null;
	onInstall: (request: InstallLibraryRequest) => void;
	onOpenChange: (open: boolean) => void;
	/** Where focus returns once the dialog closes: the control that opened it. */
	finalFocus?: (() => HTMLElement | null) | undefined;
}

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
	DialogError,
	ElsewhereOutcome,
	InstallLibraryDialogProps,
	InstallLibraryRequest,
	LibrarySourceCheck,
	NoteWrittenElsewhereDialogProps,
};
