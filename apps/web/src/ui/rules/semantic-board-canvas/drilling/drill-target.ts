// What a node's drill-down leads into, in the words the canvas and the
// application share: the repositories this machine lists, the other
// repository a board can lie in, and the act of opening one. Where one
// drill-down leads is read by `use-drill-target.ts`.

import type { RepositoryEntry } from "@archboard/workspace/repositories";

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

/**
 * Open a drill-down's board.
 * @param board The target board.
 * @param variant The variant to open, by id.
 * @param there The other repository's vault it is in, when it is not in the pane's own.
 */
type OpenDown = (board: string, variant: string, there?: OtherRepository) => void;

export { type OpenDown, type OtherRepository, type RepositoryPlace, type RepositoryPlaces };
