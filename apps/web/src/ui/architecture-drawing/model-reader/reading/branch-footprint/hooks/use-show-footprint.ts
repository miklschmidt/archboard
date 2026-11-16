import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { architectureModelQuery } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import type { Reader } from "#ui/architecture-drawing/model-reader/hooks/use-reader.ts";
import {
	showList,
	type FootprintShow,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/show-on-picture.ts";

/**
 * Show a list of a footprint on its picture: read the model that the footprint read, open the
 * nearest shared parent of the list's modules there, and select what the picture draws of them.
 * The selection is the ordinary one, which the pane keeps while the reading loads.
 * @param reader The reader.
 * @returns Show one list.
 */
function useShowFootprint(reader: Pick<Reader, "vault" | "location" | "selection">) {
	const client = useQueryClient();
	const { vault, location, selection } = reader;
	const { openReading } = location;
	const { selectMany } = selection;
	return useCallback(
		async (target: FootprintShow): Promise<void> => {
			const { ref, state } = target;
			const model = await client
				.fetchQuery(architectureModelQuery(vault, null, { ref, state }))
				.catch(() => undefined);
			const shown = showList(model?.modules ?? [], target.modules);
			openReading({ ref, state, scope: shown.scope });
			selectMany(shown.selected);
		},
		[client, vault, openReading, selectMany],
	);
}

export { useShowFootprint };
