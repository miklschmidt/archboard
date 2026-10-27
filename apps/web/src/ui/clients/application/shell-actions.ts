// Everything a person can do from the shell, over the real owners: the panes
// and their sessions, the listing, the notices, the fullscreen presentation
// and the settings surfaces. Pure composition: no state of its own.

import { NOTICE_ACTIONS, failureNotice } from "#ui/rules/application/notices.ts";
import type { WorkspaceAddressing } from "#ui/hooks/board-routing/use-workspace-address.ts";
import { paneReady, recordFor } from "#ui/rules/application/pane-records.ts";
import type { Fullscreen } from "#ui/hooks/application/use-fullscreen.ts";
import type { NoticeStack } from "#ui/hooks/application/use-notices.ts";
import type { Panes } from "#ui/hooks/application/use-panes.ts";
import type { ConversationActivation } from "#ui/clients/application/shown-conversation.ts";
import { userMoves, type UserMove } from "#ui/rules/application/user-moves.ts";
import { chooseCheckout } from "#ui/clients/board-catalog/repositories.ts";
import { type BoardCatalog } from "#ui/hooks/board-catalog/use-board-catalog.ts";
import { showBoard, showModel } from "#ui/clients/pane-session/pane-requests.ts";
import type {
	SettingsSurface,
	ShellActions,
	ShellNotice,
	ShellPresentation,
	ThemeChoice,
} from "#ui/rules/shell/contracts.ts";
import type { PaneStatus } from "#ui/rules/pane-session/session-types.ts";

/** What the server says a pane is showing after a show, and the repository it is in. */
type ShownBoard = Pick<Awaited<ReturnType<typeof showBoard>>, "board" | "repository">;

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
	 * @param vault The vault the board is in, which the pane moves into.
	 * @returns What the server says the pane is showing, and the repository it is in.
	 */
	readonly show?: (board: string, pane: string, vault: string) => Promise<ShownBoard>;
	/**
	 * Say that the user asked for a pane to move (ADR 0034). Supplied by a test; the pane's own
	 * session otherwise.
	 * @param paneId The pane they asked about.
	 * @returns The move, to be failed if the server refuses it.
	 */
	readonly userMoves?: (paneId: string) => UserMove;
	/** Say the person activated a pane's checkout (ADR 0050). */
	readonly activate: ConversationActivation;
}

/** The board actions. */
type BoardActions = Pick<ShellActions, "selectBoard" | "refreshBoards" | "chooseCheckout">;

/** Every shell action but opening beside, which waits on the panes and is composed over these. */
type ComposedShellActions = Omit<ShellActions, "openBeside">;

/**
 * The board actions: show a listed board, and read the listing again.
 * @param deps The owners.
 * @returns Those actions.
 */
function boardActions(deps: ShellActionDeps): BoardActions {
	const { panes } = deps;
	const moving = deps.userMoves ?? ((paneId: string): UserMove => userMoves(panes.handles, paneId));
	const show =
		deps.show ??
		((board: string, pane: string, vault: string): Promise<ShownBoard> =>
			showBoard({ vault, board, pane }));
	const { activate } = deps;
	/**
	 * Show a listed board in one pane; the outcome is the pane moving, or a notice.
	 * @param key The board key.
	 * @param inPane Which pane shows it; the active one when none is named.
	 * @param repository The repository the board is in; the pane's own when none is named.
	 * @returns Whether the pane shows it now.
	 */
	async function selectBoard(key: string, inPane?: string, repository?: string): Promise<boolean> {
		const paneId = inPane ?? panes.active.status.paneId;
		const { status } = recordFor(panes.records, paneId);
		const { clientId, boardKey, repository: from } = status;
		const place = placeFor(deps.catalog, status, repository);
		if (typeof place !== "string") {
			deps.notices.raise(place);
			return false;
		}
		const vault = place;
		// The command waits for the address bar's one slot, so what the person
		// just asked for is the last thing the server is given.
		const permission = await deps.addressing.claim({
			kind: "board",
			paneId,
			from: boardKey,
			repository: from,
		});
		const move = moving(paneId);
		try {
			const opened = await show(key, clientId, vault);
			permission.move.done(opened.board, opened.repository);
			// The person opened it, so the dock shows the conversation of its checkout.
			void activate(paneId, { vault });
			deps.notices.dismiss("board-command");
			// The listing says which pane holds what, and this just moved one.
			deps.catalog.refresh();
			return true;
		} catch (error) {
			permission.move.failed();
			move.failed();
			deps.notices.raise(
				failureNotice(
					"board-command",
					"Show board",
					error instanceof Error ? error.message : String(error),
				),
			);
			return false;
		}
	}
	return {
		selectBoard,
		/** Read the listing and every drawing again. */
		refreshBoards: (): void => {
			deps.catalog.reload();
		},
		/**
		 * Choose the checkout of a repository this machine reads.
		 * @param repository The repository identity.
		 * @param root One of its known checkouts.
		 */
		chooseCheckout: (repository: string, root: string): void => {
			void choose(deps, repository, root);
		},
	};
}

/**
 * A human repository open moves the pane before activating its conversation.
 * @param deps The existing pane, registry, notice and activation owners.
 * @param model The destination model identity.
 * @param repository The destination repository identity.
 * @param paneId The pane the reader chose.
 * @returns Whether the addressed route accepted the reading.
 */
async function openModel(
	deps: ShellActionDeps,
	model: string,
	repository: string,
	paneId: string,
): Promise<boolean> {
	const { status } = recordFor(deps.panes.records, paneId);
	const vault = placeFor(deps.catalog, status, repository);
	if (typeof vault !== "string") {
		deps.notices.raise(vault);
		return false;
	}
	const move = userMoves(deps.panes.handles, paneId);
	try {
		await showModel(vault, status.clientId, { model });
		await deps.activate(paneId, { vault });
		deps.notices.dismiss("architecture-command");
		return true;
	} catch (error) {
		move.failed();
		deps.notices.raise(
			failureNotice(
				"architecture-command",
				"Open architecture",
				error instanceof Error ? error.message : String(error),
			),
		);
		return false;
	}
}

/**
 * Choose a checkout, and say so when the server refuses. Every tab hears the
 * choice from the server, this one included, and reads its repositories again.
 * @param deps The owners.
 * @param repository The repository identity.
 * @param root One of its known checkouts.
 */
async function choose(deps: ShellActionDeps, repository: string, root: string): Promise<void> {
	try {
		await chooseCheckout({ repository, root });
		deps.notices.dismiss("checkout-choice");
	} catch (error) {
		deps.notices.raise(
			failureNotice(
				"checkout-choice",
				"Choose checkout",
				error instanceof Error ? error.message : String(error),
			),
		);
	}
}

/**
 * The vault a pane reads a board of a repository from, or why it cannot now.
 * @param catalog The catalog.
 * @param status The pane.
 * @param repository The repository the board is in; the pane's own when none is named.
 * @returns The vault, or the notice that says why there is none.
 */
function placeFor(
	catalog: BoardCatalog,
	status: PaneStatus,
	repository: string | undefined,
): string | ShellNotice {
	// A socket can be open before the server has accepted its pane. The
	// picker must honor the same readiness boundary as URL restoration.
	if (!paneReady(status)) {
		return {
			...failureNotice(
				"board-command",
				"Show board",
				"This pane is reconnecting. Try again once it is connected, or reload the page.",
			),
			actions: [{ kind: "select", id: NOTICE_ACTIONS.reloadFrontend, label: "Reload" }],
		};
	}
	const vault = repository === undefined ? status.vault : vaultOf(catalog, repository);
	return (
		vault ??
		failureNotice(
			"board-command",
			"Show board",
			`${repository ?? "This repository"} has no checkout with a vault to read. Choose another checkout in its menu.`,
		)
	);
}

/**
 * The vault a repository's boards are read from. A click and a restored address
 * both resolve a repository's name here, so they open the same vault.
 * @param catalog The catalog.
 * @param repository The repository's name.
 * @returns Its chosen checkout's vault, or null when it has none to read.
 */
function vaultOf(catalog: Pick<BoardCatalog, "repositories">, repository: string): string | null {
	return (
		catalog.repositories.find((each) => each.repository.name === repository)?.repository.vault ??
		null
	);
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
function createShellActions(deps: ShellActionDeps): ComposedShellActions {
	return {
		setTheme: deps.setTheme,
		/**
		 * Open a current model in the explicitly addressed pane.
		 * @param model The destination model.
		 * @param repository Its registered repository.
		 * @param paneId The target pane, or the active pane when absent.
		 * @returns Whether the move succeeded.
		 */
		openModel: (model, repository, paneId) =>
			openModel(deps, model, repository, paneId ?? deps.panes.active.status.paneId),
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

export { createShellActions, vaultOf, type ComposedShellActions, type ShellActionDeps };
