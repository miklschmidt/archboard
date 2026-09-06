// Attaching a pane's workbench owner to a freshly registered socket. Split
// from the pane core so the core stays about the board conversation; this is
// about the one socket generation the workbench rides.

import type { PaneSocketConnector, PaneSocketGeneration } from "@/ui/canvas/lib/pane-socket";
import type { WorkbenchTransportPort } from "@/ui/canvas/workbench-port";
import {
	attachCanvasWorkbenchAfterRegistration,
	type CanvasWorkbenchSocketOwner,
} from "@/ui/canvas/workbench-socket";

/** What attaching needs from the pane. */
interface WorkbenchAttachment<Transport extends WorkbenchTransportPort> {
	readonly sockets: CanvasWorkbenchSocketOwner<Transport>;
	readonly generation: PaneSocketGeneration;
	readonly connector: PaneSocketConnector;
	/** Whether the pane is still mounted. */
	readonly live: () => boolean;
	/** Say what the pane is once the workbench is attached, or failed to. */
	readonly publishStatus: () => void;
}

/**
 * Attach a workbench owner once the server has registered the socket's pane.
 * @param attachment The owner, the generation and the pane's liveness.
 */
function attachWorkbenchOwner<Transport extends WorkbenchTransportPort>(
	attachment: WorkbenchAttachment<Transport>,
): void {
	const { sockets, generation, connector } = attachment;
	/**
	 * Whether this generation is still the pane's socket.
	 * @returns True while nothing has replaced it.
	 */
	function isCurrent(): boolean {
		return (
			attachment.live() &&
			connector.isCurrent(generation) &&
			connector.registration() === generation.registration
		);
	}
	/** Say what the pane is once the workbench is attached, or failed to. */
	function settled(): void {
		if (isCurrent()) {
			attachment.publishStatus();
		}
	}
	/**
	 * Attach the owner to this generation's socket.
	 * @returns The transport state once attached.
	 */
	function attach(): ReturnType<typeof sockets.attach> {
		return sockets.attach(generation.socket);
	}
	attachCanvasWorkbenchAfterRegistration({
		registration: generation.registration,
		isCurrent,
		attach,
	})
		.then(settled, settled)
		.catch(() => undefined);
}

export { attachWorkbenchOwner, type WorkbenchAttachment };
