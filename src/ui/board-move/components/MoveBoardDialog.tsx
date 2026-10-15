// The dialog in which a person moves a board, every variant of it, to another
// repository (ADR 0051): where to, what the move would rewrite, and Move. The
// form mounts with the open dialog, so nothing is read while it is closed. Once
// the move has finished the server shows the board in its new repository in
// every pane that showed it, this one included, and the dialog closes.

import { useCallback, type JSX } from "react";

import { Button } from "@/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/ui/components/dialog";
import { BusyText, CANCEL_BUTTON_CLASS } from "@/ui/dialog-parts";
import { MoveRefusal } from "@/ui/board-move/components/MoveRefusal";
import { MoveRewrites } from "@/ui/board-move/components/MoveRewrites";
import { MoveTargets } from "@/ui/board-move/components/MoveTargets";
import { useBoardMove, type MovingBoard } from "@/ui/board-move/hooks/use-board-move";

/** Inputs for the dialog. */
interface MoveBoardDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly board: MovingBoard;
	/** The name the board is listed under. */
	readonly title: string;
}

/**
 * The first repository of the list, which the dialog focuses when it opens.
 * @returns That radio, or null to let the dialog choose.
 */
function firstTarget(): HTMLElement | null {
	return document.querySelector<HTMLElement>('[role="dialog"] [role="radio"]');
}

/**
 * The dialog that moves a board to another repository.
 * @param props Whether it is open, the board and its name.
 * @returns The dialog.
 */
function MoveBoardDialog(props: MoveBoardDialogProps): JSX.Element {
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent className="sm:max-w-lg" initialFocus={firstTarget}>
				<DialogHeader>
					<DialogTitle>Move {props.title}</DialogTitle>
					<DialogDescription>
						Every variant moves, and each drill-down that names it is rewritten to open it where it
						is then.
					</DialogDescription>
				</DialogHeader>
				<MoveBoardForm board={props.board} onMoved={props.onOpenChange} />
			</DialogContent>
		</Dialog>
	);
}

/**
 * Where to, what the move would rewrite, and Move.
 * @param props The board, and what closes the dialog once it has moved.
 * @param props.board The board that moves.
 * @param props.onMoved Closes the dialog.
 * @returns The form body and footer.
 */
function MoveBoardForm(props: {
	readonly board: MovingBoard;
	readonly onMoved: (open: false) => void;
}): JSX.Element {
	const { onMoved } = props;
	const closeOnMoved = useCallback(() => onMoved(false), [onMoved]);
	const { targets, chosen, choose, preview, moving, refused, confirm } = useBoardMove(
		props.board,
		closeOnMoved,
	);
	return (
		<>
			{targets === undefined ? (
				<BusyText busy text="Reading the repositories…" />
			) : (
				<MoveTargets targets={targets} chosen={chosen} disabled={moving} onChoose={choose} />
			)}
			{chosen !== null && <MoveRewrites preview={preview} />}
			{refused !== null && <MoveRefusal title="The board was not moved" error={refused} />}
			<BusyText busy={moving} text="Moving the board…" />
			<DialogFooter>
				<DialogClose className={CANCEL_BUTTON_CLASS} disabled={moving}>
					Cancel
				</DialogClose>
				<Button size="sm" disabled={moving || preview.data === undefined} onClick={confirm}>
					Move
				</Button>
			</DialogFooter>
		</>
	);
}

export { MoveBoardDialog };
