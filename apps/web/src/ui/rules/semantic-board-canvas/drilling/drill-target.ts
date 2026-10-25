// Where a node's drill-down leads, once the board it names has been read.
//
// A link between two boards is a link between two independent histories, so it
// is resolved rather than assumed: a named variant that is not there is
// reported, never quietly swapped for whichever variant happens to be current.
// A link that landed on a different architecture from the one it named would be
// worse than a link that refuses (ADR 0023).

import {
	resolveVariant,
	variantNamed,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";
import type { RepositoryEntry } from "@archboard/workspace/repositories";
import { readBoard } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import type { SemanticNode } from "@archboard/board/content";

type DrillDown = NonNullable<SemanticNode["drillDown"]>;

/** A repository a drill-down can name, as this machine lists it. */
type RepositoryPlace = Pick<RepositoryEntry, "vault" | "state">;

/**
 * The repositories this machine lists by identity. An untracked vault has no
 * identity, so no drill-down can name it and it is never answered here.
 * @param identity A repository identity.
 * @returns How it is listed, or undefined when it is not.
 */
type RepositoryPlaces = (identity: string) => RepositoryPlace | undefined;

/** Another repository's vault that a drill-down leads into. */
interface OtherRepository {
	/** The vault of the repository's chosen checkout. */
	readonly vault: string;
	/** The repository identity. */
	readonly repository: string;
}

/** Which vault a drill-down's board is in, or why none can be read. */
type DrillPlace =
	| {
			readonly kind: "readable";
			/** The other repository it is in, or undefined for the vault the link is drawn in. */
			readonly there: OtherRepository | undefined;
	  }
	| { readonly kind: "unregistered"; readonly repo: string }
	| {
			readonly kind: "unreachable";
			readonly repo: string;
			readonly state: Exclude<RepositoryEntry["state"], "ready">;
	  };

/**
 * Where a drill-down's board lies (ADR 0050). A link that names no repository,
 * or the repository of the vault it is drawn in, is a link within that vault.
 * Another repository's board is read in the vault of its chosen checkout.
 * @param target What the node's drill-down names.
 * @param own The repository identity of the vault the link is drawn in, if it has one.
 * @param places The repositories this machine lists.
 * @returns Where the board is, or why it cannot be read here.
 */
function drillPlace(
	target: DrillDown,
	own: string | undefined,
	places: RepositoryPlaces,
): DrillPlace {
	const repo = target.repo;
	if (repo === undefined || repo === own) return { kind: "readable", there: undefined };
	const place = places(repo);
	return place === undefined ? { kind: "unregistered", repo } : placeIn(repo, place);
}

/**
 * Where a listed repository's board lies.
 * @param repo The repository identity.
 * @param place Its chosen checkout's vault, and whether that is ready.
 * @returns Its vault, or why it cannot be read.
 */
function placeIn(repo: string, place: RepositoryPlace): DrillPlace {
	if (place.vault === null) {
		return { kind: "unreachable", repo, state: place.state === "ready" ? "no-vault" : place.state };
	}
	if (place.state !== "ready") return { kind: "unreachable", repo, state: place.state };
	return { kind: "readable", there: { vault: place.vault, repository: repo } };
}

/**
 * Open a drill-down's board.
 * @param board The target board.
 * @param variant The variant to open, by id.
 * @param there The other repository's vault it is in, when it is not in the pane's own.
 */
type OpenDown = (board: string, variant: string, there?: OtherRepository) => void;

/** Where a drill-down leads, once the target board has been read in its vault. */
type DrillResolution =
	| { readonly kind: "ready"; readonly board: SemanticBoard; readonly variant: SemanticVariant }
	| { readonly kind: "no-variant"; readonly asked: string }
	| { readonly kind: "no-current" }
	| { readonly kind: "unreadable"; readonly problem: string };

/**
 * Which variant of the target board a drill-down opens.
 *
 * A named target that is not there is reported, never quietly swapped for
 * whichever variant happens to be current. The two boards are two independent
 * histories, and a link that landed on a different architecture from the one it
 * named would be worse than a link that refuses (ADR 0023).
 * @param target What the node's drill-down names.
 * @param document The target board, as its route answered in the vault `drillPlace` named.
 * @returns The variant to open, or why there is none.
 */
function resolveDrillDown(target: DrillDown, document: unknown): DrillResolution {
	const reading = readBoard(document);
	if (!reading.ok) {
		return { kind: "unreadable", problem: reading.problem };
	}
	const asked = target.variant;
	if (asked.kind === "current") {
		const current = resolveVariant(reading.board);
		return current === undefined
			? { kind: "no-current" }
			: { kind: "ready", board: reading.board, variant: current };
	}
	// By name, or by a name the variant had before a rename (ADR 0036): a link
	// written then still means the state it named.
	const named = variantNamed(reading.board, asked.name);
	return named === undefined
		? { kind: "no-variant", asked: asked.name }
		: { kind: "ready", board: reading.board, variant: named };
}

/**
 * The name the target board goes by now: what the link names, unless the board
 * was renamed since and answered to the name it had (ADR 0036).
 * @param target What the node's drill-down names.
 * @param document The target board, as its route answered in its vault, or undefined before it has.
 * @returns The board's own name once it has been read, else the link's.
 */
function drillTargetName(target: DrillDown, document: unknown): string {
	if (document === undefined) {
		return target.board;
	}
	const reading = readBoard(document);
	return reading.ok ? reading.board.name : target.board;
}

/**
 * How a drill-down's variant is spelled in the words a person reads.
 * @param target What the node's drill-down names.
 * @returns The variant as it was asked for.
 */
function drillDownAsked(target: DrillDown): string {
	return target.variant.kind === "current" ? "whichever variant is current" : target.variant.name;
}

export {
	drillDownAsked,
	drillPlace,
	drillTargetName,
	resolveDrillDown,
	type DrillPlace,
	type DrillResolution,
	type OpenDown,
	type OtherRepository,
	type RepositoryPlace,
	type RepositoryPlaces,
};
