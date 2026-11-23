// News about the machine rather than one vault goes to every tab (ADR 0050).

import type { WebSocketMessage } from "@archboard/server-lifecycle/pane-messages";
import { sendToEveryClient } from "@archboard/workbench/panes";

/**
 * Broadcast something to every admitted client of every vault: a vault's account
 * of agent work, which names its vault (ADR 0022). The repositories reach a tab
 * over its architecture feed instead (ADR 0050).
 * @param message The keyless message.
 */
function broadcastEverywhere(message: WebSocketMessage): void {
	sendToEveryClient(JSON.stringify(message));
}

export { broadcastEverywhere };
