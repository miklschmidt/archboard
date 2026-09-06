// The application root: the sessions, the listing, the dialogs, the notices,
// the workbench and the presentation composed over the shell. The sessions,
// the transport, the runtime and the controllers are the state; this file
// only connects them.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CodeTargetNotice } from "@/shared/code-target";
import { LiveBinding } from "@/ui/application/lib/live-binding";
import { AgentSettingsHost } from "@/ui/application/lib/agent-settings-host";
import { ApplicationPane } from "@/ui/application/lib/application-pane";
import { BoardDialogsHost } from "@/ui/application/lib/dialogs";
import {
	codeTargetShellNotice,
	failureNotice,
	infoNotice,
	noteNotices,
	presentationNotice,
} from "@/ui/application/notices";
import { OpenerSettingsHost } from "@/ui/application/lib/opener-settings-host";
import { openPendingRecovery, paneEvents } from "@/ui/application/lib/pane-events";
import { heldBoardKeys, recordFor } from "@/ui/application/pane-records";
import { createShellActions } from "@/ui/application/lib/shell-actions";
import { assembleShellView } from "@/ui/application/shell-view";
import { applyTheme, initialTheme } from "@/ui/application/lib/theme";
import { useBoardDialogs } from "@/ui/application/lib/use-board-dialogs";
import { useBoardPlaceholders } from "@/ui/application/lib/use-board-placeholders";
import { useBoards, type Boards } from "@/ui/application/lib/use-boards";
import {
	shellPresentationOf,
	useFullscreen,
	type Fullscreen,
} from "@/ui/application/lib/use-fullscreen";
import { useNotices, type NoticeStack } from "@/ui/application/lib/use-notices";
import { usePanes, type Panes } from "@/ui/application/lib/use-panes";
import { useAgentActivity, type AgentActivity } from "@/ui/application/lib/use-agent-activity";
import { useReducedMotion } from "@/ui/application/lib/use-reduced-motion";
import { useStageEvents, type EscapeOrigin } from "@/ui/application/lib/use-stage-events";
import { useWorkbench } from "@/ui/application/lib/use-workbench";
import {
	PresentationVoiceControls,
	WorkbenchDockBody,
	WorkbenchDockHeader,
} from "@/ui/application/lib/workbench-frame";
import type { WorkbenchOwners } from "@/ui/application/lib/workbench-owners";
import type { DoingEntry } from "@/ui/types";
import { useLibrary, type LibraryController } from "@/ui/board-library";
import { TooltipProvider } from "@/ui/components/tooltip";
import {
	ActivityList,
	SETTINGS_TRIGGER_ID,
	Shell,
	recentDoing,
	type SettingsSurface,
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
function useCanvases(panes: Panes, theme: ThemeChoice): Readonly<Record<string, React.ReactNode>> {
	const { list, host, handles } = panes;
	return useMemo(() => {
		const canvases: Record<string, React.ReactNode> = {};
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
	header: React.ReactNode;
	body: React.ReactNode;
	voice: React.ReactNode;
	/** The active pane's recent `doing` lines, or null when nobody said anything. */
	activity: React.ReactNode;
}

/**
 * The active pane's recent activity, rendered once for the workbench's
 * session column or, without a workbench, the dock's own column.
 * @param doing Every `doing` line the active pane holds.
 * @returns The list, or null when there is nothing to show.
 */
function useActivity(doing: readonly DoingEntry[]): React.ReactNode {
	const recent = useMemo(() => recentDoing(doing), [doing]);
	return useMemo(() => (recent.length === 0 ? null : <ActivityList entries={recent} />), [recent]);
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
	activity: React.ReactNode,
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
	readonly boards: Boards;
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
	const { theme, panes, boards, fullscreen, notices, activity } = sources;
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
				boards: boards.listing,
				boardsError: boards.error,
				previews: boards.previews,
				presentation: shellPresentationOf(fullscreen.snapshot, presentedConnected),
				notices: allNotices,
				agentActivity: activity.map,
			}),
		[
			theme,
			panes,
			canvases,
			boards,
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
function SettingsHosts(props: SettingsHostsProps): React.JSX.Element | null {
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
 * The root component.
 * @returns The shell inside its providers, with the dialogs and the workbench.
 */
function Application(): React.JSX.Element {
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

	const panes = usePanes();
	const heldKeys = useMemo(
		() =>
			heldBoardKeys(
				panes.records,
				panes.list.panes.map((entry) => entry.paneId),
			),
		[panes.records, panes.list],
	);
	const boards = useBoards(panes.handles, heldKeys);
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
			 * A dialog's command finished.
			 * @param message Words for the notice, when there are any.
			 */
			onDone: (message: string | null): void => {
				if (message !== null) {
					raise(infoNotice("board-command", "Board", message));
				}
				boards.refresh();
			},
			onClosePane: panes.close,
			/** A dialog closed; a note state that waited for it gets its dialog now. */
			onClosed: (): void => {
				afterDialogClose.read()();
			},
		}),
		[raise, boards, panes.close, afterDialogClose],
	);
	const dialogs = useBoardDialogs(dialogEvents);
	usePresentationTransfer(panes, fullscreen);
	usePresentationFocusReturn(fullscreen.snapshot.paneId);
	useBoardPlaceholders(panes);
	useLibrarySync(panes, library);
	// Bound each render, after the owners the events reach exist.
	panes.bindEvents(
		paneEvents({
			notices,
			library,
			boards,
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
			createShellActions({ setTheme, panes, boards, dialogs, notices, fullscreen, openSettings }),
		[setTheme, panes, boards, dialogs, notices, fullscreen, openSettings],
	);
	const view = useShellView({ theme, panes, boards, fullscreen, notices, activity: agentActivity });
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
			[...new Set(boards.listing.boards.flatMap((board) => board.identity.level ?? []))].toSorted(),
		[boards.listing],
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
				boards={boards.listing.vault === "" ? null : boards.listing}
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

export { Application };
