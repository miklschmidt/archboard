// Bringing a proposal forward when the architecture it was derived from moves.
//
// A draft is a whole architecture, not a patch, so when its predecessor changes
// there is no diff to replay: there are three states — what the predecessor said
// before (the base), what it says now, and what the draft says — and the
// question is what the draft should say next. That is what this decides, purely,
// with no file and no clock involved.
//
// Four rules, and each of them is a thing the product would get wrong by
// default:
//
//   A change nobody competed for is simply inherited. If the predecessor
//   renamed a service and the draft never touched that name, the draft takes the
//   new one — otherwise every draft drifts into a museum of old names that were
//   never anybody's decision.
//
//   Two people reaching the same conclusion is agreement, not a conflict. The
//   same value written twice needs nobody's attention.
//
//   A real disagreement is held, never resolved by machine. Two different values
//   for one field, a subject one side deleted and the other changed, or a
//   reference the draft added to something the predecessor removed — each is
//   reported against the subject it is about, and the draft keeps the content it
//   already had, which is coherent, rather than being left half-merged.
//
//   Order is meaning. Two sides moving the same step or the same beat to
//   different places is a conflict like any other; picking the earlier index, or
//   the alphabetically smaller, would be inventing an architectural decision.
//
// Identity is what makes all of this possible: entities keep their ids through a
// branch, so "the same node" is never guessed from names or array positions
// (ADR 0023).

import type {
	SemanticEdge,
	SemanticNode,
	VariantContent,
} from "@/shared/semantic-board/lib/content";
import { incoherenceOf } from "@/shared/semantic-board/lib/reconcile-candidate";
import {
	ChangedFieldSchema,
	ReconciliationIssueSchema,
	ReconciliationKindSchema,
	ToldStandingSchema,
	VariantStandingSchema,
	type ChangedField,
	type ReconciliationIssue,
	type ReconciliationKind,
	type ToldStanding,
	type VariantStanding,
} from "@/shared/semantic-board/lib/reconcile-standing";
import {
	fieldOf,
	removedHereIssues,
	removedThereIssues,
	same,
	stated,
} from "@/shared/semantic-board/lib/reconcile-removed";
import type { SemanticFlow } from "@/shared/semantic-board/lib/views";
import type { SemanticWalkthrough } from "@/shared/semantic-board/lib/walkthrough";
import { reconcileTold, type OrderedIssue } from "@/shared/semantic-board/lib/reconcile-told";

/** What became of a proposal when its predecessor moved. */
interface Reconciliation {
	/** The proposal's content afterwards: always coherent, never half-merged. */
	readonly content: VariantContent;
	/** Everything somebody has to settle; empty when it all merged. */
	readonly issues: readonly ReconciliationIssue[];
	/** The subjects that took the predecessor's change. */
	readonly inherited: readonly string[];
}

/** The three states a merge is decided from. */
interface ThreeStates {
	/** What the predecessor said when this proposal last agreed with it. */
	readonly base: VariantContent;
	/** What this proposal says. */
	readonly mine: VariantContent;
	/** What the predecessor says now. */
	readonly theirs: VariantContent;
}

/** The fields that say what each kind of subject is. */
const MERGED = {
	node: [
		"order",
		"name",
		"kind",
		"responsibility",
		"description",
		"parent",
		"groups",
		"binding",
		"drillDown",
	],
	edge: ["order", "from", "to", "kind", "label", "description", "emphasis", "traffic"],
	flow: ["name", "summary", "participants"],
	walkthrough: ["name", "summary"],
} as const;

/** What each kind of subject is called where somebody reads about it. */
const SUBJECT_WORDS = {
	node: "node",
	edge: "relationship",
	flow: "flow",
	walkthrough: "walkthrough",
} as const;

/** One kind of subject, in all three states, by id. */
interface Sides<Entity> {
	readonly base: ReadonlyMap<string, Entity>;
	readonly mine: ReadonlyMap<string, Entity>;
	readonly theirs: ReadonlyMap<string, Entity>;
}

/**
 * The three states of one kind of subject, keyed by identity.
 * @param states The three contents.
 * @param of How to read that kind out of a content.
 * @returns The three maps.
 */
function sidesOf<Entity extends { readonly id: string }>(
	states: ThreeStates,
	of: (content: VariantContent) => readonly Entity[],
): Sides<Entity> {
	return {
		base: byId(of(states.base)),
		mine: byId(of(states.mine)),
		theirs: byId(of(states.theirs)),
	};
}

/**
 * One list of subjects, keyed by identity.
 * @param entities The subjects.
 * @returns Them, by id.
 */
function byId<Entity extends { readonly id: string }>(
	entities: readonly Entity[],
): Map<string, Entity> {
	return new Map(entities.map((entity) => [entity.id, entity]));
}

/** What one kind of subject merged to. */
interface Merged<Entity> {
	readonly entities: Entity[];
	readonly issues: ReconciliationIssue[];
	readonly inherited: string[];
	/** The subjects the predecessor removed and nothing here competed for. */
	readonly dropped: Entity[];
}

/**
 * Merge one kind of subject by identity.
 *
 * Array order of the result follows this proposal's own array, with anything
 * the predecessor added appended. Node and relationship layout order is a
 * separate authored field and is reconciled like their other fields.
 * @param sides The three states of that kind.
 * @param fields The fields that say what the subject is.
 * @param what The word for that kind in an issue.
 * @returns The merged subjects, the issues, and what was inherited.
 */
function mergeByIdentity<Entity extends { readonly id: string }>(
	sides: Sides<Entity>,
	fields: readonly string[],
	what: string,
): Merged<Entity> {
	const out: Merged<Entity> = { entities: [], issues: [], inherited: [], dropped: [] };
	for (const [id, mine] of sides.mine) {
		settleOne({ id, mine, sides, fields, what }, out);
	}
	for (const [id, theirs] of sides.theirs) {
		theirsAlone({ id, theirs, sides, fields, what }, out);
	}
	return out;
}

/** One subject the predecessor holds, in all three states. */
interface Arriving<Entity> {
	readonly id: string;
	readonly theirs: Entity;
	readonly sides: Sides<Entity>;
	readonly fields: readonly string[];
	readonly what: string;
}

/**
 * Settle a subject the predecessor holds and this proposal does not: something
 * it added, or something this proposal removed.
 * @param arriving The subject and its three states.
 * @param out The merged result, added to in place.
 */
function theirsAlone<Entity extends object & { readonly id: string }>(
	arriving: Arriving<Entity>,
	out: Merged<Entity>,
): void {
	const { id, theirs, sides, fields, what } = arriving;
	if (sides.mine.has(id)) {
		return;
	}
	const base = sides.base.get(id);
	if (base === undefined) {
		// The predecessor added it after the branch, and nothing here competes.
		out.entities.push(theirs);
		out.inherited.push(id);
		return;
	}
	// Removed here, changed there: the mirror image of the other direction, and
	// just as much somebody's decision. The removal stands — this proposal meant
	// it — and the disagreement is reported rather than swallowed.
	out.issues.push(...removedHereIssues(id, base, theirs, fields, what));
}

/** One subject being settled, in all three states. */
interface Settling<Entity> {
	readonly id: string;
	readonly mine: Entity;
	readonly sides: Sides<Entity>;
	readonly fields: readonly string[];
	readonly what: string;
}

/**
 * Settle one subject this proposal holds: field by field against the base, or
 * as a deletion the predecessor made under it.
 * @param settling The subject and its three states.
 * @param out The merged result, added to in place.
 */
function settleOne<Entity extends { readonly id: string }>(
	settling: Settling<Entity>,
	out: Merged<Entity>,
): void {
	const { id, mine, sides, fields, what } = settling;
	const base = sides.base.get(id);
	const theirs = sides.theirs.get(id);
	if (base === undefined || theirs !== undefined) {
		const settled = mergeFields({ mine, base, theirs, fields, what, id });
		out.entities.push(settled.entity);
		out.issues.push(...settled.issues);
		out.inherited.push(...settled.inherited);
		return;
	}
	// The predecessor removed it. Untouched here, it goes; changed here, the
	// deletion and the change are two decisions and only a person settles them.
	const held = removedThereIssues(id, base, mine, fields, what);
	if (held.length === 0) {
		// Safe to follow the predecessor — unless something here still refers to
		// it, which is decided once the whole content is assembled.
		out.dropped.push(mine);
		return;
	}
	out.entities.push(mine);
	out.issues.push(...held);
}

/** One subject's three states, and what is being merged. */
interface FieldMerge<Entity> {
	readonly mine: Entity;
	readonly base: Entity | undefined;
	readonly theirs: Entity | undefined;
	readonly fields: readonly string[];
	readonly what: string;
	readonly id: string;
}

/**
 * Merge one subject field by field.
 * @param merge The subject's three states and the fields that say what it is.
 * @returns The settled subject, any issues, and the fields it inherited.
 */
function mergeFields<Entity extends { readonly id: string }>(
	merge: FieldMerge<Entity>,
): { entity: Entity; issues: ReconciliationIssue[]; inherited: string[] } {
	const { mine, base, theirs, fields, what, id } = merge;
	if (base === undefined || theirs === undefined) {
		// Nothing to merge against: this proposal minted it, or the predecessor has
		// nothing to say about it any more.
		return { entity: mine, issues: [], inherited: [] };
	}
	let settled = mine;
	const issues: ReconciliationIssue[] = [];
	const inherited: string[] = [];
	for (const field of fields) {
		const decided = decideField(field, { mine, base, theirs, fields, what, id });
		settled = { ...settled, [field]: decided.value };
		issues.push(...decided.issues);
		inherited.push(...decided.inherited);
	}
	return { entity: settled, issues, inherited };
}

/**
 * Decide one field: inherit it, keep it, or hold it as a disagreement.
 * @param field The field's name.
 * @param merge The subject's three states.
 * @returns The value to settle on, and what to say about it.
 */
function decideField<Entity extends { readonly id: string }>(
	field: string,
	merge: FieldMerge<Entity> & { readonly base: Entity; readonly theirs: Entity },
): { value: unknown; issues: ReconciliationIssue[]; inherited: string[] } {
	const mine = fieldOf(merge.mine, field);
	const base = fieldOf(merge.base, field);
	const theirs = fieldOf(merge.theirs, field);
	if (field === "groups") {
		return decideMemberships(merge.id, { mine, base, theirs });
	}
	if (same(mine, theirs) || same(theirs, base)) {
		// Either both sides agree, or only this proposal moved: nothing to settle.
		return { value: mine, issues: [], inherited: [] };
	}
	if (same(mine, base)) {
		return { value: theirs, issues: [], inherited: [merge.id] };
	}
	return {
		value: mine,
		issues: [
			{
				subject: merge.id,
				what: merge.what,
				kind: "competing-field",
				field,
				mine: stated(mine),
				theirs: stated(theirs),
				repair:
					`This proposal and the variant it came from both changed \`${field}\` of this ` +
					`${merge.what}. Say which one this proposal means, or write a third answer.`,
			},
		],
		inherited: [],
	};
}

/**
 * The ids a groups field holds, read off whichever state holds it.
 * @param value What is written there, if anything.
 * @returns The ids, as a set.
 */
function membershipsOf(value: unknown): Set<string> {
	return new Set(Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
}

/**
 * Decide a node's groups one membership at a time.
 *
 * A node's groups are a set, and each membership in it is its own yes-or-no
 * against the base. Deciding the whole field as one value would hold a
 * disagreement whenever the two sides touched different groups — this proposal
 * adding one, the predecessor removing another — which is two decisions that
 * do not compete. Decided one at a time, each membership is inherited, kept or
 * agreed exactly as a scalar field is, and there is nothing left to hold: a
 * membership both sides changed from the base can only have been changed to
 * the same answer, because a membership has only two.
 * @param id The node's identity, for what was inherited.
 * @param sides What the three states say about its groups.
 * @param sides.mine The proposal's memberships.
 * @param sides.base The memberships when the two agreed.
 * @param sides.theirs The predecessor's memberships now.
 * @returns The settled memberships, and whether any came from the predecessor.
 */
function decideMemberships(
	id: string,
	sides: { readonly mine: unknown; readonly base: unknown; readonly theirs: unknown },
): { value: unknown; issues: ReconciliationIssue[]; inherited: string[] } {
	const mine = membershipsOf(sides.mine);
	const base = membershipsOf(sides.base);
	const theirs = membershipsOf(sides.theirs);
	const every = [...new Set([...mine, ...base, ...theirs])].toSorted();
	const settled = every.filter((group) =>
		settledMembership(mine.has(group), base.has(group), theirs.has(group)),
	);
	const inherited = settled.length !== mine.size || settled.some((group) => !mine.has(group));
	const value = settled.length === 0 ? undefined : settled;
	return { value, issues: [], inherited: inherited ? [id] : [] };
}

/**
 * Whether one membership stands after the merge.
 *
 * Only the predecessor moved it: it follows. Otherwise this proposal's answer
 * stands, which is also both sides' answer when they agree.
 * @param here Whether this proposal has it.
 * @param was Whether the base had it.
 * @param there Whether the predecessor has it now.
 * @returns True when the node is in the group afterwards.
 */
function settledMembership(here: boolean, was: boolean, there: boolean): boolean {
	return there !== was && here === was ? there : here;
}

/**
 * What this proposal should say now that the variant it came from has moved.
 * @param states The base, this proposal, and the predecessor as it stands.
 * @returns The proposal's content afterwards, and what is left to settle.
 */
function reconcileVariant(states: ThreeStates): Reconciliation {
	const nodes = mergeByIdentity(
		sidesOf<SemanticNode>(states, (content) => content.nodes),
		MERGED.node,
		SUBJECT_WORDS.node,
	);
	const edges = mergeByIdentity(
		sidesOf<SemanticEdge>(states, (content) => content.edges),
		MERGED.edge,
		SUBJECT_WORDS.edge,
	);
	const flows = mergeByIdentity(
		sidesOf<SemanticFlow>(states, (content) => content.flows),
		MERGED.flow,
		SUBJECT_WORDS.flow,
	);
	const walkthroughs = mergeByIdentity(
		sidesOf<SemanticWalkthrough>(states, (content) => content.walkthroughs),
		MERGED.walkthrough,
		SUBJECT_WORDS.walkthrough,
	);
	const told = reconcileTold(states, {
		flows: flows.entities,
		walkthroughs: walkthroughs.entities,
	});
	const assembled: VariantContent = {
		nodes: nodes.entities,
		edges: edges.entities,
		flows: told.flows,
		walkthroughs: told.walkthroughs,
	};
	const parts = [nodes, edges, flows, walkthroughs];
	const issues = [...parts.flatMap((part) => part.issues), ...asIssues(told.issues)];
	const dangling = incoherenceOf(assembled);
	if (dangling.length > 0) {
		// The merge would leave this proposal saying something no document may
		// say — a beat about a step that is gone, an arrow to nothing. What it
		// already said is coherent, so that is what it keeps, and every reason is
		// reported in the words the contract itself uses.
		return { content: states.mine, issues: [...issues, ...dangling], inherited: [] };
	}
	return { content: assembled, issues, inherited: parts.flatMap((part) => part.inherited) };
}

/**
 * The ordered-content issues, in the shape every other issue has.
 * @param issues What the steps and beats disagreed about.
 * @returns The issues.
 */
function asIssues(issues: readonly OrderedIssue[]): ReconciliationIssue[] {
	return issues.map((issue) => ({
		subject: issue.subject,
		what: issue.what,
		kind: issue.kind,
		...(issue.field === undefined ? {} : { field: issue.field }),
		mine: issue.mine,
		theirs: issue.theirs,
		...(issue.changed === undefined ? {} : { changed: [...issue.changed] }),
		repair: issue.repair,
	}));
}

export {
	ChangedFieldSchema,
	ReconciliationIssueSchema,
	ReconciliationKindSchema,
	VariantStandingSchema,
	ToldStandingSchema,
	type VariantStanding,
	type ToldStanding,
	MERGED,
	SUBJECT_WORDS,
	same,
	fieldOf,
	reconcileVariant,
	type ChangedField,
	type Reconciliation,
	type ReconciliationIssue,
	type ReconciliationKind,
	type ThreeStates,
};
