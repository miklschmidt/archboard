// What makes this tab read a model again, and in what order (ADR 0023).
//
// Callers report what happened: a model changed, models of a vault were
// written or let go, a listing may have moved, a vault's policy changed, the
// socket came back or a person asked for everything again. This module alone
// decides which readings that makes stale, under which of the names the tab
// asked a model by (ADR 0036), in which vault (ADR 0049), and in what order the
// reads in flight are cancelled, the readings marked stale and read again.
//
// The order is the whole of the contract. A read already on the wire carries
// an answer the server decided before the event, so it is cancelled first and
// never lands as fresh. A model's document is marked before its pictures,
// because a picture reads its model the moment it is asked for again and a
// document not yet marked is the one from before the write.
//
// `modelsListed` and `modelGoneStale` serve the module's own listing query and
// drawing ahead; nothing outside `reads/` calls them.

import type { QueryClient, QueryKey } from "@tanstack/react-query";

import {
	cachedReadings,
	readKeys,
} from "#ui/architecture-drawing/canvas/picture/reads/clients/read-keys.ts";
import type { DocumentEntry } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import {
	paneAddressOf,
	sameModelName,
} from "#ui/architecture-drawing/canvas/picture/rules/address.ts";

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
 * The names a cached reading says its model has: a document's name and former
 * names, and the model a picture was drawn of.
 * @param data What the cache holds.
 * @returns The names, possibly none.
 */
function namesIn(data: unknown): string[] {
	if (typeof data !== "object" || data === null) return [];
	const record = data as { name?: unknown; model?: unknown; formerNames?: unknown };
	const formerNames = Array.isArray(record.formerNames) ? (record.formerNames as unknown[]) : [];
	return [record.name, record.model, ...formerNames].filter(
		(name): name is string => typeof name === "string",
	);
}

/**
 * Every name this tab asked one legacy board of one vault by: another spelling of it,
 * or a name the legacy board's own reading says it has had or has now.
 * @param client The tab's cache.
 * @param vault The vault the legacy board is in.
 * @param model The legacy board, by any of its names.
 * @returns The names, as they were asked.
 */
function namesAskedFor(client: QueryClient, vault: string, model: string): string[] {
	const said = new Map<string, string[]>();
	for (const reading of cachedReadings(client, vault)) {
		said.set(reading.asked, [...(said.get(reading.asked) ?? []), ...namesIn(reading.data)]);
	}
	return [...said].flatMap(([asked, names]) =>
		[asked, ...names].some((name) => sameModelName(name, model)) ? [asked] : [],
	);
}

/**
 * Every reading of these models, by the names they were asked by: the documents before the pictures.
 * @param vault The vault the models are in.
 * @param names The names.
 * @returns The keys.
 */
function readingsOf(vault: string, names: readonly string[]): QueryKey[] {
	return [
		...names.map((name) => readKeys.document(vault, name)),
		...names.map((name) => readKeys.modelRenders(vault, name)),
	];
}

/**
 * One legacy board of one vault moved to a new version: its document and every picture
 * of it are read again, under every name this tab asked it by.
 * @param client The tab's cache.
 * @param vault The vault the legacy board is in.
 * @param model The legacy board, by any of its names, or a legacy board key naming a variant.
 * @returns Settles once the fresh reads have been asked for.
 */
function modelChanged(client: QueryClient, vault: string, model: string): Promise<void> {
	const name = paneAddressOf(model)?.model ?? model;
	return readAgain(client, readingsOf(vault, namesAskedFor(client, vault, name)));
}

/**
 * A vault's policy changed, or was read for the first time: every picture of
 * the vault is drawn again under it. No document is read again: the policy is
 * not part of a model.
 * @param client The tab's cache.
 * @param vault The vault.
 * @returns Settles once the fresh reads have been asked for.
 */
function policyChanged(client: QueryClient, vault: string): Promise<void> {
	return readAgain(client, [readKeys.rendersIn(vault)]);
}

/**
 * Mark a legacy board's readings stale without reading anything, documents first,
 * under every name this tab asked it by: for the module's own drawing ahead,
 * which reads what it needs itself.
 * @param client The tab's cache.
 * @param vault The vault the legacy board is in.
 * @param model The legacy board, by any of its names.
 */
async function modelGoneStale(client: QueryClient, vault: string, model: string): Promise<void> {
	for (const queryKey of readingsOf(vault, namesAskedFor(client, vault, model))) {
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
 * The server listed one vault's legacy boards: every reading this tab holds there of
 * a legacy board at another version than listed is read again, whichever of the
 * legacy board's names it was asked by.
 *
 * A pane hears of a write only to a legacy board of the vault it is in, so nothing
 * else tells this tab about a vault none of its panes is in: a legacy board drawn
 * ahead from the navigator's listing, or left behind when a pane moved to
 * another checkout. The readings are marked stale at once, so that the drawing
 * ahead that follows this listing draws them again rather than keeping them.
 * @param client The tab's cache.
 * @param vault The vault.
 * @param models The legacy boards listed there, with their versions.
 */
function modelsListed(client: QueryClient, vault: string, models: readonly DocumentEntry[]): void {
	const moved = new Set(
		cachedReadings(client, vault).flatMap(({ asked, data }) => {
			const held = versionOf(data);
			// A reading asked by a former name is listed under the name its model
			// goes by now, which only the reading itself says (ADR 0036).
			const names = [asked, ...namesIn(data)];
			const listed = models.find((entry) =>
				names.some((name) => sameModelName(name, entry.key) || sameModelName(name, entry.name)),
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

export { modelChanged, modelGoneStale, modelsListed, policyChanged };
