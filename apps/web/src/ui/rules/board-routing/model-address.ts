import { ArchitecturePaneReadingSchema } from "@archboard/board/pane-context";
import type { ModelAddress } from "#ui/rules/board-routing/address.ts";

/**
 * Translate portable URL intent into the shared pane navigation contract.
 * @param address The complete requested reading.
 * @returns The validated request without dropping bookmarks or retained selectors.
 */
function modelReading(address: ModelAddress) {
	const { id, subject, scope, checkpoint, ...reading } = address;
	return ArchitecturePaneReadingSchema.parse({
		...reading,
		model: id,
		module: subject,
		scope: scope ?? undefined,
		checkpoint: checkpoint ?? undefined,
	});
}

export { modelReading };
