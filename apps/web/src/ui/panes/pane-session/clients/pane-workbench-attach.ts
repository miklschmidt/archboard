// Attaching a pane's socket conversation to a freshly registered socket. Split
// from the pane core so the core stays about the model conversation; this is
// about the one socket generation the workbench rides.

import type {
	PaneSocketConnector,
	PaneSocketGeneration,
} from "#ui/panes/pane-session/clients/pane-socket.ts";
import type { PaneConversation } from "#ui/panes/pane-session/rules/session-contracts.ts";
import { attachWorkbenchAfterRegistration } from "#ui/panes/pane-session/clients/workbench-socket.ts";

/** What attaching needs from the pane. */
interface WorkbenchAttachment {
	readonly conversation: PaneConversation;
	readonly generation: PaneSocketGeneration;
	readonly connector: PaneSocketConnector;
	/** Whether the pane is still mounted. */
	readonly live: () => boolean;
	/** Say what the pane is once the workbench is attached, or failed to. */
	readonly publishStatus: () => void;
}

/**
 * Attach a pane's conversation once the server has registered the socket's pane.
 * @param attachment The conversation, the generation and the pane's liveness.
 */
function attachWorkbenchOwner(attachment: WorkbenchAttachment): void {
	const { conversation, generation, connector } = attachment;
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
	 * Attach the conversation to this generation's socket.
	 * @returns The generation's conversation, or null when superseded.
	 */
	function attach(): ReturnType<PaneConversation["attach"]> {
		return conversation.attach(generation.socket);
	}
	attachWorkbenchAfterRegistration({
		registration: generation.registration,
		isCurrent,
		attach,
	})
		.then(settled, settled)
		.catch(() => undefined);
}

export { attachWorkbenchOwner };
