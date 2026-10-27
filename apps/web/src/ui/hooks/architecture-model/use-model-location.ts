import { useCallback, useMemo } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { validateWorkspaceSearch } from "#ui/rules/board-routing/search.ts";
import type { ModelAddress } from "#ui/rules/board-routing/address.ts";
import type { Model } from "#ui/rules/architecture-model/projection.ts";

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
	const model = nullableParameter(search[`model${paneId}`]);
	const scope = nullableParameter(search[`scope${paneId}`]);
	const checkpoint = nullableParameter(search[`checkpoint${paneId}`]);
	const state = nullableParameter(search[`state${paneId}`]);
	const preview = nullableParameter(search[`preview${paneId}`]);
	const against = nullableParameter(search[`against${paneId}`]);
	const subject = nullableParameter(search[`subject${paneId}`]);
	const grammar = search[`grammar${paneId}`] ?? "architecture";
	const flow = nullableParameter(search[`flow${paneId}`]);
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
		(patch: Partial<ModelAddress>, replace = false, repository?: string): void => {
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
					if (repository !== undefined) updated[`repo${paneId}`] = repository;
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
			navigate({
				checkpoint: next,
				state: preview === null ? undefined : (state ?? undefined),
				against: undefined,
			});
		},
		[navigate, preview, state],
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
	const selectState = useCallback(
		(next: string | null): void => {
			navigate({
				state: next ?? undefined,
				checkpoint: preview === null ? null : checkpoint,
				against: undefined,
			});
		},
		[navigate, preview, checkpoint],
	);
	const compareAgainst = useCallback(
		(next: string | null): void => {
			navigate({ against: next ?? undefined });
		},
		[navigate],
	);
	const openReference = useCallback(
		(repository: string, reading: Model): void => {
			navigate(referenceAddress(reading), false, repository);
		},
		[navigate],
	);
	return {
		subject,
		preview,
		openReference,
		state,
		against,
		selectState,
		compareAgainst,
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
 * A followed reference creates one explicit destination without carrying source filters.
 * @param reading The foreign reading returned by the shared runtime.
 * @returns Its portable model, state, subject, scope, and behavior intent.
 */
function referenceAddress(reading: Model): ModelAddress {
	const location = reading.location;
	if (location === undefined)
		throw new Error("The reference returned no destination. Refresh and retry.");
	const checkpoint = location.checkpoint ?? null;
	return {
		id: location.model,
		preview: undefined,
		subject: location.subject,
		scope: referenceScope(reading),
		checkpoint,
		state: checkpoint === null ? location.state : undefined,
		flow: reading.selectedFlow,
		grammar: reading.selectedFlow === undefined ? undefined : "sequence",
		against: undefined,
		focus: referenceFocus(reading, location.subject),
		hideKinds: undefined,
		hideGroups: undefined,
	};
}

/**
 * A module destination appears among its immediate siblings with its exact identity selected.
 * @param reading The complete target model.
 * @returns Its containing module, or the model root.
 */
function referenceScope(reading: Model): string | null {
	return reading.modules.find((module) => module.id === reading.selectedModule)?.parent ?? null;
}

/**
 * A relationship destination opens the containment paths needed to show its endpoints.
 * @param reading The exact foreign model.
 * @param subject The qualified reference destination.
 * @returns One structural focus for a relationship, otherwise no added focus.
 */
function referenceFocus(reading: Model, subject: string): ModelAddress["focus"] {
	return reading.relationships.some((edge) => edge.id === subject) ? [subject] : undefined;
}

/**
 * Missing optional address fields have one absent-value convention in the reader.
 * @param value A validated string parameter, or absence.
 * @returns The requested value or null.
 */
function nullableParameter(value: string | undefined): string | null {
	return value ?? null;
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
