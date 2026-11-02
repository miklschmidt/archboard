// How this page starts, decided once. The address and the repositories can go on changing, but
// the panes that a start opens are not taken away again: from there on they own what they read.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

import { lastReading, rememberReading } from "#ui/clients/reading-routing/last-reading.ts";
import type { ModelCatalog } from "#ui/hooks/architecture-model/use-model-catalog.ts";
import { startOf, type Start } from "#ui/rules/reading-routing/start.ts";
import {
	addressFromSearch,
	parseWorkspaceSearchString,
	searchFromAddress,
	validateWorkspaceSearch,
} from "#ui/rules/reading-routing/search.ts";

/**
 * The address of the last reading.
 * @returns It, or null when this browser has none that names a model.
 */
function lastAddress() {
	const search = lastReading();
	if (search === null) return null;
	const address = addressFromSearch(parseWorkspaceSearchString(search));
	return address.panes.some((pane) => pane.model !== undefined) ? address : null;
}

/**
 * The start of this page.
 * @param catalog The repositories.
 * @returns The start, which stays once it opens.
 */
function useStart(catalog: Pick<ModelCatalog, "repositories" | "loading">): Start {
	const router = useRouter();
	const search = useRouterState({
		/**
		 * The search parameters of the location the router is on.
		 * @param state The router state.
		 * @returns The parsed search.
		 */
		select: (state) => state.location.search,
	});
	const address = useMemo(() => addressFromSearch(validateWorkspaceSearch(search)), [search]);
	const [last] = useState(lastAddress);
	const { repositories, loading } = catalog;
	const start = useMemo(
		() => startOf({ address, last, repositories, loading }),
		[address, last, repositories, loading],
	);
	const [opened, keepOpened] = useState<Extract<Start, { kind: "open" }> | null>(null);
	if (opened === null && start.kind === "open") keepOpened(start);
	const restoring = start.kind === "restore" ? start.address : null;
	useEffect(() => {
		if (restoring !== null)
			void router.navigate({ to: "/", replace: true, search: searchFromAddress(restoring) });
	}, [router, restoring]);
	return opened ?? start;
}

/** Remember the reading on screen, so that a plain address comes back to it. */
function useLastReading(): void {
	const reading = useRouterState({
		/**
		 * The address of a reading, or null while the location names no model.
		 * @param state The router state.
		 * @returns Its search string.
		 */
		select: (state) => {
			const named = Object.keys(state.location.search).some((key) => /^model[A-Z]/.test(key));
			return named ? state.location.searchStr : null;
		},
	});
	useEffect(() => {
		if (reading !== null) rememberReading(reading);
	}, [reading]);
}

export { useLastReading, useStart };
