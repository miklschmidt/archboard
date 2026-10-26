import { useCallback } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { validateWorkspaceSearch } from "#ui/rules/board-routing/search.ts";

/**
 * Module navigation shares the application's router and browser history.
 * @param paneId The pane that owns this reading.
 * @returns The requested scope and its deliberate navigation action.
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
	const scope = search[`scope${paneId}`] ?? null;
	const open = useCallback(
		(model: string, next: string | null): void => {
			void router.navigate({
				to: "/",
				/**
				 * Preserve the other pane while changing this scope.
				 * @param previous The current workspace address.
				 * @returns The next reading address.
				 */
				search: (previous) => {
					const updated = { ...validateWorkspaceSearch(previous), [`model${paneId}`]: model };
					if (next === null) delete updated[`scope${paneId}`];
					else updated[`scope${paneId}`] = next;
					return updated;
				},
			});
		},
		[router, paneId],
	);
	return { scope, open };
}

export { useModelLocation };
