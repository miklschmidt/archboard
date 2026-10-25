// The dialog in which a person moves a board, every variant of it, to another
// repository (ADR 0051): where to, what the move would rewrite, and Move. The
// form mounts with the open dialog, so nothing is read while it is closed. It
// does not close while the move is under way, so a refusal is read here. Once
// the move has finished the server shows the board in its new repository in
// every pane that showed it, this one included, and the dialog closes.

import { useCallback, type JSX } from "react";

import { Button, Dialog } from "@archboard/ui-kit/components";
import { MoveRefusal } from "#ui/components/board-move/MoveRefusal.tsx";
import { MoveRewrites } from "#ui/components/board-move/MoveRewrites.tsx";
import { MoveTargets } from "#ui/components/board-move/MoveTargets.tsx";
import {
	useBoardMove,
	useMoveInFlight,
	type MovingBoard,
} from "#ui/hooks/board-move/use-board-move.ts";

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
	const { onOpenChange } = props;
	const inFlight = useMoveInFlight(props.board.board);
	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (open || !inFlight) onOpenChange(open);
		},
		[inFlight, onOpenChange],
	);
	return (
		<Dialog open={props.open} onOpenChange={handleOpenChange}>
			<Dialog.Content className="sm:max-w-lg" initialFocus={firstTarget}>
				<Dialog.Header>
					<Dialog.Title>Move {props.title}</Dialog.Title>
					<Dialog.Description>
						Every variant moves, and each drill-down that names it is rewritten to open it where it
						is then.
					</Dialog.Description>
				</Dialog.Header>
				<MoveBoardForm board={props.board} onMoved={onOpenChange} />
			</Dialog.Content>
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
				<Dialog.Busy busy text="Reading the repositories…" />
			) : (
				<MoveTargets targets={targets} chosen={chosen} disabled={moving} onChoose={choose} />
			)}
			{chosen !== null && <MoveRewrites preview={preview} />}
			{refused !== null && <MoveRefusal title="The board was not moved" error={refused} />}
			<Dialog.Busy busy={moving} text="Moving the board…" />
			<Dialog.Footer>
				<Dialog.Cancel disabled={moving}>Cancel</Dialog.Cancel>
				<Button size="sm" disabled={moving || preview.data === undefined} onClick={confirm}>
					Move
				</Button>
			</Dialog.Footer>
		</>
	);
}

export { MoveBoardDialog };
