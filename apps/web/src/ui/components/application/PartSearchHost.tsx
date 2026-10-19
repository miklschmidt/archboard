// One pane's search for a part, joined to that pane: choosing a part picks it
// out in this pane, opening its board here first when the pane shows another.

import { useCallback, useEffect, useMemo, useRef, type JSX } from "react";

import type { PickedSubject } from "#ui/hooks/application/use-pane-reading.ts";
import { PartSearch, type PartHit } from "#ui/components/semantic-board-canvas/PartSearch.tsx";
import { sameBoardName } from "#ui/rules/semantic-board-canvas/board/address.ts";
import type { CatalogBoard } from "#ui/rules/pane-session/session-types.ts";

/** Inputs for the search host. */
interface PartSearchHostProps {
	/** The boards of the vault. */
	readonly boards: readonly CatalogBoard[];
	/** The board on screen, which a drill-down moves, or null before the pane says. */
	readonly shown: string | null;
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
	/** The board on screen when it was chosen: the part waits only until the pane shows another. */
	readonly from: string | null;
}

/**
 * The search, over the vault's boards, for one pane.
 * @param props The boards, the board on screen and what picks and opens.
 * @returns The search field.
 */
function PartSearchHost(props: PartSearchHostProps): JSX.Element {
	const { boards, shown, onPick, onOpenBoard } = props;
	const waiting = useRef<Waiting | null>(null);
	const searched = useMemo(
		() => boards.map((board) => ({ name: board.name, key: board.key })),
		[boards],
	);
	const onChoose = useCallback(
		(hit: PartHit): void => {
			const subject: PickedSubject = { id: hit.id, kind: "node", name: hit.name };
			if (shown !== null && sameBoardName(shown, hit.board.name)) {
				waiting.current = null;
				onPick(subject);
				return;
			}
			// The pane's board change clears what was picked, so the part is picked
			// once the pane says it shows the board.
			waiting.current = { board: hit.board.name, subject, from: shown };
			onOpenBoard(hit.board.key);
		},
		[onOpenBoard, onPick, shown],
	);
	// The next board the pane shows settles the wait: the part is picked when it
	// is that part's board, and forgotten when it is not, so a board that never
	// opened does not pick a stale part on some later visit.
	useEffect(() => {
		const part = waiting.current;
		if (part === null || shown === part.from) {
			return;
		}
		waiting.current = null;
		if (shown !== null && sameBoardName(shown, part.board)) {
			onPick(part.subject);
		}
	}, [onPick, shown]);
	return <PartSearch boards={searched} onChoose={onChoose} />;
}

export { PartSearchHost, type PartSearchHostProps };
