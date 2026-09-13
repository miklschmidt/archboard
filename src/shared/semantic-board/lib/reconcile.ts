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
	ReconciliationIssueSchema,
	ReconciliationKindSchema,
	ToldStandingSchema,
	VariantStandingSchema,
	type ReconciliationIssue,
	type ReconciliationKind,
	type ToldStanding,
	type VariantStanding,
} from "@/shared/semantic-board/lib/reconcile-standing";
import type { SemanticFlow } from "@/shared/semantic-board/lib/views";
import type { SemanticWalkthrough } from "@/shared/semantic-board/lib/walkthrough";
import { reconcileTold, type OrderedIssue } from "@/shared/semantic-board/lib/reconcile-told";
import { sameSemanticValue } from "@/shared/semantic-board/lib/semantic-value";

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
		"name",
		"kind",
		"responsibility",
		"description",
		"parent",
		"group",
		"binding",
		"drillDown",
	],
	edge: ["from", "to", "kind", "label", "description", "emphasis", "traffic"],
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

/**
 * One side of a disagreement, in a shape a document can hold.
 *
 * An unwritten field is `undefined` in memory and simply absent once the board
 * is JSON on disk — so an issue about somebody clearing a description would come
 * back from a restart missing the very field it is about, and be refused by the
 * contract that describes it. Absence is therefore stated rather than implied.
 * @param value What that side says, or nothing when it says nothing.
 * @returns The value, or null for nothing written.
 */
function stated(value: unknown): unknown {
	return value === undefined ? null : value;
}

/**
 * Whether two values of one field say the same thing.
 * @param one A value.
 * @param other The other.
 * @returns True when nothing is between them.
 */
const same = sameSemanticValue;

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
 * Order of the result follows this proposal's own order, with anything the
 * predecessor added appended: where a card sits in an array is not meaning, and
 * two sides appending independently must not read as a conflict.
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

/**
 * What to say about a subject this proposal removed and the predecessor then
 * changed. Nothing when the predecessor left it alone: following a removal of
 * something nobody touched is the ordinary case and needs no attention.
 * @param id The subject.
 * @param base It as it was when the two agreed.
 * @param theirs It as the predecessor has it now.
 * @param fields The fields that say what it is.
 * @param what The word for that kind of subject.
 * @returns The issue, or none.
 */
function removedHereIssues<Entity extends object>(
	id: string,
	base: Entity,
	theirs: Entity,
	fields: readonly string[],
	what: string,
): ReconciliationIssue[] {
	const moved = fields.filter((field) => !same(field9(theirs, field), field9(base, field)));
	if (moved.length === 0 && !same(theirs, base)) {
		// A flow whose steps the predecessor rewrote is a flow the predecessor
		// worked on, however untouched its own name is — the same rule as the
		// other direction, and for the same reason.
		moved.push("what it holds");
	}
	if (moved.length === 0) {
		return [];
	}
	return [
		{
			subject: id,
			what,
			kind: "deleted-and-changed",
			mine: "removed it",
			theirs: `changed ${moved.join(", ")}`,
			repair:
				`This proposal removed this ${what}, and the variant it came from changed it. Keep the ` +
				"removal and say so, or take the change instead.",
		},
	];
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
	// "Changed" means the whole subject, contents and all: a flow whose steps
	// this proposal rewrote is a flow this proposal worked on, however untouched
	// its own name is, and dropping it whole would throw that work away in
	// silence.
	const changed = fields.filter((field) => !same(field9(mine, field), field9(base, field)));
	if (changed.length === 0 && !same(mine, base)) {
		changed.push("what it holds");
	}
	if (changed.length === 0) {
		// Safe to follow the predecessor — unless something here still refers to
		// it, which is decided once the whole content is assembled.
		out.dropped.push(mine);
		return;
	}
	out.entities.push(mine);
	out.issues.push({
		subject: id,
		what,
		kind: "deleted-and-changed",
		mine: `changed ${changed.join(", ")}`,
		theirs: "removed it",
		repair:
			`The variant this proposal came from removed this ${what}, and this proposal changed it. ` +
			"Keep the change and drop the removal, or remove it here too.",
	});
}

/**
 * One field of one subject, read off whichever state holds it.
 * @param entity The subject in one state.
 * @param field The field's name.
 * @returns Its value, or undefined.
 */
function field9(entity: object, field: string): unknown {
	return Object.entries(entity).find(([name]) => name === field)?.[1];
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
	const mine = field9(merge.mine, field);
	const base = field9(merge.base, field);
	const theirs = field9(merge.theirs, field);
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
		repair: issue.repair,
	}));
}

export {
	ReconciliationIssueSchema,
	ReconciliationKindSchema,
	VariantStandingSchema,
	ToldStandingSchema,
	type VariantStanding,
	type ToldStanding,
	MERGED,
	SUBJECT_WORDS,
	same,
	field9 as fieldOf,
	reconcileVariant,
	type Reconciliation,
	type ReconciliationIssue,
	type ReconciliationKind,
	type ThreeStates,
};
