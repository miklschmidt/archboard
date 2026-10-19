// The application root: the pane sessions, the listing, the notices, the
// workbench and the presentation composed over the shell. The sessions, the
// transport, the runtime and the controllers are the state; this file only
// connects them.

import { VaultDiagnostics } from "@/ui/vault-diagnostics";
import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";

import type { CodeTargetNotice } from "@archboard/code-binding/opening";
import { LiveBinding } from "@/ui/application/lib/live-binding";
import { livePanesOver } from "@/ui/application/lib/live-panes";
import { codeTargetShellNotice, infoNotice, presentationNotice } from "@/ui/application/notices";
import { OpenerSettings } from "@/ui/application/components/OpenerSettings";
import { paneEvents } from "@/ui/application/lib/pane-events";
import { heldBoards, recordFor, type PaneRecords } from "@/ui/application/pane-records";
import { createShellActions } from "@/ui/application/actions";
import { vaultOf } from "@/ui/application/lib/shell-actions";
import {
	addressingOver,
	announcingViews,
	openingPaneList,
} from "@/ui/application/lib/workspace-port";
import { assembleShellView } from "@/ui/application/shell-view";
import { applyTheme, initialTheme } from "@/ui/application/lib/theme";
import { usePaneReadings } from "@/ui/application/hooks/use-pane-reading";
import { usePaneViews } from "@/ui/application/hooks/use-pane-views";
import { useSubtitleOverlay } from "@/ui/application/hooks/use-subtitle-overlay";
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
import { useNarration } from "@/ui/application/hooks/use-narration";
import {
	recordedMedia,
	recordedPaneOf,
	usePageRecorder,
	useRecordedViews,
} from "@/ui/application/hooks/use-page-recording";
import { useAgentSurfaces, type AgentSurfaces } from "@/ui/application/hooks/use-agent-surfaces";
import { conversationActivation } from "@/ui/application/lib/shown-conversation";
import { useWorkbench, type Workbench } from "@/ui/application/hooks/use-workbench";
import { useWorkspaceAddressing } from "@/ui/application/hooks/use-workspace-addressing";
import { useBesideOpening } from "@/ui/application/hooks/use-beside-opening";
import {
	BoardCatalogProvider,
	boardsIn,
	listedBoard,
	listedBoardKey,
	useBoardCatalog,
	type BoardCatalog,
} from "@/ui/board-catalog";
import { useOpeningAddress, type WorkspaceAddressing } from "@/ui/board-routing";
import { TooltipProvider } from "@archboard/ui-kit/overlays";
import { boardAddressOf, boardKeyFor } from "@/ui/semantic-board-canvas";
import { servedVault } from "@archboard/server-requests";
import type { BoardListing } from "@/ui/types";
import { RecordingStage } from "@/ui/walkthrough-recording";
import { OrbStageProvider, VoiceSurfaceProvider } from "@archboard/workbench/voice";
import { AgentDockSlot, AgentPanelSlot } from "@/ui/application/components/AgentSurfaceSlots";
import { PresentationVoiceKey } from "@/ui/application/components/PresentationVoiceKey";
import type { AgentContext } from "@archboard/workbench/agent";
import {
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

/**
 * What the agent reads with the next message: the board in the focused pane,
 * by the name the vault lists it under, and the state shown when it is not
 * the one the board's name opens.
 * @param listing The listing of the focused pane's repository.
 * @param boardKey The focused pane's board key, or null.
 * @returns The context.
 */
function agentContextOf(listing: BoardListing, boardKey: string | null): AgentContext {
	const address = boardAddressOf(boardKey);
	if (address === null) return { board: null, state: null };
	const board = listedBoard(listing, address.board);
	if (board === undefined) return { board: address.board, state: address.variant ?? null };
	const key = listedBoardKey(listing, boardKey);
	const variant = board.variants.find((entry) => entry.key === key);
	return {
		board: board.name,
		state: variant === undefined || variant.id === board.opens ? null : variant.name,
	};
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
	/** The board the agent sees with the next message. */
	readonly context: AgentContext;
	readonly reducedMotion: boolean;
	/** Whether the agent dock is off screen, as while a pane is presented fullscreen. */
	readonly dockless: boolean;
}

/**
 * The agent's surfaces drawn: the dock, the panel for the shell to show while it is open, and the
 * voice key a presentation's bar carries. The dock and the panel read what changes
 * while the agent works themselves, so these elements are made again only when
 * the person acts.
 * @param sources The agent, the workbench, the context, the motion preference and whether the dock is off screen.
 * @returns The slots.
 */
function useAgentSlots(sources: AgentSlotSources): AgentSlots {
	const { agent, workbench, context, reducedMotion, dockless } = sources;
	return useMemo(
		() => ({
			dock: (
				<AgentDockSlot
					agent={agent}
					workbench={workbench}
					context={context}
					reducedMotion={reducedMotion}
					dockless={dockless}
				/>
			),
			panel: <AgentPanelSlot agent={agent} workbench={workbench} context={context} />,
			voiceControls: <PresentationVoiceKey />,
		}),
		[agent, workbench, context, reducedMotion, dockless],
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
	const { vault: activeVault, boardKey: activeKey } = panes.active.status;
	const context = useMemo(
		() => agentContextOf(boardsIn(catalog, activeVault), activeKey),
		[catalog, activeVault, activeKey],
	);
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
	const slots = useAgentSlots({ agent, workbench, context, reducedMotion, dockless });
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
			<TooltipProvider>
				<RecordingStage>{recordedPane}</RecordingStage>
			</TooltipProvider>
		);
	}
	return (
		<OrbStageProvider>
			{/* The voice box over a pane reads the voice and its actions where it is drawn. */}
			<VoiceSurfaceProvider voice={agent.voice} actions={agent.actions}>
				<TooltipProvider>
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
				</TooltipProvider>
			</VoiceSurfaceProvider>
		</OrbStageProvider>
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
