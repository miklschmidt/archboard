// The shell's typed inputs and outputs. Everything the shell shows comes in
// through `ShellView`; everything a person does goes out through
// `ShellActions`. The shell keeps only presentation state of its own.

import type { ReactNode } from "react";

import type { CodeTargetNotice } from "@archboard/code-opener/opening";
import type { RepositoryEntry } from "@archboard/workspace/repositories";
import type { OutlineNode } from "#ui/rules/board-catalog/outline.ts";
import type {
	AgentActivityEntry,
	BoardListing,
	CatalogBoard,
	LockHolder,
	PaneStatus,
} from "#ui/rules/pane-session/session-types.ts";

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
	/** The name the vault lists the pane's board under, or null when it lists none. */
	boardName: string | null;
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
type ShellNoticeAction = SelectableNoticeAction | CodeTargetNotice["actions"][number];

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
type SettingsSurface = "opener";

/** One repository as the navigator lists it, with the boards of its chosen checkout (ADR 0050). */
interface ShellRepository {
	readonly repository: RepositoryEntry;
	readonly boards: BoardListing;
	/** Its boards as the navigator places them, built once by the caller. */
	readonly outline: readonly OutlineNode<CatalogBoard>[];
	/** Why its boards could not be read, or null. */
	readonly error: string | null;
	/** Its vault has not answered yet and nothing of it is in hand. */
	readonly loading: boolean;
	/**
	 * Which of its boards an agent is working on right now, by board key,
	 * including boards no pane has open (ADR 0022). The navigator marks each one.
	 */
	readonly activity: Readonly<Record<string, AgentActivityEntry>>;
}

/** Everything the shell renders. */
interface ShellView {
	theme: ThemeChoice;
	/** Every repository the navigator lists, in the server's order. */
	repositories: readonly ShellRepository[];
	/** Why the repositories could not be read, or null while they are current. */
	boardsError: string | null;
	/** The repositories have not answered yet and nothing of them is in hand. */
	boardsLoading: boolean;
	selectedBoardKey: string | null;
	/** One or two panes, in reading order. */
	panes: readonly ShellPane[];
	activePaneId: string;
	presentation: ShellPresentation | null;
	notices: readonly ShellNotice[];
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
	 * @param repository The repository the board is in; the pane's own when none is named.
	 * @returns Whether the pane shows it now. When it does not, a notice says why.
	 */
	selectBoard(key: string, paneId?: string, repository?: string): Promise<boolean>;
	/**
	 * Show a board beside the one being read: in the pane that is not active,
	 * adding the second pane when there is only one.
	 * @param key The board key.
	 * @param repository The repository the board is in.
	 */
	openBeside(key: string, repository: string): void;
	/**
	 * Choose which checkout of a repository this machine reads, for every tab
	 * and every agent (ADR 0050).
	 * @param repository The repository identity.
	 * @param root One of its known checkouts.
	 */
	chooseCheckout(repository: string, root: string): void;
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
	ShellRepository,
	ShellView,
	ShellActions,
};
