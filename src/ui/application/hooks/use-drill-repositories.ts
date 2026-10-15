// What a pane's drill-downs into other repositories need from the shell (ADR 0050).
//
// A drill-down names a repository identity. The canvas reads where that
// repository's boards are from the machine's repositories, which the shell
// lists. It shows a board of another vault by asking the shell to move the
// pane there, by the name the navigator lists that vault under, as a click in
// the navigator does.

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { repositoriesQuery } from "@/ui/board-catalog";
import { boardKeyFor, type Dive, type RepositoryPlaces } from "@/ui/semantic-board-canvas";

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
			// A vault the navigator does not list has no name to move the pane by.
			const name = listed?.find((each) => each.vault === stop.vault)?.name;
			if (name === undefined) return Promise.resolve(false);
			return openBoard(boardKeyFor(stop.board, stop.variant), name);
		},
		[listed, openBoard],
	);
	return useMemo(() => ({ places, dive }), [places, dive]);
}

export { useDrillRepositories };
