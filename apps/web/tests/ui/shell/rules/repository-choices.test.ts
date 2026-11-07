// The chooser stays usable with hundreds of checkouts: they stay folded until the person
// opens a repository or names one. What these catch: a filter that hides the repository of
// a checkout it found, and a pane letter that shows with only one pane to tell apart.

import { expect, test } from "bun:test";

import type { RepositoryEntry } from "@archboard/workspace/repositories";
import { repositoryRows } from "#ui/shell/rules/repository-choices.ts";
import type { ShellRepository } from "#ui/shell/rules/contracts.ts";

/**
 * A repository with some checkouts.
 * @param name Its identity.
 * @param roots Its checkouts.
 * @returns The shell's entry.
 */
function shell(name: string, ...roots: string[]): ShellRepository {
	const repository: RepositoryEntry = {
		name,
		untracked: false,
		vault: `${roots[0]}/.archboard/vault`,
		state: "ready",
		checkouts: roots.map((root, at) => ({
			root,
			chosen: at === 0,
			exists: true,
			hasVault: true,
		})),
	};
	return { repository, error: null, loading: false, activity: {} };
}

const REPOSITORIES = [
	shell("github.com/acme/shop", "/work/shop", "/work/shop-next"),
	shell("billing", "/work/billing"),
];

/**
 * The ids of the rows.
 * @param query The folded filter.
 * @param opened The repositories that the person opened.
 * @returns The ids.
 */
function ids(query: string, opened: readonly string[] = []) {
	return repositoryRows({
		repositories: REPOSITORIES,
		query,
		panes: [],
		opened: new Set(opened),
	}).map((row) => row.id);
}

test("checkouts stay folded until the person opens their repository", () => {
	expect(ids("")).toEqual(["repository:github.com/acme/shop", "repository:billing"]);
	expect(ids("", ["github.com/acme/shop"])).toEqual([
		"repository:github.com/acme/shop",
		"checkout:/work/shop",
		"checkout:/work/shop-next",
		"repository:billing",
	]);
});

test("a filter finds a checkout under its repository and hides what it does not match", () => {
	expect(ids("shop-next")).toEqual(["repository:github.com/acme/shop", "checkout:/work/shop-next"]);
	expect(ids("billing")).toEqual(["repository:billing", "checkout:/work/billing"]);
	expect(ids("nothing")).toEqual([]);
});

/**
 * The pane letters on each repository row.
 * @param panes The panes.
 * @returns The letters of each row.
 */
function letters(panes: Parameters<typeof repositoryRows>[0]["panes"]): (readonly string[])[] {
	return repositoryRows({ repositories: REPOSITORIES, query: "", panes, opened: new Set() }).map(
		(row) => (row.kind === "repository" ? row.letters : []),
	);
}

test("a repository carries the letters of its panes only while there are two to tell apart", () => {
	const one = [{ letter: "A", repository: "billing", active: true }];
	expect(letters(one)).toEqual([[], []]);
	const two = [...one, { letter: "B", repository: "billing", active: false }];
	expect(letters(two)).toEqual([[], ["A", "B"]]);
});
