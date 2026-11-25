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
 * Serialize the router location fields that anchor a temporary flow, so navigating away clears it.
 * @param location The current pane location.
 * @returns A stable string key for the reading location.
 */
function readingLocationKey(location: ReturnType<typeof useModelLocation>): string {
	return JSON.stringify([
		location.model,
		location.preview,
		location.bookmark,
		location.legacyAddress,
		location.scope,
		location.focus,
		location.expand,
		location.filters,
		location.grammar,
		location.flow,
		location.state,
		location.checkpoint,
		location.against,
		location.ref,
	]);
}

/**
 * Anchor an active temporary flow to the reading location where it arrived and dismiss it on navigation.
 * @param location The current pane location.
 * @param ephemeralFlow The temporary flow held by the arrival hook, if any.
 * @param onClearEphemeralFlow Callback that clears the temporary flow.
 * @returns The temporary flow while still at its arrival location, or null once the reader moves away.
 */
function useAnchoredEphemeral(
	location: ReturnType<typeof useModelLocation>,
	ephemeralFlow: ActiveEphemeralFlow | null | undefined,
	onClearEphemeralFlow: (() => void) | undefined,
): ActiveEphemeralFlow | null {
	const current = ephemeralFlow ?? null;
	const locationKey = readingLocationKey(location);
	const [anchored, setAnchored] = useState({ ephemeral: current, locationKey });
	if (anchored.ephemeral !== current) {
		setAnchored({ ephemeral: current, locationKey });
	}
	const movedAway = current !== null && anchored.locationKey !== locationKey;
	useEffect(() => {
		if (movedAway) onClearEphemeralFlow?.();
	}, [movedAway, onClearEphemeralFlow]);
	return movedAway ? null : current;
}

/**
 * Project the active flow (temporary or authored) over the structural projection.
 * @param structure The projected architecture.
 * @param grammar The router grammar.
 * @param flow The router flow id.
 * @param activeEphemeral The active temporary flow, if any.
 * @returns The flow or structural projection.
 */
function projectActiveReading(
	structure: ReturnType<typeof projectModel>,
	grammar: string,
	flow: string | null,
	activeEphemeral: ActiveEphemeralFlow | null,
) {
	if (activeEphemeral !== null) {
		return projectFlow(structure, activeEphemeral.flow, activeEphemeral.syntheticParticipants);
	}
	const selectedFlow = structure.depicted.flows.find((entry) => entry.id === flow);
	return grammar === "architecture" || selectedFlow === undefined
		? structure
		: projectFlow(structure, selectedFlow);
}

/**
 * Resolve the effective grammar and flow id, preferring an active temporary flow over router state.
 * @param activeEphemeral Active unsaved temporary flow, or null.
 * @param grammar Router grammar.
 * @param flow Router flow id.
 * @returns The grammar and flow id for scene rendering.
 */
function effectiveFlowTarget(
	activeEphemeral: ActiveEphemeralFlow | null,
	grammar: string,
	flow: string | null,
): { readonly grammar: string; readonly flow: string | null } {
	if (activeEphemeral === null) return { grammar, flow };
	return { grammar: activeEphemeral.grammar, flow: activeEphemeral.flow.id };
}

/**
 * Extract the imported bookmark reading and its visibility, if present.
 * @param model The coherent model.
 * @returns The bookmark reading and visibility.
 */
function bookmarkOf(model: Model) {
	const reading = importedReadings(model)?.bookmark?.reading;
	return { reading, visibility: reading?.visibility };
}

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
	const { reading: bookmark, visibility } = bookmarkOf(model);
	const location = useModelLocation(paneId, bookmark);
	const { scope, focus, expand, filters, grammar, flow, subject, state, checkpoint, against } =
		location;
	const activeEphemeral = useAnchoredEphemeral(location, ephemeralFlow, onClearEphemeralFlow);
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
	const target = effectiveFlowTarget(activeEphemeral, grammar, flow);
	const projection = useMemo(
		() => projectActiveReading(structure, grammar, flow, activeEphemeral),
		[structure, grammar, flow, activeEphemeral],
	);
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
			grammar: target.grammar,
			flow: target.flow,
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
			target.grammar,
			target.flow,
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
			grammar: drawableGrammar(target.grammar, projection),
			settled,
			failed,
			entry,
		}),
		[model, projection, reading, target.grammar, settled, failed, entry],
	);
	const narrowed = isNarrowed(reading) || visibility !== undefined;
	const onWholeScope = narrowed ? location.showWholeScope : undefined;
	return { location, comparison, structure, request, onWholeScope, activeEphemeral };
}

export { useModelReading };
