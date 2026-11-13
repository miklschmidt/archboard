// The lists of a branch footprint, in the order a review reads them (ADR 0045).

import type { BranchFootprintAnswer } from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";

/** One module the footprint read. */
type FootprintModule = Extract<BranchFootprintAnswer, { proposal: null }>["changed"][number];

/** Why the proposal names a module. */
type NamedReason = FootprintModule["named"][number];

/** A module the footprint did not read, with the reason. */
type FootprintSkip = BranchFootprintAnswer["skipped"][number];

/** One commit of the range. */
type FootprintCommit = BranchFootprintAnswer["commits"][number];

/** The lists a footprint answers, by the name of each. */
type ListKey = "changedNotNamed" | "namedAndChanged" | "namedNotChanged" | "changed";

/** One list of the view: what it holds and the modules in it. */
interface FootprintList {
	readonly key: ListKey;
	readonly label: string;
	readonly gloss: string;
	readonly modules: readonly FootprintModule[];
}

/** What each list is called and says it holds. */
const LISTS: Readonly<Record<ListKey, { readonly label: string; readonly gloss: string }>> = {
	changedNotNamed: {
		label: "Changed but not named",
		gloss: "The commits changed these modules, and the plan does not name them.",
	},
	namedAndChanged: {
		label: "Named and changed",
		gloss: "The plan names these modules, and the commits changed them.",
	},
	namedNotChanged: {
		label: "Named but not changed",
		gloss: "The plan names these modules, and no commit changed them yet.",
	},
	changed: { label: "Changed", gloss: "The commits changed these modules." },
};

/**
 * The lists of an answer. With a proposal, the modules that it does not name come first, because
 * a review looks for them first. Without one, the answer has one list.
 * @param answer The footprint.
 * @returns The lists, in the order they show.
 */
function footprintLists(answer: BranchFootprintAnswer): readonly FootprintList[] {
	if (answer.proposal === null) return [listOf("changed", answer.changed)];
	return [
		listOf("changedNotNamed", answer.changedNotNamed),
		listOf("namedAndChanged", answer.namedAndChanged),
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

/** What a reason other than the module's own change names, in the singular and the plural. */
const NAMED_THING: Readonly<Record<Exclude<NamedReason["by"], "part">, readonly [string, string]>> =
	{
		relationship: ["line", "lines"],
		step: ["flow step", "flow steps"],
	};

/**
 * Why the proposal names a module, in a reader's words: the change to the module itself, and the
 * lines and flow steps it ends, counted by kind and standing, so that a module at the end of many
 * reads as one short phrase.
 * @param named The reasons of the answer.
 * @returns One phrase for each kind and standing, in the order the answer first gives them.
 */
function namedWords(named: readonly NamedReason[]): string[] {
	const counts = new Map<string, { readonly reason: NamedReason; count: number }>();
	for (const reason of named) {
		const key = `${reason.by} ${reason.status}`;
		const entry = counts.get(key);
		if (entry === undefined) counts.set(key, { reason, count: 1 });
		else entry.count += 1;
	}
	return [...counts.values()].map(({ reason, count }) => {
		if (reason.by === "part") return `${reason.status} by the plan`;
		const [one, many] = NAMED_THING[reason.by];
		return `end of ${count} ${reason.status} ${count === 1 ? one : many}`;
	});
}

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
	namedWords,
	NOT_READ,
	type FootprintCommit,
	type FootprintList,
	type FootprintModule,
	type FootprintSkip,
	type ListKey,
};
