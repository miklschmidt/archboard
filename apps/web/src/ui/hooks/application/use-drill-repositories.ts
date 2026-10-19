// What a pane's drill-downs into other repositories need from the shell (ADR 0050).
//
// A drill-down names a repository identity. The canvas reads where that
// repository's boards are from the machine's repositories, which the shell
// lists. It shows a board of another vault by asking the shell to move the
// pane there, by the name the navigator lists that vault under, as a click in
// the navigator does.

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { repositoriesQuery } from "#ui/clients/board-catalog/queries.ts";
import { boardKeyFor } from "#ui/rules/semantic-board-canvas/board/address.ts";
import { type Dive } from "#ui/hooks/semantic-board-canvas/use-drill-down.ts";
import { type RepositoryPlaces } from "#ui/rules/semantic-board-canvas/drilling/drill-target.ts";

/** The repositories a pane's drill-downs lead into, and the move into one. */
interface DrillRepositories {
	/** Where each registered repository identity's boards are read from. */
	readonly places: RepositoryPlaces;
	/** Move the pane to a board of another vault. */
	readonly dive: Dive;
}

/**
 * The repositories a pane's drill-downs lead into, and the move into one.
 * @param openBoard Show a board in the pane, in a repository the navigator lists.
 * @returns The places, and the move.
 */
function useDrillRepositories(
	openBoard: (key: string, repository?: string) => Promise<boolean>,
): DrillRepositories {
	const listed = useQuery(repositoriesQuery()).data?.repositories;
	const places = useMemo<RepositoryPlaces>(() => {
		const tracked = new Map(
			(listed ?? []).flatMap((each) => (each.untracked ? [] : [[each.name, each] as const])),
		);
		return (identity) => tracked.get(identity);
	}, [listed]);
	const dive = useCallback<Dive>(
		(stop) => {
			// A vault the navigator no longer lists, such as a checkout chosen away
			// since, is asked for by the repository it was in, so the shell says why
			// it cannot show it rather than the crumb doing nothing.
			const name =
				listed?.find((each) => each.vault === stop.vault)?.name ?? stop.repository ?? stop.vault;
			return openBoard(boardKeyFor(stop.board, stop.variant), name);
		},
		[listed, openBoard],
	);
	return { places, dive };
}

export { useDrillRepositories };
