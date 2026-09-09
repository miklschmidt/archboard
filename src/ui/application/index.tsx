// The application root: the sessions, the listing, the dialogs, the notices,
// the workbench and the presentation composed over the shell. The sessions,
// the transport, the runtime and the controllers are the state; this file
// only connects them.

import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react";

import type { CodeTargetNotice } from "@/shared/code-target";
import type { BoardCommandContext } from "@/ui/application/board-commands";
import { LiveBinding } from "@/ui/application/lib/live-binding";
import { AgentSettingsHost } from "@/ui/application/components/AgentSettingsHost";
import { ApplicationPane } from "@/ui/application/components/ApplicationPane";
import { BoardDialogsHost } from "@/ui/application/components/BoardDialogsHost";
import {
	codeTargetShellNotice,
	failureNotice,
	infoNotice,
	noteNotices,
	presentationNotice,
} from "@/ui/application/notices";
import { OpenerSettingsHost } from "@/ui/application/components/OpenerSettingsHost";
import { openPendingRecovery, paneEvents } from "@/ui/application/lib/pane-events";
import { heldBoardKeys, recordFor } from "@/ui/application/pane-records";
import { createShellActions } from "@/ui/application/lib/shell-actions";
import { addressingOver, openingPaneList } from "@/ui/application/lib/workspace-port";
import { assembleShellView } from "@/ui/application/shell-view";
import { applyTheme, initialTheme } from "@/ui/application/lib/theme";
import { useBoardDialogs } from "@/ui/application/hooks/use-board-dialogs";
import {
	useMountedPreviews,
	type MountedPreviews,
} from "@/ui/application/hooks/use-mounted-previews";
import {
	shellPresentationOf,
	useFullscreen,
	type Fullscreen,
} from "@/ui/application/hooks/use-fullscreen";
import { useNotices, type NoticeStack } from "@/ui/application/hooks/use-notices";
import { usePanes, type Panes } from "@/ui/application/hooks/use-panes";
import { useAgentActivity, type AgentActivity } from "@/ui/application/hooks/use-agent-activity";
import { useReducedMotion } from "@/ui/application/hooks/use-reduced-motion";
import { useStageEvents, type EscapeOrigin } from "@/ui/application/hooks/use-stage-events";
import { useWorkbench } from "@/ui/application/hooks/use-workbench";
import { useWorkspaceAddressing } from "@/ui/application/hooks/use-workspace-addressing";
import { PresentationVoiceControls } from "@/ui/application/components/PresentationVoiceControls";
import { WorkbenchDockBody } from "@/ui/application/components/WorkbenchDockBody";
import { WorkbenchDockHeader } from "@/ui/application/components/WorkbenchDockHeader";
import type { WorkbenchOwners } from "@/ui/application/lib/workbench-owners";
import type { DoingEntry } from "@/ui/types";
import {
	BoardCatalogProvider,
	BoardPreview,
	useBoardCatalog,
	useScratchBoards,
	type BoardCatalog,
} from "@/ui/board-catalog";
import { useLibrary, type LibraryController } from "@/ui/board-library";
import { useOpeningAddress, type WorkspaceAddressing } from "@/ui/board-routing";
import { TooltipProvider } from "@/ui/components/tooltip";
import {
	ActivityList,
	SETTINGS_TRIGGER_ID,
	Shell,
	type SettingsSurface,
	type RenderBoardPreview,
	type ShellActions,
	type ShellView,
	type ThemeChoice,
} from "@/ui/shell";

/**
 * The settings menu trigger: where a settings dialog returns focus, since the
 * menu item that opened it is gone by the time the dialog closes.
 * @returns The trigger, or null before the header mounts.
 */
function settingsTrigger(): HTMLElement | null {
	return document.getElementById(SETTINGS_TRIGGER_ID);
}

/** The one notice the library menu item raises when nothing is offered. */
const LIBRARY_HINT =
	"Open a library on libraries.excalidraw.com and choose “Add to Excalidraw”; it returns to this tab and asks before installing.";

/**
 * The theme as state, applied to the document.
 * @returns The theme and its setter.
 */
function useTheme(): [ThemeChoice, (theme: ThemeChoice) => void] {
	const [theme, setTheme] = useState<ThemeChoice>(initialTheme);
	useEffect(() => {
		applyTheme(theme);
	}, [theme]);
	return [theme, setTheme];
}

/**
 * The mounted canvases, one per pane; each is the pane's own element and is
 * never remounted by a layout change.
 * @param panes The panes.
 * @param theme The theme.
 * @returns The canvases by pane id.
 */
function useCanvases(panes: Panes, theme: ThemeChoice): Readonly<Record<string, ReactNode>> {
	const { list, host, handles } = panes;
	return useMemo(() => {
		const canvases: Record<string, ReactNode> = {};
		list.panes.forEach((entry, index) => {
			canvases[entry.paneId] = (
				<ApplicationPane
					key={entry.paneId}
					paneId={entry.paneId}
					primary={index === 0}
					focused={entry.paneId === list.activePaneId}
					theme={theme}
					host={host}
					handles={handles}
				/>
			);
		});
		return canvases;
	}, [list, theme, host, handles]);
}

/**
 * Push the shell's palette into every pane whenever it changes or a pane mounts.
 * @param panes The panes.
 * @param library The library.
 */
function useLibrarySync(panes: Panes, library: LibraryController): void {
	const { handles } = panes;
	const { items } = library;
	useEffect(() => {
		for (const session of handles.sessions()) {
			session.applyLibrary(items);
		}
	}, [handles, items]);
}

/**
 * Keep the presentation on a pane that exists: when the presented or wanted
 * pane closes, the survivor takes over or the presentation ends.
 * @param panes The panes.
 * @param fullscreen The presentation.
 */
function usePresentationTransfer(panes: Panes, fullscreen: Fullscreen): void {
	const { list } = panes;
	const { target, paneRemoved } = fullscreen;
	useEffect(() => {
		const wanted = target();
		if (wanted === null || list.panes.some((pane) => pane.paneId === wanted)) {
			return;
		}
		paneRemoved(wanted, list.panes[0]?.paneId ?? null);
	}, [list, target, paneRemoved]);
}

/**
 * Return keyboard focus to the pane that was presented when a presentation
 * ends, however it ended: the exit control, the shortcut, or the browser's
 * own Escape. The exit control goes with the presentation, so without this
 * the keyboard would be stranded on the body. The pane, not the present
 * control, takes it: the person was looking at that canvas, and a control
 * focused by script would pop its tooltip over its neighbours.
 * @param presentedPaneId The presented pane, or null in the workspace.
 */
function usePresentationFocusReturn(presentedPaneId: string | null): void {
	const previous = useRef<string | null>(null);
	useEffect(() => {
		const ended = previous.current;
		if (ended !== null && presentedPaneId === null) {
			document.querySelector<HTMLElement>(`section[aria-label="Pane ${ended}"]`)?.focus();
		}
		previous.current = presentedPaneId;
	}, [presentedPaneId]);
}

/** The workbench's places in the shell. */
interface WorkbenchSlots {
	header: ReactNode;
	body: ReactNode;
	voice: ReactNode;
	/** The active pane's recent `doing` lines, or null when nobody said anything. */
	activity: ReactNode;
}

/**
 * The active pane's recent activity, rendered once for the workbench's
 * session column or, without a workbench, the dock's own column. The list
 * owns how much of the pane's `doing` it shows.
 * @param doing Every `doing` line the active pane holds.
 * @returns The list, or null when there is nothing to show.
 */
function useActivity(doing: readonly DoingEntry[]): ReactNode {
	return useMemo(() => (doing.length === 0 ? null : <ActivityList entries={doing} />), [doing]);
}

/**
 * The workbench's slots in the shell over the focused pane's owners.
 * @param owners The owners, or null while the focused pane has no transport.
 * @param reducedMotion The motion preference.
 * @param activity The active pane's rendered recent activity, or null.
 * @returns The dock header, the dock body, the presentation voice controls and the activity.
 */
function useWorkbenchSlots(
	owners: WorkbenchOwners | null,
	reducedMotion: boolean,
	activity: ReactNode,
): WorkbenchSlots {
	return useMemo(() => {
		if (owners === null) {
			return { header: null, body: null, voice: null, activity };
		}
		return {
			header: <WorkbenchDockHeader owners={owners} reducedMotion={reducedMotion} />,
			body: <WorkbenchDockBody owners={owners} reducedMotion={reducedMotion} activity={activity} />,
			voice: <PresentationVoiceControls owners={owners} />,
			activity,
		};
	}, [owners, reducedMotion, activity]);
}

/** What the shell view is assembled from, beyond the panes. */
interface ShellViewSources {
	readonly theme: ThemeChoice;
	readonly panes: Panes;
	readonly catalog: BoardCatalog;
	/** The board keys that turned out to be scratch. */
	readonly scratchKeys: ReadonlySet<string>;
	readonly renderPreview: RenderBoardPreview;
	readonly fullscreen: Fullscreen;
	readonly notices: NoticeStack;
	readonly activity: AgentActivity;
}

/**
 * The shell view.
 * @param sources What it is assembled from.
 * @returns The view.
 */
function useShellView(sources: ShellViewSources): ShellView {
	const { theme, panes, catalog, fullscreen, notices, activity } = sources;
	const canvases = useCanvases(panes, theme);
	// The note states are read off the records; only event notices are state.
	const allNotices = useMemo(
		() => [...noteNotices(panes.list, panes.records), ...notices.notices],
		[panes.list, panes.records, notices.notices],
	);
	const presentedPaneId = fullscreen.snapshot.paneId;
	const presentedConnected =
		presentedPaneId !== null && recordFor(panes.records, presentedPaneId).status.connected;
	return useMemo(
		() =>
			assembleShellView({
				theme,
				list: panes.list,
				records: panes.records,
				canvases,
				boards: catalog.listing,
				boardsError: catalog.error,
				boardsLoading: catalog.loading,
				scratchKeys: sources.scratchKeys,
				renderPreview: sources.renderPreview,
				presentation: shellPresentationOf(fullscreen.snapshot, presentedConnected),
				notices: allNotices,
				agentActivity: activity.map,
			}),
		[
			theme,
			panes,
			canvases,
			catalog,
			sources.scratchKeys,
			sources.renderPreview,
			fullscreen.snapshot,
			presentedConnected,
			allNotices,
			activity.map,
		],
	);
}

/** Inputs for the settings dialogs. */
interface SettingsHostsProps {
	surface: SettingsSurface | null;
	owners: WorkbenchOwners | null;
	notices: NoticeStack;
	onClose: () => void;
}

/**
 * The settings dialogs: opener settings over its flow, agent settings over
 * the focused pane's workbench.
 * @param props The open surface, the owners, the notices and the close.
 * @returns The open dialog, or nothing.
 */
function SettingsHosts(props: SettingsHostsProps): JSX.Element | null {
	const { surface, owners, notices, onClose } = props;
	const onSuccess = useCallback(
		(message: string): void =>
			notices.raise(infoNotice("opener-settings", "Opener settings", message)),
		[notices],
	);
	const onFailure = useCallback(
		(notice: CodeTargetNotice): void => notices.raise(codeTargetShellNotice(notice)),
		[notices],
	);
	if (surface === "opener") {
		return (
			<OpenerSettingsHost
				onSuccess={onSuccess}
				onFailure={onFailure}
				onClose={onClose}
				finalFocus={settingsTrigger}
			/>
		);
	}
	if (surface === "agent" && owners !== null) {
		return <AgentSettingsHost owners={owners} onClose={onClose} finalFocus={settingsTrigger} />;
	}
	return null;
}

/**
 * How each navigator row draws its board, bound to what the panes are holding.
 *
 * A board a pane holds is drawn from that pane's own scene; every other board
 * from the server's snapshot, which the catalog caches (ADR 0015, TASK-167).
 * Which of the two applies is decided here, where both are known, and never by
 * the shell.
 * @param previews The scenes the panes are holding, by board key.
 * @param held The board keys the panes hold.
 * @param theme The theme to draw in.
 * @returns The row's preview renderer.
 */
function usePreviewRenderer(
	previews: MountedPreviews,
	held: readonly string[],
	theme: ThemeChoice,
): RenderBoardPreview {
	const holding = useMemo(() => new Set(held), [held]);
	const { byBoard } = previews;
	return useCallback(
		(boardKey: string, boardName: string): ReactNode => (
			<BoardPreview
				boardKey={boardKey}
				boardName={boardName}
				mounted={byBoard[boardKey] ?? null}
				held={holding.has(boardKey)}
				theme={theme}
			/>
		),
		[holding, byBoard, theme],
	);
}

/**
 * The root component's body, inside the providers it needs.
 * @returns The shell, the dialogs and the workbench.
 */
function ApplicationBody(): JSX.Element {
	const [theme, setTheme] = useTheme();
	const reducedMotion = useReducedMotion();
	const notices = useNotices();
	const { raise } = notices;
	const onLibraryError = useCallback(
		(message: string): void => raise(failureNotice("library", "Library", message)),
		[raise],
	);
	const library = useLibrary({ onError: onLibraryError });
	const [settings, setSettings] = useState<SettingsSurface | null>(null);
	const closeSettings = useCallback((): void => setSettings(null), []);
	const openAgentSettings = useCallback((): void => setSettings("agent"), []);

	// The address the tab was opened on mounts the panes, so a restored
	// comparison has both canvases in its first render rather than growing one.
	const opening = useOpeningAddress();
	const panes = usePanes(useCallback(() => openingPaneList(opening), [opening]));
	const [addressBinding] = useState(() => new LiveBinding<WorkspaceAddressing>());
	const addressing = useMemo(() => addressingOver(addressBinding), [addressBinding]);
	const heldKeys = useMemo(
		() =>
			heldBoardKeys(
				panes.records,
				panes.list.panes.map((entry) => entry.paneId),
			),
		[panes.records, panes.list],
	);
	const catalog = useBoardCatalog();
	const scratchKeys = useScratchBoards(heldKeys);
	const mountedPreviews = useMountedPreviews(panes.handles);
	const renderPreview = usePreviewRenderer(mountedPreviews, heldKeys, theme);
	const agentActivity = useAgentActivity();
	const workbench = useWorkbench(panes.handles, panes.list.activePaneId, openAgentSettings);
	// A refused exit stays with the presentation, where the person is; a
	// refused entry becomes a notice in the workspace they are still in.
	const onRefused = useCallback(
		(error: string, paneId: string | null): void => {
			if (paneId === null) {
				raise(presentationNotice(error));
			}
		},
		[raise],
	);
	const fullscreen = useFullscreen({ onRefused });
	// What a closing dialog wakes exists only once the dialogs do; bound below.
	const [afterDialogClose] = useState(() => new LiveBinding<() => void>());
	const dialogEvents = useMemo(
		() => ({
			/**
			 * A dialog is about to point a pane at another board: the person's move.
			 * @param context The pane it acts for.
			 */
			onMovingPane: (context: BoardCommandContext): void => {
				addressing.expect({ kind: "board", paneId: context.paneId, from: context.boardKey });
			},
			/** That command did not move the pane. */
			onMoveAbandoned: addressing.clear,
			/**
			 * A dialog's command finished.
			 * @param message Words for the notice, when there are any.
			 */
			onDone: (message: string | null): void => {
				if (message !== null) {
					raise(infoNotice("board-command", "Board", message));
				}
				catalog.refresh();
			},
			/**
			 * The person confirmed closing a pane that held work: a comparison ends.
			 * @param paneId The pane.
			 */
			onClosePane: (paneId: string): void => {
				addressing.expect({ kind: "panes", count: panes.list.panes.length - 1 });
				panes.close(paneId);
			},
			/** A dialog closed; a note state that waited for it gets its dialog now. */
			onClosed: (): void => {
				afterDialogClose.read()();
			},
		}),
		[raise, catalog, panes, addressing, afterDialogClose],
	);
	const dialogs = useBoardDialogs(dialogEvents);
	// The address bar over the panes the shell already owns: it writes down what
	// they show, and restores what a direct load or a Back/Forward asks for.
	useWorkspaceAddressing({ panes, dialogs, notices }, addressBinding);
	usePresentationTransfer(panes, fullscreen);
	usePresentationFocusReturn(fullscreen.snapshot.paneId);
	useLibrarySync(panes, library);
	// Bound each render, after the owners the events reach exist.
	panes.bindEvents(
		paneEvents({
			addressing,
			notices,
			library,
			catalog,
			previews: mountedPreviews,
			workbench,
			activity: agentActivity,
			setTheme,
			panes,
			dialogs,
		}),
	);
	afterDialogClose.bind(() => openPendingRecovery({ panes, dialogs }));

	const openSettings = useCallback(
		(surface: SettingsSurface): void => {
			if (surface === "library" && library.pending === null) {
				notices.raise(infoNotice("library", "Install library", LIBRARY_HINT));
				return;
			}
			if (surface === "agent" && workbench.owners === null) {
				notices.raise(
					failureNotice(
						"agent-settings",
						"Agent settings",
						"No agent workbench is attached to this pane yet.",
					),
				);
				return;
			}
			setSettings(surface);
		},
		[library.pending, notices, workbench.owners],
	);
	const actions = useMemo<ShellActions>(
		() =>
			createShellActions({
				setTheme,
				addressing,
				panes,
				catalog,
				dialogs,
				notices,
				fullscreen,
				openSettings,
			}),
		[setTheme, addressing, panes, catalog, dialogs, notices, fullscreen, openSettings],
	);
	const view = useShellView({
		theme,
		panes,
		catalog,
		scratchKeys,
		renderPreview,
		fullscreen,
		notices,
		activity: agentActivity,
	});
	const pathFocused = view.pathFocus.kind === "connected";
	const stageEvents = useMemo(
		() => ({
			/**
			 * Escape leaves path focus; inside the inspector, with no focus to
			 * leave, it clears the selection and so closes the inspector.
			 * @param origin Where the key was pressed.
			 */
			onEscape: (origin: EscapeOrigin): void => {
				if (pathFocused) {
					actions.exitPathFocus();
				} else if (origin === "inspector") {
					actions.dismissSelection();
				}
			},
			/** The present shortcut toggles the presentation of the active pane. */
			onPresentShortcut: (): void => {
				if (fullscreen.snapshot.paneId === null) {
					actions.present({ kind: "live", paneId: panes.list.activePaneId });
				} else {
					actions.present(null);
				}
			},
			/**
			 * A pointer on a pane focuses it.
			 * @param paneId The pane.
			 */
			onPanePointer: (paneId: string): void => {
				panes.select(paneId);
			},
		}),
		[actions, panes, fullscreen.snapshot.paneId, pathFocused],
	);
	useStageEvents(fullscreen.stage, stageEvents);
	const activity = useActivity(panes.active.status.doing);
	const slots = useWorkbenchSlots(workbench.owners, reducedMotion, activity);
	const levels = useMemo(
		() =>
			[
				...new Set(catalog.listing.boards.flatMap((board) => board.identity.level ?? [])),
			].toSorted(),
		[catalog.listing],
	);
	return (
		<TooltipProvider>
			<Shell
				view={view}
				actions={actions}
				voiceControls={slots.voice}
				dockHeader={slots.header}
				dockBody={slots.body}
				dockActivity={slots.activity}
				attachStage={fullscreen.attachStage}
			/>
			<BoardDialogsHost
				dialogs={dialogs}
				boards={catalog.loading ? null : catalog.listing}
				levels={levels}
				elsewhere={panes.active.status.writtenElsewhere}
				library={library}
			/>
			<SettingsHosts
				surface={settings}
				owners={workbench.owners}
				notices={notices}
				onClose={closeSettings}
			/>
		</TooltipProvider>
	);
}

/**
 * The root component. The board cache is above everything that reads a board
 * resource, and is made once for the life of the tab (TASK-167).
 * @returns The shell inside its providers, with the dialogs and the workbench.
 */
function Application(): JSX.Element {
	return (
		<BoardCatalogProvider>
			<ApplicationBody />
		</BoardCatalogProvider>
	);
}

export { Application };
