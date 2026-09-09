// What the application does when a pane speaks: the notices it raises, the
// owners it wakes, and the recovery dialogs it opens the moment a note state
// begins (ADR 0006, TASK-062). Rebound every render over the owners that
// exist by then; nothing here diffs rendered state.

import type { LibraryItems } from "@excalidraw/excalidraw/types";

import type { CodeTargetNotice } from "@/shared/code-target";
import { agentBoardChange } from "@/ui/application/agent-activity";
import {
	boardErrorNotice,
	codeTargetShellNotice,
	failureNotice,
	staleFrontendNotice,
	withdrawnNotice,
} from "@/ui/application/notices";
import {
	recoveryMarker,
	type NoteStateChange,
	type PendingRecovery,
} from "@/ui/application/note-recovery";
import { recordFor } from "@/ui/application/pane-records";
import { contextFor } from "@/ui/application/lib/shell-actions";
import type { PaneSession } from "@/ui/application/lib/pane-handles";
import type { AgentActivity } from "@/ui/application/hooks/use-agent-activity";
import type { BoardDialogs } from "@/ui/application/hooks/use-board-dialogs";
import type { MountedPreviews } from "@/ui/application/hooks/use-mounted-previews";
import type { NoticeStack } from "@/ui/application/hooks/use-notices";
import type { PaneEvents, Panes } from "@/ui/application/hooks/use-panes";
import type { useWorkbench } from "@/ui/application/hooks/use-workbench";
import type { BoardCatalog } from "@/ui/board-catalog";
import type { LibraryController } from "@/ui/board-library";
import type { RecoveryKind, ThemeChoice } from "@/ui/shell";
import type { AgentActivityEntry, EditWithdrawalReason, PaneStatus } from "@/ui/types";

/** The owners the recovery dialogs reach. */
interface RecoveryOwners {
	readonly panes: Panes;
	readonly dialogs: BoardDialogs;
}

/** The owners the pane events reach. */
interface PaneEventOwners extends RecoveryOwners {
	readonly notices: NoticeStack;
	readonly library: LibraryController;
	readonly catalog: BoardCatalog;
	readonly previews: MountedPreviews;
	readonly workbench: ReturnType<typeof useWorkbench>;
	readonly activity: AgentActivity;
	readonly setTheme: (theme: ThemeChoice) => void;
}

/**
 * Open the recovery dialog for a note state and remember that it was shown.
 * The status is the pane's latest, which the rendered record may not hold yet.
 * @param owners The panes and the dialogs.
 * @param recovery The state and the pane it is on.
 */
function openRecovery(owners: RecoveryOwners, recovery: PendingRecovery): void {
	const { panes, dialogs } = owners;
	const { paneId, status, kind } = recovery;
	const marker = recoveryMarker(status, kind);
	if (marker === null) {
		return;
	}
	const context = contextFor(panes.list, { ...recordFor(panes.records, paneId), status });
	if (kind === "hold" && status.hold !== null) {
		dialogs.openConflict(status.hold.conflict, status.hold, context);
	} else {
		dialogs.openElsewhere(context);
	}
	panes.host.recoveryShown(paneId, kind, marker);
}

/**
 * A dialog closed: the first note state still waiting for its dialog gets it
 * now. A hold that began under another dialog is not lost.
 * @param owners The panes and the dialogs.
 */
function openPendingRecovery(owners: RecoveryOwners): void {
	const pending = owners.panes.host.pendingRecovery();
	if (pending !== null) {
		openRecovery(owners, pending);
	}
}

/**
 * The recovery dialog a change asks for, when no dialog is open. A write
 * elsewhere under a hold waits: the hold's dialog covers both.
 * @param change The transition.
 * @param status The pane's status now.
 * @returns The kind, or null when nothing opens for this change.
 */
function recoveryToOpen(change: NoteStateChange, status: PaneStatus): RecoveryKind | null {
	if (change === "hold-began") {
		return "hold";
	}
	if (change === "elsewhere-began" && status.hold === null) {
		return "elsewhere";
	}
	return null;
}

/**
 * A recovery dialog for a state that has ended decides nothing any more:
 * another writer or command resolved it. Close it rather than offer outcomes
 * for a hold or a write that no longer exists.
 * @param dialogs The dialogs.
 * @param change The transition.
 * @param status The pane whose state ended.
 */
function closeStaleDialog(
	dialogs: BoardDialogs,
	change: NoteStateChange,
	status: PaneStatus,
): void {
	const { open } = dialogs.state;
	const kind = change === "hold-ended" ? "conflict" : "elsewhere";
	if (open.kind === kind && open.context.clientId === status.clientId) {
		dialogs.close();
	}
}

/**
 * A pane's note state began or ended.
 * @param owners The panes and the dialogs.
 * @param status The pane's status now.
 * @param change The transition.
 */
function onNoteState(owners: RecoveryOwners, status: PaneStatus, change: NoteStateChange): void {
	if (change === "hold-ended" || change === "elsewhere-ended") {
		closeStaleDialog(owners.dialogs, change, status);
		return;
	}
	const kind = recoveryToOpen(change, status);
	if (kind !== null && owners.dialogs.state.open.kind === "none") {
		openRecovery(owners, { paneId: status.paneId, status, kind });
	}
}

/**
 * The pane events over their owners.
 * @param owners The owners.
 * @returns The events.
 */
function paneEvents(owners: PaneEventOwners): PaneEvents {
	const { notices, library, catalog, workbench } = owners;
	/**
	 * A pane published its status: its transport and its scene may have changed.
	 * @param paneId The pane.
	 */
	function onStatusPublished(paneId: string): void {
		workbench.paneReported(paneId);
		owners.previews.previewMounted(paneId);
	}
	/**
	 * A pane reported its session, or went.
	 * @param paneId The pane.
	 * @param session The session, or null.
	 */
	function onSession(paneId: string, session: PaneSession | null): void {
		if (session === null) {
			workbench.paneGone(paneId);
			return;
		}
		workbench.paneReported(paneId);
		session.applyLibrary(library.items);
	}
	/**
	 * A board note could not be rendered.
	 * @param paneId The pane.
	 * @param error The refusal.
	 */
	function onBoardError(paneId: string, error: string): void {
		notices.raise(boardErrorNotice(paneId, error));
	}
	/**
	 * A board link could not be followed.
	 * @param error The refusal and recovery guidance.
	 */
	function onBoardLinkError(error: string): void {
		notices.raise(failureNotice("board-link", "Open linked board", error));
	}
	/**
	 * This tab runs a bundle the canvas no longer serves.
	 * @param message What the server said.
	 */
	function onStaleFrontend(message: string): void {
		notices.raise(staleFrontendNotice(message));
	}
	/**
	 * A code target could not be opened.
	 * @param notice The failure.
	 */
	function onCodeTargetNotice(notice: CodeTargetNotice): void {
		notices.raise(codeTargetShellNotice(notice));
	}
	/**
	 * Excalidraw's own menu changed the theme.
	 * @param theme The theme.
	 */
	function onThemeChange(theme: ThemeChoice): void {
		owners.setTheme(theme);
	}
	/**
	 * Another tab changed the palette.
	 * @param items The palette.
	 */
	function onLibraryChanged(items: LibraryItems): void {
		library.applyFromServer(items);
	}
	/**
	 * A pane's Excalidraw changed the palette.
	 * @param items The palette.
	 */
	function onLibraryChange(items: LibraryItems): void {
		library.reportFromPane(items);
	}
	/** The server accepted a changed pane report: the listing may have moved. */
	function onPaneStateAccepted(): void {
		catalog.refresh();
	}
	/**
	 * A pane's socket came back: everything this tab caches about the server
	 * may have moved while it was down, and nothing said so.
	 */
	function onPaneReconnected(): void {
		catalog.reconnected();
	}
	/**
	 * Which boards an agent is working on.
	 * @param snapshot The whole snapshot.
	 */
	function onAgentActivity(snapshot: readonly AgentActivityEntry[]): void {
		const change = agentBoardChange(owners.activity.map, snapshot);
		owners.activity.replace(snapshot);
		if (change.settled.length > 0) {
			catalog.boardsChanged(change.settled);
		} else if (change.started.length > 0) {
			catalog.refresh();
		}
	}
	/**
	 * A pane withdrew the person's unwritten edit (ADR 0022).
	 * @param paneId The pane.
	 * @param boardKey Its board.
	 * @param reason Why.
	 */
	function onEditsWithdrawn(
		paneId: string,
		boardKey: string | null,
		reason: EditWithdrawalReason,
	): void {
		notices.raise(withdrawnNotice(paneId, boardKey, reason));
	}
	return {
		onBoardError,
		onBoardLinkError,
		onAgentActivity,
		onEditsWithdrawn,
		onStaleFrontend,
		onCodeTargetNotice,
		onThemeChange,
		onLibraryChanged,
		onLibraryChange,
		onPaneStateAccepted,
		onPaneReconnected,
		onStatusPublished,
		/**
		 * A pane's note state began or ended.
		 * @param _paneId The pane; the status names it too.
		 * @param status The pane's status now.
		 * @param change The transition.
		 */
		onNoteState: (_paneId: string, status: PaneStatus, change: NoteStateChange): void => {
			onNoteState(owners, status, change);
		},
		onSession,
	};
}

export { openPendingRecovery, paneEvents, type PaneEventOwners, type RecoveryOwners };
