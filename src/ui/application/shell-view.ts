// Assembling the shell's view from what the application holds: the pane
// list, the pane records, the mounted canvases, the listing, the scratch
// boards and the notices. Pure, so the assembly can be checked without a
// browser. The previews are not assembled here: a row draws its own through
// `renderPreview`, which is the one thing in the view that is a slot rather
// than a value.

import type { ReactNode } from "react";

import type { PaneList } from "@/ui/application/pane-list";
import { recordFor, type PaneRecords } from "@/ui/application/pane-records";
import type {
	RenderBoardPreview,
	ScratchBoardEntry,
	ShellNotice,
	ShellPane,
	ShellPresentation,
	ShellView,
	ThemeChoice,
} from "@/ui/shell";
import type { AgentActivityEntry, BoardIdentity, BoardListing } from "@/ui/types";

/** What the header names while the active pane holds no board yet. */
const NO_BOARD: BoardIdentity = Object.freeze({ board: "No board", variant: "current" });

/** Everything the assembly reads. */
interface ShellViewInputs {
	readonly theme: ThemeChoice;
	readonly list: PaneList;
	readonly records: PaneRecords;
	/** The mounted canvas per pane id. */
	readonly canvases: Readonly<Record<string, ReactNode>>;
	readonly boards: BoardListing;
	readonly boardsError: string | null;
	/** The vault has not answered yet and nothing of it is in hand. */
	readonly boardsLoading: boolean;
	/** The board keys that turned out to be scratch: a note nobody named. */
	readonly scratchKeys: ReadonlySet<string>;
	/** How many open boards could not be asked whether they have a name. */
	readonly scratchUnreadable: number;
	readonly renderPreview: RenderBoardPreview;
	readonly presentation: ShellPresentation | null;
	readonly notices: readonly ShellNotice[];
	/** Which boards an agent is working on, by board key (ADR 0022). */
	readonly agentActivity: Readonly<Record<string, AgentActivityEntry>>;
}

/**
 * The shell panes, in reading order.
 * @param inputs The assembly inputs.
 * @returns One shell pane per listed pane.
 */
function shellPanes(inputs: ShellViewInputs): ShellPane[] {
	return inputs.list.panes.map((entry) => {
		const record = recordFor(inputs.records, entry.paneId);
		return {
			status: record.status,
			canvas: inputs.canvases[entry.paneId] ?? null,
			holder: record.holder,
			takeBack: record.takeBack,
		};
	});
}

/**
 * The scratch boards the panes hold: notes without a chosen name.
 * @param inputs The assembly inputs.
 * @returns One entry per scratch board key.
 */
function scratchBoards(inputs: ShellViewInputs): ScratchBoardEntry[] {
	const entries = new Map<string, ScratchBoardEntry>();
	for (const entry of inputs.list.panes) {
		const { status } = recordFor(inputs.records, entry.paneId);
		if (
			status.boardKey !== null &&
			status.board !== null &&
			inputs.scratchKeys.has(status.boardKey)
		) {
			entries.set(status.boardKey, {
				key: status.boardKey,
				identity: status.board,
				placeholder: true,
			});
		}
	}
	return [...entries.values()];
}

/**
 * Assemble the shell view.
 * @param inputs What the application holds.
 * @returns The view.
 */
function assembleShellView(inputs: ShellViewInputs): ShellView {
	const active = recordFor(inputs.records, inputs.list.activePaneId);
	return {
		theme: inputs.theme,
		current: active.status.board ?? NO_BOARD,
		boards: inputs.boards,
		boardsError: inputs.boardsError,
		boardsLoading: inputs.boardsLoading,
		scratch: scratchBoards(inputs),
		scratchUnreadable: inputs.scratchUnreadable,
		renderPreview: inputs.renderPreview,
		selectedBoardKey: active.status.boardKey,
		panes: shellPanes(inputs),
		activePaneId: inputs.list.activePaneId,
		presentation: inputs.presentation,
		selection: active.selection,
		pathFocus: active.pathFocus,
		pathFocusOverlay: active.overlay,
		notices: inputs.notices,
		agentActivity: inputs.agentActivity,
	};
}

export { NO_BOARD, assembleShellView, type ShellViewInputs };
