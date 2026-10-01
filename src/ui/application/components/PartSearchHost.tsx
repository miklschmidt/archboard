// The search at the top of the shell, joined to the panes: choosing a part picks
// it out in the active pane, opening its board there first when the pane shows
// another one.

import { useCallback, useEffect, useMemo, useRef, type JSX } from "react";

import type { PaneReadings, PickedSubject } from "@/ui/application/hooks/use-pane-reading";
import {
	PartSearch,
	boardAddressOf,
	sameBoardName,
	type PartHit,
} from "@/ui/semantic-board-canvas";
import type { ShellActions } from "@/ui/shell";
import type { CatalogBoard } from "@/ui/types";

/** Inputs for the search host. */
interface PartSearchHostProps {
	/** The boards of the vault. */
	readonly boards: readonly CatalogBoard[];
	/** The active pane. */
	readonly paneId: string;
	/** The board the active pane shows, by its key. */
	readonly boardKey: string | null;
	readonly readings: PaneReadings;
	readonly actions: ShellActions;
}

/** A part waiting for its board to open. */
interface Waiting {
	readonly board: string;
	readonly subject: PickedSubject;
}

/**
 * The search, over the vault's boards and the active pane.
 * @param props The boards, the active pane and what picks and opens.
 * @returns The search field.
 */
function PartSearchHost(props: PartSearchHostProps): JSX.Element {
	const { boards, paneId, boardKey, readings, actions } = props;
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
				readings.pick(paneId, subject);
				return;
			}
			// The pane's board change clears what was picked, so the part is picked
			// once the pane says it shows the board.
			waiting.current = { board: hit.board.name, subject };
			actions.selectBoard(hit.board.key, paneId);
		},
		[actions, paneId, readings, shown],
	);
	useEffect(() => {
		const part = waiting.current;
		if (part === null || shown === undefined || !sameBoardName(shown, part.board)) {
			return;
		}
		waiting.current = null;
		readings.pick(paneId, part.subject);
	}, [paneId, readings, shown]);
	return <PartSearch boards={searched} onChoose={onChoose} />;
}

export { PartSearchHost, type PartSearchHostProps };
