import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ReconciliationIssue } from "#shared/schemas/reconciliation.ts";
import { mergeByIdentity, asIssues } from "#shared/rules/reconcile/variant.ts";
import { mergeTold } from "#shared/rules/reconcile/told-order.ts";
import { leftEmpty } from "#shared/rules/reconcile/flow.ts";

type Walkthrough = ArchitectureModel["walkthroughs"][number];

/**
 * Reuse identity and order rules while keeping each complete reading an atomic authored field.
 * @param base The common retained predecessor.
 * @param mine The coherent proposal side.
 * @param theirs The new predecessor.
 * @returns Reconciled narratives and their unresolved decisions.
 */
function reconcileNarratives(
	base: ArchitectureModel,
	mine: ArchitectureModel,
	theirs: ArchitectureModel,
) {
	const sides = {
		base: narrativeMap(base),
		mine: narrativeMap(mine),
		theirs: narrativeMap(theirs),
	};
	const merged = mergeByIdentity(
		sides,
		["name", "formerNames", "summary", "target", "beats"],
		"walkthrough",
	);
	// Whole-beat comparisons protect deletion against a changed narrative. Continuing beats merge below.
	const issues = merged.issues.filter(
		(issue) => !(issue.kind === "competing-field" && issue.field === "beats"),
	);
	const walkthroughs = merged.entities.map((walk) => {
		const before = sides.base.get(walk.id),
			own = sides.mine.get(walk.id),
			next = sides.theirs.get(walk.id);
		if (before === undefined || own === undefined || next === undefined) return walk;
		const beats = mergeTold(
			{ base: before.beats, mine: own.beats, theirs: next.beats },
			["title", "narrative", "reading"],
			"beat",
		);
		issues.push(...asIssues(beats.issues));
		return withBeats(walk, own, beats.entries, issues);
	});
	return { walkthroughs, issues };
}

/**
 * Preserve a coherent narrative when independent removals would leave no beat.
 * @param walk The reconciled metadata.
 * @param mine The coherent proposal side.
 * @param beats The reconciled ordered beats.
 * @param issues The durable decisions accumulated for this family.
 * @returns A complete narrative with its original side retained on an empty conflict.
 */
function withBeats(
	walk: Walkthrough,
	mine: Walkthrough,
	beats: Walkthrough["beats"],
	issues: ReconciliationIssue[],
): Walkthrough {
	if (beats.length > 0) return { ...walk, beats };
	issues.push(...asIssues([leftEmpty(walk.id, "walkthrough", walk.name)]));
	return { ...walk, beats: mine.beats };
}

/**
 * Key narratives by their stable canonical identity.
 * @param model The coherent model.
 * @returns Its existing authored narratives.
 */
function narrativeMap(model: ArchitectureModel) {
	return new Map(model.walkthroughs.map((walk) => [walk.id, walk]));
}

export { reconcileNarratives };
