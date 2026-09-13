// What each pane is reading, as the shell owns it: which of the board's
// named views, and which subject the person picked out.
//
// Which board a pane shows is not here. That is the server's: a pane is
// pointed at a board by `browser show` or by the person choosing one, the
// server records it, and the pane hears it back over its socket. Keeping a
// second copy in the browser is how a pane and `browser panes` come to
// disagree.
//
// A view and a selection are the opposite kind of fact. They are session
// state — two panes can read one board two ways at once, and neither choice
// touches the board (ADR 0023) — so they live here, and go to the server only
// as context an agent can be grounded in.

import { useCallback, useMemo, useState } from "react";

import type { SemanticSubjectRef } from "@/shared/semantic-pane-context";
import { boardAddressOf, sameBoardName } from "@/ui/semantic-board-canvas";

/** One picked subject, as the viewer described it. */
type PickedSubject = SemanticSubjectRef;

/** A value held per pane, by pane id. */
type ByPane<Value> = Readonly<Record<string, Value>>;

/** What each pane is reading, and how that changes. */
interface PaneReadings {
	/**
	 * Which of the board's views one pane is reading it through.
	 * @param paneId The pane.
	 * @returns The view's id, or null for the whole variant.
	 */
	readonly viewOf: (paneId: string) => string | null;
	/**
	 * Read a board through one of its views, in this pane.
	 * @param paneId The pane.
	 * @param view The view's id, or null for the whole variant.
	 */
	readonly showView: (paneId: string, view: string | null) => void;
	/**
	 * What the person has picked out in one pane.
	 * @param paneId The pane.
	 * @returns The subject, or null when nothing is picked.
	 */
	readonly pickedIn: (paneId: string) => PickedSubject | null;
	/**
	 * The person picked a subject out, or cleared the selection.
	 * @param paneId The pane.
	 * @param subject The subject, or null.
	 */
	readonly pick: (paneId: string, subject: PickedSubject | null) => void;
	/**
	 * A pane moved: clear its selection, retaining the view within one board.
	 * @param paneId The pane.
	 * @param boardKey The board key it adopted.
	 * @param previousKey The board key it left, or null on first adoption.
	 */
	readonly boardChanged: (paneId: string, boardKey: string, previousKey: string | null) => void;
}

/** Nothing is being read yet. */
const NONE: ByPane<never> = Object.freeze({});

/**
 * The record with one pane's value set.
 * @param current What the panes hold now.
 * @param paneId The pane.
 * @param value The value.
 * @returns The record, or the same one when nothing changed.
 */
function held<Value>(current: ByPane<Value>, paneId: string, value: Value): ByPane<Value> {
	return current[paneId] === value ? current : { ...current, [paneId]: value };
}

/**
 * The record with one pane's value dropped.
 * @param current What the panes hold now.
 * @param paneId The pane.
 * @returns The record, or the same one when that pane held nothing.
 */
function cleared<Value>(current: ByPane<Value>, paneId: string): ByPane<Value> {
	if (current[paneId] === undefined) {
		return current;
	}
	const { [paneId]: _dropped, ...rest } = current;
	return rest;
}

/**
 * What each pane is reading.
 * @returns The readings and the ways they change.
 */
function usePaneReadings(): PaneReadings {
	const [views, setViews] = useState<ByPane<string>>(NONE);
	const [picked, setPicked] = useState<ByPane<PickedSubject>>(NONE);
	const showView = useCallback((paneId: string, view: string | null): void => {
		setViews((current) => (view === null ? cleared(current, paneId) : held(current, paneId, view)));
	}, []);
	const pick = useCallback((paneId: string, subject: PickedSubject | null): void => {
		setPicked((current) =>
			subject === null ? cleared(current, paneId) : held(current, paneId, subject),
		);
	}, []);
	const boardChanged = useCallback(
		(paneId: string, boardKey: string, previousKey: string | null): void => {
			const board = boardAddressOf(boardKey);
			const previous = boardAddressOf(previousKey);
			if (board === null || previous === null || !sameBoardName(board.board, previous.board)) {
				setViews((current) => cleared(current, paneId));
			}
			setPicked((current) => cleared(current, paneId));
		},
		[],
	);
	const viewOf = useCallback((paneId: string): string | null => views[paneId] ?? null, [views]);
	const pickedIn = useCallback(
		(paneId: string): PickedSubject | null => picked[paneId] ?? null,
		[picked],
	);
	return useMemo(
		() => ({ viewOf, showView, pickedIn, pick, boardChanged }),
		[viewOf, showView, pickedIn, pick, boardChanged],
	);
}

export { usePaneReadings, type ByPane, type PaneReadings, type PickedSubject };
