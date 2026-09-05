// The shell's typed inputs and outputs. Everything the shell shows comes in
// through `ShellView`; everything a person does goes out through
// `ShellActions`. The shell keeps only presentation state of its own.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type { CodeBinding } from "@/shared/code-target";
import type {
	BoardIdentity,
	BoardListing,
	BoardPreviewSnapshot,
	LockHolder,
	PaneStatus,
} from "@/ui/types";

/** The theme a person chose, stored on the root element. */
type ThemeChoice = "light" | "dark";

/** One canvas pane: what it reports about itself, and who holds its board. */
interface ShellPane {
	status: PaneStatus;
	/** The board's current lock holder, or null when nobody is writing it. */
	holder: LockHolder | null;
}

/** A navigator entry that is not a persisted board: a scratch note. */
interface ScratchBoardEntry {
	key: string;
	identity: BoardIdentity;
}

/** One row of the inspector's metadata table. */
interface SelectionMetadataRow {
	label: string;
	value: string;
	/** True for identifiers, paths and times, which are set in the mono face. */
	technical: boolean;
}

/**
 * What the inspector shows for the selected element. A projection of the
 * selection, never the element itself: the shell cannot write the board.
 */
interface SelectionProjection {
	elementId: string;
	title: string;
	elementType: string;
	metadata: readonly SelectionMetadataRow[];
	/** The persisted code binding, or null when the element is unbound. */
	binding: CodeBinding | null;
}

/** A recovery action a notice offers. Selecting it is reported by id. */
interface ShellNoticeAction {
	id: string;
	label: string;
}

/** A persistent notice: it stays up until its owner clears it. */
interface ShellNotice {
	id: string;
	title: string;
	description: string;
	tone: "default" | "destructive";
	actions: readonly ShellNoticeAction[];
}

/** A fullscreen presentation of one pane. */
interface ShellPresentation {
	paneId: string;
}

/** The settings surfaces the header's menu reaches. */
type SettingsSurface = "opener" | "agent" | "library";

/** Everything the shell renders. */
interface ShellView {
	theme: ThemeChoice;
	/** The board named in the header: what the active pane is holding. */
	current: BoardIdentity;
	boards: BoardListing;
	scratch: readonly ScratchBoardEntry[];
	/** Lazy previews keyed by board key; null until one has been rendered. */
	previews: Readonly<Record<string, BoardPreviewSnapshot | null>>;
	selectedBoardKey: string | null;
	/** One or two panes, in reading order. */
	panes: readonly ShellPane[];
	activePaneId: string;
	presentation: ShellPresentation | null;
	selection: SelectionProjection | null;
	notices: readonly ShellNotice[];
}

/** Everything a person can do from the shell. */
interface ShellActions {
	setTheme(theme: ThemeChoice): void;
	selectBoard(key: string): void;
	createBoard(): void;
	openBoard(): void;
	saveBoard(): void;
	clearBoard(): void;
	selectPane(paneId: string): void;
	addPane(): void;
	closePane(paneId: string): void;
	/** Present one pane fullscreen, or null to return to the workspace. */
	present(presentation: ShellPresentation | null): void;
	takeBackControl(paneId: string): void;
	openSettings(surface: SettingsSurface): void;
	selectNoticeAction(noticeId: string, actionId: string): void;
	openCode(elementId: string): void;
	focusPath(elementId: string): void;
	/** A pane's canvas has mounted and handed over Excalidraw's imperative API. */
	canvasReady(paneId: string, api: ExcalidrawImperativeAPI): void;
}

export type {
	ThemeChoice,
	ShellPane,
	ScratchBoardEntry,
	SelectionMetadataRow,
	SelectionProjection,
	ShellNoticeAction,
	ShellNotice,
	ShellPresentation,
	SettingsSurface,
	ShellView,
	ShellActions,
};
