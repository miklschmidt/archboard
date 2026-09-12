// The shell's typed inputs and outputs. Everything the shell shows comes in
// through `ShellView`; everything a person does goes out through
// `ShellActions`. The shell keeps only presentation state of its own.

import type { ReactNode } from "react";

import type { CodeTargetNoticeAction } from "@/shared/code-target";
import type {
	AgentActivityEntry,
	BoardIdentity,
	BoardListing,
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

/** One pane: what it reports about itself, who holds its board, and its mounted stage. */
interface ShellPane {
	status: PaneStatus;
	/** The pane's mounted stage, owned by the application so it never remounts. */
	stage: ReactNode;
	/** The board's current lock holder, or null when nobody is writing it. */
	holder: LockHolder | null;
	takeBack: TakeBackState;
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
	/** A refused exit, in plain words, shown where the person is: in the presentation. */
	error?: string | null;
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
type SettingsSurface = "opener" | "agent";

/** Everything the shell renders. */
interface ShellView {
	theme: ThemeChoice;
	/** The board named in the header: what the active pane is showing. */
	current: BoardIdentity;
	boards: BoardListing;
	/** Why the listing could not be refreshed, or null while it is current. */
	boardsError: string | null;
	/** The vault has not answered yet and nothing of it is in hand. */
	boardsLoading: boolean;
	selectedBoardKey: string | null;
	/** One or two panes, in reading order. */
	panes: readonly ShellPane[];
	activePaneId: string;
	presentation: ShellPresentation | null;
	notices: readonly ShellNotice[];
	/**
	 * Which boards an agent is working on right now, by board key, including
	 * boards no pane has open (ADR 0022). The navigator marks each one.
	 */
	agentActivity: Readonly<Record<string, AgentActivityEntry>>;
}

/** Everything a person can do from the shell. */
interface ShellActions {
	setTheme(theme: ThemeChoice): void;
	/**
	 * Show a board in one pane.
	 *
	 * The pane is named, never inferred from focus. A person choosing a variant
	 * in the right-hand pane while the left one is focused means the right-hand
	 * pane, and a control that read the focus instead would move the board they
	 * were reading and leave the one they clicked alone.
	 * @param key The board key.
	 * @param paneId Which pane shows it; the active one when none is named.
	 */
	selectBoard(key: string, paneId?: string): void;
	refreshBoards(): void;
	selectPane(paneId: string): void;
	addPane(): void;
	closePane(paneId: string): void;
	/** Present one pane fullscreen, or null to return to the workspace. */
	present(presentation: ShellPresentation | null): void;
	takeBackControl(paneId: string): void;
	openSettings(surface: SettingsSurface): void;
	selectNoticeAction(noticeId: string, actionId: string): void;
	dismissNotice(noticeId: string): void;
}

export type {
	ThemeChoice,
	TakeBackState,
	ShellPane,
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
