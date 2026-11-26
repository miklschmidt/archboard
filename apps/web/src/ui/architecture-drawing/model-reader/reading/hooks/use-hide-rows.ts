import { useMemo } from "react";
import type { Model, ModelFilters } from "@archboard/model/content";
import { hiddenKinds } from "@archboard/model/policy";
import type { FilterField } from "#ui/panes/reading-routing/hooks/use-model-location.ts";
import type { RelationshipRows } from "#ui/architecture-drawing/model-reader/reading/rules/legend-rows.ts";

/** Hide these kinds or effects besides what the lens leaves out, and show the rest. */
type HideRows = (field: FilterField, ids: readonly string[]) => void;

/**
 * Hide rows of one list of the legend, and keep what a reader hid that the list does not show.
 * @param model The reading, whose policy names the kinds hidden by default.
 * @param filters What a reader hid.
 * @param rows The rows the legend shows.
 * @param onHide Hide kinds or effects, or nothing where the legend only explains.
 * @returns How the rows hide, or nothing where they cannot.
 */
function useHideRows(
	model: Model,
	filters: Pick<ModelFilters, "hideKinds" | "hideEffects">,
	rows: RelationshipRows,
	onHide: HideRows | undefined,
): HideRows | undefined {
	return useMemo(() => {
		if (onHide === undefined) return undefined;
		return (field, ids) => {
			const kinds = field === "hideKinds";
			const current = kinds ? hiddenKinds(filters.hideKinds, model.policy) : filters.hideEffects;
			const visibleRows = kinds ? rows.kinds : rows.effects;
			const unlisted = (current ?? []).filter((id) => !visibleRows.some((row) => row.id === id));
			onHide(field, [...unlisted, ...ids]);
		};
	}, [filters, model.policy, onHide, rows]);
}

export { useHideRows };
