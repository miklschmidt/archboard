// Everything a person can do from the shell, over the real owners: the panes
// and their sessions, the listing, the notices, the fullscreen presentation
// and the settings surfaces. Pure composition: no state of its own.

import { NOTICE_ACTIONS, failureNotice } from "@/ui/application/notices";
import type { WorkspaceAddressing } from "@/ui/board-routing";
import { recordFor } from "@/ui/application/pane-records";
import type { Fullscreen } from "@/ui/application/hooks/use-fullscreen";
import type { NoticeStack } from "@/ui/application/hooks/use-notices";
import type { Panes } from "@/ui/application/hooks/use-panes";
import type { BoardCatalog } from "@/ui/board-catalog";
import { showBoard } from "@/ui/pane-session";
import type { SettingsSurface, ShellActions, ShellPresentation, ThemeChoice } from "@/ui/shell";

/** What the actions act on. */
interface ShellActionDeps {
	readonly setTheme: (theme: ThemeChoice) => void;
	/** Where a person's own move is announced, so the address bar records it. */
	readonly addressing: WorkspaceAddressing;
	readonly panes: Panes;
	readonly catalog: BoardCatalog;
	readonly notices: NoticeStack;
	readonly fullscreen: Fullscreen;
	readonly openSettings: (surface: SettingsSurface) => void;
	/**
	 * Point a pane at a board, injectable for checks.
	 * @param board The board key.
	 * @param pane The pane's identity to the server.
	 * @returns What the server says the pane is showing.
	 */
	readonly show?: (board: string, pane: string) => Promise<{ board: string }>;
}

/** The board actions. */
type BoardActions = Pick<ShellActions, "selectBoard" | "refreshBoards">;

/**
 * The board actions: show a listed board, and read the listing again.
 * @param deps The owners.
 * @returns Those actions.
 */
function boardActions(deps: ShellActionDeps): BoardActions {
	const { panes } = deps;
	const show =
		deps.show ??
		((board: string, pane: string): Promise<{ board: string }> => showBoard({ board, pane }));
	/**
	 * Show a listed board in one pane.
	 * @param key The board key.
	 * @param inPane Which pane shows it; the active one when none is named.
	 */
	async function selectBoard(key: string, inPane?: string): Promise<void> {
		const paneId = inPane ?? panes.active.status.paneId;
		const { clientId, boardKey } = recordFor(panes.records, paneId).status;
		// The command waits for the address bar's one slot, so what the person
		// just asked for is the last thing the server is given.
		const permission = await deps.addressing.claim({ kind: "board", paneId, from: boardKey });
		try {
			const opened = await show(key, clientId);
			permission.move.done(opened.board);
			// The listing says which pane holds what, and this just moved one.
			deps.catalog.refresh();
		} catch (error) {
			permission.move.failed();
			deps.notices.raise(
				failureNotice(
					"board-command",
					"Show board",
					error instanceof Error ? error.message : String(error),
				),
			);
		}
	}
	return {
		/**
		 * Show a listed board; the outcome is the pane moving, or a notice.
		 * @param key The board key.
		 * @param inPane Which pane shows it; the active one when none is named.
		 */
		selectBoard: (key: string, inPane?: string): void => {
			void selectBoard(key, inPane);
		},
		/** Read the listing and every drawing again. */
		refreshBoards: (): void => {
			deps.catalog.reload();
		},
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
	 * Take a claimed board back from the agent (ADR 0022).
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
	return {
		/**
		 * Focus a pane.
		 * @param paneId The pane.
		 */
		selectPane: (paneId: string): void => {
			panes.select(paneId);
		},
		/** Add the second pane: the person asked for a comparison. */
		addPane: (): void => {
			deps.addressing.expect({ kind: "panes", count: panes.list.panes.length + 1 });
			panes.add();
		},
		/**
		 * Close a pane.
		 * @param paneId The pane.
		 */
		closePane: (paneId: string): void => {
			deps.addressing.expect({ kind: "panes", count: panes.list.panes.length - 1 });
			panes.close(paneId);
		},
		/**
		 * Present a pane fullscreen, or leave the presentation.
		 * @param presentation The pane, or null.
		 */
		present: (presentation: ShellPresentation | null): void => {
			if (presentation === null) {
				fullscreen.exit();
			} else {
				fullscreen.present(presentation.paneId);
			}
		},
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
	if (actionId === NOTICE_ACTIONS.settings) {
		deps.openSettings("opener");
		return;
	}
	if (actionId === NOTICE_ACTIONS.reloadFrontend) {
		window.location.reload();
	}
}

/**
 * Everything a person can do from the shell.
 * @param deps The owners.
 * @returns The actions.
 */
function createShellActions(deps: ShellActionDeps): ShellActions {
	return {
		setTheme: deps.setTheme,
		...boardActions(deps),
		...paneActions(deps),
		/**
		 * Open a settings surface.
		 * @param surface The surface.
		 */
		openSettings: (surface: SettingsSurface): void => {
			deps.openSettings(surface);
		},
		/**
		 * A notice's action was chosen.
		 * @param _noticeId The notice; every action id is unique across them.
		 * @param actionId The action.
		 */
		selectNoticeAction: (_noticeId: string, actionId: string): void => {
			answerNotice(deps, actionId);
		},
		/**
		 * A notice was dismissed.
		 * @param noticeId The notice.
		 */
		dismissNotice: (noticeId: string): void => {
			deps.notices.dismiss(noticeId);
		},
	};
}

export { createShellActions, type ShellActionDeps };
