import { useCallback, useMemo } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { validateWorkspaceSearch } from "#ui/rules/board-routing/search.ts";
import type { ModelAddress } from "#ui/rules/board-routing/address.ts";

/**
 * Module navigation shares the application's router and browser history.
 * @param paneId The pane that owns this reading.
 * @returns Exact reading intent and deliberate navigation actions.
 */
function useModelLocation(paneId: string) {
	const router = useRouter();
	const search = useRouterState({
		/**
		 * Read the location without copying it into component state.
		 * @param state The router snapshot.
		 * @returns Its validated search.
		 */
		select: (state) => state.location.search,
	});
	const model = search[`model${paneId}`] ?? null;
	const scope = search[`scope${paneId}`] ?? null;
	const checkpoint = search[`checkpoint${paneId}`] ?? null;
	const grammar = search[`grammar${paneId}`] ?? "architecture";
	const flow = search[`flow${paneId}`] ?? null;
	const focused = search[`focus${paneId}`];
	const hiddenKinds = search[`hideKinds${paneId}`];
	const hiddenGroups = search[`hideGroups${paneId}`];
	const filters = useMemo(
		() => ({
			hideKinds: hiddenKinds?.split(",") ?? [],
			hideGroups: hiddenGroups?.split(",") ?? [],
		}),
		[hiddenKinds, hiddenGroups],
	);
	const focus = useMemo(
		() => (focused === undefined ? null : [...new Set(focused.split(","))]),
		[focused],
	);
	const navigate = useCallback(
		(patch: Partial<ModelAddress>, replace = false): void => {
			void router.navigate({
				to: "/",
				replace,
				/**
				 * Preserve other panes and every unchanged reading field.
				 * @param previous The current workspace address.
				 * @returns The requested canonical location.
				 */
				search: (previous) => {
					const updated = { ...validateWorkspaceSearch(previous) };
					for (const [field, value] of Object.entries(patch)) {
						const key = `${field === "id" ? "model" : field}${paneId}`;
						const serialized = searchValue(value);
						if (serialized === undefined) delete updated[key];
						else updated[key] = serialized;
					}
					delete updated[`pane${paneId}`];
					delete updated[`view${paneId}`];
					return updated;
				},
			});
		},
		[router, paneId],
	);
	const identify = useCallback(
		(id: string): void => {
			if (model === null) navigate({ id }, true);
		},
		[model, navigate],
	);
	const open = useCallback(
		(id: string, next: string | null): void => {
			navigate({ id, scope: next, focus: undefined, grammar: undefined });
		},
		[navigate],
	);
	const selectCheckpoint = useCallback(
		(next: string | null): void => {
			navigate({ checkpoint: next });
		},
		[navigate],
	);
	const setFocus = useCallback(
		(ids: readonly string[] | null): void => {
			const next = ids === null ? undefined : [...new Set(ids)].toSorted();
			if (next?.join(",") === focused) return;
			navigate({ focus: next });
		},
		[navigate, focused],
	);
	const toggleFilter = useCallback(
		(field: "hideKinds" | "hideGroups", id: string): void => {
			const current = filters[field];
			const next = current.includes(id)
				? current.filter((value) => value !== id)
				: [...current, id];
			navigate({ [field]: next.length === 0 ? undefined : next.toSorted() });
		},
		[filters, navigate],
	);
	const reveal = useCallback(
		(ids: readonly string[], kinds: readonly string[]): void => {
			const hidden = filters.hideKinds.filter((kind) => !kinds.includes(kind));
			navigate({
				grammar: undefined,
				focus: [...new Set(ids)].toSorted(),
				hideKinds: hidden.length === 0 ? undefined : hidden,
			});
		},
		[filters.hideKinds, navigate],
	);
	const selectGrammar = useCallback(
		(next: string): void => {
			if (next !== grammar) navigate({ grammar: next === "architecture" ? undefined : next });
		},
		[grammar, navigate],
	);
	const selectFlow = useCallback(
		(next: string): void => {
			if (next !== flow) navigate({ flow: next });
		},
		[flow, navigate],
	);
	const openFlow = useCallback(
		(id: string): void => {
			navigate({ flow: id, grammar: grammar === "flowchart" ? "flowchart" : "sequence" });
		},
		[grammar, navigate],
	);
	return {
		openFlow,
		grammar,
		flow,
		selectGrammar,
		selectFlow,
		model,
		scope,
		checkpoint,
		focus,
		filters,
		toggleFilter,
		reveal,
		setFocus,
		open,
		selectCheckpoint,
		identify,
	};
}

/**
 * Reading fields serialize without making missing values into names.
 * @param value A field of the canonical address.
 * @returns Its search value, or absence.
 */
function searchValue(value: ModelAddress[keyof ModelAddress]): string | undefined {
	if (value === null || value === undefined) return undefined;
	return typeof value === "string" ? value : value.join(",");
}

export { useModelLocation };
