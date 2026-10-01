// One pane's search for a part, joined to that pane: choosing a part picks it
// out in this pane, opening its board here first when the pane shows another.

import { useCallback, useEffect, useMemo, useRef, type JSX } from "react";

import type { PickedSubject } from "@/ui/application/hooks/use-pane-reading";
import {
	PartSearch,
	boardAddressOf,
	sameBoardName,
	type PartHit,
} from "@/ui/semantic-board-canvas";
import type { CatalogBoard } from "@/ui/types";

/** Inputs for the search host. */
interface PartSearchHostProps {
	/** The boards of the vault. */
	readonly boards: readonly CatalogBoard[];
	/** Whether the pane has focus, which is the pane the shortcut reaches. */
	readonly active: boolean;
	/** The board the pane shows, by its key. */
	readonly boardKey: string | null;
	/**
	 * Pick a part out in the pane.
	 * @param subject The part.
	 */
	readonly onPick: (subject: PickedSubject) => void;
	/**
	 * Show a board in the pane.
	 * @param key The board key.
	 */
	readonly onOpenBoard: (key: string) => void;
}

/** A part waiting for its board to open. */
interface Waiting {
	readonly board: string;
	readonly subject: PickedSubject;
}

/**
 * The search, over the vault's boards, for one pane.
 * @param props The boards, the pane's board and what picks and opens.
 * @returns The search field.
 */
function PartSearchHost(props: PartSearchHostProps): JSX.Element {
	const { boards, boardKey, onPick, onOpenBoard, active } = props;
	const waiting = useRef<Waiting | null>(null);
	const searched = useMemo(
		() => boards.map((board) => ({ name: board.name, key: board.key })),
		[boards],
	);
	const shown = boardAddressOf(boardKey)?.board;
	const onChoose = useCallback(
		(hit: PartHit): void => {
			const subject: PickedSubject = { id: hit.id, kind: "node", name: hit.name };
			if (shown !== undefined && sameBoardName(shown, hit.board.name)) {
				onPick(subject);
				return;
			}
			// The pane's board change clears what was picked, so the part is picked
			// once the pane says it shows the board.
			waiting.current = { board: hit.board.name, subject };
			onOpenBoard(hit.board.key);
		},
		[onOpenBoard, onPick, shown],
	);
	useEffect(() => {
		const part = waiting.current;
		if (part === null || shown === undefined || !sameBoardName(shown, part.board)) {
			return;
		}
		waiting.current = null;
		onPick(part.subject);
	}, [onPick, shown]);
	return <PartSearch boards={searched} onChoose={onChoose} listening={active} />;
}

export { PartSearchHost, type PartSearchHostProps };
