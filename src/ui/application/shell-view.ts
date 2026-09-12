// Assembling the shell's view from what the application holds: the pane list,
// the pane records, the mounted panes, the listing and the notices. Pure, so
// the assembly can be checked without a browser.

import type { ReactNode } from "react";

import type { PaneList } from "@/ui/application/pane-list";
import { recordFor, type PaneRecords } from "@/ui/application/pane-records";
import type { ShellNotice, ShellPane, ShellPresentation, ShellView, ThemeChoice } from "@/ui/shell";
import type { AgentActivityEntry, BoardIdentity, BoardListing } from "@/ui/types";

/** What the header names while the active pane holds no board yet. */
const NO_BOARD: BoardIdentity = Object.freeze({ board: "No board", variant: "current" });

/** Everything the assembly reads. */
interface ShellViewInputs {
	readonly theme: ThemeChoice;
	readonly list: PaneList;
	readonly records: PaneRecords;
	/** The mounted pane per pane id. */
	readonly panes: Readonly<Record<string, ReactNode>>;
	readonly boards: BoardListing;
	readonly boardsError: string | null;
	/** The vault has not answered yet and nothing of it is in hand. */
	readonly boardsLoading: boolean;
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
			stage: inputs.panes[entry.paneId] ?? null,
			holder: record.holder,
			takeBack: record.takeBack,
		};
	});
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
		selectedBoardKey: active.status.boardKey,
		panes: shellPanes(inputs),
		activePaneId: inputs.list.activePaneId,
		presentation: inputs.presentation,
		notices: inputs.notices,
		agentActivity: inputs.agentActivity,
	};
}

export { NO_BOARD, assembleShellView, type ShellViewInputs };
