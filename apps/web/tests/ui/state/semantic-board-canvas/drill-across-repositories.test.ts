// The trail a drill-down into another repository leaves. Where the link leads
// is read by `use-drill-target.ts`, and `drill-target.test.tsx` owns it.
//
// What these catch: a dive that forgets the boards the reader came through once
// the pane arrives, and a trail kept after somebody else pointed the pane
// somewhere else.

import { describe, expect, test } from "bun:test";

import {
	NO_TRAIL,
	drillArrived,
	drillBack,
	drillInto,
	drillRefused,
	stopsOf,
	type DrillStop,
} from "#ui/state/semantic-board-canvas/drill-trail.ts";

const OWN = "github.com/acme/shop";
const OTHER = "github.com/acme/payments";

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

		// Down a level in place there, and back to the pane's own board, which is no move.
		const journal = { ...LEDGER, board: "journal" };
		const up = drillBack(drillInto(arrived, LEDGER, journal).trail, LEDGER, 2);
		expect(up.dive).toBeNull();
		expect(stopsOf(up.trail, LEDGER)).toEqual([SHOP, CART, LEDGER]);

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
		const refused = drillRefused(drillInto(there, SHOP, LEDGER).trail, LEDGER);
		expect(stopsOf(refused, SHOP)).toEqual(stopsOf(there, SHOP));
		expect(drillArrived(refused, LEDGER)).toEqual(NO_TRAIL);
	});

	test("a dive refused after the reader asked for another leaves the later one waiting", () => {
		const first = drillInto(NO_TRAIL, SHOP, LEDGER);
		const journal = { ...LEDGER, board: "journal" };
		const second = drillInto(first.trail, SHOP, journal);
		const refused = drillRefused(second.trail, LEDGER);
		expect(stopsOf(drillArrived(refused, journal), journal)).toEqual([SHOP, journal]);
	});
});
