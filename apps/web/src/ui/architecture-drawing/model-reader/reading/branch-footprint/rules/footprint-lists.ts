// The lists of a branch footprint, from the plan outward (ADR 0045).

import type { BranchFootprintAnswer } from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";

/** One module the footprint read. */
type FootprintModule = Extract<BranchFootprintAnswer, { proposal: null }>["changed"][number];

/** A module the footprint did not read, with the reason. */
type FootprintSkip = BranchFootprintAnswer["skipped"][number];

/** One commit of the range. */
type FootprintCommit = BranchFootprintAnswer["commits"][number];

/** The lists a footprint answers, by the name of each. */
type ListKey = "changedNotNamed" | "namedAndChanged" | "namedNotChanged" | "changed";

/** One list of the view: what it is called, the question it asks, and the modules in it. */
interface FootprintList {
	readonly key: ListKey;
	readonly label: string;
	/** What the list means for a review, under its modules. */
	readonly note: string;
	/** Whether the list holds work that the plan does not name, which a review looks at first. */
	readonly outside: boolean;
	readonly modules: readonly FootprintModule[];
}

/** What each list is called and what it asks. */
const LISTS: Readonly<
	Record<ListKey, { readonly label: string; readonly note: string; readonly outside: boolean }>
> = {
	namedAndChanged: {
		label: "Planned and changed",
		note: "The branch built what the proposal names.",
		outside: false,
	},
	changedNotNamed: {
		label: "Changed outside the plan",
		note: "Did the branch leave the plan, or does the plan miss a module?",
		outside: true,
	},
	namedNotChanged: {
		label: "Planned, not changed yet",
		note: "Is the work still to do, or does the module need no code change?",
		outside: false,
	},
	changed: { label: "Changed", note: "The branch changed these modules.", outside: false },
};

/**
 * The lists of an answer. With a proposal, they read from the plan outward: what the branch built,
 * what it changed outside the plan, and what it did not change yet. The middle list stands out,
 * because a review looks at it first. Without a proposal, the answer has one list.
 * @param answer The footprint.
 * @returns The lists, in the order they show.
 */
function footprintLists(answer: BranchFootprintAnswer): readonly FootprintList[] {
	if (answer.proposal === null) return [listOf("changed", answer.changed)];
	return [
		listOf("namedAndChanged", answer.namedAndChanged),
		listOf("changedNotNamed", answer.changedNotNamed),
		listOf("namedNotChanged", answer.namedNotChanged),
	];
}

/**
 * One list with its words.
 * @param key The list.
 * @param modules Its modules.
 * @returns The list.
 */
function listOf(key: ListKey, modules: readonly FootprintModule[]): FootprintList {
	return { key, ...LISTS[key], modules };
}

/** Why a module or a repository was not read, in a reader's words. */
const NOT_READ: Readonly<Record<FootprintSkip["reason"], string>> = {
	unbound: "no code binding",
	"drill-down": "another module holds its history",
	"repository-unregistered": "repository not registered here",
	"checkout-unavailable": "checkout could not be read",
	"ref-not-checked-out": "its ref is not checked out",
	"base-unresolved": "the base is not in its repository",
	"head-unresolved": "the head is not in its repository",
	"no-merge-base": "the base and the head share no history",
};

/**
 * The commits of a module, newest first, as the answer holds them.
 * @param answer The footprint.
 * @param module The module.
 * @returns Its commits, each one once.
 */
function commitsOf(
	answer: BranchFootprintAnswer,
	module: FootprintModule,
): readonly FootprintCommit[] {
	const commits = new Map(answer.commits.map((commit) => [commit.commit, commit]));
	return module.commits.flatMap((id) => {
		const commit = commits.get(id);
		return commit === undefined ? [] : [commit];
	});
}

export {
	commitsOf,
	footprintLists,
	NOT_READ,
	type FootprintCommit,
	type FootprintList,
	type FootprintModule,
	type FootprintSkip,
	type ListKey,
};
