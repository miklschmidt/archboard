import { ArchitecturePaneReadingSchema } from "@archboard/model/pane-context";
import { comparisonIntent } from "#ui/rules/architecture-model/comparison-intent.ts";
import type { ModelAddress } from "#ui/panes/reading-routing/rules/address.ts";

/**
 * Translate portable URL intent into the shared pane navigation contract.
 * @param address The complete requested reading.
 * @returns The validated request without dropping bookmarks or retained selectors.
 */
function modelReading(address: ModelAddress) {
	const { id, subject, scope, checkpoint, against, ...reading } = address;
	return ArchitecturePaneReadingSchema.parse({
		...reading,
		...comparisonIntent(against ?? null),
		model: id,
		module: subject,
		scope: scope ?? undefined,
		checkpoint: checkpoint ?? undefined,
	});
}

export { modelReading };
