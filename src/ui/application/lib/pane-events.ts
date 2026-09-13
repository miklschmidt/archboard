// What the application does when a pane speaks: the notices it raises and the
// owners it wakes. Rebound every render over the owners that exist by then;
// nothing here diffs rendered state.

import type { CodeTargetNotice } from "@/shared/code-target";
import { agentBoardChange } from "@/ui/application/agent-activity";
import {
	boardErrorNotice,
	codeTargetShellNotice,
	staleFrontendNotice,
} from "@/ui/application/notices";
import type { PaneSession } from "@/ui/application/lib/pane-handles";
import type { AgentActivity } from "@/ui/application/hooks/use-agent-activity";
import type { NoticeStack } from "@/ui/application/hooks/use-notices";
import type { PaneReadings } from "@/ui/application/hooks/use-pane-reading";
import type { PaneEvents } from "@/ui/application/hooks/use-panes";
import type { useWorkbench } from "@/ui/application/hooks/use-workbench";
import type { BoardCatalog } from "@/ui/board-catalog";
import type { AgentActivityEntry } from "@/ui/types";

/** The owners the pane events reach. */
interface PaneEventOwners {
	readonly notices: NoticeStack;
	readonly catalog: BoardCatalog;
	readonly readings: PaneReadings;
	readonly workbench: ReturnType<typeof useWorkbench>;
	readonly activity: AgentActivity;
}

/**
 * The pane events over their owners.
 * @param owners The owners.
 * @returns The events.
 */
function paneEvents(owners: PaneEventOwners): PaneEvents {
	const { notices, catalog, workbench } = owners;
	return {
		/**
		 * A pane published its status: its transport may have changed.
		 * @param paneId The pane.
		 */
		onStatusPublished: (paneId: string): void => {
			workbench.paneReported(paneId);
		},
		/**
		 * A pane reported its session, or went.
		 * @param paneId The pane.
		 * @param session The session, or null.
		 */
		onSession: (paneId: string, session: PaneSession | null): void => {
			if (session === null) {
				workbench.paneGone(paneId);
			} else {
				workbench.paneReported(paneId);
			}
		},
		/**
		 * A board could not be shown.
		 * @param paneId The pane.
		 * @param error The refusal.
		 */
		onBoardError: (paneId: string, error: string): void => {
			notices.raise(boardErrorNotice(paneId, error));
		},
		/**
		 * The server moved a pane onto another board or variant.
		 * @param paneId The pane.
		 * @param boardKey The board key it adopted.
		 * @param previousKey The board key it left, or null on first adoption.
		 */
		onBoardAdopted: (paneId: string, boardKey: string, previousKey: string | null): void => {
			owners.readings.boardChanged(paneId, boardKey, previousKey);
		},
		/**
		 * This tab runs a bundle the canvas no longer serves.
		 * @param message What the server said.
		 */
		onStaleFrontend: (message: string): void => {
			notices.raise(staleFrontendNotice(message));
		},
		/**
		 * A code target could not be opened.
		 * @param notice The failure.
		 */
		onCodeTargetNotice: (notice: CodeTargetNotice): void => {
			notices.raise(codeTargetShellNotice(notice));
		},
		/** The server accepted a changed pane report: the listing may have moved. */
		onPaneStateAccepted: (): void => {
			catalog.refresh();
		},
		/**
		 * A pane's socket came back: everything this tab caches about the server
		 * may have moved while it was down, and nothing said so.
		 */
		onPaneReconnected: (): void => {
			catalog.reconnected();
		},
		/**
		 * A pane has gone and the server has dropped it: what the panes are
		 * holding is not what this tab last read.
		 */
		onPaneRetired: (): void => {
			catalog.refresh();
		},
		/**
		 * Which boards an agent is working on.
		 * @param snapshot The whole snapshot.
		 */
		onAgentActivity: (snapshot: readonly AgentActivityEntry[]): void => {
			const change = agentBoardChange(owners.activity.map, snapshot);
			owners.activity.replace(snapshot);
			if (change.settled.length > 0) {
				catalog.boardsChanged(change.settled);
			} else if (change.started.length > 0) {
				catalog.refresh();
			}
		},
	};
}

export { paneEvents, type PaneEventOwners };
