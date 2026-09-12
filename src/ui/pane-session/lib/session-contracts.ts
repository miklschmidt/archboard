// The contract between the shell and one pane's session: what the shell tells
// a pane, and what it hears back. Kept apart from the implementation so the
// application and the pane core agree on one shape without importing each
// other's internals.

import type { CodeTargetNotice } from "@/shared/code-target";
import type { PaneReading } from "@/ui/pane-session/lib/pane-reading";
import type {
	AgentActivityEntry,
	BoardIdentity,
	DoingEntry,
	LockHolder,
	PaneStatus,
} from "@/ui/types";
import type { WorkbenchTransportPort } from "@/ui/pane-session/workbench-port";
import type { PaneWorkbenchSocketOwner } from "@/ui/pane-session/workbench-socket";

/** Which palette the pane draws in. */
type PaneTheme = "light" | "dark";

/**
 * The holder a pane assumes before the server has said anything.
 *
 * Not a claim and not nobody: a pane that has not been told does not read the
 * board as free (ADR 0016). It disappears the moment the first `board_lock`
 * arrives, which the server sends immediately behind the board.
 */
const UNKNOWN_HOLDER: LockHolder = Object.freeze({
	id: "",
	kind: "agent",
	since: "",
	until: "",
	process: "",
});

/** Whether a take-back released the claim it was aimed at. */
interface TakeBackResult {
	outcome: "success" | "failure";
}

/** What the shell tells one pane, and what it wants to hear back. */
interface PaneSessionOptions<Transport extends WorkbenchTransportPort> {
	paneId: string;
	/** The first pane in reading order: the one that speaks for the tab. */
	primary: boolean;
	/** The pane the person last touched. */
	focused: boolean;
	theme: PaneTheme;
	/**
	 * The pane said what it is.
	 * @param status The pane's status.
	 */
	onStatus: (status: PaneStatus) => void;
	/**
	 * Who is writing this pane's board, or null when nobody is.
	 * @param paneId The pane.
	 * @param boardKey The board it is showing.
	 * @param holder The holder, or null.
	 */
	onHolder?: (paneId: string, boardKey: string | null, holder: LockHolder | null) => void;
	/**
	 * The server asked the shell for another pane, or for this one to go.
	 * @param request Which way the layout should move.
	 */
	onLayoutRequest?: (request: "open" | "close") => void;
	/** The server accepted this pane's report, so the pane inventory has moved. */
	onPaneStateAccepted?: () => void;
	/**
	 * This pane's socket came back after a drop, so anything cached from this
	 * server while it was down may be stale (TASK-167).
	 * @param paneId The pane.
	 */
	onPaneReconnected?: (paneId: string) => void;
	/**
	 * This pane's socket has actually closed, so the server has dropped it.
	 * @param paneId The pane.
	 */
	onPaneRetired?: (paneId: string) => void;
	/**
	 * The board could not be shown.
	 * @param error What the server said, in words a person can act on.
	 */
	onBoardError?: (error: string) => void;
	/**
	 * This tab is running a bundle the canvas no longer serves (TASK-056).
	 * @param message What the server said about it.
	 */
	onStaleFrontend?: (message: string) => void;
	/**
	 * Opening a file for a node's binding failed, or needs a decision.
	 * @param notice The notice, with whatever it offers.
	 */
	onCodeTargetNotice?: (notice: CodeTargetNotice) => void;
	/**
	 * Which boards an agent is working on, across this whole server (ADR 0022).
	 * @param activity The snapshot.
	 */
	onAgentActivity?: (activity: readonly AgentActivityEntry[]) => void;
	/**
	 * The board the server says this pane is showing, which is how a pane learns
	 * that `browser show` moved it.
	 * @param paneId The pane.
	 * @param boardKey The board key.
	 */
	onBoardAdopted?: (paneId: string, boardKey: string) => void;
	/** The workbench sockets this pane carries, when the shell gives it one. */
	createWorkbenchSockets?: () => PaneWorkbenchSocketOwner<Transport>;
}

/** One pane's session, as the shell holds it. */
interface PaneSession<Transport extends WorkbenchTransportPort> {
	/** The pane's identity to the server. */
	readonly clientId: string;
	/**
	 * Attach the element the pane fills, so its place on the display is measured.
	 * @param element The element, or null when it goes.
	 * @returns Detaches it.
	 */
	readonly attachPaneElement: (element: HTMLElement | null) => void;
	/**
	 * The board the server pointed this pane at, or null before it pointed it
	 * anywhere.
	 *
	 * Where the pane was opened, not what it is showing: following a link down
	 * puts another board on screen, and the viewer keeps this one so it can
	 * offer the way back out. Everything about which board this pane HOLDS —
	 * its lock, the code a subject opens, what an agent is told, the address,
	 * what `browser panes` says — is the status's `boardKey`, which the pane
	 * reports from what is actually drawn.
	 */
	readonly openedKey: string | null;
	readonly board: BoardIdentity | null;
	readonly connected: boolean;
	/** Who holds the board, or null when nobody does. */
	readonly heldBy: LockHolder | null;
	readonly doing: readonly DoingEntry[];
	/** Release an agent's claim on this pane's board (ADR 0022). */
	readonly takeBack: () => Promise<TakeBackResult>;
	/**
	 * Open the file a node's binding names, in the person's editor.
	 *
	 * The browser sends the board and the subject and nothing else: the binding,
	 * the checkout registry and the opener are all the server's, and a browser
	 * that read a local path would be a second owner of where code lives.
	 * @param subjectId The semantic id whose binding to open.
	 */
	readonly openCode: (subjectId: string) => void;
	/**
	 * What the person is reading in this pane changed: which board, which
	 * variant, which named view, and what they picked out.
	 *
	 * Reading, never writing. It reaches the server so that an agent asked to
	 * change something can be told what the person is looking at (ADR 0023).
	 * @param reading The board, variant, view and selection.
	 */
	readonly readingChanged: (reading: PaneReading) => void;
	/**
	 * The transport retained by the current socket generation, or null.
	 * @returns The transport.
	 */
	readonly workbenchTransport: () => Transport | null;
}

export {
	UNKNOWN_HOLDER,
	type PaneSession,
	type PaneSessionOptions,
	type PaneTheme,
	type TakeBackResult,
};
