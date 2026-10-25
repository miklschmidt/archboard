// A listing of a vault reads again what this tab holds of a board that moved.
//
// What this catches: a picture or document of a board in a vault no pane of
// this tab is in, which no announcement reaches, kept at the version it was
// drawn at after the listing says the board has moved on, and a listing of one
// vault making a board of the same name in another vault stale.

import { afterEach, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import {
	semanticBoardKeys,
	semanticBoardListQuery,
} from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import type { BoardListingSchema } from "@archboard/board/board-listing";
import type { z } from "zod";

type BoardListing = z.infer<typeof BoardListingSchema>;

/** The vault the listing is of. */
const VAULT = "/work/shop/.archboard/vault";
/** Another vault with a board of the same name. */
const OTHER = "/work/billing/.archboard/vault";

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

/**
 * One listed board.
 * @param key Its key.
 * @param version Its version.
 * @returns The entry.
 */
function listed(key: string, version: number): BoardListing["boards"][number] {
	return { name: key, key, version, opens: "v1", variants: [], links: [], description: null };
}

/**
 * The listing route's answer: `payments` at version 2 and `orders` at version 1.
 * @returns The answer.
 */
function listing(): BoardListing {
	return {
		success: true,
		levels: ["system"],
		boards: [listed("payments", 2), listed("orders", 1)],
	};
}

test("a listing reads again the cached document and pictures of a board it lists at another version, in that vault only", async () => {
	globalThis.fetch = Object.assign(
		() =>
			Promise.resolve(
				new Response(JSON.stringify(listing()), {
					headers: { "Content-Type": "application/json" },
				}),
			),
		{ preconnect: realFetch.preconnect },
	);
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const held = {
		// Drawn ahead at version 1, and asked for by another spelling of its name.
		moved: [
			semanticBoardKeys.document(VAULT, "Payments"),
			semanticBoardKeys.render({ vault: VAULT, board: "Payments", variant: "v2" }),
		],
		unmoved: [
			semanticBoardKeys.document(VAULT, "orders"),
			semanticBoardKeys.render({ vault: VAULT, board: "orders" }),
		],
		elsewhere: [
			semanticBoardKeys.document(OTHER, "payments"),
			semanticBoardKeys.render({ vault: OTHER, board: "payments" }),
		],
	};
	for (const key of Object.values(held).flat()) client.setQueryData(key, { version: 1 });

	await client.fetchQuery(semanticBoardListQuery(VAULT));

	/**
	 * Whether the cache reads each of these again before it shows it.
	 * @param keys The cache keys.
	 * @returns One answer for each.
	 */
	const readAgain = (keys: readonly (readonly unknown[])[]): boolean[] =>
		keys.map((key) => client.getQueryState(key)?.isInvalidated === true);
	expect({
		moved: readAgain(held.moved),
		unmoved: readAgain(held.unmoved),
		elsewhere: readAgain(held.elsewhere),
	}).toEqual({ moved: [true, true], unmoved: [false, false], elsewhere: [false, false] });
	client.clear();
});
