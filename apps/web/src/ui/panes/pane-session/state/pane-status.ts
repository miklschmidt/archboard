// What one pane reports about itself, kept live outside React and published to
// the shell whole, so two readers never see two different panes.

import type { LegacyIdentity, PaneStatus } from "#ui/panes/pane-session/rules/session-types.ts";

/** The live status of one pane. */
interface LivePaneStatus {
	connected: boolean;
	/** Whether the server accepted a report of this pane once: a later loss is a reconnection. */
	contacted: boolean;
	registered: boolean;
	model: LegacyIdentity | null;
	paneKey: string | null;
	opened: string | null;
	view: string | null;
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
		contacted: false,
		registered: false,
		model: null,
		paneKey: null,
		opened: null,
		view: null,
		vault: parts.vault,
		repository: null,
	};

	/** Tell the shell what this pane is, now. */
	function publish(): void {
		parts.onStatus({
			paneId: parts.paneId,
			clientId: parts.clientId,
			connected: live.connected,
			reconnecting: live.contacted && !live.connected,
			registered: live.registered,
			model: live.model,
			paneKey: live.paneKey,
			opened: live.opened,
			view: live.view,
			vault: live.vault,
			repository: live.repository,
		});
	}

	return { live, publish };
}

export { createPaneStatus, type LivePaneStatus };
