// The agent over the server's panes: each pane's current transport, heard
// through one publication per pane; the owners over the focused pane's
// transport, which is the pane a message speaks from; one agent setup for the
// whole server, so a message waiting on sign-in survives the person clicking
// the other pane; and the voice session, which stays with the pane voice was
// started from until it ends, because its media belongs to that pane's socket.
// Voice is kept on a pane only once a start succeeded, and let go when that
// session ends in any way or its pane goes.

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type Dispatch,
	type SetStateAction,
} from "react";

import { createAgentSetup, type AgentSetup } from "@archboard/workbench/agent";
import { createAgentFocus } from "#ui/state/application/agent-focus.ts";
import { createVoiceStore } from "#ui/state/application/voice-store.ts";
import type { PaneHandles } from "#ui/state/application/pane-handles.ts";
import {
	agentSetupPorts,
	releaseWhenVoiceEnds,
} from "#ui/clients/application/agent-setup-ports.ts";
import {
	createWorkbenchOwners,
	type VoiceOwner,
	type WorkbenchOwners,
} from "#ui/state/application/workbench-owners.ts";
import {
	createWorkbenchTransportPublication,
	type WorkbenchTransportPublication,
} from "#ui/state/pane-session/workbench-publication.ts";
import type { BrowserWorkbenchTransport } from "@archboard/agent-workbench/browser";

/** The transports by pane id; null while a pane has none. */
type PaneTransports = Readonly<Record<string, BrowserWorkbenchTransport | null>>;

/** The agent's state and the moves the panes drive. */
interface Workbench {
	/** The owners over the focused pane's transport, or null while it has none. */
	readonly owners: WorkbenchOwners | null;
	/** The server-wide agent setup. */
	readonly setup: AgentSetup;
	/** The voice session, or null while its pane has no transport. */
	readonly voice: VoiceOwner | null;
	/** Voice ended: let it follow the focused pane again. */
	readonly releaseVoice: () => void;
	/** A pane published its status: re-read its transport. */
	readonly paneReported: (paneId: string) => void;
	/** A pane went: forget its transport. */
	readonly paneGone: (paneId: string) => void;
}

/**
 * Each pane's transport, as the panes publish them.
 * @param handles The pane sessions.
 * @returns The transports and the moves that re-read them.
 */
function usePaneTransports(handles: PaneHandles): {
	readonly transports: PaneTransports;
	readonly paneReported: (paneId: string) => void;
	readonly paneGone: (paneId: string) => void;
} {
	const [transports, setTransports] = useState<PaneTransports>({});
	const publications = useRef(
		new Map<string, WorkbenchTransportPublication<BrowserWorkbenchTransport>>(),
	);
	const publicationFor = useCallback(
		(paneId: string): WorkbenchTransportPublication<BrowserWorkbenchTransport> => {
			const existing = publications.current.get(paneId);
			if (existing !== undefined) return existing;
			const created = createWorkbenchTransportPublication<BrowserWorkbenchTransport>({
				/**
				 * The transport the pane's socket owner holds now.
				 * @returns The transport, or null.
				 */
				current: () => handles.session(paneId)?.workbenchTransport() ?? null,
				listener: {
					/**
					 * The pane's transport changed.
					 * @param transport The transport, or null.
					 */
					publish: (transport) => {
						setTransports((current) => ({ ...current, [paneId]: transport }));
					},
				},
			});
			publications.current.set(paneId, created);
			return created;
		},
		[handles],
	);
	const paneReported = useCallback(
		(paneId: string): void => publicationFor(paneId).reconcile(),
		[publicationFor],
	);
	const paneGone = useCallback((paneId: string): void => {
		publications.current.get(paneId)?.dispose();
		publications.current.delete(paneId);
		setTransports((current) => {
			const { [paneId]: gone, ...rest } = current;
			return gone === undefined ? current : rest;
		});
	}, []);
	return { transports, paneReported, paneGone };
}

/**
 * The voice session for the pane voice runs for.
 * @param handles The pane sessions.
 * @param paneId The pane.
 * @param transport Its transport, or null.
 * @returns The voice owner, or null.
 */
function useVoiceOwner(
	handles: PaneHandles,
	paneId: string,
	transport: BrowserWorkbenchTransport | null,
): VoiceOwner | null {
	const [store] = useState(createVoiceStore);
	useEffect(() => {
		if (transport === null) return undefined;
		return store.follow({ paneId, transport, realtime: handles.media(paneId) });
	}, [store, handles, paneId, transport]);
	return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** What letting voice's pane go reads and moves. */
interface VoiceRelease {
	readonly voice: VoiceOwner | null;
	/** The pane voice is kept on, or null while it follows focus. */
	readonly voicePane: string | null;
	readonly setVoicePane: Dispatch<SetStateAction<string | null>>;
	/** Forget a pane's transport. */
	readonly forgetPane: (paneId: string) => void;
}

/**
 * Let voice's pane go once its session ends in any way, or once the pane goes.
 * @param inputs The voice, its pane and the moves.
 * @returns Release voice now, and forget a pane that went.
 */
function useVoiceRelease(inputs: VoiceRelease): {
	readonly releaseVoice: () => void;
	readonly paneGone: (paneId: string) => void;
} {
	const { voice, voicePane, setVoicePane, forgetPane } = inputs;
	const releaseVoice = useCallback(() => setVoicePane(null), [setVoicePane]);
	const pinnedSession = voicePane !== null && voice?.paneId === voicePane ? voice.session : null;
	useEffect(
		() => (pinnedSession === null ? undefined : releaseWhenVoiceEnds(pinnedSession, releaseVoice)),
		[pinnedSession, releaseVoice],
	);
	const paneGone = useCallback(
		(paneId: string): void => {
			setVoicePane((pinned) => (pinned === paneId ? null : pinned));
			forgetPane(paneId);
		},
		[setVoicePane, forgetPane],
	);
	return { releaseVoice, paneGone };
}

/**
 * The agent over the server's panes.
 * @param handles The pane sessions.
 * @param activePaneId The focused pane.
 * @returns The owners, the setup, the voice and the moves.
 */
function useWorkbench(handles: PaneHandles, activePaneId: string): Workbench {
	const { transports, paneReported, paneGone: forgetPane } = usePaneTransports(handles);
	const transport = transports[activePaneId] ?? null;
	// The controllers listen only while somebody does, so composing them is pure.
	const owners = useMemo(
		() => (transport === null ? null : createWorkbenchOwners({ paneId: activePaneId, transport })),
		[activePaneId, transport],
	);
	const [voicePane, setVoicePane] = useState<string | null>(null);
	const voicePaneId = voicePane ?? activePaneId;
	const voice = useVoiceOwner(handles, voicePaneId, transports[voicePaneId] ?? null);

	// The setup outlives focus: its ports read whatever is focused when a step is taken.
	const [focus] = useState(createAgentFocus);
	useEffect(() => focus.retarget(owners, voice), [focus, owners, voice]);
	const [setup] = useState(() => createAgentSetup(agentSetupPorts(focus, setVoicePane)));
	useEffect(() => setup.connect(), [setup]);
	const { releaseVoice, paneGone } = useVoiceRelease({
		voice,
		voicePane,
		setVoicePane,
		forgetPane,
	});

	return useMemo(
		() => ({ owners, setup, voice, releaseVoice, paneReported, paneGone }),
		[owners, setup, voice, releaseVoice, paneReported, paneGone],
	);
}

export { useWorkbench, type Workbench };
