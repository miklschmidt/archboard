import { useCallback } from "react";
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
						if (value === null) delete updated[key];
						else updated[key] = value;
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
			navigate({ id, scope: next });
		},
		[navigate],
	);
	const selectCheckpoint = useCallback(
		(next: string | null): void => {
			navigate({ checkpoint: next });
		},
		[navigate],
	);
	return { model, scope, checkpoint, open, selectCheckpoint, identify };
}

export { useModelLocation };
