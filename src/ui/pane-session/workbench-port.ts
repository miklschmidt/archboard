// What the canvas needs from a workbench transport, and nothing more.
//
// A pane owns the one socket to the canvas server. The text and voice
// workbench ride that socket through a transport the canvas does not implement:
// `src/ui/workbench-transport` implements `WorkbenchTransportPort`, and
// `src/ui/codex-workbench-media` implements `WorkbenchMediaPort`. The canvas
// only attaches a transport generation to its socket after the server has
// registered the pane, retires it when the socket goes, and hands the current
// transport to whoever asks. It never reads a workbench message itself.

/** The socket a pane opens to the canvas server, as a transport sees it. */
interface PaneSocket extends EventTarget {
	readonly readyState: number;
	readonly send: (data: string) => void;
}

/**
 * The connection facts every transport state carries; the canvas reads no
 * more. `stream` is the workbench transport's stale-snapshot state, carried so
 * the production transport satisfies this port without an adapter.
 */
interface WorkbenchTransportState {
	readonly kind: "connection" | "readiness" | "stream";
	readonly state: string;
	readonly connection: "connected" | "reconnecting" | "stopped";
	readonly snapshot: unknown;
	readonly sequence: number | null;
	readonly reason?: string;
}

/** The state the canvas itself reports when no transport is attached. */
interface WorkbenchStoppedState extends WorkbenchTransportState {
	readonly kind: "connection";
	readonly state: "stopped";
	readonly connection: "stopped";
	readonly snapshot: null;
	readonly sequence: null;
	readonly reason: string;
}

/** One transport generation over one pane socket. */
interface WorkbenchTransportPort {
	readonly attach: (socket: PaneSocket) => Promise<WorkbenchTransportState>;
	readonly state: () => WorkbenchTransportState;
	readonly dispose: () => Promise<void>;
}

/** The media owner that follows each transport generation. */
interface WorkbenchMediaPort<Transport extends WorkbenchTransportPort> {
	readonly attach: (transport: Transport) => Promise<unknown>;
	readonly detach: (transport: Transport) => Promise<void>;
	readonly dispose: () => Promise<void>;
}

/**
 * The state reported while no transport is attached.
 * @param reason Why there is none.
 * @returns A stopped state.
 */
function stoppedState(reason: string): WorkbenchStoppedState {
	return Object.freeze({
		kind: "connection",
		state: "stopped",
		connection: "stopped",
		snapshot: null,
		sequence: null,
		reason,
	});
}

export {
	type PaneSocket,
	type WorkbenchMediaPort,
	type WorkbenchStoppedState,
	type WorkbenchTransportPort,
	type WorkbenchTransportState,
	stoppedState,
};
