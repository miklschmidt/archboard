// What one pane reports about itself, kept live outside React and published to
// the shell whole, so two readers never see two different panes.

import type {
	BoardIdentity,
	DoingEntry,
	PaneStatus,
} from "#ui/rules/pane-session/session-types.ts";

/** The live status of one pane. */
interface LivePaneStatus {
	connected: boolean;
	registered: boolean;
	board: BoardIdentity | null;
	boardKey: string | null;
	opened: string | null;
	view: string | null;
	presenting: boolean;
	lastChangeAt: string | null;
	doing: DoingEntry[];
	version: number | null;
	vault: string;
	repository: string | null;
}

/** What the status needs to publish itself. */
interface PaneStatusParts {
	readonly paneId: string;
	readonly clientId: string;
	/** The vault the pane opens in, until the server says otherwise. */
	readonly vault: string;
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
		presenting: false,
		lastChangeAt: null,
		doing: [],
		version: null,
		vault: parts.vault,
		repository: null,
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
			presenting: live.presenting,
			lastChangeAt: live.lastChangeAt,
			doing: live.doing,
			version: live.version,
			vault: live.vault,
			repository: live.repository,
		});
	}

	return { live, publish };
}

export { createPaneStatus, type LivePaneStatus, type PaneStatusOwner };
