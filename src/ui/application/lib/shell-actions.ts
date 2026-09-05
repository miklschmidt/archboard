// Everything a person can do from the shell, over the real owners: the panes
// and their sessions, the listing, the dialogs, the notices, the fullscreen
// presentation and the settings surfaces. Pure composition: no state of its own.

import {
	SERVER_API,
	runOpen,
	runSave,
	type BoardCommandContext,
	type BoardCommandOutcome,
} from "@/ui/application/board-commands";
import { NOTICE_ACTIONS, failureNotice, infoNotice } from "@/ui/application/notices";
import type { PaneList } from "@/ui/application/pane-list";
import { recordFor, type PaneRecord } from "@/ui/application/pane-records";
import type { Boards } from "@/ui/application/lib/use-boards";
import { EMPTY_DRAFT, type BoardDialogs } from "@/ui/application/lib/use-board-dialogs";
import type { Fullscreen } from "@/ui/application/lib/use-fullscreen";
import type { NoticeStack } from "@/ui/application/lib/use-notices";
import type { Panes } from "@/ui/application/lib/use-panes";
import type { SettingsSurface, ShellActions, ShellPresentation, ThemeChoice } from "@/ui/shell";
import type { BoardIdentity, BoardListing } from "@/ui/types";

/** What the actions act on. */
interface ShellActionDeps {
	readonly setTheme: (theme: ThemeChoice) => void;
	readonly panes: Panes;
	readonly boards: Boards;
	readonly dialogs: BoardDialogs;
	readonly notices: NoticeStack;
	readonly fullscreen: Fullscreen;
	readonly openSettings: (surface: SettingsSurface) => void;
}

/**
 * The command context for one pane.
 * @param list The pane list, for whether a pane must be named.
 * @param record The pane's record.
 * @returns The context.
 */
function contextFor(list: PaneList, record: PaneRecord): BoardCommandContext {
	const { status } = record;
	return {
		clientId: status.clientId,
		boardKey: status.boardKey,
		board: status.board,
		// The server picks the primary pane when none is named; with two open,
		// the request names the pane the person is on.
		pane: list.panes.length > 1 ? status.clientId : undefined,
	};
}

/**
 * The identity a listing entry has, by key.
 * @param listing The listing.
 * @param key The board key.
 * @returns The identity, or null when the listing has no such board.
 */
function identityFor(listing: BoardListing, key: string): BoardIdentity | null {
	const persisted = listing.boards.find((board) => board.key === key);
	if (persisted !== undefined) {
		return persisted.identity;
	}
	return listing.open.find((board) => board.key === key)?.identity ?? null;
}

/**
 * The pane holding a board, or the active pane.
 * @param panes The panes.
 * @param key The board key.
 * @returns The record.
 */
function paneHolding(panes: Panes, key: string): PaneRecord {
	for (const entry of panes.list.panes) {
		const record = recordFor(panes.records, entry.paneId);
		if (record.status.boardKey === key) {
			return record;
		}
	}
	return panes.active;
}

/**
 * Apply a command's outcome outside a dialog: a notice, or the conflict dialog.
 * @param deps The owners.
 * @param outcome The outcome.
 * @param context The pane it was for.
 * @param title The notice title on success.
 */
function settle(
	deps: ShellActionDeps,
	outcome: BoardCommandOutcome,
	context: BoardCommandContext,
	title: string,
): void {
	switch (outcome.kind) {
		case "done":
			if (outcome.message !== null) {
				deps.notices.raise(infoNotice("board-command", title, outcome.message));
			}
			deps.boards.refresh();
			return;
		case "conflict":
			deps.dialogs.openConflict(outcome.conflict, outcome.hold, context);
			return;
		default:
			deps.notices.raise(
				failureNotice("board-command", outcome.error.title, outcome.error.message),
			);
	}
}

/** The board actions. */
type BoardActions = Pick<
	ShellActions,
	| "selectBoard"
	| "refreshBoards"
	| "createBoard"
	| "nameBoard"
	| "openBoard"
	| "saveBoard"
	| "clearBoard"
>;

/**
 * The board actions: open, create, save, save as, clear and select.
 * @param deps The owners.
 * @returns Those actions.
 */
function boardActions(deps: ShellActionDeps): BoardActions {
	const { panes, dialogs } = deps;
	/**
	 * Show a listed board in the active pane.
	 * @param key The board key.
	 */
	async function selectBoard(key: string): Promise<void> {
		const identity = identityFor(deps.boards.listing, key);
		const context = contextFor(panes.list, panes.active);
		if (identity === null) {
			deps.notices.raise(failureNotice("board-command", "Open board", `${key} is not listed.`));
			return;
		}
		settle(deps, await runOpen(SERVER_API, identity, context), context, "Open board");
	}
	/** Save the active pane's board back to its note. */
	async function saveBoard(): Promise<void> {
		const context = contextFor(panes.list, panes.active);
		settle(deps, await runSave(SERVER_API, context), context, "Save");
	}
	/**
	 * Give a scratch board a name: save it as, from the pane holding it.
	 * @param key The scratch board's key.
	 */
	function nameBoard(key: string): void {
		const context = contextFor(panes.list, paneHolding(panes, key));
		dialogs.openBoardDialog("save-as", EMPTY_DRAFT, context);
	}
	/** Open the board dialog to choose a persisted board. */
	function openBoard(): void {
		dialogs.openBoardDialog("open", EMPTY_DRAFT, contextFor(panes.list, panes.active));
	}
	/** Open the board dialog to create a board. */
	function createBoard(): void {
		dialogs.openBoardDialog("create", EMPTY_DRAFT, contextFor(panes.list, panes.active));
	}
	/** Ask before emptying the active pane's board. */
	function clearBoard(): void {
		dialogs.openConfirmClear(contextFor(panes.list, panes.active));
	}
	/** Read the listing and every preview again. */
	function refreshBoards(): void {
		deps.boards.reload();
	}
	return {
		/**
		 * Show a listed board; the outcome is a notice or the conflict dialog.
		 * @param key The board key.
		 */
		selectBoard: (key: string): void => {
			void selectBoard(key);
		},
		refreshBoards,
		createBoard,
		nameBoard,
		openBoard,
		/** Save the active pane's board; the outcome is a notice or the conflict dialog. */
		saveBoard: (): void => {
			void saveBoard();
		},
		clearBoard,
	};
}

/** The pane actions. */
type PaneActions = Pick<
	ShellActions,
	"selectPane" | "addPane" | "closePane" | "present" | "takeBackControl"
>;

/**
 * The pane actions: focus, add, close, present and take back.
 * @param deps The owners.
 * @returns Those actions.
 */
function paneActions(deps: ShellActionDeps): PaneActions {
	const { panes, fullscreen } = deps;
	/**
	 * Close a pane, confirming first when its board has stopped saving.
	 * @param paneId The pane.
	 */
	function closePane(paneId: string): void {
		const { hold } = recordFor(panes.records, paneId).status;
		if (hold !== null) {
			deps.dialogs.openConfirmClose(paneId, hold.writes);
			return;
		}
		panes.close(paneId);
	}
	/**
	 * Present a pane fullscreen, or leave the presentation.
	 * @param presentation The pane, or null.
	 */
	function present(presentation: ShellPresentation | null): void {
		if (presentation === null) {
			fullscreen.exit();
		} else {
			fullscreen.present(presentation.paneId);
		}
	}
	/**
	 * Take a claimed board back from the agent (ADR 0016).
	 * @param paneId The pane.
	 */
	async function takeBackControl(paneId: string): Promise<void> {
		const session = panes.handles.session(paneId);
		if (session === null) {
			return;
		}
		panes.patch(paneId, { takeBack: { kind: "pending" } });
		const result = await session.takeBack();
		panes.patch(paneId, {
			takeBack:
				result.outcome === "success"
					? { kind: "idle" }
					: { kind: "failed", message: "The board could not be taken back. Try again." },
		});
	}
	/**
	 * Focus a pane.
	 * @param paneId The pane.
	 */
	function selectPane(paneId: string): void {
		panes.select(paneId);
	}
	/** Add the second pane. */
	function addPane(): void {
		panes.add();
	}
	return {
		selectPane,
		addPane,
		closePane,
		present,
		/**
		 * Take a claimed board back; the pane's take-back state shows the outcome.
		 * @param paneId The pane.
		 */
		takeBackControl: (paneId: string): void => {
			void takeBackControl(paneId);
		},
	};
}

/**
 * Answer a notice action by id.
 * @param deps The owners.
 * @param actionId The action.
 */
function answerNotice(deps: ShellActionDeps, actionId: string): void {
	const { panes } = deps;
	const context = contextFor(panes.list, panes.active);
	const { hold } = panes.active.status;
	switch (actionId) {
		case NOTICE_ACTIONS.settings:
			deps.openSettings("opener");
			return;
		case NOTICE_ACTIONS.reloadFrontend:
			window.location.reload();
			return;
		case NOTICE_ACTIONS.resolveHold:
			if (hold !== null) {
				deps.dialogs.openConflict(hold.conflict, hold, context);
			}
			return;
		case NOTICE_ACTIONS.resolveElsewhere:
			deps.dialogs.openElsewhere(context);
			return;
		default:
			return;
	}
}

/** The inspector and notice actions. */
type InspectorActions = Pick<
	ShellActions,
	| "openSettings"
	| "selectNoticeAction"
	| "dismissNotice"
	| "openCode"
	| "focusPath"
	| "exitPathFocus"
>;

/**
 * The inspector and notice actions.
 * @param deps The owners.
 * @returns Those actions.
 */
function inspectorActions(deps: ShellActionDeps): InspectorActions {
	const { panes } = deps;
	/**
	 * The active pane's session, when it has reported one.
	 * @returns The session, or null.
	 */
	function activeSession(): ReturnType<Panes["handles"]["session"]> {
		return panes.handles.session(panes.list.activePaneId);
	}
	/**
	 * Open a settings surface.
	 * @param surface The surface.
	 */
	function openSettings(surface: SettingsSurface): void {
		deps.openSettings(surface);
	}
	/**
	 * A notice action was chosen.
	 * @param _noticeId The notice.
	 * @param actionId The action.
	 */
	function selectNoticeAction(_noticeId: string, actionId: string): void {
		answerNotice(deps, actionId);
	}
	/**
	 * Dismiss a notice.
	 * @param id The notice.
	 */
	function dismissNotice(id: string): void {
		deps.notices.dismiss(id);
	}
	/**
	 * Open the selected element's code target.
	 * @param elementId The element.
	 */
	function openCode(elementId: string): void {
		activeSession()?.openCode(elementId);
	}
	/** Dim everything not connected to the selected element. */
	function focusPath(): void {
		activeSession()?.focusPath();
	}
	/** Leave path focus. */
	function exitPathFocus(): void {
		activeSession()?.exitPathFocus();
	}
	return { openSettings, selectNoticeAction, dismissNotice, openCode, focusPath, exitPathFocus };
}

/**
 * The shell actions.
 * @param deps The owners.
 * @returns The actions.
 */
function createShellActions(deps: ShellActionDeps): ShellActions {
	/**
	 * Choose a theme.
	 * @param theme The theme.
	 */
	function setTheme(theme: ThemeChoice): void {
		deps.setTheme(theme);
	}
	return {
		setTheme,
		...boardActions(deps),
		...paneActions(deps),
		...inspectorActions(deps),
	};
}

export { contextFor, createShellActions, identityFor, type ShellActionDeps };
