import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/model/content";
import { architectureRecordQuery } from "#ui/clients/architecture-model/queries.ts";
import { stateCatalogue } from "#ui/rules/architecture-model/state-catalogue.ts";
import { stateTimeline, type StateTimeline } from "#ui/rules/architecture-model/state-timeline.ts";

/**
 * The model's states on their timeline. A live reading holds only the authored states, so the
 * page reads the record while it is open. The state on screen stands on it from the first paint.
 * A retained original has no record to read.
 * @param vault The addressed vault.
 * @param model The reading on screen.
 * @returns The timeline.
 */
function useStateTimeline(vault: string, model: Model): StateTimeline {
	const record = useQuery({
		...architectureRecordQuery(vault),
		enabled: model.migrationPreview === undefined,
	});
	const { selectedState } = model;
	return useMemo(() => {
		const states = stateCatalogue(record.data);
		const known = selectedState === null || states.some(({ id }) => id === selectedState.id);
		return stateTimeline(known ? states : [...states, selectedState]);
	}, [record.data, selectedState]);
}

export { useStateTimeline };
