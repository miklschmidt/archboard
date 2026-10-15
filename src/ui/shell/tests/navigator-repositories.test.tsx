// The navigator lists every repository, each with the boards of its chosen
// checkout and a menu of its checkouts (ADR 0050).

import { expect, test } from "bun:test";

import type { RepositoryEntry } from "@/shared/repositories/index";
import {
	SHOP,
	SHOP_BOARDS,
	SHOP_VAULT,
	act,
	board,
	carrying,
	mountNavigator,
	pane,
	ready,
	repositoryOf,
	row,
} from "@/ui/shell/tests/navigator-fixture";
import type { BoardListing } from "@/ui/types";

/** A second repository, with a board of the same name as one of the shop's. */
const BILLING = "github.com/acme/billing";
const BILLING_VAULT = "/work/billing/.archboard/vault";
const BILLING_BOARDS: BoardListing = {
	boards: [board("Payments", "service")],
	levels: ["system", "service", "module"],
	onScreen: [],
};

test("every repository is a row with its own boards, and a board of one name in two repositories is two rows a pane opens by repository", () => {
	const asked = mountNavigator({
		repositories: [
			repositoryOf(ready(SHOP, SHOP_VAULT), SHOP_BOARDS),
			repositoryOf(ready(BILLING, BILLING_VAULT), BILLING_BOARDS),
		],
		panes: [pane("A", "payments"), pane("B", "payments", BILLING_VAULT)],
	});
	const inBilling = `repository:${BILLING}|board:payments`;
	expect(row(`repository:${SHOP}`).getAttribute("aria-level")).toBe("1");
	expect(row(`repository:${BILLING}`).getAttribute("aria-label")).toContain("1 boards");
	expect(row(inBilling).getAttribute("aria-level")).toBe("2");
	// Each pane's letter is on its own repository's board.
	expect(carrying("B")).toEqual([inBilling]);
	act(() => row(inBilling).click());
	expect(asked.opened).toEqual([`${BILLING}|payments`]);
	// A repository row opens and closes what it holds, as a folder's does.
	act(() => row(`repository:${BILLING}`).click());
	expect(document.querySelector(`[data-row-id="${CSS.escape(inBilling)}"]`)).toBeNull();
});

test("a repository whose chosen checkout has no vault says so, and its menu chooses another checkout from the keyboard", async () => {
	const stale: RepositoryEntry = {
		name: BILLING,
		untracked: false,
		vault: null,
		state: "no-vault",
		checkouts: [
			{ root: "/work/billing-old", chosen: true, exists: true, hasVault: false },
			{ root: "/work/billing", chosen: false, exists: true, hasVault: true },
			{ root: "/work/billing-gone", chosen: false, exists: false, hasVault: false },
		],
	};
	const asked = mountNavigator({
		repositories: [
			repositoryOf(ready(SHOP, SHOP_VAULT), SHOP_BOARDS),
			repositoryOf(stale, { boards: [], levels: [], onScreen: [] }),
		],
	});
	const line = row(`repository:${BILLING}`);
	expect(line.getAttribute("aria-label")).toContain("no vault");
	act(() => line.focus());
	act(() => {
		line.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }));
	});
	// The menu's popup is placed once it has been laid out, a turn or two later.
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 50));
	});
	const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
	expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
		"true",
		"false",
		"false",
	]);
	// A checkout that is gone, or has no vault, is listed and cannot be chosen.
	expect(items.map((item) => item.getAttribute("aria-disabled") === "true")).toEqual([
		true,
		false,
		true,
	]);
	act(() => items[1]?.click());
	expect(asked.chosen).toEqual([`${BILLING}|/work/billing`]);
});
