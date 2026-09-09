// The board dialogs as one piece of state: which dialog is open, for which
// pane, what is in flight and what failed. Every submission is one board
// command; the outcome closes the dialog, keeps it open with the error, or
// hands over to the conflict dialogs (ADR 0006).

import { useCallback, useMemo, useRef, useState } from "react";

import {
	SERVER_API,
	runBoardDialogRequest,
	runClear,
	runConflictOutcome,
	type BoardCommandApi,
	type BoardCommandContext,
	type BoardCommandOutcome,
} from "@/ui/application/board-commands";
import type {
	BoardDialogDraft,
	BoardDialogMode,
	BoardDialogRequest,
	ConflictOutcome,
	ElsewhereOutcome,
} from "@/ui/board-dialogs";
import type { BoardHold, BoardWriteConflict } from "@/ui/types";
import { type DialogError } from "@/ui/dialog-parts";

/** Which dialog is open, and for which pane. */
type OpenDialog =
	| { readonly kind: "none" }
	| {
			readonly kind: "board";
			readonly mode: BoardDialogMode;
			readonly initial: BoardDialogDraft;
			/** The pane the request acts for, captured when the dialog opened. */
			readonly context: BoardCommandContext;
	  }
	| { readonly kind: "confirm-clear"; readonly context: BoardCommandContext }
	| { readonly kind: "confirm-close"; readonly paneId: string; readonly writes: number }
	| {
			readonly kind: "conflict";
			readonly conflict: BoardWriteConflict;
			readonly hold: BoardHold | null;
			readonly context: BoardCommandContext;
	  }
	| { readonly kind: "elsewhere"; readonly context: BoardCommandContext };

/** The dialogs' state. */
interface BoardDialogState {
	readonly open: OpenDialog;
	readonly busy: boolean;
	/** The conflict outcome in flight, or null. */
	readonly busyOutcome: ConflictOutcome | null;
	readonly error: DialogError | null;
}

/** What the dialogs report to the application. */
interface BoardDialogEvents {
	/**
	 * A submission is about to point a pane at another board. A save-as writes a
	 * file and does not move a pane (ADR 0012), so it never asks.
	 *
	 * The answer decides whether it may, and comes back once nothing else is on
	 * its way to the server: a board leaves a pane by one rule whichever surface
	 * asks, so a pane whose canvas holds work the note has not got keeps it, and
	 * the words say why. Null means it may go ahead.
	 * @returns The refusal to show in the dialog, or null.
	 */
	readonly onMovingPane: (context: BoardCommandContext) => Promise<DialogError | null>;
	/**
	 * The pane was pointed at this board, as the server keys it. A request may
	 * spell an address several ways; only the answer says which board it is.
	 */
	readonly onPaneMoved: (boardKey: string) => void;
	/** That submission did not move the pane after all. */
	readonly onMoveAbandoned: () => void;
	/** A command finished; the words are for a notice, when there are any. */
	/**
	 * A command finished, however it ended: these boards were written and what
	 * the shell holds about them is behind. A command that wrote none names none.
	 * @param boards The boards the command wrote.
	 */
	readonly onWrote: (boards: readonly string[]) => void;
	/**
	 * A command finished without a refusal.
	 * @param message Words for the notice, when there are any.
	 */
	readonly onDone: (message: string | null) => void;
	/** The person confirmed closing a pane that held work. */
	readonly onClosePane: (paneId: string) => void;
	/** No dialog is open any more, whatever closed it. */
	readonly onClosed: () => void;
}

/** The dialogs' state and the moves. */
interface BoardDialogs {
	readonly state: BoardDialogState;
	readonly openBoardDialog: (
		mode: BoardDialogMode,
		initial: BoardDialogDraft,
		context: BoardCommandContext,
	) => void;
	readonly openConfirmClear: (context: BoardCommandContext) => void;
	readonly openConfirmClose: (paneId: string, writes: number) => void;
	readonly openConflict: (
		conflict: BoardWriteConflict,
		hold: BoardHold | null,
		context: BoardCommandContext,
	) => void;
	readonly openElsewhere: (context: BoardCommandContext) => void;
	readonly close: () => void;
	readonly submitBoard: (request: BoardDialogRequest) => void;
	readonly confirm: () => void;
	readonly chooseConflictOutcome: (outcome: ConflictOutcome) => void;
	readonly chooseElsewhereOutcome: (outcome: ElsewhereOutcome) => void;
	/** The control that had focus when the open dialog was opened, while it is still in the page. */
	readonly opener: () => HTMLElement | null;
}

const NONE: OpenDialog = Object.freeze({ kind: "none" });

const CLOSED: BoardDialogState = Object.freeze({
	open: NONE,
	busy: false,
	busyOutcome: null,
	error: null,
});

const EMPTY_DRAFT: BoardDialogDraft = Object.freeze({ board: "", variant: "", level: null });

/**
 * The board dialogs.
 * @param events What the dialogs report.
 * @param api The server, injectable for checks.
 * @returns The state and the moves.
 */
function useBoardDialogs(
	events: BoardDialogEvents,
	api: BoardCommandApi = SERVER_API,
): BoardDialogs {
	const [state, setState] = useState<BoardDialogState>(CLOSED);
	// Captured when a dialog opens, so closing returns focus to what opened it:
	// a header button, a navigator chip, a notice action or a header chip.
	const openedFrom = useRef<HTMLElement | null>(null);
	const opener = useCallback(
		(): HTMLElement | null =>
			openedFrom.current?.isConnected === true ? openedFrom.current : null,
		[],
	);

	const show = useCallback((open: OpenDialog): void => {
		const active = document.activeElement;
		openedFrom.current = active instanceof HTMLElement ? active : null;
		setState({ open, busy: false, busyOutcome: null, error: null });
	}, []);
	// Every way out of a dialog ends here, so what waits for one to close hears it.
	const close = useCallback((): void => {
		setState(CLOSED);
		events.onClosed();
	}, [events]);

	/**
	 * Apply a command's outcome: close on success, keep the error, or move to
	 * the conflict dialog.
	 */
	const settle = useCallback(
		(outcome: BoardCommandOutcome, context: BoardCommandContext): void => {
			// Nothing moved unless the command finished, so a move announced
			// before it is withdrawn here.
			if (outcome.kind !== "done") {
				events.onMoveAbandoned();
			}
			switch (outcome.kind) {
				case "done":
					setState(CLOSED);
					events.onWrote(outcome.boards);
					events.onDone(outcome.message);
					events.onClosed();
					return;
				case "conflict":
					show({ kind: "conflict", conflict: outcome.conflict, hold: outcome.hold, context });
					return;
				default:
					// The dialog stays open with the refusal, and whatever the command
					// wrote before it failed is still read again.
					events.onWrote(outcome.boards);
					setState((current) => ({
						...current,
						busy: false,
						busyOutcome: null,
						error: outcome.error,
					}));
			}
		},
		[events, show],
	);

	const submit = useCallback(
		/**
		 * Ask whether the pane may move, and send the command when it may.
		 * @param request What the dialog asked for.
		 * @param context The pane it acts for.
		 */
		async (request: BoardDialogRequest, context: BoardCommandContext): Promise<void> => {
			const refusal = request.mode === "save-as" ? null : await events.onMovingPane(context);
			if (refusal !== null) {
				setState((current) => ({ ...current, busy: false, error: refusal }));
				return;
			}
			settle(await runBoardDialogRequest(api, request, context, events.onPaneMoved), context);
		},
		[api, events, settle],
	);

	const submitBoard = useCallback(
		(request: BoardDialogRequest): void => {
			const { open } = state;
			if (open.kind !== "board" || state.busy) {
				return;
			}
			setState((current) => ({ ...current, busy: true, error: null }));
			// Asked of the pane as it is now, not as it was when the dialog opened:
			// a board can stop saving while somebody is typing a name into it.
			void submit(request, open.context);
		},
		[state, submit],
	);

	const confirm = useCallback((): void => {
		const { open } = state;
		if (open.kind === "confirm-close") {
			setState(CLOSED);
			events.onClosePane(open.paneId);
			events.onClosed();
			return;
		}
		if (open.kind !== "confirm-clear" || state.busy) {
			return;
		}
		setState((current) => ({ ...current, busy: true, error: null }));
		void runClear(api, open.context).then((outcome) => settle(outcome, open.context));
	}, [api, events, settle, state]);

	const chooseConflictOutcome = useCallback(
		(outcome: ConflictOutcome): void => {
			const { open } = state;
			if (open.kind !== "conflict" || state.busyOutcome !== null) {
				return;
			}
			if (outcome === "elsewhere") {
				show({ kind: "board", mode: "save-as", initial: EMPTY_DRAFT, context: open.context });
				return;
			}
			setState((current) => ({ ...current, busyOutcome: outcome, error: null }));
			void runConflictOutcome(api, outcome, open.context).then((result) =>
				settle(result, open.context),
			);
		},
		[api, settle, show, state],
	);

	const chooseElsewhereOutcome = useCallback(
		(outcome: ElsewhereOutcome): void => {
			const { open } = state;
			if (open.kind !== "elsewhere" || state.busyOutcome !== null) {
				return;
			}
			if (outcome === "keep") {
				close();
				return;
			}
			if (outcome === "elsewhere") {
				show({ kind: "board", mode: "save-as", initial: EMPTY_DRAFT, context: open.context });
				return;
			}
			setState((current) => ({ ...current, busyOutcome: "reload", error: null }));
			void runConflictOutcome(api, "reload", open.context).then((result) =>
				settle(result, open.context),
			);
		},
		[api, close, settle, show, state],
	);

	const openBoardDialog = useCallback(
		(mode: BoardDialogMode, initial: BoardDialogDraft, context: BoardCommandContext): void =>
			show({ kind: "board", mode, initial, context }),
		[show],
	);
	const openConfirmClear = useCallback(
		(context: BoardCommandContext): void => show({ kind: "confirm-clear", context }),
		[show],
	);
	const openConfirmClose = useCallback(
		(paneId: string, writes: number): void => show({ kind: "confirm-close", paneId, writes }),
		[show],
	);
	const openConflict = useCallback(
		(conflict: BoardWriteConflict, hold: BoardHold | null, context: BoardCommandContext): void =>
			show({ kind: "conflict", conflict, hold, context }),
		[show],
	);
	const openElsewhere = useCallback(
		(context: BoardCommandContext): void => show({ kind: "elsewhere", context }),
		[show],
	);

	return useMemo(
		() => ({
			state,
			openBoardDialog,
			openConfirmClear,
			openConfirmClose,
			openConflict,
			openElsewhere,
			close,
			submitBoard,
			confirm,
			chooseConflictOutcome,
			chooseElsewhereOutcome,
			opener,
		}),
		[
			opener,
			state,
			openBoardDialog,
			openConfirmClear,
			openConfirmClose,
			openConflict,
			openElsewhere,
			close,
			submitBoard,
			confirm,
			chooseConflictOutcome,
			chooseElsewhereOutcome,
		],
	);
}

export {
	EMPTY_DRAFT,
	useBoardDialogs,
	type BoardDialogEvents,
	type BoardDialogState,
	type BoardDialogs,
	type OpenDialog,
};
