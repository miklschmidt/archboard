// What the application does when a board dialog speaks: whether the pane it
// acts for may be moved at all, what the address bar is told about the move,
// and what a finished command leaves behind. Pure composition over the owners.

import { infoNotice } from "@/ui/application/notices";
import { navigationBlockReason } from "@/ui/application/notices";
import { refuseMove } from "@/ui/application/navigation-guard";
import type { BoardCommandContext } from "@/ui/application/board-commands";
import type { LiveBinding } from "@/ui/application/lib/live-binding";
import type { BoardDialogEvents, BoardDialogs } from "@/ui/application/hooks/use-board-dialogs";
import type { NoticeStack } from "@/ui/application/hooks/use-notices";
import type { Panes } from "@/ui/application/hooks/use-panes";
import type { BoardCatalog } from "@/ui/board-catalog";
import type { NavigationClaim, WorkspaceAddressing } from "@/ui/board-routing";
import type { DialogError } from "@/ui/dialog-parts";

/** The owners the dialog events reach. */
interface DialogEventOwners {
	readonly panes: Panes;
	readonly notices: NoticeStack;
	readonly catalog: BoardCatalog;
	/** Where a person's own move is announced, so the address bar records it. */
	readonly addressing: WorkspaceAddressing;
	/** The dialogs, which exist only once these events do. */
	readonly dialogs: LiveBinding<BoardDialogs>;
	/** What a closing dialog wakes, which exists only once the dialogs do. */
	readonly afterClose: LiveBinding<() => void>;
}

/**
 * The dialog events over their owners.
 * @param owners The owners.
 * @returns The events.
 */
function dialogEvents(owners: DialogEventOwners): BoardDialogEvents {
	const { panes, notices, catalog, addressing } = owners;
	// The permission the submission is running under, from the moment it is
	// granted until the command it covers has finished one way or the other.
	let move: NavigationClaim | null = null;
	return {
		/**
		 * A dialog is about to point a pane at another board.
		 *
		 * Asked of the pane as it is now: a board can stop saving while somebody
		 * is still typing a name into the dialog. When it may go, this is the
		 * person moving that pane, and the address bar records it as their move.
		 * @param context The pane it acts for.
		 * @returns The refusal to show, or null once the command may be sent.
		 */
		onMovingPane: async (context: BoardCommandContext): Promise<DialogError | null> => {
			const refusal = refuseMove({ panes, notices, dialogs: owners.dialogs.read() }, context);
			if (refusal !== null) {
				return refusal;
			}
			// The command waits for the address bar's one slot, so what the person
			// just asked for is the last thing the server is given — and the pane is
			// asked again, there, whether it may still go.
			const permission = await addressing.claim({
				kind: "board",
				paneId: context.paneId,
				from: context.boardKey,
			});
			if (permission.kind === "blocked") {
				return {
					title: "Open board",
					message: navigationBlockReason(permission.block.paneId, permission.block.kind),
				};
			}
			move = permission.move;
			return null;
		},
		/**
		 * The pane was pointed at this board.
		 * @param boardKey The board, as the server keys it.
		 */
		onPaneMoved: (boardKey: string): void => {
			move?.done(boardKey);
			move = null;
		},
		/** That command did not move the pane. */
		onMoveAbandoned: (): void => {
			move?.failed();
			move = null;
		},
		/**
		 * A dialog's command wrote these boards, whatever it went on to do.
		 * @param boards The boards it wrote, whose cached state is now behind.
		 */
		onWrote: (boards: readonly string[]): void => {
			catalog.boardsChanged(boards);
		},
		/**
		 * A dialog's command finished without a refusal.
		 * @param message Words for the notice, when there are any.
		 */
		onDone: (message: string | null): void => {
			// A command that finished without moving a pane — a save-as — never
			// took the slot, and one that did has already reported.
			move?.failed();
			move = null;
			if (message !== null) {
				notices.raise(infoNotice("board-command", "Board", message));
			}
		},
		/**
		 * The person confirmed closing a pane that held work: a comparison ends.
		 * @param paneId The pane.
		 */
		onClosePane: (paneId: string): void => {
			addressing.expect({ kind: "panes", count: panes.list.panes.length - 1 });
			panes.close(paneId);
		},
		/** A dialog closed; a note state that waited for it gets its dialog now. */
		onClosed: (): void => {
			owners.afterClose.read()();
		},
	};
}

export { dialogEvents, type DialogEventOwners };
