// The typed inputs and outputs of one canvas session: what a pane is told,
// and what it reports.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
	AppState,
	ExcalidrawImperativeAPI,
	ExcalidrawProps,
	LibraryItems,
} from "@excalidraw/excalidraw/types";

import type { CodeTargetNotice } from "@/shared/code-target";
import type { CanvasWorkbenchSocketOwner } from "@/ui/canvas/workbench-socket";
import type { WorkbenchTransportPort } from "@/ui/canvas/workbench-port";
import type { MountedBoardPreviewController } from "@/ui/board-preview";
import type { PathFocusOverlay, PathFocusSnapshot } from "@/ui/path-focus";
import type { SelectionProjection } from "@/ui/selection-inspector";
import type {
	AgentActivityEntry,
	BoardIdentity,
	DoingEntry,
	EditWithdrawalReason,
	LockHolder,
	PaneStatus,
} from "@/ui/types";

/**
 * The holder a pane assumes before it has been told who has the board.
 *
 * Not a real holder and never printed as one: it is how "I do not know" is
 * spelled in the field that says who has the board, so nothing reads the
 * board as free before the server has said so. It is not a claim, so it does
 * not make the pane read-only; it is replaced by the truth one message later,
 * or by nothing if the board is free.
 */
const UNKNOWN_HOLDER: LockHolder = Object.freeze({
	id: "",
	kind: "agent",
	since: "",
	until: "",
	process: "",
	reason: "not yet known",
});

/**
 * Messages that say what is on a board, as opposed to messages about the
 * board. A pane that must send a full report ignores the first kind and acts
 * on the second (TASK-079).
 */
const CONTENT_MESSAGES: ReadonlySet<string> = new Set([
	"initial_elements",
	"element_created",
	"element_updated",
	"element_deleted",
	"elements_batch_created",
	"elements_changed",
	"canvas_cleared",
	"files_added",
	"files_replaced",
]);

/** How taking a board back ended. */
type TakeBackResult = { readonly outcome: "success" } | { readonly outcome: "failure" };

/** The selection of one pane, with the board it was taken on. */
interface PaneSelectionSnapshot {
	readonly boardKey: string | null;
	readonly projection: SelectionProjection;
}

/** The path focus of one pane, with the board it was taken on. */
interface PanePathFocusSnapshot {
	readonly boardKey: string | null;
	readonly snapshot: PathFocusSnapshot;
}

/** The theme Excalidraw renders in. */
type CanvasTheme = "light" | "dark";

/** What the shell tells a session, and what it wants to hear back. */
interface CanvasSessionOptions<Transport extends WorkbenchTransportPort> {
	paneId: string;
	/**
	 * Is this the pane the server picks when a request names no pane? Reported,
	 * and used for the one message that is about the browser rather than a
	 * pane: a library change, which every pane hears and only one forwards.
	 */
	primary: boolean;
	/** Is this the pane the human last touched? Reported, not enforced. */
	focused: boolean;
	/** The theme the shell chose; Excalidraw is told, and its own menu is heard. */
	theme: CanvasTheme;
	onStatus: (status: PaneStatus) => void;
	/** Who holds this pane's board changed, or the board did (ADR 0016). */
	onHolder?: (paneId: string, boardKey: string | null, holder: LockHolder | null) => void;
	/** Another tab changed the stencil palette; the shell owns the library. */
	onLibraryChanged?: (items: LibraryItems) => void;
	/** This pane's Excalidraw changed the palette; the shell persists it. */
	onLibraryChange?: (items: LibraryItems) => void;
	/** The server asks for another pane, or for this one to go. */
	onLayoutRequest?: (paneId: string, request: "open" | "close") => void;
	/** The server accepted a changed authoritative pane report. */
	onPaneStateAccepted?: () => void;
	/**
	 * This pane's socket came back after being lost. Said once per reconnection
	 * and never for the first connection: what it means is that this tab was
	 * out of earshot for a while, so anything it caches about the server may
	 * have moved without it hearing.
	 */
	onPaneReconnected?: (paneId: string) => void;
	/** A board note could not be rendered and none of it entered Excalidraw. */
	onBoardError?: (error: string) => void;
	/** An element's board link could not be followed. */
	onBoardLinkError?: (error: string) => void;
	/**
	 * This tab runs a bundle the canvas no longer serves (TASK-056). Said once
	 * per build, at the pane's own pulse, rather than discovered by a command
	 * timing out on a tab that cannot answer it.
	 */
	onStaleFrontend?: (message: string) => void;
	/** Excalidraw's own menu changed the theme. */
	onThemeChange?: (theme: CanvasTheme) => void;
	/** The selection, projected for the inspector; published only when it changes. */
	onSelection?: (paneId: string, snapshot: PaneSelectionSnapshot) => void;
	/** Path focus, published only when it changes. */
	onPathFocus?: (paneId: string, snapshot: PanePathFocusSnapshot) => void;
	/** Where the focused elements are on the stage, or null while focus is off. */
	onPathFocusOverlay?: (paneId: string, overlay: PathFocusOverlay | null) => void;
	/** A code target could not be opened. */
	onCodeTargetNotice?: (notice: CodeTargetNotice) => void;
	/**
	 * Which boards an agent is working on, across this whole server (ADR 0022).
	 * A whole snapshot each time; every pane's socket hears it, and the shell
	 * replaces its map, so hearing it twice changes nothing.
	 */
	onAgentActivity?: (activity: readonly AgentActivityEntry[]) => void;
	/**
	 * The person's unwritten edit on this pane was withdrawn and the board now
	 * shows the note's state (ADR 0022).
	 */
	onEditsWithdrawn?: (
		paneId: string,
		boardKey: string | null,
		reason: EditWithdrawalReason,
	) => void;
	/**
	 * How the workbench rides this pane's socket. Called once; the session
	 * attaches the owner after pane registration and disposes it on unmount.
	 * Absent, the pane carries no workbench.
	 */
	createWorkbenchSockets?: () => CanvasWorkbenchSocketOwner<Transport>;
}

/** What the person's canvas reports, and what the shell can ask of it. */
interface CanvasSession<Transport extends WorkbenchTransportPort> {
	/** The pane's identity to the server. */
	clientId: string;
	attachExcalidraw: (api: ExcalidrawImperativeAPI) => void;
	/**
	 * The element the canvas fills. Watched for resize, because splitting the
	 * shell halves a pane without anything on the canvas changing.
	 */
	attachPaneElement: (element: HTMLElement | null) => void;
	/** Exact identity used for board-scoped requests from this pane. */
	boardKey: string | null;
	board: BoardIdentity | null;
	connected: boolean;
	/**
	 * Whether the canvas takes content edits (ADR 0022). A pane whose board an
	 * agent claims is read-only while the claim stands: pan, zoom and selection
	 * keep working, and a content gesture does not revoke the claim; `takeBack`
	 * is the one control that releases it. A pane out of contact with the
	 * server for longer than one reconnect attempt is read-only too, since
	 * nothing it shows can be settled. Otherwise the canvas is editable, on
	 * mount and through a socket blip alike, and every edit is optimistic:
	 * written with the note version the pane last saw, refused and withdrawn
	 * when the note has moved since or the server could not be reached.
	 */
	readOnly: boolean;
	/** Who holds the board when it is not this pane, or null. */
	heldBy: LockHolder | null;
	/** The last few things an agent said it was doing here, oldest first (TASK-095). */
	doing: DoingEntry[];
	/** Excalidraw's onChange. */
	handleChange: (elements: readonly ExcalidrawElement[], appState: AppState) => void;
	/** Excalidraw's onLibraryChange. */
	handleLibraryChange: (items: LibraryItems) => void;
	/** Push the shell's palette into this pane's Excalidraw, once per content hash. */
	applyLibrary: (items: LibraryItems) => void;
	markInteracted: () => void;
	/** Release an agent's claim on this pane's board; nothing is undone (ADR 0016, ADR 0022). */
	takeBack: () => Promise<TakeBackResult>;
	/** Dim everything not connected to the selected element. */
	focusPath: () => void;
	exitPathFocus: () => void;
	/** Clear the selection, which closes the inspector; presentation only. */
	clearSelection: () => void;
	/** Open the selected element's code target. */
	openCode: (elementId: string) => void;
	/** Excalidraw's onLinkOpen, for board and code links. */
	handleLinkOpen: NonNullable<ExcalidrawProps["onLinkOpen"]>;
	previewController: MountedBoardPreviewController;
	/** The transport retained by the current canvas socket generation. */
	workbenchTransport: () => Transport | null;
}

export {
	CONTENT_MESSAGES,
	UNKNOWN_HOLDER,
	type CanvasSession,
	type CanvasSessionOptions,
	type CanvasTheme,
	type PanePathFocusSnapshot,
	type PaneSelectionSnapshot,
	type TakeBackResult,
};
