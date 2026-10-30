import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { projectModel, type Model } from "@archboard/board/content";
import { useModelComparison } from "#ui/hooks/architecture-model/use-model-comparison.ts";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { projectFlow } from "#ui/rules/architecture-model/flow-reading.ts";
import { importedReadings } from "#ui/rules/architecture-model/imported-readings.ts";
import { drawableGrammar } from "#ui/rules/architecture-model/scene.ts";

/**
 * The destination the address asks for, as one request.
 * @param vault The reading vault.
 * @param paneId The pane that owns the address.
 * @param model The coherent model.
 * @param settled Whether the model answers this address.
 * @returns The location, the comparison, the structural projection and the request.
 */
function useModelReading(vault: string, paneId: string, model: Model, settled: boolean) {
	const comparison = useModelComparison(vault, model);
	const { reference } = comparison;
	const bookmark = importedReadings(model)?.bookmark?.reading;
	const location = useModelLocation(paneId, bookmark);
	const { scope, focus, filters, grammar, flow, subject, state, checkpoint, against } = location;
	const visibility = bookmark?.visibility;
	const structure = useMemo(
		() => projectModel(model, scope, focus, filters, reference, visibility),
		[model, scope, focus, filters, reference, visibility],
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
		() => ({ scope, focus, filters, grammar, flow, subject, state, checkpoint, against }),
		[scope, focus, filters, grammar, flow, subject, state, checkpoint, against],
	);
	const request = useMemo(
		() => ({
			model,
			projection,
			reading,
			grammar: drawableGrammar(grammar, projection),
			settled,
			entry,
		}),
		[model, projection, reading, grammar, settled, entry],
	);
	return { location, comparison, structure, request };
}

export { useModelReading };
