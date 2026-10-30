// What the application does when a pane speaks: the notices it raises and the
// owners it wakes. Rebound every render over the owners that exist by then;
// nothing here diffs rendered state.

import type { CodeTargetNotice } from "@archboard/code-opener/opening";
import {
	boardErrorNotice,
	codeTargetShellNotice,
	staleFrontendNotice,
} from "#ui/rules/application/notices.ts";
import type { PaneSession } from "#ui/state/application/pane-handles.ts";
import type { AgentActivity } from "#ui/hooks/application/use-agent-activity.ts";
import type { NoticeStack } from "#ui/hooks/application/use-notices.ts";
import type { PaneReadings } from "#ui/hooks/application/use-pane-reading.ts";
import type { PaneEvents } from "#ui/hooks/application/use-panes.ts";
import type { useWorkbench } from "#ui/hooks/application/use-workbench.ts";
import type { ModelCatalog } from "#ui/hooks/architecture-model/use-model-catalog.ts";
import type { AgentActivityEntry } from "#ui/rules/pane-session/session-types.ts";

/** The owners the pane events reach. */
interface PaneEventOwners {
	readonly notices: NoticeStack;
	readonly catalog: ModelCatalog;
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
		 * This tab runs a bundle the server no longer serves.
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
		/**
		 * A pane's socket came back: everything this tab caches about the server
		 * may have moved while it was down, and nothing said so. The agent work it
		 * heard is forgotten before the socket's first message, which is the
		 * server's account of every vault where an agent is at work now.
		 */
		onPaneReconnected: (): void => {
			owners.activity.forget();
			catalog.reconnected();
		},
		/**
		 * Which boards an agent is working on in one vault.
		 * @param vault The vault.
		 * @param snapshot The whole snapshot.
		 */
		onAgentActivity: (vault: string, snapshot: readonly AgentActivityEntry[]): void => {
			owners.activity.replace(vault, snapshot);
		},
		/** A checkout was chosen somewhere: the repositories are read again. */
		onRepositoriesChanged: (): void => {
			catalog.repositoriesChanged();
		},
	};
}

export { paneEvents, type PaneEventOwners };
