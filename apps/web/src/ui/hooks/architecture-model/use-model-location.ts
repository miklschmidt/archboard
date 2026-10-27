import { useCallback, useMemo } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { validateWorkspaceSearch } from "#ui/rules/board-routing/search.ts";
import type { ModelAddress } from "#ui/rules/board-routing/address.ts";
import type { Model } from "#ui/rules/architecture-model/projection.ts";

type Reading = Model["walkthroughs"][number]["beats"][number]["reading"];

/**
 * Module navigation shares the application's router and browser history.
 * @param paneId The pane that owns this reading.
 * @param bookmarkReading An imported bookmark's complete starting reading.
 * @returns Exact reading intent and deliberate navigation actions.
 */
function useModelLocation(paneId: string, bookmarkReading?: Reading) {
	const router = useRouter();
	const address = useRouterState({
		/**
		 * Read the location without copying it into component state.
		 * @param state The router snapshot.
		 * @returns Its validated search.
		 */
		select: (state) => state.location.search,
	});
	const search = { ...bookmarkSearch(bookmarkReading, paneId), ...address };
	const model = nullableParameter(search[`model${paneId}`]);
	const scope = nullableParameter(search[`scope${paneId}`]);
	const checkpoint = nullableParameter(search[`checkpoint${paneId}`]);
	const state = nullableParameter(search[`state${paneId}`]);
	const preview = nullableParameter(search[`preview${paneId}`]);
	const bookmark = nullableParameter(search[`bookmark${paneId}`]);
	const legacyAddress = nullableParameter(search[`legacyAddress${paneId}`]);
	const against = nullableParameter(search[`against${paneId}`]);
	const subject = nullableParameter(search[`subject${paneId}`]);
	const grammar = search[`grammar${paneId}`] ?? "architecture";
	const flow = nullableParameter(search[`flow${paneId}`]);
	const focused = search[`focus${paneId}`];
	const hiddenKinds = search[`hideKinds${paneId}`];
	const hiddenGroups = search[`hideGroups${paneId}`];
	const filters = useMemo(
		() => ({
			hideKinds: hiddenKinds ? hiddenKinds.split(",") : [],
			hideGroups: hiddenGroups ? hiddenGroups.split(",") : [],
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
	const explore = useCallback(
		(patch: Partial<ModelAddress>): void => {
			navigate({
				...(bookmarkReading === undefined
					? {}
					: {
							scope,
							focus: focus ?? undefined,
							grammar,
							flow: flow ?? undefined,
							hideKinds: filters.hideKinds,
							hideGroups: filters.hideGroups,
							bookmark: undefined,
						}),
				...patch,
			});
		},
		[navigate, bookmarkReading, scope, focus, grammar, flow, filters],
	);
	const selectBookmark = useCallback(
		(next: string | null): void => {
			navigate({
				bookmark: next ?? undefined,
				scope: null,
				focus: undefined,
				grammar: undefined,
				flow: undefined,
				hideKinds: undefined,
				hideGroups: undefined,
				subject: undefined,
			});
		},
		[navigate],
	);
	const identify = useCallback(
		(id: string): void => {
			if (model === null) navigate({ id }, true);
		},
		[model, navigate],
	);
	const selectLegacyAddress = useCallback(
		(next: string): void => {
			navigate({
				legacyAddress: next,
				state: undefined,
				bookmark: undefined,
				scope: null,
				focus: undefined,
				grammar: undefined,
				flow: undefined,
				hideKinds: undefined,
				hideGroups: undefined,
				subject: undefined,
				against: undefined,
			});
		},
		[navigate],
	);
	const open = useCallback(
		(id: string, next: string | null): void => {
			explore({ id, scope: next, focus: undefined, grammar: undefined });
		},
		[explore],
	);
	const selectCheckpoint = useCallback(
		(next: string | null): void => {
			navigate({
				checkpoint: next,
				bookmark: undefined,
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
			explore({ focus: next });
		},
		[explore, focused],
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
			explore({
				grammar: undefined,
				focus: [...new Set(ids)].toSorted(),
				hideKinds: hidden.length === 0 ? undefined : hidden,
			});
		},
		[filters.hideKinds, explore],
	);
	const selectGrammar = useCallback(
		(next: string): void => {
			if (next !== grammar) explore({ grammar: next === "architecture" ? undefined : next });
		},
		[grammar, explore],
	);
	const selectFlow = useCallback(
		(next: string): void => {
			if (next !== flow) explore({ flow: next });
		},
		[flow, explore],
	);
	const openFlow = useCallback(
		(id: string): void => {
			explore({ flow: id, grammar: grammar === "flowchart" ? "flowchart" : "sequence" });
		},
		[grammar, explore],
	);
	const selectState = useCallback(
		(next: string | null): void => {
			navigate({
				state: next ?? undefined,
				legacyAddress: undefined,
				bookmark: undefined,
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
		legacyAddress,
		selectLegacyAddress,
		bookmark,
		selectBookmark,
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
		preview: location.preview,
		bookmark: undefined,
		legacyAddress: undefined,
		subject: location.subject,
		scope: referenceScope(reading),
		checkpoint,
		state: checkpoint === null || location.preview !== undefined ? location.state : undefined,
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

/**
 * Read bookmark defaults through the same parameter representation as explicit navigation.
 * @param reading The optional imported reading.
 * @param paneId The pane that owns its parameters.
 * @returns Defaults that explicit router values can override.
 */
function bookmarkSearch(reading: Reading | undefined, paneId: string): Record<string, string> {
	if (reading === undefined) return {};
	const values = {
		scope: reading.scope,
		grammar: reading.grammar,
		flow: reading.flow,
		focus: reading.focus,
		hideKinds: reading.filters.relationships,
		hideGroups: reading.filters.groups,
	};
	return Object.fromEntries(
		Object.entries(values).flatMap(([field, value]) => {
			const encoded = searchValue(value);
			return encoded === undefined || encoded === "" ? [] : [[`${field}${paneId}`, encoded]];
		}),
	);
}
