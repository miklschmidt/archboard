// What every subject of a `semantic compare` answer carries, and the answer's
// entry for one flow step, which may be a message, a decision or a loop.

import { z } from "zod";
import { isMessage, stepWords } from "@archboard/board/flow-steps";
import { SubjectStandingSchema } from "@archboard/board/render-reply";
import {
	type FieldChange,
	type PlacedStep,
	type SubjectChange,
} from "@archboard/board/compare-variants";

/** One field that moved, and what it moved between. */
const MovedFieldSchema = z.object({
	field: z.string(),
	/** What the variant it is read against said; absent when it said nothing. */
	before: z.unknown(),
	/** What this variant says; absent when it says nothing. */
	after: z.unknown(),
});

/**
 * What every compared subject carries: its identity, how it stands against the
 * variant it is read against, and the fields that moved — empty for anything
 * but a change.
 *
 * `standing` rather than `kind`, because a node and a relationship each already
 * have a `kind` of their own and an answer with two of them would be a riddle.
 */
const comparedSubject = {
	id: z.string(),
	standing: SubjectStandingSchema,
	fields: z.array(MovedFieldSchema),
};

/**
 * One step, with the flow it is told in and where it comes in it. A decision
 * or loop has no ends and is labelled by its question or condition; `within`
 * names the alternative or loop that holds a step, null at the top.
 */
const ComparedStepSchema = z.object({
	...comparedSubject,
	flow: z.string(),
	position: z.int(),
	within: z.object({ step: z.string(), alternative: z.string().optional() }).nullable(),
	from: z.string().nullable(),
	to: z.string().nullable(),
	fromName: z.string().nullable(),
	toName: z.string().nullable(),
	kind: z.string(),
	label: z.string(),
});

/**
 * One field that moved, as the answer carries it.
 * @param change The field change.
 * @returns The same three facts.
 */
function movedField(change: FieldChange): z.infer<typeof MovedFieldSchema> {
	return { field: change.field, before: change.before, after: change.after };
}

/** Who sends a step and who receives it, as the answer carries them. */
interface Ends {
	readonly from: string | null;
	readonly to: string | null;
	readonly fromName: string | null;
	readonly toName: string | null;
}

/**
 * The parts a step runs between: a message's sender and receiver, and nobody
 * for a decision or a loop, which runs between no two parts.
 * @param step The step.
 * @param names What each part is called.
 * @returns Its ends.
 */
function endsOf(step: PlacedStep, names: ReadonlyMap<string, string>): Ends {
	if (!isMessage(step)) return { from: null, to: null, fromName: null, toName: null };
	return {
		from: step.from,
		to: step.to,
		fromName: names.get(step.from) ?? null,
		toName: names.get(step.to) ?? null,
	};
}

/**
 * One step, as the answer carries it.
 * @param change How it stands.
 * @param names What each part is called.
 * @returns The entry.
 */
function comparedStep(
	change: SubjectChange<PlacedStep>,
	names: ReadonlyMap<string, string>,
): z.infer<typeof ComparedStepSchema> {
	const step = change.entity;
	return {
		id: step.id,
		standing: change.kind,
		fields: change.fields.map(movedField),
		flow: step.flow,
		position: step.position,
		within: step.within ?? null,
		...endsOf(step, names),
		kind: step.kind,
		label: stepWords(step),
	};
}

export { ComparedStepSchema, comparedStep, comparedSubject, movedField };
