// What one pane's core reads from React, and what it offers back. Types only,
// kept beside the core rather than inside it so the wiring stays readable.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";

import type { CanvasSessionOptions, TakeBackResult } from "@/ui/canvas/lib/session-contracts";
import type { SceneProjection } from "@/ui/canvas/lib/scene-projection";
import type { WorkbenchTransportPort } from "@/ui/canvas/workbench-port";
import type { CanvasWorkbenchSocketOwner } from "@/ui/canvas/workbench-socket";
import type { BoardIdentity, DoingEntry, LockHolder } from "@/ui/types";

/** What the core reads from React and writes back to it. */
interface PaneCoreHost<Transport extends WorkbenchTransportPort> {
	readonly paneId: string;
	readonly clientId: string;
	/** The latest options, so a changed callback is heard without re-wiring. */
	readonly options: () => CanvasSessionOptions<Transport>;
	readonly api: () => ExcalidrawImperativeAPI | null;
	readonly paneElement: () => HTMLElement | null;
	readonly workbenchSockets: CanvasWorkbenchSocketOwner<Transport> | null;
	readonly setConnected: (connected: boolean) => void;
	readonly setBoard: (board: BoardIdentity | null) => void;
	readonly setBoardKey: (key: string | null) => void;
	readonly setHeldBy: (holder: LockHolder | null) => void;
	readonly setDoing: (entries: DoingEntry[]) => void;
}

/** The core's surface for the hook. */
interface PaneCore<Transport extends WorkbenchTransportPort> {
	readonly projection: SceneProjection;
	readonly connect: () => void;
	readonly publishStatus: () => void;
	/** The pane's facets the server hears about changed: report again. */
	readonly facetsChanged: () => void;
	readonly paneElementChanged: () => void;
	readonly takeBack: () => Promise<TakeBackResult>;
	readonly handleChange: (elements: readonly ExcalidrawElement[], appState: AppState) => void;
	readonly handleLibraryChange: (items: LibraryItems) => void;
	readonly applyLibrary: (items: LibraryItems) => void;
	readonly markInteracted: () => void;
	readonly flushWithBeacon: () => void;
	/** Whether the person's edits have not all reached the server yet. */
	readonly pendingEdits: () => boolean;
	readonly workbenchTransport: () => Transport | null;
	readonly dispose: () => void;
}

export type { PaneCore, PaneCoreHost };
