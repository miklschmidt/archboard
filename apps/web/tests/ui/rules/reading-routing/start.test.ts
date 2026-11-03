// How a page starts: the address, then the last reading, then the chooser. A repository never
// opens for being first in a list, and none that needs migration opens unless somebody asked.

import { expect, test } from "bun:test";
import type { RepositoryModel } from "#ui/hooks/architecture-model/use-model-catalog.ts";
import { addressFromSearch } from "#ui/rules/reading-routing/search.ts";
import { startOf } from "#ui/rules/reading-routing/start.ts";

const SHOP = "github.com/acme/shop";
const OLD = "github.com/acme/aaa-old";

/**
 * A listed repository.
 * @param name Its name.
 * @param model Its model, when it holds one.
 * @param state How its chosen checkout stands.
 * @returns The repository.
 */
function listed(
	name: string,
	model?: string,
	state: RepositoryModel["repository"]["state"] = "ready",
): RepositoryModel {
	return {
		repository: {
			name,
			untracked: false,
			vault: state === "ready" ? `/work/${name}/.archboard/vault` : null,
			state,
			checkouts: [],
		},
		...(model === undefined ? {} : { model: { id: model, name: model } }),
		migrationRequired: model === undefined,
		error: null,
		loading: false,
	};
}

const SEVERAL = [listed(OLD), listed(SHOP, "Shop")];
const vault = `/work/${SHOP}/.archboard/vault`;
const NOWHERE = addressFromSearch({});

/**
 * The start of a page.
 * @param search The address it is on.
 * @param last The search of its last reading, when it has one.
 * @param repositories The repositories.
 * @returns The start.
 */
function startFrom(
	search: Record<string, string>,
	last: Record<string, string> | null,
	repositories: readonly RepositoryModel[] = SEVERAL,
) {
	return startOf({
		address: addressFromSearch(search),
		last: last === null ? null : addressFromSearch(last),
		repositories,
		loading: false,
	});
}

test("a plain address with no last reading opens the chooser, whatever sorts first", () => {
	expect(startFrom({}, null)).toEqual({ kind: "choose", missing: null });
});

test("an address decides before the last reading", () => {
	const start = startFrom({ modelA: "Shop", repoA: SHOP }, { modelA: "Old", repoA: OLD });
	expect(start).toEqual({ kind: "open", vaults: { A: vault }, first: vault });
});

test("an address opens the repository it names, even one that needs migration", () => {
	expect(startFrom({ repoA: OLD }, null)).toMatchObject({ kind: "open" });
});

test("an address that names a model finds the repository that holds it", () => {
	expect(startFrom({ modelA: "Shop" }, null)).toMatchObject({ first: vault });
});

test("an address that no repository can answer names what it asked for", () => {
	expect(startFrom({ modelA: "Shop", repoA: "github.com/acme/gone" }, null)).toEqual({
		kind: "choose",
		missing: "github.com/acme/gone",
	});
});

test("a pane the address cannot place opens beside the one it can", () => {
	const start = startFrom({ repoA: "github.com/acme/gone", modelB: "Shop", repoB: SHOP }, null);
	expect(start).toEqual({ kind: "open", vaults: { B: vault }, first: vault });
});

test("the last reading restores its whole address", () => {
	const last = { modelA: "Shop", repoA: SHOP, scopeA: "Payments" };
	expect(startFrom({}, last)).toMatchObject({ kind: "restore", address: addressFromSearch(last) });
});

test("a last reading that its repository can no longer answer goes to the chooser", () => {
	const legacyNow = [listed(OLD), listed(SHOP)];
	expect(startFrom({}, { modelA: "Shop", repoA: SHOP }, legacyNow)).toMatchObject({
		kind: "choose",
	});
	const gone = [listed(OLD), listed(SHOP, "Shop", "gone")];
	expect(startFrom({}, { modelA: "Shop", repoA: SHOP }, gone)).toMatchObject({ kind: "choose" });
	const renamed = [listed(OLD), listed(SHOP, "Another")];
	expect(startFrom({}, { modelA: "Shop", repoA: SHOP }, renamed)).toMatchObject({ kind: "choose" });
});

test("a machine with one repository opens it only when it holds a model", () => {
	expect(startFrom({}, null, [listed(SHOP, "Shop")])).toEqual({
		kind: "open",
		vaults: {},
		first: vault,
	});
	expect(startFrom({}, null, [listed(OLD)])).toMatchObject({ kind: "choose" });
	expect(startFrom({}, null, [])).toMatchObject({ kind: "choose" });
});

test("the start waits for what decides it, and names its destination", () => {
	const summary = { ...listed(SHOP), loading: true };
	expect(startOf({ address: NOWHERE, last: null, repositories: [], loading: true })).toEqual({
		kind: "wait",
		destination: null,
	});
	expect(startFrom({}, { modelA: "Shop", repoA: SHOP }, [listed(OLD), summary])).toEqual({
		kind: "wait",
		destination: SHOP,
	});
	expect(startFrom({}, null, [summary])).toEqual({ kind: "wait", destination: SHOP });
});
