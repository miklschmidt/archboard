import { ModelArrivalContext } from "#ui/state/board-routing/model-arrival.ts";
// The application root: the pane sessions, the listing, the notices, the
// workbench and the presentation composed over the shell. The sessions, the
// transport, the runtime and the controllers are the state; this file only
// connects them.

import { VaultDiagnostics } from "#ui/components/vault-diagnostics/VaultDiagnostics.tsx";
import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";

import type { CodeTargetNotice } from "@archboard/code-opener/opening";
import { LiveBinding } from "#ui/state/application/live-binding.ts";
import { livePanesOver } from "#ui/rules/application/live-panes.ts";
import {
	codeTargetShellNotice,
	infoNotice,
	presentationNotice,
} from "#ui/rules/application/notices.ts";
import { OpenerSettings } from "@archboard/code-opener/opener-settings";
import { paneEvents } from "#ui/rules/application/pane-events.ts";
import { heldBoards, recordFor, type PaneRecords } from "#ui/rules/application/pane-records.ts";
import { createShellActions, vaultOf } from "#ui/clients/application/shell-actions.ts";
import {
	addressingOver,
	announcingViews,
	openingPaneList,
} from "#ui/clients/application/workspace-port.ts";
import { assembleShellView } from "#ui/rules/application/shell-view.ts";
import { applyTheme, initialTheme } from "#ui/clients/application/theme.ts";
import { usePaneReadings } from "#ui/hooks/application/use-pane-reading.ts";
import { usePaneViews } from "#ui/hooks/application/use-pane-views.ts";
import { useSubtitleOverlay } from "#ui/hooks/application/use-subtitle-overlay.ts";
import { useReleasedBoards } from "#ui/hooks/application/use-released-boards.ts";
import {
	shellPresentationOf,
	useFullscreen,
	type Fullscreen,
} from "#ui/hooks/application/use-fullscreen.ts";
import { useNotices, type NoticeStack } from "#ui/hooks/application/use-notices.ts";
import { usePanes, type Panes } from "#ui/hooks/application/use-panes.ts";
import { useAgentActivity, type AgentActivity } from "#ui/hooks/application/use-agent-activity.ts";
import { useReducedMotion } from "#ui/hooks/application/use-reduced-motion.ts";
import { useStageEvents } from "#ui/hooks/application/use-stage-events.ts";
import { useNarration } from "#ui/hooks/application/use-narration.ts";
import {
	recordedMedia,
	recordedPaneOf,
	usePageRecorder,
	useRecordedViews,
} from "#ui/hooks/application/use-page-recording.ts";
import { useAgentSurfaces, type AgentSurfaces } from "#ui/hooks/application/use-agent-surfaces.ts";
import { conversationActivation } from "#ui/clients/application/shown-conversation.ts";
import { useWorkbench, type Workbench } from "#ui/hooks/application/use-workbench.ts";
import { useWorkspaceAddressing } from "#ui/hooks/application/use-workspace-addressing.ts";
import { useBesideOpening } from "#ui/hooks/application/use-beside-opening.ts";
import { BoardCatalogProvider } from "#ui/components/board-catalog/BoardCatalogProvider.tsx";
import { useBoardCatalog, type BoardCatalog } from "#ui/hooks/board-catalog/use-board-catalog.ts";
import { useOpeningAddress } from "#ui/hooks/board-routing/use-opening-address.ts";
import { type WorkspaceAddressing } from "#ui/hooks/board-routing/use-workspace-address.ts";
import { Tooltip } from "@archboard/ui-kit/components";
import { boardAddressOf, boardKeyFor } from "#ui/rules/semantic-board-canvas/board/address.ts";
import { servedVault } from "@archboard/server-requests";
import { RecordingStage } from "#ui/components/walkthrough-recording/RecordingStage.tsx";
import { OrbStageProvider, VoiceSurfaceProvider } from "@archboard/workbench/voice";
import { AgentDockSlot, AgentPanelSlot } from "#ui/components/application/AgentSurfaceSlots.tsx";
import { PresentationVoiceKey } from "#ui/components/application/PresentationVoiceKey.tsx";
import { SETTINGS_TRIGGER_ID } from "#ui/components/shell/BrandBar.tsx";
import { Shell } from "#ui/components/shell/Shell.tsx";
import {
	type SettingsSurface,
	type ShellActions,
	type ShellView,
	type ThemeChoice,
} from "#ui/rules/shell/contracts.ts";

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

/** The agent's surfaces as the shell places them. */
interface AgentSlots {
	readonly dock: ReactNode;
	readonly panel: ReactNode;
	readonly voiceControls: ReactNode;
}

/** What the agent's surfaces are drawn from. */
interface AgentSlotSources {
	readonly agent: AgentSurfaces;
	readonly workbench: Workbench;
	readonly reducedMotion: boolean;
	/** Whether the agent dock is off screen, as while a pane is presented fullscreen. */
	readonly dockless: boolean;
}

/**
 * The agent's surfaces drawn: the dock, the panel for the shell to show while it is open, and the
 * voice key a presentation's bar carries. The dock and the panel read what changes
 * while the agent works themselves, so these elements are made again only when
 * the person acts.
 * @param sources The agent, the workbench, the motion preference and whether the dock is off screen.
 * @returns The slots.
 */
function useAgentSlots(sources: AgentSlotSources): AgentSlots {
	const { agent, workbench, reducedMotion, dockless } = sources;
	return useMemo(
		() => ({
			dock: (
				<AgentDockSlot
					agent={agent}
					workbench={workbench}
					reducedMotion={reducedMotion}
					dockless={dockless}
				/>
			),
			panel: <AgentPanelSlot agent={agent} workbench={workbench} />,
			voiceControls: <PresentationVoiceKey />,
		}),
		[agent, workbench, reducedMotion, dockless],
	);
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
				catalog,
				presentation: shellPresentationOf(fullscreen.snapshot, presentedConnected),
				notices: notices.notices,
				agentActivity: activity.byVault,
			}),
		[
			theme,
			panes,
			mounted,
			catalog,
			fullscreen.snapshot,
			presentedConnected,
			notices.notices,
			activity.byVault,
		],
	);
}

/** Inputs for the settings dialog. */
interface SettingsHostsProps {
	surface: SettingsSurface | null;
	notices: NoticeStack;
	onClose: () => void;
}

/**
 * The settings dialog: where the server opens code.
 * @param props The open surface, the notices and the close.
 * @returns The open dialog, or nothing.
 */
function SettingsHosts(props: SettingsHostsProps): JSX.Element | null {
	const { surface, notices, onClose } = props;
	const onSuccess = useCallback(
		(message: string): void =>
			notices.raise(infoNotice("opener-settings", "Opener settings", message)),
		[notices],
	);
	const onFailure = useCallback(
		(notice: CodeTargetNotice): void => notices.raise(codeTargetShellNotice(notice)),
		[notices],
	);
	if (surface !== "opener") return null;
	return (
		<OpenerSettings
			onSuccess={onSuccess}
			onFailure={onFailure}
			onClose={onClose}
			finalFocus={settingsTrigger}
		/>
	);
}

/**
 * The vault each repository is read from, for the address bar; null until the
 * page has read the repositories, so a restore waits for them.
 * @param catalog The catalog.
 * @returns The lookup, or null.
 */
function useVaultOf(catalog: BoardCatalog): ((repository: string) => string | null) | null {
	const { repositories, loading } = catalog;
	return useMemo(
		() =>
			loading ? null : (repository: string): string | null => vaultOf({ repositories }, repository),
		[repositories, loading],
	);
}

/**
 * The root component's body, inside the providers it needs.
 * @returns The shell, the settings dialogs and the workbench.
 */
function ApplicationBody(): JSX.Element {
	const [theme, setTheme] = useTheme();
	const reducedMotion = useReducedMotion();
	const notices = useNotices();
	const [settings, setSettings] = useState<SettingsSurface | null>(null);
	const closeSettings = useCallback((): void => setSettings(null), []);

	// The address the tab was opened on mounts the panes, so a restored
	// comparison has both panes in its first render rather than growing one.
	const opening = useOpeningAddress();
	const recorder = usePageRecorder(opening);
	const panes = usePanes(
		useCallback(() => openingPaneList(opening), [opening]),
		recordedMedia(recorder),
	);
	const paneReadings = usePaneReadings();
	const [addressBinding] = useState(() => new LiveBinding<WorkspaceAddressing>());
	const addressing = useMemo(() => addressingOver(addressBinding), [addressBinding]);
	// Choosing a way of reading a board is the person's own move, so it is
	// announced and the address bar keeps it.
	const readings = useMemo(
		() => announcingViews(paneReadings, addressing),
		[paneReadings, addressing],
	);
	const held = useMemo(
		() =>
			heldBoards(
				panes.records,
				panes.list.panes.map((entry) => entry.paneId),
			),
		[panes.records, panes.list],
	);
	const catalog = useBoardCatalog();
	useReleasedBoards(held, catalog);
	const agentActivity = useAgentActivity();
	const workbench = useWorkbench(panes.handles, panes.list.activePaneId);
	const { vault: activeVault } = panes.active.status;
	// The actions read the panes as they are when somebody acts, so a pane's news
	// does not make them, and every control holding one, again.
	const [panesNow] = useState(() => new LiveBinding<Panes>());
	panesNow.bind(panes);
	const [livePanes] = useState(() => livePanesOver(panesNow));
	const [activate] = useState(() => conversationActivation(() => livePanes.records));
	const showConversation = useCallback(
		(checkout: string): void => {
			void activate(livePanes.active.status.paneId, { checkout });
		},
		[activate, livePanes],
	);
	const agent = useAgentSurfaces(workbench, showConversation);
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
	// The agent dock is off screen while a pane is presented fullscreen.
	const dockless = fullscreen.snapshot.paneId !== null;
	const slots = useAgentSlots({ agent, workbench, reducedMotion, dockless });
	// The address bar over the panes the shell already owns: it writes down what
	// they show, and restores what a direct load or a Back/Forward asks for.
	const repositoryVaults = useVaultOf(catalog);
	useWorkspaceAddressing({ panes, notices, readings, vaultOf: repositoryVaults }, addressBinding);
	usePresentationTransfer(panes, fullscreen);
	// Bound each render, after the owners the events reach exist.
	panes.bindEvents(paneEvents({ notices, catalog, readings, workbench, activity: agentActivity }));

	const openSettings = useCallback((surface: SettingsSurface): void => setSettings(surface), []);
	const composed = useMemo(
		() =>
			createShellActions({
				setTheme,
				addressing,
				panes: livePanes,
				catalog,
				notices,
				fullscreen,
				openSettings,
				activate,
			}),
		[setTheme, addressing, livePanes, catalog, notices, fullscreen, openSettings, activate],
	);
	const openBeside = useBesideOpening(panes, livePanes, composed);
	const actions = useMemo<ShellActions>(
		() => ({ ...composed, openBeside }),
		[composed, openBeside],
	);
	// Which variant of its board a pane shows is part of the board key, so
	// asking for another one is asking the shell to show a different board. It
	// reads the records and the actions when it is asked, so one identity serves
	// every render: a pane's news changes both, and a pane must not be rebuilt for it.
	const [variantSources] = useState(
		() => new LiveBinding<{ readonly records: PaneRecords; readonly actions: ShellActions }>(),
	);
	variantSources.bind({ records: panes.records, actions });
	const onVariantChange = useCallback(
		(paneId: string, variant: string | null): void => {
			const { records, actions: shell } = variantSources.read();
			const address = boardAddressOf(recordFor(records, paneId).status.boardKey);
			if (address !== null) {
				// This pane, not whichever has focus: the person chose a variant of
				// the board in front of them, and focus follows the pointer.
				void shell.selectBoard(boardKeyFor(address.board, variant), paneId);
			}
		},
		[variantSources],
	);
	// The actions are read when somebody acts, so the panes are not made again
	// each time they are: a pane is offered one function for as long as it lives.
	const [actionsNow] = useState(() => new LiveBinding<ShellActions>());
	actionsNow.bind(actions);
	const selectBoard = useCallback(
		(key: string, paneId: string, repository?: string): Promise<boolean> =>
			actionsNow.read().selectBoard(key, paneId, repository),
		[actionsNow],
	);
	const selectPane = useCallback(
		(paneId: string): void => actionsNow.read().selectPane(paneId),
		[actionsNow],
	);
	const narration = useNarration(workbench, agent.voice, panes.list.activePaneId, selectPane);
	const overlay = useSubtitleOverlay({
		workbench,
		activePaneId: panes.list.activePaneId,
		reducedMotion,
		recording: recorder !== null,
		presentedPaneId: fullscreen.snapshot.paneId,
	});
	const recorded = useRecordedViews(recorder, workbench, { narration, overlay });
	const mounted = usePaneViews({
		panes,
		theme,
		readings,
		reducedMotion,
		onVariantChange,
		openBoard: selectBoard,
		...recorded,
	});
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
				// Focusing another pane is the person's act, so the dock follows its checkout.
				if (panes.select(paneId)) void activate(paneId);
			},
		}),
		[actions, panes, activate, fullscreen.snapshot.paneId],
	);
	useStageEvents(fullscreen.stage, stageEvents);
	const transport = workbench.owners?.transport ?? null;
	// The bell speaks for the repository in front of the person.
	const diagnosed = activeVault ?? servedVault();
	const { ask } = agent;
	// A repair goes to the workhorse of the repository diagnosed, so its checkout is shown first.
	// The server tells the workbench socket of the switch before it answers, but that answer can
	// arrive first. A read on the socket comes after the news, so the repair is composed for the
	// conversation shown now, not refused because the workbench moved under it.
	const askAboutDiagnosed = useCallback(
		(text: string): void => {
			void activate(livePanes.active.status.paneId)
				.then(() => transport?.refresh())
				.catch(() => undefined)
				.then(() => ask(text));
		},
		[activate, livePanes, ask, transport],
	);
	const diagnostics = useMemo(
		() => <VaultDiagnostics vault={diagnosed} transport={transport} ask={askAboutDiagnosed} />,
		[diagnosed, transport, askAboutDiagnosed],
	);

	const recordedPane = recordedPaneOf(recorded.recording, panes.list, mounted);
	if (recordedPane !== null) {
		return (
			<Tooltip.Provider>
				<RecordingStage>{recordedPane}</RecordingStage>
			</Tooltip.Provider>
		);
	}
	return (
		<ModelArrivalContext value={addressing.modelArriving}>
			<OrbStageProvider>
				{/* The voice box over a pane reads the voice and its actions where it is drawn. */}
				<VoiceSurfaceProvider voice={agent.voice} actions={agent.actions}>
					<Tooltip.Provider>
						<Shell
							view={view}
							actions={actions}
							diagnostics={diagnostics}
							voiceControls={slots.voiceControls}
							agentDock={slots.dock}
							agentPanel={slots.panel}
							agentPanelOpen={agent.panel.open}
							onAgentPanelClose={agent.panel.closePanel}
							attachStage={fullscreen.attachStage}
						/>
						<SettingsHosts surface={settings} notices={notices} onClose={closeSettings} />
					</Tooltip.Provider>
				</VoiceSurfaceProvider>
			</OrbStageProvider>
		</ModelArrivalContext>
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
