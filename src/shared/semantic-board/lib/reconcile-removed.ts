// A subject one side removed and the other changed, and the values that settle it.
//
// The one disagreement no choice of side can answer: `mine` keeps the removal,
// but taking the other side means writing the subject again, which is an
// ordinary edit rather than a choice — so the issue has to carry what that edit
// is written out of. A field name alone sends its reader to the board's JSON to
// copy a sentence out by hand, one line below a near-identical neighbour, which
// is how a restored node comes back saying something nobody wrote (TASK-256.09).
//
// Here rather than in `reconcile.ts` because it is one shape said twice, once
// in each direction, and because reading a field off a subject and stating an
// unwritten one belong with the comparison that needs them.

import { sameSemanticValue } from "@/shared/semantic-board/lib/semantic-value";
import type {
	ChangedField,
	ReconciliationIssue,
} from "@/shared/semantic-board/lib/reconcile-standing";

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

/**
 * One field of one subject, read off whichever state holds it.
 * @param entity The subject in one state.
 * @param field The field's name.
 * @returns Its value, or undefined.
 */
function fieldOf(entity: object, field: string): unknown {
	return Object.entries(entity).find(([name]) => name === field)?.[1];
}

/**
 * The fields one side moved, with the values to settle them out of.
 *
 * A disagreement between a removal and a change is settled by stating the
 * subject again, and that is written out of values rather than field names: an
 * issue that said only `changed description` would send its reader to the board
 * for the sentence, one line below a near-identical `responsibility`, to be
 * copied out by hand (TASK-256.09).
 * @param was The subject as the two sides had it when they last agreed.
 * @param now The subject as the side that changed it has it.
 * @param fields The fields that say what it is.
 * @returns One entry per field that moved.
 */
function changedFields<Entity extends object>(
	was: Entity,
	now: Entity,
	fields: readonly string[],
): ChangedField[] {
	return fields
		.filter((field) => !same(fieldOf(now, field), fieldOf(was, field)))
		.map((field) => ({
			field,
			before: stated(fieldOf(was, field)),
			after: stated(fieldOf(now, field)),
		}));
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
	const changed = changedFields(base, theirs, fields);
	const moved = changed.map((field) => field.field);
	if (moved.length === 0 && !same(theirs, base)) {
		// A flow whose steps the predecessor rewrote is a flow the predecessor
		// worked on, however untouched its own name is — the same rule as the
		// other direction, and for the same reason. It is not a field and has no
		// value of its own: what it holds is reported against the entries.
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
			...(changed.length === 0 ? {} : { changed }),
			repair:
				`This proposal removed this ${what}, and the variant it came from changed it. Keep the ` +
				`removal and say so, or take the change by stating the ${what} again under this id, ` +
				"with the values this disagreement carries for each field it changed.",
		},
	];
}

/**
 * What to say about a subject the predecessor removed and this proposal then
 * changed: the mirror of `removedHereIssues`, and nothing when this proposal
 * left it alone, which is the ordinary case of following a removal.
 *
 * "Changed" means the whole subject, contents and all: a flow whose steps this
 * proposal rewrote is a flow this proposal worked on, however untouched its own
 * name is, and dropping it whole would throw that work away in silence.
 * @param id The subject.
 * @param base It as it was when the two agreed.
 * @param mine It as this proposal has it.
 * @param fields The fields that say what it is.
 * @param what The word for that kind of subject.
 * @returns The issue, or none.
 */
function removedThereIssues<Entity extends object>(
	id: string,
	base: Entity,
	mine: Entity,
	fields: readonly string[],
	what: string,
): ReconciliationIssue[] {
	const changed = changedFields(base, mine, fields);
	const moved = changed.map((field) => field.field);
	if (moved.length === 0 && !same(mine, base)) {
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
			mine: `changed ${moved.join(", ")}`,
			theirs: "removed it",
			...(changed.length === 0 ? {} : { changed }),
			repair:
				`The variant this proposal came from removed this ${what}, and this proposal changed it. ` +
				"Keep the change and drop the removal, or remove it here too.",
		},
	];
}

export { fieldOf, removedHereIssues, removedThereIssues, same, stated };
