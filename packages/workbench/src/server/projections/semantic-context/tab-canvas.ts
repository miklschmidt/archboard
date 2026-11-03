// What one browser tab's canvas holds now, as its voice and coordinator are told about it
// (TASK-293): the models its panes show, and the model a narration in one of them is on.

import type { CoordinatorCallbackCanvas } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import { paneKeyOf, panes } from "#server/services/panes/registry.ts";
import { aggregateKey } from "#server/projections/semantic-context/architecture-context.ts";
import { semanticPaneContextFor } from "#server/services/panes/context.ts";
import { tabSessionOf } from "#server/services/panes/tab-sessions.ts";
import { narratedModelOf } from "#server/projections/semantic-context/walkthrough-narration.ts";
import type { TabSessionId } from "@archboard/codex-realtime-voice/server";

/**
 * Read the actual model address from the pane's captured report.
 * @param clientId The reporting socket identity.
 * @returns The canonical key or retained opaque presentation address.
 */
function reportedKey(clientId: string): string | null {
	const report = semanticPaneContextFor(clientId);
	if (report === null) return null;
	if (report.architecture != null) return `model:${report.architecture.model}`;
	return report.model?.name ?? null;
}
/**
 * What one tab's canvas holds now, read at the moment it is asked: a pane moves, and leaving a
 * walkthrough ends its narration. A pane is on two models for a moment: the one the server last
 * pointed it at, which a show changes before the pane says so, and the one the pane last said it
 * reads, which a drill-down changes without the server.
 * @param tabSessionId The tab.
 * @returns The models its panes show and the narrated one, each by aggregate key.
 */
function canvasOf(tabSessionId: TabSessionId): CoordinatorCallbackCanvas {
	const models = [...panes.values()].flatMap((pane) => {
		if (tabSessionOf(pane.clientId) !== tabSessionId) {
			return [];
		}
		const said = reportedKey(pane.clientId);
		return [paneKeyOf(pane), said].flatMap((model) =>
			model === null ? [] : [aggregateKey(model)],
		);
	});
	return { models, narrated: narratedModelOf(tabSessionId) };
}

export { canvasOf };
