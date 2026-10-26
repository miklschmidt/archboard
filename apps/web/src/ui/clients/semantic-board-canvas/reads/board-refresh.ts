import { architectureModelKeys } from "#ui/clients/architecture-model/queries.ts";
// What makes this tab read a board again, and in what order (ADR 0023).
//
// Callers report what happened: a board changed, boards of a vault were
// written or let go, a listing may have moved, a vault's policy changed, the
// socket came back or a person asked for everything again. This module alone
// decides which readings that makes stale, under which of the names the tab
// asked a board by (ADR 0036), in which vault (ADR 0049), and in what order the
// reads in flight are cancelled, the readings marked stale and read again.
//
// The order is the whole of the contract. A read already on the wire carries
// an answer the server decided before the event, so it is cancelled first and
// never lands as fresh. A board's document is marked before its pictures,
// because a picture reads its board the moment it is asked for again and a
// document not yet marked is the one from before the write.
//
// `boardsListed` and `boardGoneStale` serve the module's own listing query and
// drawing ahead; nothing outside `reads/` calls them.

import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { boardCatalogKeys } from "#ui/clients/board-catalog/queries.ts";
import {
	cachedReadings,
	semanticBoardKeys,
} from "#ui/clients/semantic-board-canvas/reads/board-keys.ts";
import type { SemanticBoardEntry } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { boardAddressOf, sameBoardName } from "#ui/rules/semantic-board-canvas/board/address.ts";

/**
 * Read these queries again, so that an event is answered from after it and
 * never by a request that was already on the wire before it.
 *
 * Every read in flight is cancelled first. A cache with nothing behind that
 * key cannot restart such a read, and a query no one is reading right now is
 * skipped by a refetch altogether, so the stale answer would land, clear the
 * invalidation and count as fresh. A cancelled read is reverted rather than
 * failed: data already in hand stays on screen, no error reaches a person, and
 * the invalidation stands. Then they are marked stale in the order given,
 * without cancelling a read that started after the cancelling.
 * @param client The cache.
 * @param queryKeys The queries, by exact key or by prefix, sources before what they feed.
 * @returns Settles once the fresh reads have been asked for.
 */
async function readAgain(client: QueryClient, queryKeys: readonly QueryKey[]): Promise<void> {
	await Promise.all(queryKeys.map((queryKey) => client.cancelQueries({ queryKey })));
	await Promise.all(
		queryKeys.map((queryKey) => client.invalidateQueries({ queryKey }, { cancelRefetch: false })),
	);
}

/**
 * The names a cached reading says its board has: a document's name and former
 * names, and the board a picture was drawn of.
 * @param data What the cache holds.
 * @returns The names, possibly none.
 */
function namesIn(data: unknown): string[] {
	if (typeof data !== "object" || data === null) return [];
	const record = data as { name?: unknown; board?: unknown; formerNames?: unknown };
	const formerNames = Array.isArray(record.formerNames) ? (record.formerNames as unknown[]) : [];
	return [record.name, record.board, ...formerNames].filter(
		(name): name is string => typeof name === "string",
	);
}

/**
 * Every name this tab asked one board of one vault by: another spelling of it,
 * or a name the board's own reading says it has had or has now.
 * @param client The tab's cache.
 * @param vault The vault the board is in.
 * @param board The board, by any of its names.
 * @returns The names, as they were asked.
 */
function namesAskedFor(client: QueryClient, vault: string, board: string): string[] {
	const said = new Map<string, string[]>();
	for (const reading of cachedReadings(client, vault)) {
		said.set(reading.asked, [...(said.get(reading.asked) ?? []), ...namesIn(reading.data)]);
	}
	return [...said].flatMap(([asked, names]) =>
		[asked, ...names].some((name) => sameBoardName(name, board)) ? [asked] : [],
	);
}

/**
 * Every reading of these boards, by the names they were asked by: the documents before the pictures.
 * @param vault The vault the boards are in.
 * @param names The names.
 * @returns The keys.
 */
function readingsOf(vault: string, names: readonly string[]): QueryKey[] {
	return [
		...names.map((name) => semanticBoardKeys.document(vault, name)),
		...names.map((name) => semanticBoardKeys.boardRenders(vault, name)),
	];
}

/**
 * One board of one vault moved to a new version: its document and every picture
 * of it are read again, under every name this tab asked it by.
 * @param client The tab's cache.
 * @param vault The vault the board is in.
 * @param board The board, by any of its names, or a board key naming a variant.
 * @returns Settles once the fresh reads have been asked for.
 */
function boardChanged(client: QueryClient, vault: string, board: string): Promise<void> {
	const name = boardAddressOf(board)?.board ?? board;
	return readAgain(client, readingsOf(vault, namesAskedFor(client, vault, name)));
}

/**
 * These boards of one vault have been written, or stopped being worked on:
 * the vault's listing and which pane holds what are read again either way, and
 * each named board as `boardChanged` reads it.
 * @param client The tab's cache.
 * @param vault The vault the boards are in.
 * @param boards The board keys, which may be none. A key that names a variant is of the whole board.
 * @returns Settles once the fresh reads have been asked for.
 */
async function boardsChanged(
	client: QueryClient,
	vault: string,
	boards: readonly string[],
): Promise<void> {
	await Promise.all([
		readAgain(client, [semanticBoardKeys.boards(vault), boardCatalogKeys.panes]),
		...boards.map((board) => boardChanged(client, vault, board)),
	]);
}

/**
 * Something may have moved what every vault lists or what the panes hold: a
 * board command, a pane report. The repositories are not read: only a chosen
 * checkout moves those, and it is announced.
 * @param client The tab's cache.
 * @returns Settles once the fresh reads have been asked for.
 */
function listingsChanged(client: QueryClient): Promise<void> {
	return readAgain(client, [semanticBoardKeys.allBoards, boardCatalogKeys.panes]);
}

/**
 * A checkout was chosen somewhere: the repositories are read again, and with them their boards.
 * @param client The tab's cache.
 * @returns Settles once the fresh reads have been asked for.
 */
function repositoriesChanged(client: QueryClient): Promise<void> {
	return readAgain(client, [boardCatalogKeys.repositories]);
}

/**
 * A vault's policy changed, or was read for the first time: every picture of
 * the vault is drawn again under it. No document is read again: the policy is
 * not part of a board.
 * @param client The tab's cache.
 * @param vault The vault.
 * @returns Settles once the fresh reads have been asked for.
 */
function policyChanged(client: QueryClient, vault: string): Promise<void> {
	return readAgain(client, [semanticBoardKeys.rendersIn(vault)]);
}

/**
 * Read the repositories, the listings, the panes, and every document and
 * picture of every board again: what a reconnected socket needs, since
 * whatever moved while it was down moved unheard, and the one control a person
 * has when something the shell reads has gone wrong. The documents matter as
 * much as the pictures: the inspector and the variant controls are built from
 * them, and a fresh picture beside a document of before would explain a board
 * as it used to be.
 * @param client The tab's cache.
 * @returns Settles once the fresh reads have been asked for.
 */
async function readEverythingAgain(client: QueryClient): Promise<void> {
	await Promise.all([
		repositoriesChanged(client),
		listingsChanged(client),
		readAgain(client, [
			semanticBoardKeys.documents,
			semanticBoardKeys.renders,
			architectureModelKeys.all,
		]),
	]);
}

/**
 * Mark a board's readings stale without reading anything, documents first,
 * under every name this tab asked it by: for the module's own drawing ahead,
 * which reads what it needs itself.
 * @param client The tab's cache.
 * @param vault The vault the board is in.
 * @param board The board, by any of its names.
 */
async function boardGoneStale(client: QueryClient, vault: string, board: string): Promise<void> {
	for (const queryKey of readingsOf(vault, namesAskedFor(client, vault, board))) {
		// oxlint-disable-next-line no-await-in-loop -- in order: the documents before the pictures drawn from them
		await client.invalidateQueries({ queryKey, refetchType: "none" });
	}
}

/**
 * The version a cached document or picture is of, when it says.
 * @param data What the cache holds.
 * @returns The version, or nothing.
 */
function versionOf(data: unknown): number | undefined {
	if (typeof data !== "object" || data === null || !("version" in data)) return undefined;
	return typeof data.version === "number" ? data.version : undefined;
}

/**
 * The server listed one vault's boards: every reading this tab holds there of
 * a board at another version than listed is read again, whichever of the
 * board's names it was asked by.
 *
 * A pane hears of a write only to a board of the vault it is in, so nothing
 * else tells this tab about a vault none of its panes is in: a board drawn
 * ahead from the navigator's listing, or left behind when a pane moved to
 * another checkout. The readings are marked stale at once, so that the drawing
 * ahead that follows this listing draws them again rather than keeping them.
 * @param client The tab's cache.
 * @param vault The vault.
 * @param boards The boards listed there, with their versions.
 */
function boardsListed(
	client: QueryClient,
	vault: string,
	boards: readonly SemanticBoardEntry[],
): void {
	const moved = new Set(
		cachedReadings(client, vault).flatMap(({ asked, data }) => {
			const held = versionOf(data);
			// A reading asked by a former name is listed under the name its board
			// goes by now, which only the reading itself says (ADR 0036).
			const names = [asked, ...namesIn(data)];
			const listed = boards.find((entry) =>
				names.some((name) => sameBoardName(name, entry.key) || sameBoardName(name, entry.name)),
			)?.version;
			return held !== undefined && listed !== undefined && listed !== held ? [asked] : [];
		}),
	);
	if (moved.size === 0) return;
	const queryKeys = readingsOf(vault, [...moved]);
	for (const queryKey of queryKeys) {
		void client.invalidateQueries({ queryKey, refetchType: "none" });
	}
	void readAgain(client, queryKeys);
}

export {
	boardChanged,
	boardGoneStale,
	boardsChanged,
	boardsListed,
	listingsChanged,
	policyChanged,
	readEverythingAgain,
	repositoriesChanged,
};
