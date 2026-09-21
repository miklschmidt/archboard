// Which pane and which coordinator turn a voice tool call belongs to: host facts, never arguments.

import type { LogicalToolCallCorrelation } from "@/shared/codex-workbench-identity";
import type { CodexWorkbenchComponents } from "@/server/canvas/lib/codex-workbench";

/**
 * The pane the voice session is linked through: the ready workhorse link's, never one a model named.
 * @param created What the graph has built so far.
 * @returns The pane id, or null while no workhorse is ready.
 */
function voiceLinkedPaneId(created: Partial<CodexWorkbenchComponents>): string | null {
	const workhorse = created.workhorse?.snapshot();
	return workhorse?.state === "ready" ? (workhorse.paneId ?? null) : null;
}

/**
 * The coordinator turn the call in flight was made in, so "next step" means one step per turn.
 * @param owners The generation's owners.
 * @param owners.currentCoordinatorCall The coordinator call in flight, when one is.
 * @returns The turn id, or null when no call is in flight.
 */
function coordinatorTurnId(owners: {
	readonly currentCoordinatorCall: LogicalToolCallCorrelation | null;
}): string | null {
	return owners.currentCoordinatorCall?.turnId ?? null;
}

export { coordinatorTurnId, voiceLinkedPaneId };
