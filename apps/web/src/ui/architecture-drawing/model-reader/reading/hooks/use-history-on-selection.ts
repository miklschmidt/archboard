import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/model/content";
import { modelHistoryQuery } from "#ui/architecture-drawing/model-reader/access/clients/history.ts";

/**
 * A selection of a bound module asks for the model's code history (ADR 0045), so About and Measures
 * find it. One answer holds every module, so a later selection asks nothing. An original under
 * migration has no history to read. The answer draws nothing here, because they read it themselves.
 * @param vault The addressed vault.
 * @param model The reading on show.
 * @param selected The selected identities.
 */
function useHistoryOnSelection(
	vault: string,
	model: Parameters<typeof modelHistoryQuery>[1] & Pick<Model, "modules" | "migrationPreview">,
	selected: ReadonlySet<string>,
): void {
	useQuery({
		...modelHistoryQuery(vault, model),
		enabled:
			model.migrationPreview === undefined &&
			model.modules.some((module) => selected.has(module.id) && module.binding !== undefined),
		notifyOnChangeProps: [],
	});
}

export { useHistoryOnSelection };
