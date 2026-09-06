// What one pane reports about itself, kept live outside React and published
// to the shell whole, so two readers never see two different panes.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type {
	BoardHold,
	BoardIdentity,
	DoingEntry,
	NoteWrittenElsewhere,
	PaneStatus,
} from "@/ui/types";

/** The live status of one pane. */
interface LivePaneStatus {
	connected: boolean;
	board: BoardIdentity | null;
	boardKey: string | null;
	lastChangeAt: string | null;
	hold: BoardHold | null;
	writtenElsewhere: NoteWrittenElsewhere | null;
	doing: DoingEntry[];
	noteVersion: number | null;
}

/** What the status needs to publish itself. */
interface PaneStatusParts {
	readonly paneId: string;
	readonly clientId: string;
	readonly api: () => ExcalidrawImperativeAPI | null;
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
		board: null,
		boardKey: null,
		lastChangeAt: null,
		hold: null,
		writtenElsewhere: null,
		doing: [],
		noteVersion: null,
	};

	/** Tell the shell what this pane is, now. */
	function publish(): void {
		parts.onStatus({
			paneId: parts.paneId,
			clientId: parts.clientId,
			connected: live.connected,
			board: live.board,
			boardKey: live.boardKey,
			elementCount: parts.api()?.getSceneElements().length ?? 0,
			lastChangeAt: live.lastChangeAt,
			hold: live.hold,
			writtenElsewhere: live.writtenElsewhere,
			doing: live.doing,
			noteVersion: live.noteVersion,
		});
	}

	return { live, publish };
}

export { createPaneStatus, type LivePaneStatus, type PaneStatusOwner };
