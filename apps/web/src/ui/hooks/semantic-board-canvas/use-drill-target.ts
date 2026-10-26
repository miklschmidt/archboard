// Where a card's drill-down leads: one reading, for the inspector's "Open" and
// for the double-click on the card.
//
// The reading has two steps, taken in this order by both of its adapters. The
// first finds the vault the target board is in (ADR 0050): a link that names a
// repository is compared with the repository of the vault it is drawn in, so
// that vault's listing is read first. When that listing cannot be read, the link
// leads nowhere: no other vault is guessed for it. The second reads the target
// board in that vault and picks the variant the link names, by a name it has or
// had (ADR 0036). A named variant that is not there is reported, never quietly
// swapped for whichever variant happens to be current. The two boards are two
// independent histories, and a link that landed on a different architecture
// from the one it named would be worse than a link that refuses (ADR 0023).
//
// The inspector subscribes to the reading, so it follows the board's news under
// the name it goes by now. The double-click asks once and gets a promise; the
// gesture decides whether its answer still counts.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useCallback } from "react";

import {
	resolveVariant,
	variantNamed,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";
import type { RepositoryEntry } from "@archboard/workspace/repositories";
import type { SemanticNode } from "@archboard/board/content";
import { readBoard } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import type {
	OtherRepository,
	RepositoryPlace,
	RepositoryPlaces,
} from "#ui/rules/semantic-board-canvas/drilling/drill-target.ts";
import {
	semanticBoardDocumentQuery,
	semanticBoardListQuery,
} from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import type { SemanticBoardListing } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { RepositoryPlacesContext } from "#ui/state/semantic-board-canvas/repository-places.ts";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";
import { useSemanticBoardChanges } from "#ui/hooks/semantic-board-canvas/use-semantic-board-changes.ts";

type DrillDown = NonNullable<SemanticNode["drillDown"]>;

/** Where a drill-down leads, or the one reason it leads nowhere yet. */
type DrillTarget =
	| {
			readonly kind: "ready";
			readonly board: SemanticBoard;
			readonly variant: SemanticVariant;
			/** The other repository it is in, or undefined for the vault the link is drawn in. */
			readonly there: OtherRepository | undefined;
	  }
	/** The listing or the board is still on its way. */
	| { readonly kind: "reading" }
	/** The vault the link is drawn in could not be listed, so its repository is not known. */
	| { readonly kind: "listing-failed"; readonly problem: string }
	/** The link names a repository this machine lists no checkout of. */
	| { readonly kind: "unregistered"; readonly repo: string }
	/** The link names a repository whose chosen checkout cannot be read. */
	| {
			readonly kind: "unreachable";
			readonly repo: string;
			readonly state: Exclude<RepositoryEntry["state"], "ready">;
	  }
	/** The target board could not be read in its vault. */
	| { readonly kind: "unreadable"; readonly problem: string }
	/** The target board has no variant by the name the link asks for. */
	| { readonly kind: "no-variant"; readonly asked: string }
	/** The link asks for whichever variant is current, and the board has none. */
	| { readonly kind: "no-current" };

/** One read the reading waits on, as far as it has got. */
type Read<T> =
	| { readonly kind: "reading" }
	| { readonly kind: "failed"; readonly problem: string }
	| { readonly kind: "read"; readonly value: T };

/** The vault the target board is in: the link's own, or another repository's. */
type Place = { readonly kind: "readable"; readonly there: OtherRepository | undefined };

/**
 * The listing a link that names no repository never asks for: it is a link
 * within the vault it is drawn in, whatever that vault's listing says.
 */
const NOT_ASKED: Read<never> = { kind: "reading" };

/**
 * Where a drill-down's board lies. A link that names no repository, or the
 * repository of the vault it is drawn in, is a link within that vault. Another
 * repository's board is read in the vault of its chosen checkout.
 * @param target What the node's drill-down names.
 * @param listing The listing of the vault the link is drawn in, as far as it is read.
 * @param places The repositories this machine lists.
 * @returns Where the board is, or why it cannot be read yet or at all.
 */
function placeOf(
	target: DrillDown,
	listing: Read<SemanticBoardListing>,
	places: RepositoryPlaces,
): Place | Exclude<DrillTarget, { readonly kind: "ready" }> {
	const repo = target.repo;
	if (repo === undefined) return { kind: "readable", there: undefined };
	if (listing.kind === "reading") return listing;
	if (listing.kind === "failed") return { kind: "listing-failed", problem: listing.problem };
	if (repo === listing.value.repository) return { kind: "readable", there: undefined };
	const place = places(repo);
	return place === undefined ? { kind: "unregistered", repo } : placeIn(repo, place);
}

/**
 * Where a listed repository's board lies.
 * @param repo The repository identity.
 * @param place Its chosen checkout's vault, and whether that is ready.
 * @returns Its vault, or why it cannot be read.
 */
function placeIn(
	repo: string,
	place: RepositoryPlace,
): Place | Extract<DrillTarget, { readonly kind: "unreachable" }> {
	if (place.vault === null) {
		return { kind: "unreachable", repo, state: place.state === "ready" ? "no-vault" : place.state };
	}
	if (place.state !== "ready") return { kind: "unreachable", repo, state: place.state };
	return { kind: "readable", there: { vault: place.vault, repository: repo } };
}

/**
 * Which variant of the target board a drill-down opens, once the board is read.
 * @param target What the node's drill-down names.
 * @param there The other repository the board is in, if any.
 * @param document The target board, as its route answered in its vault, as far as it is read.
 * @returns The destination, or why there is none.
 */
function destinationOf(
	target: DrillDown,
	there: OtherRepository | undefined,
	document: Read<unknown>,
): DrillTarget {
	if (document.kind === "reading") return document;
	if (document.kind === "failed") return { kind: "unreadable", problem: document.problem };
	const reading = readBoard(document.value);
	return reading.ok
		? variantOf(target, reading.board, there)
		: { kind: "unreadable", problem: reading.problem };
}

/**
 * The variant of the target board a drill-down opens.
 * @param target What the node's drill-down names.
 * @param board The target board.
 * @param there The other repository the board is in, if any.
 * @returns The destination, or why there is none.
 */
function variantOf(
	target: DrillDown,
	board: SemanticBoard,
	there: OtherRepository | undefined,
): DrillTarget {
	const asked = target.variant;
	if (asked.kind === "current") {
		const current = resolveVariant(board);
		return current === undefined
			? { kind: "no-current" }
			: { kind: "ready", board, variant: current, there };
	}
	// By name, or by a name the variant had before a rename (ADR 0036): a link
	// written then still means the state it named.
	const named = variantNamed(board, asked.name);
	return named === undefined
		? { kind: "no-variant", asked: asked.name }
		: { kind: "ready", board, variant: named, there };
}

/**
 * One subscribed read, as far as it has got. A failure counts over an older
 * answer, as a fresh read would fail rather than answer with what is cached.
 * @param query The subscription.
 * @param query.data What it holds.
 * @param query.error Why its last read failed, if it did.
 * @returns The read.
 */
function subscribed<T>(query: {
	readonly data: T | undefined;
	readonly error: Error | null;
}): Read<T> {
	if (query.error !== null) return { kind: "failed", problem: query.error.message };
	return query.data === undefined ? { kind: "reading" } : { kind: "read", value: query.data };
}

/**
 * One read asked once, once it has settled.
 * @param asked The read.
 * @returns The read.
 */
async function settled<T>(asked: Promise<T>): Promise<Read<T>> {
	try {
		return { kind: "read", value: await asked };
	} catch (error) {
		return { kind: "failed", problem: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * The name the target board goes by now: what the link names, unless the board
 * was renamed since and answered to the name it had (ADR 0036).
 * @param target What the node's drill-down names.
 * @param document The target board, as its route answered, or undefined before it has.
 * @returns The board's own name once it has been read, else the link's.
 */
function nameNow(target: DrillDown, document: unknown): string {
	if (document === undefined) return target.board;
	const reading = readBoard(document);
	return reading.ok ? reading.board.name : target.board;
}

/**
 * Where a drill-down drawn in this pane's vault leads, kept up to date: the
 * target board is heard under the name it goes by now, so a state superseded
 * since the link was written is never offered as though it were current.
 * @param target What the node's drill-down names.
 * @returns Where it leads, or why it leads nowhere yet.
 */
function useDrillTarget(target: DrillDown): DrillTarget {
	const vault = usePaneVault();
	const places = use(RepositoryPlacesContext);
	const listing = useQuery({
		...semanticBoardListQuery(vault),
		enabled: target.repo !== undefined,
	});
	const place = placeOf(target, subscribed(listing), places);
	const there = place.kind === "readable" ? place.there : undefined;
	const inVault = there?.vault ?? vault;
	const document = useQuery({
		...semanticBoardDocumentQuery(inVault, target.board),
		enabled: place.kind === "readable",
	});
	useSemanticBoardChanges(inVault, target.board, nameNow(target, document.data));
	return place.kind === "readable" ? destinationOf(target, there, subscribed(document)) : place;
}

/**
 * Where drill-downs drawn in this pane's vault lead, each asked once.
 * @returns Read where one drill-down leads; the promise settles once it is known, and never rejects.
 */
function useDrillTargetReader(): (target: DrillDown) => Promise<DrillTarget> {
	const queryClient = useQueryClient();
	const vault = usePaneVault();
	const places = use(RepositoryPlacesContext);
	return useCallback(
		async (target: DrillDown): Promise<DrillTarget> => {
			const listing =
				target.repo === undefined
					? NOT_ASKED
					: await settled(queryClient.fetchQuery(semanticBoardListQuery(vault)));
			const place = placeOf(target, listing, places);
			if (place.kind !== "readable") return place;
			const inVault = place.there?.vault ?? vault;
			const document = await settled(
				queryClient.fetchQuery(semanticBoardDocumentQuery(inVault, target.board)),
			);
			return destinationOf(target, place.there, document);
		},
		[queryClient, vault, places],
	);
}

export { useDrillTarget, useDrillTargetReader, type DrillTarget };
