// The navigator lists every repository, each with the boards of its chosen
// checkout and a menu of its checkouts (ADR 0050).

import { expect, test } from "bun:test";

import type { RepositoryEntry } from "@archboard/workspace/repositories";
import {
	SHOP,
	SHOP_MODEL,
	SHOP_VAULT,
	act,
	carrying,
	mountNavigator,
	pane,
	ready,
	repositoryOf,
	row,
} from "#tests/ui/support/shell/navigator-fixture.ts";
import type { AgentActivityEntry } from "#ui/rules/pane-session/session-types.ts";

/** A second repository, with a board of the same name as one of the shop's. */
const BILLING = "github.com/acme/billing";
const BILLING_VAULT = "/work/billing/.archboard/vault";
const BILLING_MODEL = { ...SHOP_MODEL, id: "Billing", name: "Billing" };

test("repository rows open each canonical model and mark the panes that read it", () => {
	const asked = mountNavigator({
		repositories: [
			repositoryOf(ready(SHOP, SHOP_VAULT), SHOP_MODEL),
			repositoryOf(ready(BILLING, BILLING_VAULT), BILLING_MODEL),
		],
		panes: [pane("A", null), pane("B", null, BILLING, BILLING_VAULT)],
	});
	const inBilling = `repository:${BILLING}`;
	expect(row(inBilling).getAttribute("aria-level")).toBe("1");
	expect(carrying("B")).toEqual([inBilling]);
	act(() => row(inBilling).click());
	expect(asked.opened).toEqual([`${BILLING}|Billing`]);
	expect(row(inBilling).hasAttribute("aria-expanded")).toBe(false);
});

/**
 * An agent's unclaimed write to the payments board.
 * @param said What it said it was doing.
 * @returns The activity.
 */
function writing(said: string): AgentActivityEntry {
	return {
		board: "model:Shop",
		model: "Shop",
		claims: [],
		doing: { doing: said, at: new Date().toISOString(), writer: "agent" },
	};
}

test("agent work stays with its repository and opens its canonical model", () => {
	const asked = mountNavigator({
		repositories: [
			repositoryOf(ready(SHOP, SHOP_VAULT), SHOP_MODEL, { payments: writing("adding a queue") }),
			repositoryOf(ready(BILLING, BILLING_VAULT), BILLING_MODEL, {
				payments: writing("adding a ledger"),
			}),
		],
	});
	const entries = [
		...document.querySelectorAll<HTMLButtonElement>('[data-slot="working-now"] button'),
	];
	expect(entries.map((entry) => entry.textContent.includes(BILLING))).toEqual([false, true]);
	expect(entries.map((entry) => entry.textContent.includes(SHOP))).toEqual([true, false]);
	act(() => entries[1]?.click());
	expect(asked.opened).toEqual([`${BILLING}|Billing`]);
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
		repositories: [repositoryOf(stale, undefined)],
	});
	const line = row(`repository:${BILLING}`);
	// The row says why, so the navigator gives no advice for an empty vault over it.
	expect(document.querySelector('[data-slot="navigator"] p')).toBeNull();
	// It says why it holds nothing rather than counting none, and has nothing to open or close.
	expect(line.textContent).not.toMatch(/\d/);
	expect(line.hasAttribute("aria-expanded")).toBe(false);
	expect(line.getAttribute("aria-haspopup")).toBe("menu");
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
	// Keys in the menu stay in it: a letter is not typed into the filter.
	act(() => {
		document.activeElement?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "b", bubbles: true }),
		);
	});
	expect(document.querySelector<HTMLInputElement>('[data-slot="navigator"] input')?.value).toBe("");
	act(() => items[1]?.click());
	expect(asked.chosen).toEqual([`${BILLING}|/work/billing`]);
	// Escape closes the menu and gives the keyboard back to the row.
	act(() => {
		document.activeElement?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
	});
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 50));
	});
	expect(document.querySelector('[role="menu"]')).toBeNull();
	expect(document.activeElement).toBe(row(`repository:${BILLING}`));
});

test("a repository whose model cannot be read offers to read them again, and the navigator does not call it empty", () => {
	const failed = {
		...repositoryOf(ready(BILLING, BILLING_VAULT), undefined),
		error: "The board listing could not be read: offline",
	};
	const { show } = mountNavigator({ repositories: [failed], panes: [] });
	const alert = document.querySelector('[data-slot="navigator"] [role="alert"]');
	expect(alert?.querySelector("button")).not.toBeNull();
	expect(document.querySelector('[data-slot="navigator-empty"]')).toBeNull();
	// Read again and empty, it says so and offers nothing to retry.
	show({ repositories: [repositoryOf(ready(BILLING, BILLING_VAULT), undefined)], panes: [] });
	expect(document.querySelector('[data-slot="navigator"] [role="alert"]')).toBeNull();
	expect(
		row(`repository:${BILLING}`).querySelector('[data-slot="repository-model-open"]'),
	).toBeNull();
});

test("a pane is marked in the repository the server says it is in, before the repositories are read again", () => {
	// A checkout of billing was just chosen: the pane is in its new vault, which
	// the repositories as last read do not name yet.
	mountNavigator({
		repositories: [
			repositoryOf(ready(SHOP, SHOP_VAULT), SHOP_MODEL),
			repositoryOf(ready(BILLING, BILLING_VAULT), BILLING_MODEL),
		],
		panes: [
			pane("A", "payments"),
			pane("B", "payments", BILLING, "/work/billing-next/.archboard/vault"),
		],
	});
	expect(carrying("B")).toEqual([`repository:${BILLING}`]);
});

/**
 * Type a filter into the navigator, as a person does.
 * @param text The whole filter.
 */
function filterBy(text: string): void {
	const input = document.querySelector<HTMLInputElement>('input[type="search"]');
	const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
	act(() => {
		value?.set?.call(input, text);
		input?.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

test("a GitHub repository is named by its owner and name beside GitHub's mark, another keeps the repository mark, and the filter finds it by its whole identity", () => {
	const scratch: RepositoryEntry = {
		...ready("scratch", "/work/scratch/.archboard/vault"),
		untracked: true,
	};
	mountNavigator({
		repositories: [
			repositoryOf(scratch, SHOP_MODEL),
			repositoryOf(ready(BILLING, BILLING_VAULT), BILLING_MODEL),
		],
	});
	const billing = `[data-row-id="${CSS.escape(`repository:${BILLING}`)}"]`;
	const other = '[data-row-id="repository:scratch"]';
	expect(document.querySelector(`${other} [title="Repository"]`)).not.toBeNull();
	expect(document.querySelector(`${billing} [title="GitHub repository"]`)).not.toBeNull();
	expect(document.querySelector(`${billing} [title="${BILLING}"]`)?.textContent).toBe(
		"acme/billing",
	);
	expect(document.querySelector(billing)?.getAttribute("aria-label")).toStartWith(BILLING);
	// A match in the words the row shows is marked there.
	filterBy("acme/bill");
	expect(document.querySelector(`${billing} mark`)?.textContent).toBe("acme/bill");
	expect(document.querySelector(other)).toBeNull();
	// A match that reaches into the host keeps the row, with nothing marked.
	filterBy("github.com/acme/billing");
	expect(document.querySelector(billing)).not.toBeNull();
	expect(document.querySelector(`${billing} mark`)).toBeNull();
	expect(document.querySelector(other)).toBeNull();
});
