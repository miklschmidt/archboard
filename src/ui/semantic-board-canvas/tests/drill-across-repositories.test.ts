// Where a drill-down into another repository leads, and the trail it leaves.
//
// What these catch: a link to the pane's own repository read as another one,
// a link to a repository this machine cannot read opened anyway, a dive that
// forgets the boards the reader came through once the pane arrives, and a
// trail kept after somebody else pointed the pane somewhere else.

import { describe, expect, test } from "bun:test";

import {
	NO_TRAIL,
	drillPlace,
	type RepositoryPlaces,
	drillArrived,
	drillBack,
	drillInto,
	drillRefused,
	stopsOf,
	type DrillStop,
} from "@/ui/semantic-board-canvas/drilling";

const OWN = "github.com/acme/shop";
const OTHER = "github.com/acme/payments";
const LISTED = new Map([
	[OTHER, { vault: "/payments/.archboard/vault", state: "ready" as const }],
	["github.com/acme/gone", { vault: null, state: "gone" as const }],
]);
/**
 * The repositories this machine lists, by identity.
 * @param identity The repository identity.
 * @returns Its chosen checkout's vault and state, or undefined when it is not listed.
 */
const PLACES: RepositoryPlaces = (identity) => LISTED.get(identity);

describe("drillPlace", () => {
	test("a link without a repository, or to the vault's own, is read in that vault", () => {
		expect(drillPlace({ board: "cart", variant: "current" }, OWN, PLACES)).toEqual({
			kind: "readable",
			there: undefined,
		});
		expect(drillPlace({ board: "cart", variant: "current", repo: OWN }, OWN, PLACES)).toEqual({
			kind: "readable",
			there: undefined,
		});
	});

	test("another repository is read in its chosen checkout's vault", () => {
		expect(drillPlace({ board: "ledger", variant: "current", repo: OTHER }, OWN, PLACES)).toEqual({
			kind: "readable",
			there: { vault: "/payments/.archboard/vault", repository: OTHER },
		});
	});

	test("a repository this machine does not list, or cannot read, opens nothing", () => {
		const unknown = "github.com/acme/unknown";
		expect(drillPlace({ board: "x", variant: "current", repo: unknown }, OWN, PLACES).kind).toBe(
			"unregistered",
		);
		expect(
			drillPlace({ board: "x", variant: "current", repo: "github.com/acme/gone" }, OWN, PLACES),
		).toEqual({ kind: "unreachable", repo: "github.com/acme/gone", state: "gone" });
	});
});

const SHOP: DrillStop = { board: "shop", variant: undefined, vault: "/shop", repository: OWN };
const CART: DrillStop = { board: "cart", variant: "v1", vault: "/shop", repository: OWN };
const LEDGER: DrillStop = {
	board: "ledger",
	variant: undefined,
	vault: "/payments",
	repository: OTHER,
};

describe("the drill trail", () => {
	test("a drill-down in the pane's vault is read in place", () => {
		const step = drillInto(NO_TRAIL, SHOP, CART);
		expect(step.dive).toBeNull();
		expect(stopsOf(step.trail, SHOP)).toEqual([SHOP, CART]);
	});

	test("a dive into another vault keeps the trail before the board it arrives on", () => {
		const down = drillInto(drillInto(NO_TRAIL, SHOP, CART).trail, SHOP, LEDGER);
		expect(down.dive).toEqual(LEDGER);
		// The shell moved the pane: the server announces the board, whose name may differ in case.
		const arrived = drillArrived(down.trail, { ...LEDGER, board: "Ledger" });
		expect(stopsOf(arrived, LEDGER)).toEqual([SHOP, CART, LEDGER]);

		const back = drillBack(arrived, LEDGER, 0);
		expect(back.dive).toEqual(SHOP);
		expect(stopsOf(drillArrived(back.trail, SHOP), SHOP)).toEqual([SHOP]);
	});

	test("going back to the board the pane holds, from a trail that came back to it, stays in place", () => {
		// shop, then ledger in another vault, then a link from ledger back to shop.
		const there = drillArrived(drillInto(NO_TRAIL, SHOP, LEDGER).trail, LEDGER);
		const home = drillArrived(drillInto(there, LEDGER, SHOP).trail, SHOP);
		expect(stopsOf(home, SHOP)).toEqual([SHOP, LEDGER, SHOP]);
		// The shell would not move a pane to the board it holds, so no arrival would answer a dive.
		const back = drillBack(home, SHOP, 0);
		expect(back.dive).toBeNull();
		expect(stopsOf(back.trail, SHOP)).toEqual([SHOP]);
	});

	test("any other arrival is somebody else's, and ends the trail", () => {
		const down = drillInto(drillInto(NO_TRAIL, SHOP, CART).trail, SHOP, LEDGER);
		expect(drillArrived(down.trail, { ...LEDGER, vault: "/elsewhere" })).toEqual(NO_TRAIL);
	});

	test("a refused dive leaves the trail where it was", () => {
		const there = drillInto(drillInto(NO_TRAIL, SHOP, CART).trail, SHOP, CART).trail;
		const refused = drillRefused(drillInto(there, SHOP, LEDGER).trail);
		expect(stopsOf(refused, SHOP)).toEqual(stopsOf(there, SHOP));
		expect(drillArrived(refused, LEDGER)).toEqual(NO_TRAIL);
	});
});
