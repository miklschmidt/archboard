import { useCallback, type JSX, type MouseEvent } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@archboard/ui-kit/components";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import type { Model } from "@archboard/board/content";
import { addressFromSearch, validateWorkspaceSearch } from "#ui/rules/board-routing/search.ts";

/**
 * Open current architecture from its repository without inventing a board.
 * @param props The repository and canonical identity returned by the reader.
 * @param props.repository The portable repository identity.
 * @param props.model The canonical manifest.
 * @returns One explicit action in the repository navigator.
 */
function RepositoryModelLink({
	repository,
	model,
}: {
	repository: string;
	model: Model["manifest"];
}): JSX.Element {
	const pane = useRouterState({
		/**
		 * Read the active pane from the shared router.
		 * @param state The current route.
		 * @returns Its pane identity or the initial pane.
		 */
		select: (state) =>
			addressFromSearch(validateWorkspaceSearch(state.location.search)).activePaneId ?? "A",
	});
	const { openRepository } = useModelLocation(pane);
	const open = useCallback(
		(event: MouseEvent<HTMLButtonElement>): void => {
			event.stopPropagation();
			openRepository(model.id, repository);
		},
		[model.id, repository, openRepository],
	);
	return (
		<Button
			data-slot="repository-model-open"
			variant="ghost"
			size="sm"
			onClick={open}
			title={`Open ${model.name}`}
		>
			Open
		</Button>
	);
}

export { RepositoryModelLink };
