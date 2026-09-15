// The workspace as the address bar sees it: what each pane shows, whether a
// pane can be addressed yet, and the commands that move one. Pure composition
// over the panes and the notices; the router owns neither.
//
// Opening a board here is the same command the navigator runs, so a restore
// and a click go down one path and get the same refusals.

import { unreachableBoardsNotice } from "@/ui/application/notices";
import { PANE_IDS, paneListOf, type PaneList } from "@/ui/application/pane-list";
import { paneReady, recordFor } from "@/ui/application/pane-records";
import type { LiveBinding } from "@/ui/application/lib/live-binding";
import type { NoticeStack } from "@/ui/application/hooks/use-notices";
import type { PaneReadings } from "@/ui/application/hooks/use-pane-reading";
import type { Panes } from "@/ui/application/hooks/use-panes";
import type { OpenOutcome, WorkspacePort } from "@/ui/board-routing/contracts";
import type { WorkspaceAddress, WorkspaceAddressing } from "@/ui/board-routing";
import { showBoard } from "@/ui/pane-session";

/**
 * The pane list a tab opens with: the panes its address names, so a restored
 * comparison has both panes in its first render rather than growing one.
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
 * @returns The announcements the actions make.
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

/**
 * The same readings, with a view choice announced as the person's own move.
 *
 * The address bar cannot tell a person's gesture from a change that simply
 * happened — both arrive as the workspace being different — so the gesture says
 * so, and that is what makes this a history entry somebody can go Back through
 * rather than a silent rewrite of the address they are on.
 * @param readings What each pane is reading.
 * @param addressing Where a person's moves are announced.
 * @returns The readings, with `showView` announcing itself.
 */
function announcingViews(readings: PaneReadings, addressing: WorkspaceAddressing): PaneReadings {
	return {
		...readings,
		/**
		 * The person chose a way of reading one pane's board.
		 * @param paneId The pane.
		 * @param view The view's id, or null for the whole variant.
		 */
		showView: (paneId: string, view: string | null): void => {
			addressing.expect({ kind: "view", paneId, from: readings.viewOf(paneId) });
			readings.showView(paneId, view);
		},
	};
}

/** Nothing is reading anything, for a caller with no readings of its own. */
const NO_READINGS: PaneReadings = Object.freeze({
	/**
	 * No pane is reading through a view.
	 * @returns Null, always.
	 */
	viewOf: (): string | null => null,
	/** Nothing to read through a view. */
	showView: (): void => {
		// A caller with no readings has no view to choose.
	},
	/**
	 * Nothing is picked out.
	 * @returns Null, always.
	 */
	pickedIn: (): null => null,
	/** Nothing to pick out. */
	pick: (): void => {
		// A caller with no readings has nothing to pick.
	},
	/** Nothing to forget. */
	boardChanged: (): void => {
		// A caller with no readings has nothing held against a board.
	},
});

/** What the port composes. */
interface WorkspacePortDeps {
	readonly panes: Panes;
	readonly notices: NoticeStack;
	/** What each pane is reading; nothing when the caller has no readings. */
	readonly readings?: PaneReadings;
	/**
	 * Point a pane at a board, injectable for checks.
	 * @param clientId The pane's identity to the server.
	 * @param boardKey The board.
	 * @returns The board the server says the pane is on now.
	 */
	readonly show?: (clientId: string, boardKey: string) => Promise<string>;
}

/**
 * Point a pane at a board through the server, which is the one owner of which
 * pane holds what.
 * @param clientId The pane's identity to the server.
 * @param boardKey The board.
 * @returns The board key the server says the pane is on.
 */
async function showThroughServer(clientId: string, boardKey: string): Promise<string> {
	const reply = await showBoard({ board: boardKey, pane: clientId });
	return reply.board;
}

/**
 * What the panes are showing, in reading order.
 *
 * Both halves come from the pane itself, and they have to: a board and the view
 * it is read through are one answer. The shell remembers which view a person
 * chose for the board it pointed a pane at, but a pane that has followed a link
 * down is reading another board, whose views are its own — an address pairing
 * the level below's board with the level above's remembered view id would name
 * a view that board has not got, and reopening it would fail. So the address
 * records what the pane says is drawn, and a board arriving with nothing chosen
 * on it simply carries no view.
 * @param panes The panes.
 * @param _readings Unused; the pane is the authority on what it is reading.
 * @returns The displayed address.
 */
function displayedAddress(panes: Panes, _readings: PaneReadings = NO_READINGS): WorkspaceAddress {
	return Object.freeze({
		panes: panes.list.panes.map((entry) => {
			const { status } = recordFor(panes.records, entry.paneId);
			return Object.freeze({
				paneId: entry.paneId,
				// The board the pane says it is on, variant and all: the server told
				// it, so the address records what is actually on screen rather than
				// what somebody asked for.
				boardKey: status.boardKey,
				view: status.view,
			});
		}),
		activePaneId: panes.list.activePaneId,
	});
}

/**
 * The workspace the address bar reads and moves.
 * @param deps The panes, the readings and the notices.
 * @returns The port.
 */
function createWorkspacePort(deps: WorkspacePortDeps): WorkspacePort {
	const { panes } = deps;
	const readings = deps.readings ?? NO_READINGS;
	const show = deps.show ?? showThroughServer;
	return {
		displayed: displayedAddress(panes, readings),
		paneIds: PANE_IDS,
		/**
		 * Whether a pane can be addressed: the server has it.
		 *
		 * A live socket is not enough, and the difference is what a direct load
		 * races. A socket opens, the shell reads an address naming a board, and
		 * the canvas has no pane to point at yet — so the open is refused and the
		 * address the person typed is abandoned as unreachable. Waiting for the
		 * pane the canvas actually registered costs one report and gets it right.
		 * @param paneId The pane.
		 * @returns True once the server knows this pane.
		 */
		ready: (paneId: string): boolean => {
			return paneReady(recordFor(panes.records, paneId).status);
		},
		/**
		 * Point one pane at one board.
		 * @param paneId The pane.
		 * @param boardKey The board.
		 * @returns Whether the board was reached.
		 */
		open: async (paneId: string, boardKey: string): Promise<OpenOutcome> => {
			const { clientId } = recordFor(panes.records, paneId).status;
			try {
				return { kind: "opened", boardKey: await show(clientId, boardKey) };
			} catch {
				return { kind: "unreachable" };
			}
		},
		/**
		 * Read the board a pane already shows through one of its views.
		 * @param paneId The pane.
		 * @param view The view's id, or null for the whole variant.
		 * @returns Whether the pane was reading its board some other way.
		 */
		read: (paneId: string, view: string | null): boolean => {
			if (readings.viewOf(paneId) === view) {
				return false;
			}
			readings.showView(paneId, view);
			return true;
		},
		addPane: panes.add,
		closePane: panes.close,
		selectPane: panes.select,
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
	NO_READINGS,
	addressingOver,
	announcingViews,
	createWorkspacePort,
	displayedAddress,
	openingPaneList,
	type WorkspacePortDeps,
};
