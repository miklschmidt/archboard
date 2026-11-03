// The models above the one on screen, as the header's breadcrumb lists them.
//
// While nothing has been followed, they are where the navigator places the
// model on screen. Once the reader has followed a drill-down, they are where
// the navigator places the first model of the trail, then every model the
// reader came down through. Each of those is a way back along the drill, not a
// way to open the model again.
//
// The way back is not read off the navigator's placing of the model on screen.
// A drill-down can run up a level or across, and a model that several models
// link down to sits under only one of them. That placing can leave out the
// model the reader came from, and the pane would then offer no way back to it.
//
// Each model the reader came through is named as it names itself, with its
// level, from the document the pane read while that model was on screen, in
// the vault it is in. A trail can cross repositories (ADR 0050): then the first
// crumb of each run from one repository names that repository, muted, and the
// navigator's placing is left out unless the trail starts in the pane's vault.

import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { CrumbPlace, PaneHeaderProps } from "#ui/components/canvas/PaneHeader.tsx";
import type { DrillNavigation } from "#ui/hooks/canvas/use-drill-down.ts";
import { readDocument } from "#ui/rules/canvas/reading/document.ts";
import { retainedDocumentQuery, retainedListingQuery } from "#ui/clients/canvas/reads/queries.ts";
import { usePaneVault } from "#ui/hooks/canvas/use-pane-vault.ts";

/** What a model calls itself, and its level. */
interface Named {
	readonly name: string;
	readonly level: string | undefined;
}

/** A crumb, and the vault and repository it is in. */
interface Located {
	readonly vault: string;
	readonly repository: string | null;
}

/**
 * What each model of the trail calls itself.
 * @param results The trail's documents, in the trail's order.
 * @returns Each model's name and level, or undefined while its document cannot be read.
 */
function namesOf(results: readonly { readonly data: unknown }[]): (Named | undefined)[] {
	return results.map((result) => {
		const read = readDocument(result.data);
		return read.ok ? { name: read.board.name, level: read.board.level } : undefined;
	});
}

/**
 * Which crumbs name their repository: every first crumb of a run from one
 * vault, and none at all while the whole trail is in one.
 * @param crumbs Every crumb, the model on screen last.
 * @returns For each crumb, the repository to name, or undefined.
 */
function repositoryLabels(crumbs: readonly Located[]): (string | undefined)[] {
	const across = new Set(crumbs.map((crumb) => crumb.vault)).size > 1;
	return crumbs.map((crumb, at) =>
		across && crumbs[at - 1]?.vault !== crumb.vault ? (crumb.repository ?? undefined) : undefined,
	);
}

/**
 * The models above the one on screen, outermost first, each a way to it, and
 * the repository to name on the model on screen.
 * @param placeOf The models above one as the navigator places them, when the shell can say.
 * @param drill The model on screen, and how the pane got there.
 * @param onBackTo Go back to the model at this depth of the trail.
 * @returns The places, and the repository of the model on screen when it is named.
 */
function useDrillPlaces(
	placeOf: ((model: string) => readonly CrumbPlace[]) | undefined,
	drill: Pick<DrillNavigation, "model" | "trail">,
	onBackTo: (depth: number) => void,
): Pick<PaneHeaderProps, "ancestors" | "repository"> {
	const { model, trail } = drill;
	const vault = usePaneVault();
	const repository = useQuery(retainedListingQuery(vault)).data?.repository ?? null;
	const names = useQueries({
		queries: trail.map((stop) => retainedDocumentQuery(stop.vault, stop.model)),
		combine: namesOf,
	});
	return useMemo(() => {
		const passed = trail.map((stop, at) => ({
			place: {
				name: names[at]?.name ?? stop.model,
				level: names[at]?.level,
				vault: stop.vault,
				/** Go back to this model of the trail. */
				open: (): void => {
					onBackTo(at);
				},
			},
			where: stop,
		}));
		const placed = navigatorPlaces(placeOf, trail[0] ?? { model, vault }, vault);
		const here = { vault, repository };
		return labelled([...placed.map((place) => ({ place, where: here })), ...passed], here);
	}, [placeOf, model, trail, names, onBackTo, vault, repository]);
}

/**
 * Where the navigator places the first model of the trail. It places the models
 * of the pane's vault, so a trail that starts in another vault has no such places.
 * @param placeOf The models above one as the navigator places them, when the shell can say.
 * @param first The first model of the trail, or the model on screen.
 * @param vault The pane's vault.
 * @returns The places, outermost first.
 */
function navigatorPlaces(
	placeOf: ((model: string) => readonly CrumbPlace[]) | undefined,
	first: Pick<Located, "vault"> & { readonly model: string },
	vault: string,
): readonly CrumbPlace[] {
	return first.vault === vault ? (placeOf?.(first.model) ?? []) : [];
}

/**
 * The crumbs, each naming its repository where a run from one vault starts,
 * when the crumbs span more than one.
 * @param ancestors The models above the one on screen, each with where it is.
 * @param here Where the model on screen is.
 * @returns The places, and the repository of the model on screen when it is named.
 */
function labelled(
	ancestors: readonly { readonly place: CrumbPlace; readonly where: Located }[],
	here: Located,
): Pick<PaneHeaderProps, "ancestors" | "repository"> {
	const labels = repositoryLabels([...ancestors.map((each) => each.where), here]);
	const places = ancestors.map(({ place }, at) => {
		const label = labels[at];
		return label === undefined ? place : { ...place, repository: label };
	});
	const own = labels.at(-1);
	return own === undefined ? { ancestors: places } : { ancestors: places, repository: own };
}

export { useDrillPlaces };
