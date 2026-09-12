// The architecture section of the canonical semantic brief.
//
// The brief's own owner lives in the runtime and this parser deliberately does
// not import it: the whole point is that two independent readers agree on the
// bytes, so a field that quietly changed shape on one side is refused on the
// other rather than displayed as though it had always been that way. Every key
// must be present and nothing else may be, and one malformed entry refuses the
// list it is in — a brief showing three of four selected subjects would be a
// quieter lie than one that failed to parse.

import type { VoiceContextCanonicalBrief } from "@/ui/voice-context/contract";
import {
	isIndex,
	isNullableString,
	isOneOf,
	isRecord,
	isString,
	shaped,
	type JsonRecord,
} from "@/ui/voice-context/lib/brief-sections";

type Architecture = VoiceContextCanonicalBrief["architecture"];
type Selection = Architecture["selection"];
type Subject = Selection["subjects"][number];
type Difference = NonNullable<Architecture["differences"]>["subjects"][number];
type Reconciliation = Architecture["reconciliation"];
type Issue = Reconciliation["issues"][number];

const SUBJECT_KINDS = ["node", "edge", "flow", "step", "view", "walkthrough", "beat"] as const;
const CHANGE_KINDS = ["added", "removed", "changed", "unchanged"] as const;
const LIFECYCLES = ["current", "draft", "historical"] as const;
const GRAMMARS = ["architecture", "data-flow"] as const;
const ISSUE_KINDS = [
	"competing-field",
	"competing-order",
	"deleted-and-changed",
	"reference-lost",
	"left-empty",
] as const;

/** What every identity in this block carries, once it has been read. */
interface Identity {
	readonly id: string;
	readonly name: string;
}

/** What a subject carries: the same, with a label that may be absent. */
interface Labelled {
	readonly id: string;
	readonly name: string | null;
}

/**
 * The `id` and `name` of a record, both required.
 * @param parsed The record.
 * @returns The identity, or null when either field is not a string.
 */
function identityOf(parsed: JsonRecord): Identity | null {
	const id = parsed["id"];
	const name = parsed["name"];
	return isString(id) && isString(name) ? { id, name } : null;
}

/**
 * The `id` and optional `name` of a record.
 * @param parsed The record.
 * @returns The labelled identity, or null when the shape is wrong.
 */
function labelOf(parsed: JsonRecord): Labelled | null {
	const id = parsed["id"];
	const name = parsed["name"];
	return isString(id) && isNullableString(name) ? { id, name } : null;
}

/**
 * Parses which architectural state is being read.
 * @param value The section, or null when nothing is drawn.
 * @returns The variant, null, or undefined when malformed.
 */
function parseVariant(value: unknown): Architecture["variant"] | undefined {
	if (value === null) {
		return null;
	}
	const parsed = shaped(value, ["id", "name", "lifecycle", "against"]);
	if (parsed === null) {
		return undefined;
	}
	const identity = identityOf(parsed);
	const lifecycle = parsed["lifecycle"];
	const against = parsed["against"];
	if (identity === null || !isNullableString(against)) {
		return undefined;
	}
	return isOneOf(lifecycle, LIFECYCLES)
		? Object.freeze({ ...identity, lifecycle, against })
		: undefined;
}

/**
 * Parses which view the variant is being read through.
 * @param value The section, or null for the whole variant.
 * @returns The view, null, or undefined when malformed.
 */
function parseView(value: unknown): Architecture["view"] | undefined {
	if (value === null) {
		return null;
	}
	const parsed = shaped(value, ["id", "name", "grammar"]);
	const identity = parsed === null ? null : identityOf(parsed);
	const grammar = parsed?.["grammar"];
	if (identity === null || !isOneOf(grammar, GRAMMARS)) {
		return undefined;
	}
	return Object.freeze({ ...identity, grammar });
}

/**
 * Parses one selected subject.
 * @param value The entry.
 * @returns The subject, or null when malformed.
 */
function parseSubject(value: unknown): Subject | null {
	const parsed = shaped(value, ["kind", "id", "name"]);
	const label = parsed === null ? null : labelOf(parsed);
	const kind = parsed?.["kind"];
	return label === null || !isOneOf(kind, SUBJECT_KINDS) ? null : Object.freeze({ kind, ...label });
}

/**
 * Parses one difference against the predecessor.
 * @param value The entry.
 * @returns The difference, or null when malformed.
 */
function parseDifference(value: unknown): Difference | null {
	const parsed = shaped(value, ["change", "kind", "id", "name"]);
	if (parsed === null) {
		return null;
	}
	const label = labelOf(parsed);
	const kind = parsed["kind"];
	const change = parsed["change"];
	if (label === null || !isOneOf(kind, SUBJECT_KINDS)) {
		return null;
	}
	return isOneOf(change, CHANGE_KINDS) ? Object.freeze({ change, kind, ...label }) : null;
}

/**
 * Parses one unsettled disagreement.
 * @param value The entry.
 * @returns The issue, or null when malformed.
 */
function parseIssue(value: unknown): Issue | null {
	const parsed = shaped(value, ["subject", "what", "kind", "field", "repair"]);
	const said = parsed === null ? null : sentencesOf(parsed);
	const kind = parsed?.["kind"];
	if (said === null || !isOneOf(kind, ISSUE_KINDS)) {
		return null;
	}
	return Object.freeze({ ...said, kind });
}

/** The three sentences an issue carries, and the field it is about. */
interface Said {
	readonly subject: string;
	readonly what: string;
	readonly field: string | null;
	readonly repair: string;
}

/**
 * The words of one issue, read off the record.
 * @param parsed The record.
 * @returns The words, or null when any of them is malformed.
 */
function sentencesOf(parsed: JsonRecord): Said | null {
	const subject = parsed["subject"];
	const what = parsed["what"];
	const field = parsed["field"];
	const repair = parsed["repair"];
	if (!isString(subject) || !isString(what)) {
		return null;
	}
	return isNullableString(field) && isString(repair) ? { subject, what, field, repair } : null;
}

/**
 * Parses a list where one malformed entry refuses the whole list.
 * @param value The list.
 * @param parse How to read one entry.
 * @returns The entries, or null when the list or any entry is malformed.
 */
function parseAll<Entry>(value: unknown, parse: (entry: unknown) => Entry | null): Entry[] | null {
	if (!Array.isArray(value)) {
		return null;
	}
	const parsed: Entry[] = [];
	for (const entry of value) {
		const one = parse(entry);
		if (one === null) {
			return null;
		}
		parsed.push(one);
	}
	return parsed;
}

/**
 * Parses what was picked out.
 *
 * `count` must be there and may exceed the listed subjects: a brief drops them
 * under byte pressure and the count is what says they existed. A reader that
 * counted the list would report an empty selection for a brief that had one.
 * @param value The section.
 * @returns The selection, or null when malformed.
 */
function parseSelection(value: unknown): Selection | null {
	const parsed = shaped(value, ["count", "subjects"]);
	if (parsed === null || !isIndex(parsed["count"])) {
		return null;
	}
	const subjects = parseAll(parsed["subjects"], parseSubject);
	return subjects === null
		? null
		: Object.freeze({ count: parsed["count"], subjects: Object.freeze(subjects) });
}

/**
 * Parses the differences against the predecessor.
 * @param value The section, or null for a variant with no predecessor.
 * @returns The differences, null, or undefined when malformed.
 */
function parseDifferences(value: unknown): Architecture["differences"] | undefined {
	if (value === null) {
		return null;
	}
	const parsed = shaped(value, ["added", "removed", "changed", "subjects"]);
	const counts = parsed === null ? null : countsOf(parsed);
	const subjects = parsed === null ? null : parseAll(parsed["subjects"], parseDifference);
	if (counts === null || subjects === null) {
		return undefined;
	}
	return Object.freeze({ ...counts, subjects: Object.freeze(subjects) });
}

/** How many subjects differ, by the way they differ. */
interface Counts {
	readonly added: number;
	readonly removed: number;
	readonly changed: number;
}

/**
 * The three counts, read off the record.
 * @param parsed The record.
 * @returns The counts, or null when any of them is not a count.
 */
function countsOf(parsed: JsonRecord): Counts | null {
	const added = parsed["added"];
	const removed = parsed["removed"];
	const changed = parsed["changed"];
	return isIndex(added) && isIndex(removed) && isIndex(changed)
		? { added, removed, changed }
		: null;
}

/**
 * Parses what the variant is waiting on.
 *
 * `required` and `count` are the fact and must be there; `issues` is what fitted
 * into the brief and may legitimately be shorter than `count` or empty. A reader
 * that reconstructed `required` from the list length would report "nothing to
 * settle" for a brief whose issues were dropped, which is the one wrong answer.
 * @param value The section.
 * @returns The reconciliation, or null when malformed.
 */
function parseReconciliation(value: unknown): Reconciliation | null {
	const parsed = shaped(value, ["required", "count", "blockedBy", "issues"]);
	if (parsed === null || typeof parsed["required"] !== "boolean" || !isIndex(parsed["count"])) {
		return null;
	}
	const issues = parseAll(parsed["issues"], parseIssue);
	if (issues === null || !isNullableString(parsed["blockedBy"])) {
		return null;
	}
	return Object.freeze({
		required: parsed["required"],
		count: parsed["count"],
		blockedBy: parsed["blockedBy"],
		issues: Object.freeze(issues),
	});
}

/**
 * Parses the whole architecture section.
 * @param value The section.
 * @returns The architecture, or null when any part of it is malformed.
 */
function parseArchitecture(value: unknown): Architecture | null {
	if (!isRecord(value)) {
		return null;
	}
	const parsed = shaped(value, ["variant", "view", "selection", "differences", "reconciliation"]);
	if (parsed === null) {
		return null;
	}
	const read = {
		variant: parseVariant(parsed["variant"]),
		view: parseView(parsed["view"]),
		differences: parseDifferences(parsed["differences"]),
		selection: parseSelection(parsed["selection"]),
		reconciliation: parseReconciliation(parsed["reconciliation"]),
	};
	return complete(read)
		? Object.freeze({
				variant: read.variant,
				view: read.view,
				selection: read.selection,
				differences: read.differences,
				reconciliation: read.reconciliation,
			})
		: null;
}

/** Every part of the section, each parsed or refused. */
interface Read {
	readonly variant: Architecture["variant"] | undefined;
	readonly view: Architecture["view"] | undefined;
	readonly differences: Architecture["differences"] | undefined;
	readonly selection: Selection | null;
	readonly reconciliation: Reconciliation | null;
}

/** The same, with every part parsed. */
interface Parsed {
	readonly variant: Architecture["variant"];
	readonly view: Architecture["view"];
	readonly differences: Architecture["differences"];
	readonly selection: Selection;
	readonly reconciliation: Reconciliation;
}

/**
 * Whether every part parsed. A section is refused whole: half an architecture
 * is a picture of a board that does not exist.
 * @param read The parts.
 * @returns True when none was refused.
 */
function complete(read: Read): read is Parsed {
	// `undefined` is a refusal and `null` is an absence: a pane that has drawn
	// nothing has no variant, and a root variant has nothing to differ from.
	// Only the two lists have no way of being legitimately absent.
	return (
		read.variant !== undefined &&
		read.view !== undefined &&
		read.differences !== undefined &&
		read.selection !== null &&
		read.reconciliation !== null
	);
}

export { parseArchitecture };
