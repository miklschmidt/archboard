import { comparisonIntent } from "#ui/architecture-drawing/model-reader/rules/comparison-intent.ts";
import type { ModelAddress } from "#ui/panes/reading-routing/rules/address.ts";
import { parseDocument } from "@archboard/model-contract";

/**
 * Translate portable URL intent into the shared pane navigation contract.
 * @param address The complete requested reading.
 * @returns The validated request without dropping bookmarks or retained selectors.
 */
function modelReading(address: ModelAddress) {
	const { id, subject, scope, checkpoint, against, ...reading } = address;
	const parsed = parseDocument("paneReading", {
		...reading,
		...comparisonIntent(against ?? null),
		model: id,
		module: subject,
		scope: scope ?? undefined,
		checkpoint: checkpoint ?? undefined,
	});
	if (!parsed.success) throw parsed.error;
	return parsed.data;
}

export { modelReading };
