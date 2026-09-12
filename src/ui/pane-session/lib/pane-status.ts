// What one pane reports about itself, kept live outside React and published to
// the shell whole, so two readers never see two different panes.

import type { BoardIdentity, DoingEntry, PaneStatus } from "@/ui/types";

/** The live status of one pane. */
interface LivePaneStatus {
	connected: boolean;
	registered: boolean;
	board: BoardIdentity | null;
	boardKey: string | null;
	opened: string | null;
	view: string | null;
	lastChangeAt: string | null;
	doing: DoingEntry[];
	version: number | null;
}

/** What the status needs to publish itself. */
interface PaneStatusParts {
	readonly paneId: string;
	readonly clientId: string;
	readonly onStatus: (status: PaneStatus) => void;
}

/** One pane's live status and its publication. */
interface PaneStatusOwner {
	readonly live: LivePaneStatus;
	/** Tell the shell what this pane is, now. */
	readonly publish: () => void;
}

/**
 * Create the live status of one pane.
 * @param parts What it needs to publish itself.
 * @returns The owner.
 */
function createPaneStatus(parts: PaneStatusParts): PaneStatusOwner {
	const live: LivePaneStatus = {
		connected: false,
		registered: false,
		board: null,
		boardKey: null,
		opened: null,
		view: null,
		lastChangeAt: null,
		doing: [],
		version: null,
	};

	/** Tell the shell what this pane is, now. */
	function publish(): void {
		parts.onStatus({
			paneId: parts.paneId,
			clientId: parts.clientId,
			connected: live.connected,
			registered: live.registered,
			board: live.board,
			boardKey: live.boardKey,
			opened: live.opened,
			view: live.view,
			lastChangeAt: live.lastChangeAt,
			doing: live.doing,
			version: live.version,
		});
	}

	return { live, publish };
}

export { createPaneStatus, type LivePaneStatus, type PaneStatusOwner };
