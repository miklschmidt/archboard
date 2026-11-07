import { useCallback, useContext, useMemo } from "react";
import { ModelExplanationContext } from "#ui/architecture-drawing/model-reader/state/explanations.ts";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { validateWorkspaceSearch } from "#ui/panes/reading-routing/rules/search.ts";
import type { ModelAddress } from "#ui/panes/reading-routing/rules/address.ts";
import type { Model } from "@archboard/model/content";
import type { PaneModelRequest } from "#ui/panes/pane-session/rules/socket-messages.ts";
import { AFTER } from "#ui/architecture-drawing/model-reader/rules/comparison-intent.ts";
import type { FlowGrammar } from "#ui/architecture-drawing/model-reader/rules/flow-fit.ts";

type Reading = Model["walkthroughs"][number]["beats"][number]["reading"];

/**
 * Module navigation shares the application's router and browser history.
 * @param paneId The pane that owns this reading.
 * @param bookmarkReading An imported bookmark's complete starting reading.
 * @returns Exact reading intent and deliberate navigation actions.
 */
function useModelLocation(paneId: string, bookmarkReading?: Reading) {
	const router = useRouter();
	const reportUserChange = useContext(ModelExplanationContext)?.userChanged;
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
	const paneKey = nullableParameter(search[`pane${paneId}`]);
	const scope = nullableParameter(search[`scope${paneId}`]);
	const checkpoint = nullableParameter(search[`checkpoint${paneId}`]);
	const state = nullableParameter(search[`state${paneId}`]);
	const preview = nullableParameter(search[`preview${paneId}`]);
	const userChanged = preview === null ? reportUserChange : undefined;
	const bookmark = nullableParameter(search[`bookmark${paneId}`]);
	const legacyAddress = nullableParameter(search[`legacyAddress${paneId}`]);
	const against = nullableParameter(search[`against${paneId}`]);
	const subject = nullableParameter(search[`subject${paneId}`]);
	const grammar = search[`grammar${paneId}`] ?? "architecture";
	const flow = nullableParameter(search[`flow${paneId}`]);
	const focused = search[`focus${paneId}`];
	const hiddenKinds = search[`hideKinds${paneId}`];
	const expanded = search[`expand${paneId}`];
	const filters = useMemo(
		() => ({
			hideKinds: hiddenKinds ? hiddenKinds.split(",") : [],
		}),
		[hiddenKinds],
	);
	const focus = useMemo(
		() => (focused === undefined ? null : [...new Set(focused.split(","))]),
		[focused],
	);
	const expand = useMemo(
		() => (expanded === undefined ? [] : [...new Set(expanded.split(","))]),
		[expanded],
	);
	const navigate = useCallback(
		(patch: Partial<ModelAddress>, replace = false, repository?: string): Promise<void> => {
			return router.navigate({
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
			userChanged?.("view");
			void navigate({
				...(bookmarkReading === undefined
					? {}
					: {
							scope,
							focus: focus ?? undefined,
							expand,
							grammar,
							flow: flow ?? undefined,
							hideKinds: filters.hideKinds,
							bookmark: undefined,
						}),
				...patch,
			});
		},
		[navigate, bookmarkReading, scope, focus, expand, grammar, flow, filters, userChanged],
	);
	const selectBookmark = useCallback(
		(next: string | null): void => {
			userChanged?.("view");
			void navigate({
				bookmark: next ?? undefined,
				scope: null,
				focus: undefined,
				expand: undefined,
				grammar: undefined,
				flow: undefined,
				hideKinds: undefined,
				subject: undefined,
			});
		},
		[navigate, userChanged],
	);
	const identify = useCallback(
		(id: string): void => {
			if (model === null) void navigate({ id }, true);
		},
		[model, navigate],
	);
	const selectLegacyAddress = useCallback(
		(next: string): void => {
			void navigate({
				legacyAddress: next,
				checkpoint: preview === null ? null : checkpoint,
				state: undefined,
				bookmark: undefined,
				scope: null,
				focus: undefined,
				expand: undefined,
				grammar: undefined,
				flow: undefined,
				hideKinds: undefined,
				subject: undefined,
				against: undefined,
			});
		},
		[navigate, preview, checkpoint],
	);
	const openOriginal = useCallback(
		(destination: ModelAddress): void => {
			void navigate(destination, true);
		},
		[navigate],
	);
	const openRepository = useCallback(
		(id: string, repository: string): void => {
			void navigate(
				{
					id,
					scope: null,
					checkpoint: null,
					state: undefined,
					preview: undefined,
					bookmark: undefined,
					legacyAddress: undefined,
					against: undefined,
					subject: undefined,
					grammar: undefined,
					flow: undefined,
					focus: undefined,
					expand: undefined,
					hideKinds: undefined,
				},
				false,
				repository,
			);
		},
		[navigate],
	);
	const openRequested = useCallback(
		({ reading, repository }: PaneModelRequest, push = false): Promise<void> => {
			return navigate(
				{
					id: reading.model,
					scope: reading.scope ?? null,
					checkpoint: reading.checkpoint ?? null,
					state: reading.state,
					preview: reading.preview,
					bookmark: reading.bookmark,
					legacyAddress: reading.legacyAddress,
					against: requestedComparison(reading),
					subject: reading.module,
					grammar: requestedGrammar(reading),
					flow: reading.flow,
					focus: reading.focus,
					expand: reading.expand,
					hideKinds: reading.hideKinds,
				},
				!push,
				repository ?? undefined,
			);
		},
		[navigate],
	);
	const open = useCallback(
		(id: string, next: string | null): void => {
			explore({
				id,
				scope: next,
				focus: undefined,
				expand: next === scope ? expand : undefined,
				grammar: undefined,
				flow: undefined,
				subject: undefined,
			});
		},
		[explore, scope, expand],
	);
	const selectCheckpoint = useCallback(
		(next: string | null): void => {
			userChanged?.("variant");
			void navigate({
				checkpoint: next,
				bookmark: undefined,
				state: preview === null ? undefined : (state ?? undefined),
				against: undefined,
			});
		},
		[navigate, preview, state, userChanged],
	);
	const setFocus = useCallback(
		(ids: readonly string[] | null): void => {
			const next = ids === null ? undefined : [...new Set(ids)].toSorted();
			if (next?.join(",") === focused) return;
			explore({ focus: next });
		},
		[explore, focused],
	);
	const setExpand = useCallback(
		(ids: readonly string[]): void => {
			explore({ expand: [...new Set(ids)].toSorted() });
		},
		[explore],
	);
	const toggleFilter = useCallback(
		(field: "hideKinds", id: string): void => {
			userChanged?.("view");
			const current = filters[field];
			const next = current.includes(id)
				? current.filter((value) => value !== id)
				: [...current, id];
			void navigate({ [field]: next.length === 0 ? undefined : next.toSorted() });
		},
		[filters, navigate, userChanged],
	);
	const showAllKinds = useCallback((): void => {
		userChanged?.("view");
		void navigate({ hideKinds: undefined });
	}, [navigate, userChanged]);
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
	const showFlow = useCallback(
		(id: string, reading: FlowGrammar): void => {
			explore({ flow: id, grammar: reading });
		},
		[explore],
	);
	const selectState = useCallback(
		(next: string | null): void => {
			userChanged?.("variant");
			void navigate({
				state: next ?? undefined,
				legacyAddress: undefined,
				bookmark: undefined,
				checkpoint: preview === null ? null : checkpoint,
				against: undefined,
			});
		},
		[navigate, preview, checkpoint, userChanged],
	);
	const compareAgainst = useCallback(
		(next: string | null): void => {
			userChanged?.("variant");
			void navigate({ against: next ?? undefined });
		},
		[navigate, userChanged],
	);
	const openRetained = useCallback(
		(next: string, module: string): void => {
			userChanged?.("variant");
			void navigate({
				checkpoint: next,
				state: undefined,
				bookmark: undefined,
				against: AFTER,
				scope: module,
				focus: undefined,
				expand: undefined,
				grammar: undefined,
				flow: undefined,
				subject: undefined,
			});
		},
		[navigate, userChanged],
	);
	const showWholeScope = useCallback((): void => {
		explore({ focus: undefined, hideKinds: undefined });
	}, [explore]);
	const openReference = useCallback(
		(repository: string, reading: Model): void => {
			void navigate(referenceAddress(reading), false, repository);
		},
		[navigate],
	);
	return {
		openRequested,
		openRepository,
		openOriginal,
		legacyAddress: legacyAddress ?? (model === null ? paneKey : null),
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
		openRetained,
		showWholeScope,
		showFlow,
		grammar,
		flow,
		selectGrammar,
		model,
		scope,
		checkpoint,
		focus,
		expand,
		setExpand,
		filters,
		toggleFilter,
		showAllKinds,
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
		expand: undefined,
		hideKinds: undefined,
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
	if (typeof value === "string") return value;
	// An empty list narrows nothing, and `focus=` would read back as one empty identity.
	return value.length === 0 ? undefined : value.join(",");
}

export { useModelLocation };

/**
 * The address field of a resolved request's comparison.
 * @param reading The resolved navigation request.
 * @returns The named base, or `after` when the request turned the comparison off.
 */
function requestedComparison(reading: PaneModelRequest["reading"]): ModelAddress["against"] {
	return reading.compare === false ? AFTER : reading.against;
}

/**
 * Omit the ordinary default while preserving an explicit override of a bookmark's grammar.
 * @param reading The resolved navigation request.
 * @returns The grammar needed in the portable address.
 */
function requestedGrammar(reading: PaneModelRequest["reading"]): ModelAddress["grammar"] {
	return reading.grammar === "architecture" && reading.bookmark === undefined
		? undefined
		: reading.grammar;
}

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
	};
	return Object.fromEntries(
		Object.entries(values).flatMap(([field, value]) => {
			const encoded = searchValue(value);
			return encoded === undefined || encoded === "" ? [] : [[`${field}${paneId}`, encoded]];
		}),
	);
}
