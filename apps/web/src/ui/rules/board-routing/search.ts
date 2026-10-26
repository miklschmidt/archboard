// The workspace as search parameters, and back. One parameter per open pane,
// named for the pane and carrying the board key exactly as the pane reports it
// (`payments`, `payments@proposed`), plus `repoA` for the repository the board
// is in (ADR 0050), plus `pane` for the active one when it is not the first,
// plus `viewA` for a semantic board being read through one of its named views.
// A repository is named by its identity or by an untracked vault's registry
// name, never by a path. Nothing else of the workspace is addressable:
// selection, the camera, pending edits and live voice are session state and
// stay out of here.
//
// The view is in the address rather than in the board key because it is not
// part of the board's identity: `semantic:pipeline` is one board however it is
// being explained, and a key that carried the reading would make two of them.
// It is here at all — rather than left as pane state — because reload, Back and
// Forward have to come back to the explanation the person was looking at, and a
// link somebody sends has to open on the one they meant.
//
//     /?paneA=payments&repoA=github.com/acme/shop
//     /?paneA=payments&repoA=github.com/acme/shop&paneB=ledger&repoB=github.com/acme/billing&pane=B
//     /?paneA=semantic:pipeline&viewA=k3f9
//
// Search parameters rather than path segments because the Archboard server serves
// the page at `/` alone, so a path would answer 404 on every direct load.

import {
	settledAddress,
	type AddressedPane,
	type ModelAddress,
	type WorkspaceAddress,
} from "#ui/rules/board-routing/address.ts";

/** The search parameters this application owns, as they appear in the URL. */
type WorkspaceSearch = Readonly<Record<string, string>>;

/**
 * Read the query string with every value left as the string it was written as.
 *
 * The router's own reader converts what looks like a number or a boolean, so
 * `?paneA=2026` would name the number 2026 and `?paneA=true` a boolean — and
 * every one of `2026`, `true` and `1.5` is a name a board is allowed to have.
 * @param searchStr The query string, with or without its leading question mark.
 * @returns The parameters, all of them strings.
 */
function parseWorkspaceSearchString(searchStr: string): Record<string, string> {
	const search: Record<string, string> = {};
	for (const [key, value] of new URLSearchParams(searchStr)) {
		search[key] = value;
	}
	return search;
}

/**
 * Write the query string back. `/`, `@` and `:` are left as they are: all three
 * are legal in a query string, and a board key is meant to be read in the
 * address bar — `payments@proposed` and `semantic:pipeline` say what they are,
 * and `payments%40proposed` says nothing to anybody.
 * @param search The parameters.
 * @returns The query string, with its leading question mark, or empty.
 */
function stringifyWorkspaceSearch(search: Record<string, unknown>): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(search)) {
		// The workspace search is board keys and a pane id; anything else in it
		// is not this application's and is not written back.
		if (typeof value === "string") {
			params.set(key, value);
		}
	}
	const query = params
		.toString()
		.replaceAll("%2F", "/")
		.replaceAll("%40", "@")
		.replaceAll("%3A", ":");
	return query === "" ? "" : `?${query}`;
}

/** Names the active pane; absent means the first open pane. */
const ACTIVE_PANE_PARAM = "pane";

/** `paneA`, `paneB`: one per open pane, carrying its board key. */
const PANE_PARAM = /^pane([A-Za-z0-9]+)$/;

/** `viewA`: the view one pane reads its semantic board through. */
const VIEW_PARAM = /^view([A-Za-z0-9]+)$/;

/** The repository of one pane's board: `repoA`, `repoB`. */
const REPO_PARAM = /^repo([A-Za-z0-9]+)$/;

/**
 * The parameter name for one pane.
 * @param paneId The pane.
 * @returns The name, `paneA` for pane A.
 */
function paneParam(paneId: string): string {
	return `${ACTIVE_PANE_PARAM}${paneId}`;
}

/**
 * The parameter name for one pane's view.
 * @param paneId The pane.
 * @returns The name, `viewA` for pane A.
 */
function viewParam(paneId: string): string {
	return `view${paneId}`;
}

/**
 * The parameter naming the repository of one pane's board.
 * @param paneId The pane.
 * @returns `repo` and the pane's letter.
 */
function repoParam(paneId: string): string {
	return `repo${paneId}`;
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
		if (value !== null && ownedParam(key)) {
			search[key] = value;
		}
	}
	return search;
}

/** The parameters each pane owns: its board, its view and its board's repository. */
const PANE_PARAMS: readonly RegExp[] = [
	PANE_PARAM,
	VIEW_PARAM,
	REPO_PARAM,
	/^(model|scope|checkpoint)([A-Za-z0-9]+)$/,
];

/**
 * Whether a search parameter is one the workspace owns.
 * @param key The parameter's name.
 * @returns True for the active pane and every pane's own parameters.
 */
function ownedParam(key: string): boolean {
	return key === ACTIVE_PANE_PARAM || PANE_PARAMS.some((param) => param.test(key));
}

/**
 * The panes a search names, in the order they are written.
 * @param search The search.
 * @returns The panes and their boards.
 */
function panesFromSearch(search: WorkspaceSearch): readonly AddressedPane[] {
	const panes: AddressedPane[] = [];
	for (const key of Object.keys(search)) {
		const paneId = /^(?:pane|model)([A-Za-z0-9]+)$/.exec(key)?.[1];
		if (paneId !== undefined && !panes.some((pane) => pane.paneId === paneId)) {
			panes.push(paneFromSearch(search, paneId));
		}
	}
	return panes.toSorted((one, other) => one.paneId.localeCompare(other.paneId));
}

/**
 * One pane a search names. A view or a repository named for a pane that is not
 * open names nothing; a pane on an ordinary board has no views, and its stated
 * one is ignored the same way.
 * @param search The search.
 * @param paneId The pane.
 * @returns The pane.
 */
function paneFromSearch(search: WorkspaceSearch, paneId: string): AddressedPane {
	const model = modelFromSearch(search, paneId);
	return Object.freeze({
		paneId,
		model,
		boardKey: model === undefined ? (search[paneParam(paneId)] ?? null) : null,
		repository: search[repoParam(paneId)] ?? null,
		view: search[viewParam(paneId)] ?? null,
	});
}

/**
 * Read the canonical identity without replacing a missing checkpoint or scope.
 * @param search The requested workspace.
 * @param paneId The addressed pane.
 * @returns Exact canonical intent, or no canonical reading.
 */
function modelFromSearch(search: WorkspaceSearch, paneId: string): ModelAddress | undefined {
	const id = search[`model${paneId}`];
	if (id === undefined) return undefined;
	return {
		id,
		scope: search[`scope${paneId}`] ?? null,
		checkpoint: search[`checkpoint${paneId}`] ?? null,
	};
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
 * The parameters one pane writes: its board, its board's repository and its
 * view, or nothing while it has not said what it holds.
 * @param pane The pane.
 * @returns Its parameters.
 */
function paneSearch(pane: AddressedPane): Record<string, string> {
	if (pane.model !== undefined) return modelSearch(pane);
	if (pane.boardKey === null) return {};
	return {
		[paneParam(pane.paneId)]: pane.boardKey,
		...(pane.repository === null ? {} : { [repoParam(pane.paneId)]: pane.repository }),
		...(pane.view === null ? {} : { [viewParam(pane.paneId)]: pane.view }),
	};
}

/**
 * Preserve exact model identity and scope even when that reading is unavailable.
 * @param pane The addressed canonical pane.
 * @returns Its portable reading parameters.
 */
function modelSearch(pane: AddressedPane): Record<string, string> {
	const model = pane.model;
	if (model === undefined) return {};
	return {
		[`model${pane.paneId}`]: model.id,
		...(pane.repository === null ? {} : { [repoParam(pane.paneId)]: pane.repository }),
		...(model.scope === null ? {} : { [`scope${pane.paneId}`]: model.scope }),
		...(model.checkpoint === null ? {} : { [`checkpoint${pane.paneId}`]: model.checkpoint }),
	};
}

/**
 * The search that writes an address down. A pane that has not said what it
 * holds is left out: the address is only written once every open pane has a
 * board, so that half a workspace is never published.
 * @param address The address.
 * @returns The search.
 */
function searchFromAddress(address: WorkspaceAddress): WorkspaceSearch {
	const search: Record<string, string> = Object.assign({}, ...address.panes.map(paneSearch));
	const active = writtenActivePane(address);
	if (active !== null) {
		search[ACTIVE_PANE_PARAM] = active;
	}
	return search;
}

export {
	ACTIVE_PANE_PARAM,
	addressFromSearch,
	paneParam,
	parseWorkspaceSearchString,
	repoParam,
	searchFromAddress,
	stringifyWorkspaceSearch,
	viewParam,
	validateWorkspaceSearch,
	type WorkspaceSearch,
};
