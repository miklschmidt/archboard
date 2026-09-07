// The words a change event is written in.
//
// Both the headline and the long form describe the same diff, so the small
// decisions about how a node, a value or a list reads belong in one place:
// never print a node id, quote a name but not a description, and say "on its
// own" rather than "[]" for the case that matters most.

import type { FieldChange } from "@/runtime/engine/compare";

/** A borrowing view over inert diff data. */
type DeepReadonly<T> = T extends readonly (infer Item)[]
	? readonly DeepReadonly<Item>[]
	: T extends object
		? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
		: T;

/** Node id to the name a reader would use. */
type NameIndex = Readonly<Record<string, string>>;

/**
 * How much a movement is worth saying out loud. Containment, grouping and
 * cluster membership say who a node now belongs with; region only says roughly
 * where it sits, and is the coarsest thing this can notice.
 * @param model One moved node's field changes.
 * @returns 0 when it names a relationship, 1 when it is merely positional.
 */
const changeRank = (model: DeepReadonly<{ changes: object }>): number =>
	["cluster", "container", "group"].some((key) => key in model.changes) ? 0 : 1;

/**
 * A name in quotation marks, unless it is a description ("an unlabelled
 * rectangle") that would read wrongly inside them.
 * @param name The name or description.
 * @returns The phrase to drop into a sentence.
 */
const quoted = (name: string): string => (name.startsWith("an ") ? name : `"${name}"`);

/**
 * One field value, written the way it would appear in the note.
 * @param value The value.
 * @returns Its JSON form, or "none" for a value JSON cannot express.
 */
const encodeValue = (value: unknown): string => {
	const encoded: unknown = JSON.stringify(value);
	return typeof encoded === "string" ? encoded : "none";
};

/**
 * Several names in a row, cut off once the list stops being readable.
 * @param names The names.
 * @param limit How many to name before counting the rest.
 * @returns The list.
 */
function list(names: readonly string[], limit = 3): string {
	if (names.length <= limit) {
		return names.join(", ");
	}
	return `${names.slice(0, limit).join(", ")} and ${names.length - limit} more`;
}

/**
 * What to call one node, never its id: a synthetic id means nothing to a
 * reader, and a real one is not what anybody calls the box.
 * @param names Node id to reader-facing name.
 * @param node The node id.
 * @returns The name, falling back to the id when nothing else is known.
 */
function namedBy(names: NameIndex | undefined, node: string): string {
	return quoted(names?.[node] ?? node);
}

/**
 * Several nodes named in a row.
 * @param names Node id to reader-facing name.
 * @param ids The node ids.
 * @param limit How many to name before counting the rest.
 * @returns The list.
 */
function namedList(names: NameIndex | undefined, ids: readonly string[], limit = 3): string {
	return list(
		ids.map((node) => namedBy(names, node)),
		limit,
	);
}

/**
 * The "(+n more)" tail that keeps a one-line summary honest about what it left
 * out.
 * @param total How many there were altogether.
 * @returns The tail, or nothing when the one named was the only one.
 */
function andMore(total: number): string {
	return total > 1 ? ` (+${total - 1} more)` : "";
}

/**
 * Who a node sits with, for the fields that hold node ids rather than values.
 *
 * The empty case is the one that matters most — a node on its own, which "[]"
 * says badly.
 * @param value The field's value.
 * @param names Node id to reader-facing name.
 * @returns The phrase.
 */
function company(value: unknown, names: NameIndex | undefined): string {
	if (!Array.isArray(value)) {
		return encodeValue(value);
	}
	const members: unknown[] = value;
	if (members.length === 0) {
		return "on its own";
	}
	return `with ${members.map((member) => namedBy(names, String(member))).join(", ")}`;
}

/**
 * Everything that changed about one node or edge, in one clause.
 * @param changes Each field with its before and after.
 * @param names Node id to reader-facing name, for the fields that hold ids.
 * @returns The clause.
 */
function describeFieldChanges(
	changes: Readonly<Record<string, DeepReadonly<FieldChange>>>,
	names?: NameIndex,
): string {
	const descriptions: string[] = [];
	for (const [field, change] of Object.entries(changes)) {
		descriptions.push(
			field === "cluster" || field === "clusterWith"
				? `sits ${company(change.to, names)} (was ${company(change.from, names)})`
				: `${field} ${encodeValue(change.from)} → ${encodeValue(change.to)}`,
		);
	}
	return descriptions.join("; ");
}

export {
	type DeepReadonly,
	type NameIndex,
	andMore,
	changeRank,
	describeFieldChanges,
	list,
	namedBy,
	namedList,
	quoted,
};
