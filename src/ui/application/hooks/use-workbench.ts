// The agent over the canvas's panes: each pane's current transport, heard
// through one publication per pane; the owners over the focused pane's
// transport, which is the pane a message speaks from; one agent setup for the
// whole canvas, so a message waiting on sign-in survives the person clicking
// the other pane; and the voice session, which stays with the pane voice was
// started from until it ends, because its media belongs to that pane's socket.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createAgentSetup, type AgentSetup } from "@/ui/agent-setup";
import { createFocusedTransport } from "@/ui/application/lib/focused-transport";
import type { PaneHandles } from "@/ui/application/lib/pane-handles";
import {
	agentSetupPorts,
	createWorkbenchOwners,
	type WorkbenchOwners,
} from "@/ui/application/lib/workbench-owners";
import {
	createWorkbenchTransportPublication,
	type WorkbenchTransportPublication,
} from "@/ui/pane-session/workbench-publication";
import { createVoiceSession, type VoiceSession } from "@/ui/voice-session";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** The transports by pane id; null while a pane has none. */
type PaneTransports = Readonly<Record<string, BrowserWorkbenchTransport | null>>;

/** The voice session, the pane it runs for, and that pane's transport. */
interface VoiceOwner {
	readonly paneId: string;
	readonly session: VoiceSession;
	readonly transport: BrowserWorkbenchTransport;
}

/** The agent's state and the moves the panes drive. */
interface WorkbenchHost {
	/** The owners over the focused pane's transport, or null while it has none. */
	readonly owners: WorkbenchOwners | null;
	/** The canvas-wide agent setup. */
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
	const publications = useRef(new Map<string, WorkbenchTransportPublication<BrowserWorkbenchTransport>>());
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
	const paneReported = useCallback((paneId: string): void => publicationFor(paneId).reconcile(), [publicationFor]);
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
 * The owners over one pane's transport, composed in an effect: the voice and
 * approvals adapters subscribe on creation, so a set that never mounted must
 * never be created.
 * @param paneId The pane.
 * @param transport Its transport, or null.
 * @returns The owners, or null.
 */
function usePaneOwners(paneId: string, transport: BrowserWorkbenchTransport | null): WorkbenchOwners | null {
	const [owners, setOwners] = useState<WorkbenchOwners | null>(null);
	useEffect(() => {
		if (transport === null) {
			setOwners(null);
			return undefined;
		}
		const created = createWorkbenchOwners({ paneId, transport });
		setOwners(created);
		return () => setOwners((current) => (current === created ? null : current));
	}, [paneId, transport]);
	return owners;
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
	const [voice, setVoice] = useState<VoiceOwner | null>(null);
	useEffect(() => {
		if (transport === null) {
			setVoice(null);
			return undefined;
		}
		const session = createVoiceSession({ realtime: handles.media(paneId), transport, paneId });
		const created = { paneId, session, transport };
		setVoice(created);
		return () => {
			session.dispose();
			setVoice((current) => (current === created ? null : current));
		};
	}, [handles, paneId, transport]);
	return voice;
}

/**
 * The agent over the canvas's panes.
 * @param handles The pane sessions.
 * @param activePaneId The focused pane.
 * @returns The owners, the setup, the voice and the moves.
 */
function useWorkbench(handles: PaneHandles, activePaneId: string): WorkbenchHost {
	const { transports, paneReported, paneGone } = usePaneTransports(handles);
	const transport = transports[activePaneId] ?? null;
	const owners = usePaneOwners(activePaneId, transport);
	const [voicePane, setVoicePane] = useState<string | null>(null);
	const voicePaneId = voicePane ?? activePaneId;
	const voice = useVoiceOwner(handles, voicePaneId, transports[voicePaneId] ?? null);

	// The setup outlives focus: its ports read whatever is current when a step is taken.
	const current = useRef<{ owners: WorkbenchOwners | null; voice: VoiceOwner | null }>({ owners, voice });
	useEffect(() => {
		current.current = { owners, voice };
	}, [owners, voice]);
	const [focused] = useState(createFocusedTransport);
	useEffect(() => focused.retarget(transport), [focused, transport]);
	const [setup] = useState(() =>
		createAgentSetup(
			agentSetupPorts(
				focused,
				() => current.current.owners,
				async (walkthrough) => {
					const running = current.current.voice;
					if (running === null) throw new Error("No pane can carry voice yet.");
					setVoicePane(running.paneId);
					const view = await running.session.start(walkthrough === null ? null : { walkthrough });
					if (view.failure !== null) throw new Error(view.failure.message);
				},
			),
		),
	);
	useEffect(() => setup.connect(), [setup]);
	const releaseVoice = useCallback(() => setVoicePane(null), []);

	return useMemo(
		() => ({ owners, setup, voice, releaseVoice, paneReported, paneGone }),
		[owners, setup, voice, releaseVoice, paneReported, paneGone],
	);
}

export { useWorkbench, type VoiceOwner, type WorkbenchHost };
