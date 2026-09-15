// The application root: the pane sessions, the listing, the notices, the
// workbench and the presentation composed over the shell. The sessions, the
// transport, the runtime and the controllers are the state; this file only
// connects them.

import { VaultDiagnostics, useVaultPolicyRefresh } from "@/ui/vault-diagnostics";
import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";

import type { CodeTargetNotice } from "@/shared/code-target";
import { LiveBinding } from "@/ui/application/lib/live-binding";
import { AgentSettingsHost } from "@/ui/application/components/AgentSettingsHost";
import {
	codeTargetShellNotice,
	failureNotice,
	infoNotice,
	presentationNotice,
} from "@/ui/application/notices";
import { OpenerSettingsHost } from "@/ui/application/components/OpenerSettingsHost";
import { paneEvents } from "@/ui/application/lib/pane-events";
import { heldBoardKeys, recordFor } from "@/ui/application/pane-records";
import { createShellActions } from "@/ui/application/actions";
import {
	addressingOver,
	announcingViews,
	openingPaneList,
} from "@/ui/application/lib/workspace-port";
import { assembleShellView } from "@/ui/application/shell-view";
import { applyTheme, initialTheme } from "@/ui/application/lib/theme";
import { usePaneReadings } from "@/ui/application/hooks/use-pane-reading";
import { usePaneViews } from "@/ui/application/hooks/use-pane-views";
import { useReleasedBoards } from "@/ui/application/hooks/use-released-boards";
import {
	shellPresentationOf,
	useFullscreen,
	type Fullscreen,
} from "@/ui/application/hooks/use-fullscreen";
import { useNotices, type NoticeStack } from "@/ui/application/hooks/use-notices";
import { usePanes, type Panes } from "@/ui/application/hooks/use-panes";
import { useAgentActivity, type AgentActivity } from "@/ui/application/hooks/use-agent-activity";
import { useReducedMotion } from "@/ui/application/hooks/use-reduced-motion";
import { useStageEvents } from "@/ui/application/hooks/use-stage-events";
import { useWorkbench } from "@/ui/application/hooks/use-workbench";
import { useWorkspaceAddressing } from "@/ui/application/hooks/use-workspace-addressing";
import { PresentationVoiceControls } from "@/ui/application/components/PresentationVoiceControls";
import { WorkbenchDockBody } from "@/ui/application/components/WorkbenchDockBody";
import { WorkbenchDockHeader } from "@/ui/application/components/WorkbenchDockHeader";
import type { WorkbenchOwners } from "@/ui/application/lib/workbench-owners";
import type { DoingEntry } from "@/ui/types";
import { BoardCatalogProvider, useBoardCatalog, type BoardCatalog } from "@/ui/board-catalog";
import { useOpeningAddress, type WorkspaceAddressing } from "@/ui/board-routing";
import { TooltipProvider } from "@/ui/components/tooltip";
import { boardAddressOf, boardKeyFor } from "@/ui/semantic-board-canvas";
import {
	ActivityList,
	SETTINGS_TRIGGER_ID,
	Shell,
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
 * session column or, without a workbench, the dock's own column.
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
	/** The mounted pane per pane id. */
	readonly mounted: Readonly<Record<string, ReactNode>>;
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
	const { theme, panes, catalog, fullscreen, notices, activity, mounted } = sources;
	const presentedPaneId = fullscreen.snapshot.paneId;
	const presentedConnected =
		presentedPaneId !== null && recordFor(panes.records, presentedPaneId).status.connected;
	return useMemo(
		() =>
			assembleShellView({
				theme,
				list: panes.list,
				records: panes.records,
				panes: mounted,
				boards: catalog.listing,
				boardsError: catalog.error,
				boardsLoading: catalog.loading,
				presentation: shellPresentationOf(fullscreen.snapshot, presentedConnected),
				notices: notices.notices,
				agentActivity: activity.map,
			}),
		[
			theme,
			panes,
			mounted,
			catalog,
			fullscreen.snapshot,
			presentedConnected,
			notices.notices,
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
 * The root component's body, inside the providers it needs.
 * @returns The shell, the settings dialogs and the workbench.
 */
function ApplicationBody(): JSX.Element {
	useVaultPolicyRefresh();
	const [theme, setTheme] = useTheme();
	const reducedMotion = useReducedMotion();
	const notices = useNotices();
	const [settings, setSettings] = useState<SettingsSurface | null>(null);
	const closeSettings = useCallback((): void => setSettings(null), []);
	const openAgentSettings = useCallback((): void => setSettings("agent"), []);

	// The address the tab was opened on mounts the panes, so a restored
	// comparison has both panes in its first render rather than growing one.
	const opening = useOpeningAddress();
	const panes = usePanes(useCallback(() => openingPaneList(opening), [opening]));
	const paneReadings = usePaneReadings();
	const [addressBinding] = useState(() => new LiveBinding<WorkspaceAddressing>());
	const addressing = useMemo(() => addressingOver(addressBinding), [addressBinding]);
	// Choosing a way of reading a board is the person's own move, so it is
	// announced and the address bar keeps it.
	const readings = useMemo(
		() => announcingViews(paneReadings, addressing),
		[paneReadings, addressing],
	);
	const heldKeys = useMemo(
		() =>
			heldBoardKeys(
				panes.records,
				panes.list.panes.map((entry) => entry.paneId),
			),
		[panes.records, panes.list],
	);
	const catalog = useBoardCatalog();
	useReleasedBoards(heldKeys, catalog);
	const agentActivity = useAgentActivity();
	const workbench = useWorkbench(panes.handles, panes.list.activePaneId, openAgentSettings);
	const { raise } = notices;
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
	// The address bar over the panes the shell already owns: it writes down what
	// they show, and restores what a direct load or a Back/Forward asks for.
	useWorkspaceAddressing({ panes, notices, readings }, addressBinding);
	usePresentationTransfer(panes, fullscreen);
	// Bound each render, after the owners the events reach exist.
	panes.bindEvents(paneEvents({ notices, catalog, readings, workbench, activity: agentActivity }));

	const openSettings = useCallback(
		(surface: SettingsSurface): void => {
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
		[notices, workbench.owners],
	);
	const actions = useMemo<ShellActions>(
		() =>
			createShellActions({
				setTheme,
				addressing,
				panes,
				catalog,
				notices,
				fullscreen,
				openSettings,
			}),
		[setTheme, addressing, panes, catalog, notices, fullscreen, openSettings],
	);
	// Which variant of its board a pane shows is part of the board key, so
	// asking for another one is asking the shell to show a different board.
	const onVariantChange = useCallback(
		(paneId: string, variant: string | null): void => {
			const shown = recordFor(panes.records, paneId).status.boardKey;
			const address = boardAddressOf(shown);
			if (address !== null) {
				// This pane, not whichever has focus: the person chose a variant of
				// the board in front of them, and focus follows the pointer.
				actions.selectBoard(boardKeyFor(address.board, variant), paneId);
			}
		},
		[actions, panes.records],
	);
	const mounted = usePaneViews({ panes, theme, readings, reducedMotion, onVariantChange });
	const view = useShellView({
		theme,
		panes,
		catalog,
		mounted,
		fullscreen,
		notices,
		activity: agentActivity,
	});
	const stageEvents = useMemo(
		() => ({
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
		[actions, panes, fullscreen.snapshot.paneId],
	);
	useStageEvents(fullscreen.stage, stageEvents);
	const activity = useActivity(panes.active.status.doing);
	const slots = useWorkbenchSlots(workbench.owners, reducedMotion, activity);
	const diagnostics = useMemo(
		() => <VaultDiagnostics target={workbench.owners} chooseThread={openAgentSettings} />,
		[workbench.owners, openAgentSettings],
	);
	return (
		<TooltipProvider>
			<Shell
				view={view}
				actions={actions}
				diagnostics={diagnostics}
				voiceControls={slots.voice}
				dockHeader={slots.header}
				dockBody={slots.body}
				dockActivity={slots.activity}
				attachStage={fullscreen.attachStage}
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
 * @returns The shell inside its providers, with the workbench.
 */
function Application(): JSX.Element {
	return (
		<BoardCatalogProvider>
			<ApplicationBody />
		</BoardCatalogProvider>
	);
}

export { Application };
