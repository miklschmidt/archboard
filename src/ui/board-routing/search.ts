// The workspace as search parameters, and back. One parameter per open pane,
// named for the pane and carrying the board key exactly as the pane reports it
// (`payments`, `payments@proposed`), plus `pane` for the active one when it is
// not the first. Nothing else of the workspace is addressable: selection, the
// camera, pending edits and live voice are session state and stay out of here.
//
//     /?paneA=payments
//     /?paneA=payments&paneB=payments@proposed&pane=B
//
// Search parameters rather than path segments because the canvas server serves
// the page at `/` alone, so a path would answer 404 on every direct load.

import {
	settledAddress,
	type AddressedPane,
	type WorkspaceAddress,
} from "@/ui/board-routing/address";

/** The search parameters this application owns, as they appear in the URL. */
type WorkspaceSearch = Readonly<Record<string, string>>;

/** Names the active pane; absent means the first open pane. */
const ACTIVE_PANE_PARAM = "pane";

/** `paneA`, `paneB`: one per open pane, carrying its board key. */
const PANE_PARAM = /^pane([A-Za-z0-9]+)$/;

/**
 * The parameter name for one pane.
 * @param paneId The pane.
 * @returns The name, `paneA` for pane A.
 */
function paneParam(paneId: string): string {
	return `${ACTIVE_PANE_PARAM}${paneId}`;
}

/**
 * One search value as a string, when it is one worth keeping.
 * @param value The raw value.
 * @returns The trimmed string, or null when it is empty or not a string.
 */
function stringValue(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

/**
 * Keep only the parameters this application owns, as strings.
 *
 * The router's `validateSearch`: everything else in the query string is
 * dropped, because the query string is the workspace and nothing else.
 * @param input The raw search parameters.
 * @returns The workspace search.
 */
function validateWorkspaceSearch(input: Record<string, unknown>): WorkspaceSearch {
	const search: Record<string, string> = {};
	for (const [key, raw] of Object.entries(input)) {
		const value = stringValue(raw);
		if (value === null) {
			continue;
		}
		if (key === ACTIVE_PANE_PARAM || PANE_PARAM.test(key)) {
			search[key] = value;
		}
	}
	return Object.freeze(search);
}

/**
 * The panes a search names, in the order they are written.
 * @param search The search.
 * @returns The panes and their boards.
 */
function panesFromSearch(search: WorkspaceSearch): readonly AddressedPane[] {
	const panes: AddressedPane[] = [];
	for (const [key, value] of Object.entries(search)) {
		const paneId = PANE_PARAM.exec(key)?.[1];
		if (paneId !== undefined && !panes.some((pane) => pane.paneId === paneId)) {
			panes.push(Object.freeze({ paneId, boardKey: value }));
		}
	}
	return panes.toSorted((one, other) => one.paneId.localeCompare(other.paneId));
}

/**
 * The workspace a search asks for.
 * @param search The validated search.
 * @returns The address, with no panes when the search names none.
 */
function addressFromSearch(search: WorkspaceSearch): WorkspaceAddress {
	return settledAddress({
		panes: panesFromSearch(search),
		activePaneId: search[ACTIVE_PANE_PARAM] ?? null,
	});
}

/**
 * The active pane, when it is worth writing down: the first open pane is what
 * an address with no `pane` already means.
 * @param address The address.
 * @returns The pane id, or null when it need not be written.
 */
function writtenActivePane(address: WorkspaceAddress): string | null {
	const first = address.panes[0]?.paneId ?? null;
	return address.activePaneId === null || address.activePaneId === first
		? null
		: address.activePaneId;
}

/**
 * The search that writes an address down. A pane that has not said what it
 * holds is left out: the address is only written once every open pane has a
 * board, so that half a workspace is never published.
 * @param address The address.
 * @returns The search.
 */
function searchFromAddress(address: WorkspaceAddress): WorkspaceSearch {
	const search: Record<string, string> = {};
	for (const pane of address.panes) {
		if (pane.boardKey !== null) {
			search[paneParam(pane.paneId)] = pane.boardKey;
		}
	}
	const active = writtenActivePane(address);
	if (active !== null) {
		search[ACTIVE_PANE_PARAM] = active;
	}
	return Object.freeze(search);
}

export {
	ACTIVE_PANE_PARAM,
	addressFromSearch,
	paneParam,
	searchFromAddress,
	validateWorkspaceSearch,
	type WorkspaceSearch,
};
