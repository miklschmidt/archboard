// Assembling the shell's view from what the application holds: the pane
// list, the pane records, the mounted canvases, the listing, the previews and
// the notices. Pure, so the assembly can be checked without a browser.

import type { PreviewSource } from "@/ui/board-preview";
import type { PaneList } from "@/ui/application/pane-list";
import { recordFor, type PaneRecords } from "@/ui/application/pane-records";
import type {
	ScratchBoardEntry,
	ShellNotice,
	ShellPane,
	ShellPresentation,
	ShellView,
	ThemeChoice,
} from "@/ui/shell";
import type { BoardIdentity, BoardListing } from "@/ui/types";

/** The listing before the server has answered. */
const EMPTY_LISTING: BoardListing = Object.freeze({
	vault: "",
	boards: [],
	open: [],
	onScreen: [],
});

/** What the header names while the active pane holds no board yet. */
const NO_BOARD: BoardIdentity = Object.freeze({ board: "No board", variant: "current" });

/** Everything the assembly reads. */
interface ShellViewInputs {
	readonly theme: ThemeChoice;
	readonly list: PaneList;
	readonly records: PaneRecords;
	/** The mounted canvas per pane id. */
	readonly canvases: Readonly<Record<string, React.ReactNode>>;
	readonly boards: BoardListing;
	readonly boardsError: string | null;
	readonly previews: Readonly<Record<string, PreviewSource | null>>;
	readonly presentation: ShellPresentation | null;
	readonly notices: readonly ShellNotice[];
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
		const { status, placeholder } = recordFor(inputs.records, entry.paneId);
		if (placeholder && status.boardKey !== null && status.board !== null) {
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
		scratch: scratchBoards(inputs),
		previews: inputs.previews,
		selectedBoardKey: active.status.boardKey,
		panes: shellPanes(inputs),
		activePaneId: inputs.list.activePaneId,
		presentation: inputs.presentation,
		selection: active.selection,
		pathFocus: active.pathFocus,
		pathFocusOverlay: active.overlay,
		notices: inputs.notices,
	};
}

export { EMPTY_LISTING, NO_BOARD, assembleShellView, type ShellViewInputs };
