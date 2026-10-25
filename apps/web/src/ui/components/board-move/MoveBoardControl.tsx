// The control in a pane's header that moves the pane's board to another
// repository, and the dialog it opens. It is there only while the pane shows a
// board of a vault the server named.

import { RiFolderTransferLine } from "@remixicon/react";
import { useCallback, useMemo, useState, type JSX } from "react";

import { IconButton } from "@archboard/ui-kit/components";
import { MoveBoardDialog } from "#ui/components/board-move/MoveBoardDialog.tsx";
import { boardAddressOf } from "#ui/rules/semantic-board-canvas/board/address.ts";
import type { PaneStatus } from "#ui/rules/pane-session/session-types.ts";

/** Inputs for the control. */
interface MoveBoardControlProps {
	readonly status: Pick<PaneStatus, "vault" | "boardKey" | "repository" | "version">;
	/** The name the vault lists the board under, or null when it lists none. */
	readonly boardName: string | null;
}

/**
 * Move the pane's board to another repository.
 * @param props The pane's status and the board's listed name.
 * @returns The control and its dialog, or nothing while the pane shows no board.
 */
function MoveBoardControl(props: MoveBoardControlProps): JSX.Element | null {
	const { vault, boardKey, repository, version } = props.status;
	const [open, setOpen] = useState(false);
	const handleOpen = useCallback(() => setOpen(true), []);
	// The board's name: every variant of it moves, so the key's variant is left off.
	const board = boardAddressOf(boardKey)?.board;
	const moving = useMemo(
		() => (vault === null || board === undefined ? null : { vault, board, repository, version }),
		[vault, board, repository, version],
	);
	if (moving === null) return null;
	const title = props.boardName ?? moving.board;
	return (
		<>
			<IconButton label={`Move ${title} to another repository`} onClick={handleOpen}>
				<RiFolderTransferLine />
			</IconButton>
			<MoveBoardDialog open={open} onOpenChange={setOpen} board={moving} title={title} />
		</>
	);
}

export { MoveBoardControl, type MoveBoardControlProps };
