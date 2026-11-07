import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { projectModel, type Model } from "@archboard/model/content";
import { useModelComparison } from "#ui/architecture-drawing/model-reader/hooks/use-model-comparison.ts";
import { useModelLocation } from "#ui/panes/reading-routing/hooks/use-model-location.ts";
import { projectFlow } from "#ui/architecture-drawing/model-reader/rules/flow-reading.ts";
import { importedReadings } from "#ui/architecture-drawing/model-reader/rules/imported-readings.ts";
import { drawableGrammar, isNarrowed } from "#ui/architecture-drawing/model-reader/rules/scene.ts";

/**
 * The destination the address asks for, as one request.
 * @param vault The reading vault.
 * @param paneId The pane that owns the address.
 * @param model The coherent model.
 * @param settled Whether the model answers this address.
 * @param failed Whether the read of this address failed, so that the model only stands in.
 * @returns The location, the comparison, the structural projection, the request, and the
 * way out of a reading that narrows its scope.
 */
function useModelReading(
	vault: string,
	paneId: string,
	model: Model,
	settled: boolean,
	failed?: boolean,
) {
	const comparison = useModelComparison(vault, model);
	const { reference } = comparison;
	const bookmark = importedReadings(model)?.bookmark?.reading;
	const location = useModelLocation(paneId, bookmark);
	const { scope, focus, expand, filters, grammar, flow, subject, state, checkpoint, against } =
		location;
	const visibility = bookmark?.visibility;
	const structure = useMemo(
		() =>
			projectModel(
				model,
				scope,
				focus,
				{ ...filters, expand, controls: true },
				reference,
				visibility,
			),
		[model, scope, focus, expand, filters, reference, visibility],
	);
	const projection = useMemo(() => {
		const selectedFlow = structure.depicted.flows.find((entry) => entry.id === flow);
		return grammar === "architecture" || selectedFlow === undefined
			? structure
			: projectFlow(structure, selectedFlow);
	}, [structure, grammar, flow]);
	const entry = useRouterState({
		/**
		 * The history entry names the reading a reader can come back to.
		 * @param router The router state.
		 * @returns The history entry's key.
		 */
		select: (router) => {
			const { __TSR_key: key } = router.location.state;
			return key;
		},
	});
	const reading = useMemo(
		() => ({ scope, focus, expand, filters, grammar, flow, subject, state, checkpoint, against }),
		[scope, focus, expand, filters, grammar, flow, subject, state, checkpoint, against],
	);
	const request = useMemo(
		() => ({
			model,
			projection,
			reading,
			grammar: drawableGrammar(grammar, projection),
			settled,
			failed,
			entry,
		}),
		[model, projection, reading, grammar, settled, failed, entry],
	);
	const narrowed = isNarrowed(reading) || visibility !== undefined;
	const onWholeScope = narrowed ? location.showWholeScope : undefined;
	return { location, comparison, structure, request, onWholeScope };
}

export { useModelReading };
