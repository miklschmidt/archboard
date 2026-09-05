// The shell's typed inputs and outputs. Everything the shell shows comes in
// through `ShellView`; everything a person does goes out through
// `ShellActions`. The shell keeps only presentation state of its own.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type { CodeTargetNoticeAction } from "@/shared/code-target";
import type { PathFocusOverlay, PathFocusSnapshot } from "@/ui/path-focus";
import type { SelectionProjection } from "@/ui/selection-inspector";
import type {
	BoardIdentity,
	BoardListing,
	BoardPreviewSnapshot,
	LockHolder,
	PaneStatus,
} from "@/ui/types";

/** The theme a person chose, stored on the root element. */
type ThemeChoice = "light" | "dark";

/** Where the take-back operation for one pane's board stands. */
type TakeBackState =
	| { kind: "idle" }
	| { kind: "pending" }
	| {
			kind: "failed";
			/** Plain words for why the board could not be taken back. */
			message: string;
	  };

/** One canvas pane: what it reports about itself, and who holds its board. */
interface ShellPane {
	status: PaneStatus;
	/** The board's current lock holder, or null when nobody is writing it. */
	holder: LockHolder | null;
	takeBack: TakeBackState;
}

/** A navigator entry that is not a persisted board: a scratch note. */
interface ScratchBoardEntry {
	key: string;
	identity: BoardIdentity;
	/** A board with a note but no chosen name, which the navigator asks for. */
	placeholder: boolean;
}

/** A recovery action a notice offers, reported back by id when chosen. */
interface SelectableNoticeAction {
	kind: "select";
	id: string;
	label: string;
}

/**
 * What a notice can offer: a shell action reported by id, or one of the code
 * target shapes. A `settings` action is reported with the id `settings`; a
 * `github` action opens its validated URL in a new tab and reports nothing.
 */
type ShellNoticeAction = SelectableNoticeAction | CodeTargetNoticeAction;

/** A persistent notice: it stays up until its owner clears it or the person dismisses it. */
interface ShellNotice {
	id: string;
	title: string;
	description: string;
	tone: "default" | "destructive";
	actions: readonly ShellNoticeAction[];
}

/** One pane presented fullscreen. */
interface LivePresentation {
	kind: "live";
	paneId: string;
}

/** The presented pane has lost its connection; the person is told and can leave. */
interface RecoveryPresentation {
	kind: "recovery";
	paneId: string;
	message: string;
}

/** A fullscreen presentation of one pane. */
type ShellPresentation = LivePresentation | RecoveryPresentation;

/** The settings surfaces the header's menu reaches. */
type SettingsSurface = "opener" | "agent" | "library";

/** Everything the shell renders. */
interface ShellView {
	theme: ThemeChoice;
	/** The board named in the header: what the active pane is holding. */
	current: BoardIdentity;
	boards: BoardListing;
	/** Why the listing could not be refreshed, or null while it is current. */
	boardsError: string | null;
	scratch: readonly ScratchBoardEntry[];
	/** Lazy previews keyed by board key; null until one has been rendered. */
	previews: Readonly<Record<string, BoardPreviewSnapshot | null>>;
	selectedBoardKey: string | null;
	/** One or two panes, in reading order. */
	panes: readonly ShellPane[];
	activePaneId: string;
	presentation: ShellPresentation | null;
	/** The active pane's selection. */
	selection: SelectionProjection;
	/** The active pane's path focus. */
	pathFocus: PathFocusSnapshot;
	/** Where the focused elements are on their stage, or null while focus is off. */
	pathFocusOverlay: PathFocusOverlay | null;
	notices: readonly ShellNotice[];
}

/** Everything a person can do from the shell. */
interface ShellActions {
	setTheme(theme: ThemeChoice): void;
	selectBoard(key: string): void;
	refreshBoards(): void;
	createBoard(): void;
	/** Give a placeholder scratch board the name it is missing. */
	nameBoard(key: string): void;
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
	dismissNotice(noticeId: string): void;
	openCode(elementId: string): void;
	focusPath(elementId: string): void;
	exitPathFocus(): void;
	/** A pane's canvas has mounted and handed over Excalidraw's imperative API. */
	canvasReady(paneId: string, api: ExcalidrawImperativeAPI): void;
}

export type {
	ThemeChoice,
	TakeBackState,
	ShellPane,
	ScratchBoardEntry,
	SelectableNoticeAction,
	ShellNoticeAction,
	ShellNotice,
	LivePresentation,
	RecoveryPresentation,
	ShellPresentation,
	SettingsSurface,
	ShellView,
	ShellActions,
};
