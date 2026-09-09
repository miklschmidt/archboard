// The board dialogs, rendered from the dialogs' state: the board dialog in
// its three modes, the two confirmations, the two recovery dialogs of ADR
// 0006, and the library installation dialog over the library's pending offer.

import { useCallback, useMemo } from "react";

import type { BoardDialogs } from "@/ui/application/hooks/use-board-dialogs";
import {
	BoardDialog,
	ConfirmDialog,
	ConflictDialog,
	InstallLibraryDialog,
	NoteWrittenElsewhereDialog,
	type BoardDialogIssue,
} from "@/ui/board-dialogs";
import type { LibraryController } from "@/ui/board-library";
import type { NoteWrittenElsewhere, PersistedBoardListing } from "@/ui/types";
import { type DialogError } from "@/ui/dialog-parts";

/** The board dialog validates its own draft; the host reports no issues of its own. */
const NO_ISSUES: readonly BoardDialogIssue[] = Object.freeze([]);

/** Inputs for the dialogs. */
interface BoardDialogsHostProps {
	dialogs: BoardDialogs;
	/** The persisted boards the open dialog lists, or null while unknown. */
	boards: PersistedBoardListing | null;
	/** The levels the listing knows. */
	levels: readonly string[];
	/** The active pane's note-written-elsewhere notice, for that dialog. */
	elsewhere: NoteWrittenElsewhere | null;
	library: LibraryController;
}

/** Inputs for the library installation dialog. */
interface LibraryInstallHostProps {
	library: LibraryController;
}

/**
 * The library installation dialog over the library's pending offer.
 * @param props The library.
 * @returns The dialog, or nothing while no library is offered.
 */
function LibraryInstallHost(props: LibraryInstallHostProps): React.JSX.Element | null {
	const { library } = props;
	const { pending, error } = library;
	const handleInstall = useCallback((): void => library.acceptInstall(), [library]);
	const handleOpenChange = useCallback(
		(open: boolean): void => {
			if (!open) {
				library.declineInstall();
			}
		},
		[library],
	);
	const dialogError = useMemo<DialogError | null>(
		() => (error === null ? null : { title: "Library", message: error }),
		[error],
	);
	if (pending === null) {
		return null;
	}
	return (
		<InstallLibraryDialog
			open
			source={pending.source}
			itemCount={pending.items.length}
			busy={library.busy}
			error={dialogError}
			onInstall={handleInstall}
			onOpenChange={handleOpenChange}
		/>
	);
}

/**
 * A closing dialog closes the dialogs' state; an opening one is already open.
 * @param close The dialogs' close.
 * @returns The open-change handler.
 */
function useCloseOnDismiss(close: () => void): (open: boolean) => void {
	return useCallback(
		(open: boolean): void => {
			if (!open) {
				close();
			}
		},
		[close],
	);
}

/** Inputs for the confirmation dialogs. */
interface ConfirmationsProps {
	dialogs: BoardDialogs;
	onOpenChange: (open: boolean) => void;
}

/**
 * The clear and close-pane confirmations.
 * @param props The dialogs and the dismiss handler.
 * @returns The open confirmation, or nothing.
 */
function Confirmations(props: ConfirmationsProps): React.JSX.Element | null {
	const { dialogs, onOpenChange } = props;
	const { open, busy, error } = dialogs.state;
	if (open.kind === "confirm-clear") {
		return (
			<ConfirmDialog
				open
				title="Clear this board?"
				body="Every element on the board is removed in one write. The note keeps its history in the vault."
				confirmLabel="Clear board"
				destructive
				busy={busy}
				error={error}
				onConfirm={dialogs.confirm}
				onOpenChange={onOpenChange}
				finalFocus={dialogs.opener}
			/>
		);
	}
	if (open.kind === "confirm-close") {
		return (
			<ConfirmDialog
				open
				title={`Close pane ${open.paneId}?`}
				body={`${open.writes} change(s) on this pane exist only on its canvas. Closing the pane discards them.`}
				confirmLabel="Close pane"
				destructive
				busy={false}
				error={null}
				onConfirm={dialogs.confirm}
				onOpenChange={onOpenChange}
				finalFocus={dialogs.opener}
			/>
		);
	}
	return null;
}

/** Inputs for the two recovery dialogs. */
interface RecoveryDialogsProps {
	dialogs: BoardDialogs;
	elsewhere: NoteWrittenElsewhere | null;
	onOpenChange: (open: boolean) => void;
}

/**
 * The conflict and note-written-elsewhere dialogs (ADR 0006, TASK-062).
 * @param props The dialogs, the active pane's notice and the dismiss handler.
 * @returns The open recovery dialog, or nothing.
 */
function RecoveryDialogs(props: RecoveryDialogsProps): React.JSX.Element | null {
	const { dialogs, onOpenChange } = props;
	const { open, busyOutcome, error } = dialogs.state;
	if (open.kind === "conflict") {
		return (
			<ConflictDialog
				open
				conflict={open.conflict}
				hold={open.hold}
				busy={busyOutcome}
				error={error}
				onOutcome={dialogs.chooseConflictOutcome}
				onOpenChange={onOpenChange}
				finalFocus={dialogs.opener}
			/>
		);
	}
	if (open.kind === "elsewhere" && props.elsewhere !== null) {
		return (
			<NoteWrittenElsewhereDialog
				open
				notice={props.elsewhere}
				busy={busyOutcome === "reload" ? "reload" : null}
				error={error}
				onOutcome={dialogs.chooseElsewhereOutcome}
				onOpenChange={onOpenChange}
				finalFocus={dialogs.opener}
			/>
		);
	}
	return null;
}

/**
 * The board dialogs.
 * @param props The dialogs' state, the listing, the levels and the library.
 * @returns Whichever dialog is open, and the library dialog.
 */
function BoardDialogsHost(props: BoardDialogsHostProps): React.JSX.Element {
	const { dialogs } = props;
	const { open, busy, error } = dialogs.state;
	const onOpenChange = useCloseOnDismiss(dialogs.close);
	return (
		<>
			{open.kind === "board" && (
				<BoardDialog
					mode={open.mode}
					open
					boards={props.boards}
					levels={props.levels}
					initial={open.initial}
					issues={NO_ISSUES}
					busy={busy}
					error={error}
					onSubmit={dialogs.submitBoard}
					onOpenChange={onOpenChange}
					finalFocus={dialogs.opener}
				/>
			)}
			<Confirmations dialogs={dialogs} onOpenChange={onOpenChange} />
			<RecoveryDialogs dialogs={dialogs} elsewhere={props.elsewhere} onOpenChange={onOpenChange} />
			<LibraryInstallHost library={props.library} />
		</>
	);
}

export { BoardDialogsHost, type BoardDialogsHostProps };
