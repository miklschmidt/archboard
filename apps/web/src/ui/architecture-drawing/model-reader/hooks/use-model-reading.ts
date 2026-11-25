import { useEffect, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { projectModel, type Model } from "@archboard/model/content";
import { useModelComparison } from "#ui/architecture-drawing/model-reader/hooks/use-model-comparison.ts";
import { useModelLocation } from "#ui/panes/reading-routing/hooks/use-model-location.ts";
import { projectFlow } from "#ui/architecture-drawing/model-reader/rules/flow-reading.ts";
import { importedReadings } from "#ui/architecture-drawing/model-reader/rules/imported-readings.ts";
import { drawableGrammar, isNarrowed } from "#ui/architecture-drawing/model-reader/rules/scene.ts";
import type { ActiveEphemeralFlow } from "#ui/architecture-drawing/model-reader/hooks/use-model-arrival.ts";

/**
 * The destination the address asks for, as one request.
 * @param vault The reading vault.
 * @param paneId The pane that owns the address.
 * @param model The coherent model.
 * @param settled Whether the model answers this address.
 * @param failed Whether the read of this address failed, so that the model only stands in.
 * @param ephemeralFlow Optional unsaved temporary flow active in this pane session.
 * @param onClearEphemeralFlow Dismisses the temporary flow when the user navigates away.
 * @returns The location, the comparison, the structural projection, the request, and the
 * way out of a reading that narrows its scope.
 */
function useModelReading(
	vault: string,
	paneId: string,
	model: Model,
	settled: boolean,
	failed?: boolean,
	ephemeralFlow?: ActiveEphemeralFlow | null,
	onClearEphemeralFlow?: () => void,
) {
	const comparison = useModelComparison(vault, model);
	const { reference } = comparison;
	const bookmark = importedReadings(model)?.bookmark?.reading;
	const location = useModelLocation(paneId, bookmark);
	const { scope, focus, expand, filters, grammar, flow, subject, state, checkpoint, against, ref } =
		location;
	const locationKey = JSON.stringify([
		scope,
		focus,
		expand,
		filters,
		grammar,
		flow,
		state,
		checkpoint,
		against,
		ref,
	]);
	const [anchored, setAnchored] = useState<{
		readonly ephemeral: ActiveEphemeralFlow | null;
		readonly locationKey: string;
	}>({ ephemeral: ephemeralFlow ?? null, locationKey });
	if (anchored.ephemeral !== (ephemeralFlow ?? null)) {
		setAnchored({ ephemeral: ephemeralFlow ?? null, locationKey });
	}
	const movedAway = ephemeralFlow != null && anchored.locationKey !== locationKey;
	useEffect(() => {
		if (movedAway) onClearEphemeralFlow?.();
	}, [movedAway, onClearEphemeralFlow]);
	const activeEphemeral = movedAway ? null : (ephemeralFlow ?? null);

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
	const effectiveGrammar = activeEphemeral?.grammar ?? grammar;
	const effectiveFlow = activeEphemeral?.flow.id ?? flow;
	const projection = useMemo(() => {
		if (activeEphemeral !== null) {
			return projectFlow(structure, activeEphemeral.flow, activeEphemeral.syntheticParticipants);
		}
		const selectedFlow = structure.depicted.flows.find((entry) => entry.id === flow);
		return grammar === "architecture" || selectedFlow === undefined
			? structure
			: projectFlow(structure, selectedFlow);
	}, [structure, grammar, flow, activeEphemeral]);
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
		() => ({
			scope,
			focus,
			expand,
			filters,
			grammar: effectiveGrammar,
			flow: effectiveFlow,
			subject,
			state,
			checkpoint,
			against,
		}),
		[
			scope,
			focus,
			expand,
			filters,
			effectiveGrammar,
			effectiveFlow,
			subject,
			state,
			checkpoint,
			against,
		],
	);
	const request = useMemo(
		() => ({
			model,
			projection,
			reading,
			grammar: drawableGrammar(effectiveGrammar, projection),
			settled,
			failed,
			entry,
		}),
		[model, projection, reading, effectiveGrammar, settled, failed, entry],
	);
	const narrowed = isNarrowed(reading) || visibility !== undefined;
	const onWholeScope = narrowed ? location.showWholeScope : undefined;
	return { location, comparison, structure, request, onWholeScope, activeEphemeral };
}

export { useModelReading };
