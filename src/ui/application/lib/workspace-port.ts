// The workspace as the address bar sees it: what each pane shows, whether a
// pane can be addressed yet, and the commands that move one. Pure composition
// over the panes, the dialogs and the notices; the router owns none of them.
//
// Opening a board here is the same command the board picker runs, so a restore
// and a click go down one path and get the same refusals.

import { SERVER_API, runOpenKey, type BoardCommandApi } from "@/ui/application/board-commands";
import { unreachableBoardsNotice } from "@/ui/application/notices";
import { PANE_IDS, paneListOf, type PaneList } from "@/ui/application/pane-list";
import { recordFor } from "@/ui/application/pane-records";
import type { LiveBinding } from "@/ui/application/lib/live-binding";
import {
	guardNavigation,
	guardedPanes,
	reportNavigationBlock,
} from "@/ui/application/navigation-guard";
import { contextFor } from "@/ui/application/lib/shell-actions";
import type { BoardDialogs } from "@/ui/application/hooks/use-board-dialogs";
import type { NoticeStack } from "@/ui/application/hooks/use-notices";
import type { Panes } from "@/ui/application/hooks/use-panes";
import type {
	GuardVerdict,
	NavigationBlock,
	OpenOutcome,
	WorkspacePort,
} from "@/ui/board-routing/contracts";
import type { WorkspaceAddress, WorkspaceAddressing } from "@/ui/board-routing";

/**
 * The pane list a tab opens with: the panes its address names, so a restored
 * comparison has both canvases in its first render rather than growing one.
 * @param address The address the tab was opened on.
 * @returns The list.
 */
function openingPaneList(address: WorkspaceAddress): PaneList {
	return paneListOf(
		address.panes.map((pane) => pane.paneId),
		address.activePaneId,
	);
}

/**
 * The person's own moves, reachable before the address bar that answers them
 * exists. Only ever called from an event, never during render.
 * @param binding Where the address bar is bound each render.
 * @returns The announcements the actions and the dialogs make.
 */
function addressingOver(binding: LiveBinding<WorkspaceAddressing>): WorkspaceAddressing {
	return {
		/**
		 * A person asked for a move.
		 * @param intent What they asked for.
		 */
		expect: (intent): void => {
			binding.read().expect(intent);
		},
		/**
		 * A person is about to have the shell open a board.
		 * @param intent What they asked for.
		 * @returns Where to report the outcome, once the command may be sent.
		 */
		claim: (intent) => binding.read().claim(intent),
	};
}

/** What the port composes. */
interface WorkspacePortDeps {
	readonly panes: Panes;
	readonly dialogs: BoardDialogs;
	readonly notices: NoticeStack;
	/** The server, injectable for checks. */
	readonly api?: BoardCommandApi;
}

/**
 * What the panes are showing, in reading order.
 * @param panes The panes.
 * @returns The displayed address.
 */
function displayedAddress(panes: Panes): WorkspaceAddress {
	return Object.freeze({
		panes: panes.list.panes.map((entry) =>
			Object.freeze({
				paneId: entry.paneId,
				boardKey: recordFor(panes.records, entry.paneId).status.boardKey,
			}),
		),
		activePaneId: panes.list.activePaneId,
	});
}

/**
 * Show the recovery for a pane that refused a navigation.
 * @param deps The owners.
 * @param block The pane that refused and why.
 */
function reportBlocked(deps: WorkspacePortDeps, block: NavigationBlock): void {
	const { panes } = deps;
	const record = recordFor(panes.records, block.paneId);
	reportNavigationBlock(deps, block, contextFor(panes.list, record), record.status.hold);
}

/**
 * The workspace the address bar reads and moves.
 * @param deps The panes, the dialogs and the notices.
 * @returns The port.
 */
function createWorkspacePort(deps: WorkspacePortDeps): WorkspacePort {
	const { panes } = deps;
	const api = deps.api ?? SERVER_API;
	return {
		displayed: displayedAddress(panes),
		paneIds: PANE_IDS,
		/**
		 * Whether a pane can be addressed: it has a client id and a live socket.
		 * @param paneId The pane.
		 * @returns True once the server knows this pane.
		 */
		ready: (paneId: string): boolean => {
			const { clientId, connected } = recordFor(panes.records, paneId).status;
			return connected && clientId !== "";
		},
		/**
		 * Whether these panes may lose what they show.
		 * @param paneIds The panes at risk.
		 * @returns The verdict.
		 */
		guard: (paneIds: readonly string[]): GuardVerdict =>
			guardNavigation(guardedPanes(panes.records, panes.handles), paneIds),
		/**
		 * Point one pane at one board.
		 * @param paneId The pane.
		 * @param boardKey The board.
		 * @returns Whether the board was reached.
		 */
		open: async (paneId: string, boardKey: string): Promise<OpenOutcome> => {
			const { clientId } = recordFor(panes.records, paneId).status;
			const opened: string[] = [];
			const outcome = await runOpenKey(api, boardKey, clientId, (key) => opened.push(key));
			const key = opened[0];
			return outcome.kind === "done" && key !== undefined
				? { kind: "opened", boardKey: key }
				: { kind: "unreachable" };
		},
		addPane: panes.add,
		closePane: panes.close,
		selectPane: panes.select,
		/**
		 * A navigation was refused.
		 * @param block The pane that refused and why.
		 */
		reportBlocked: (block: NavigationBlock): void => {
			reportBlocked(deps, block);
		},
		/**
		 * Boards the address named that no pane could reach.
		 * @param boardKeys The boards.
		 */
		reportUnreachable: (boardKeys: readonly string[]): void => {
			deps.notices.raise(unreachableBoardsNotice(boardKeys));
		},
	};
}

export {
	addressingOver,
	createWorkspacePort,
	displayedAddress,
	openingPaneList,
	type WorkspacePortDeps,
};
