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
//
// Two linked panes share a pick (TASK-538.02): the person picks a part in one,
// and the other picks it too. Only the pane they picked in tells the server
// that the person changed it (ADR 0034), because only that pane marks it. They
// share a view the person chooses as well (TASK-538.03), while the other pane
// reads the board it was opened on. A restore reads each pane through the view
// its address names, one pane at a time, and never across the link. A board
// opened beside reads through the view of the pane it was opened from
// (TASK-538.04): the pane is told before it is shown the board, and reads the
// view once it has it.

import { useCallback, useMemo, useState } from "react";

import type { PaneLinks } from "#ui/rules/application/pane-link.ts";
import { boardAddressOf, sameBoardName } from "#ui/rules/semantic-board-canvas/board/address.ts";
import type { ViewBefore } from "#ui/state/board-routing/intent.ts";
import type { SemanticPaneContextSchema } from "@archboard/board/pane-context";
import type { z } from "zod";

type SemanticSubjectRef = z.infer<typeof SemanticPaneContextSchema>["selection"][number];

/** One picked subject, as the viewer described it. */
type PickedSubject = SemanticSubjectRef;

/** A value held per pane, by pane id. */
type ByPane<Value> = Readonly<Record<string, Value>>;

/** The view a pane is to read a board through once it is shown it. */
interface Arrival {
	/** The board's name. */
	readonly board: string;
	/** The view's id, or null for the overview. */
	readonly view: string | null;
}

/** What each pane is reading, and how that changes. */
interface PaneReadings {
	/**
	 * Which of the board's views one pane is reading it through.
	 * @param paneId The pane.
	 * @returns The view's id, or null for the overview.
	 */
	readonly viewOf: (paneId: string) => string | null;
	/**
	 * Read a board through one of its views, in this pane only: what a restore does.
	 * @param paneId The pane.
	 * @param view The view's id, or null for the overview.
	 */
	readonly showView: (paneId: string, view: string | null) => void;
	/**
	 * The person chose a view in one pane. It is read there, and in the pane linked to
	 * it while that pane reads the board it was opened on.
	 * @param paneId The pane.
	 * @param view The view's id, or null for the overview.
	 * @returns Each pane the choice reached, with the view it read before.
	 */
	readonly chooseView: (paneId: string, view: string | null) => readonly ViewBefore[];
	/**
	 * What the person has picked out in one pane.
	 * @param paneId The pane.
	 * @returns The subject, or null when nothing is picked.
	 */
	readonly pickedIn: (paneId: string) => PickedSubject | null;
	/**
	 * The person picked a subject out, or cleared the selection, in one pane and
	 * in the pane linked to it.
	 * @param paneId The pane.
	 * @param subject The subject, or null.
	 */
	readonly pick: (paneId: string, subject: PickedSubject | null) => void;
	/**
	 * One pane left the board its pick was made on, so its pick goes, and only its own.
	 * @param paneId The pane.
	 */
	readonly leave: (paneId: string) => void;
	/**
	 * A pane is about to be shown a board, and is to read it through a view once it is.
	 * Its next adoption reads that view when the board has that name, and forgets it either way.
	 * @param paneId The pane.
	 * @param arrival The board's name and the view, or null when the board will not come.
	 */
	readonly arriveThrough: (paneId: string, arrival: Arrival | null) => void;
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
 * The record with one pane's view set, or the overview read.
 * @param current What the panes hold now.
 * @param paneId The pane.
 * @param view The view's id, or null for the overview.
 * @returns The record.
 */
function viewedAs(current: ByPane<string>, paneId: string, view: string | null): ByPane<string> {
	return view === null ? cleared(current, paneId) : held(current, paneId, view);
}

/**
 * Whether a pane that adopted a board stays on the board it left.
 * @param boardKey The board key it adopted.
 * @param previousKey The board key it left, or null on first adoption.
 * @returns True when both name one board.
 */
function staysOnBoard(boardKey: string, previousKey: string | null): boolean {
	const board = boardAddressOf(boardKey);
	const previous = boardAddressOf(previousKey);
	return board !== null && previous !== null && sameBoardName(board.board, previous.board);
}

/**
 * Whether a pane adopted the board it was told it would be shown.
 * @param arrival What it was told.
 * @param boardKey The board key it adopted.
 * @returns True when the board has the name it was told.
 */
function arrivesOn(arrival: Arrival, boardKey: string): boolean {
	const board = boardAddressOf(boardKey);
	return board !== null && sameBoardName(arrival.board, board.board);
}

/**
 * One pane's view once it adopted a board: the view it was told to arrive with
 * on that board, the view it read on the same board, else the overview.
 * @param current What the panes hold now.
 * @param paneId The pane.
 * @param moved The board key it adopted, and the one it left.
 * @param moved.boardKey The board key it adopted.
 * @param moved.previousKey The board key it left, or null on first adoption.
 * @param arrival The view it was told to arrive with, if any.
 * @returns The record.
 */
function viewOnArrival(
	current: ByPane<string>,
	paneId: string,
	moved: { readonly boardKey: string; readonly previousKey: string | null },
	arrival: Arrival | undefined,
): ByPane<string> {
	if (arrival !== undefined && arrivesOn(arrival, moved.boardKey)) {
		return viewedAs(current, paneId, arrival.view);
	}
	return staysOnBoard(moved.boardKey, moved.previousKey) ? current : cleared(current, paneId);
}

/**
 * The record with one pane's pick set, or let go.
 * @param current What the panes hold now.
 * @param paneId The pane.
 * @param subject The subject, or null.
 * @returns The record.
 */
function pickedAs(
	current: ByPane<PickedSubject>,
	paneId: string,
	subject: PickedSubject | null,
): ByPane<PickedSubject> {
	return subject === null ? cleared(current, paneId) : held(current, paneId, subject);
}

/**
 * What each pane is reading.
 * @param links Which panes are linked.
 * @returns The readings and the ways they change.
 */
function usePaneReadings(links: PaneLinks): PaneReadings {
	const [views, setViews] = useState<ByPane<string>>(NONE);
	const [picked, setPicked] = useState<ByPane<PickedSubject>>(NONE);
	// What a pane is told before it is shown a board: nothing draws it, so it is no render state.
	const [arrivals] = useState(() => new Map<string, Arrival>());
	const showView = useCallback((paneId: string, view: string | null): void => {
		setViews((current) => viewedAs(current, paneId, view));
	}, []);
	const chooseView = useCallback(
		(paneId: string, view: string | null): readonly ViewBefore[] => {
			const linked = links[paneId];
			const reached = linked?.ownBoard === true ? [paneId, linked.paneId] : [paneId];
			setViews((current) => reached.reduce((now, one) => viewedAs(now, one, view), current));
			return reached.map((one) => ({ paneId: one, from: views[one] ?? null }));
		},
		[links, views],
	);
	const pick = useCallback(
		(paneId: string, subject: PickedSubject | null): void => {
			const linked = links[paneId]?.paneId;
			setPicked((current) => {
				const here = pickedAs(current, paneId, subject);
				return linked === undefined ? here : pickedAs(here, linked, subject);
			});
		},
		[links],
	);
	const leave = useCallback((paneId: string): void => {
		setPicked((current) => cleared(current, paneId));
	}, []);
	const arriveThrough = useCallback(
		(paneId: string, arrival: Arrival | null): void => {
			if (arrival === null) {
				arrivals.delete(paneId);
				return;
			}
			arrivals.set(paneId, arrival);
		},
		[arrivals],
	);
	const boardChanged = useCallback(
		(paneId: string, boardKey: string, previousKey: string | null): void => {
			const arrival = arrivals.get(paneId);
			arrivals.delete(paneId);
			setViews((current) => viewOnArrival(current, paneId, { boardKey, previousKey }, arrival));
			setPicked((current) => cleared(current, paneId));
		},
		[arrivals],
	);
	const viewOf = useCallback((paneId: string): string | null => views[paneId] ?? null, [views]);
	const pickedIn = useCallback(
		(paneId: string): PickedSubject | null => picked[paneId] ?? null,
		[picked],
	);
	return useMemo(
		() => ({ viewOf, showView, chooseView, pickedIn, pick, leave, arriveThrough, boardChanged }),
		[viewOf, showView, chooseView, pickedIn, pick, leave, arriveThrough, boardChanged],
	);
}

export { usePaneReadings, type Arrival, type ByPane, type PaneReadings, type PickedSubject };
