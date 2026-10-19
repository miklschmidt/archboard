// The repositories a pane's drill-downs can lead into (ADR 0050).
//
// A drill-down names a repository identity, and the vault it is read from is
// that repository's chosen checkout's on this machine. The canvas cannot read
// the machine's repositories itself, so the application provides them, as it
// provides the pane's vault. Outside an application nothing is listed, and a
// link into another repository reads as unregistered.

import { createContext } from "react";

import type { RepositoryPlaces } from "#ui/rules/semantic-board-canvas/drilling/drill-target.ts";

/**
 * No repository is listed.
 * @returns Undefined, for every identity.
 */
function noRepositories(): undefined {
	return undefined;
}

/** The repositories this machine lists by identity. */
const RepositoryPlacesContext = createContext<RepositoryPlaces>(noRepositories);

export { RepositoryPlacesContext };
