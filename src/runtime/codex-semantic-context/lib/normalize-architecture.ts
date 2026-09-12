// The architecture block of a context: what is being read, and what is picked
// out of it.
//
// Apart from the rest of the normalizer because it is the half that is about a
// board rather than about a session, and because the two together are more than
// one reviewed file. Nothing here reads a board: it validates what a
// composition adapter says the board said, and refuses a word an edit command
// would not take.

import { SEMANTIC_CONTEXT_LIMITS } from "@/runtime/codex-semantic-context/lib/limits";
import {
	DiagramGrammarSchema,
	ReconciliationKindSchema,
	VariantLifecycleSchema,
	type ChangeKind,
} from "@/shared/semantic-board/index";
import { SemanticSubjectKindSchema } from "@/shared/semantic-pane-context/index";
import type {
	SemanticArchitecture,
	SemanticContextInput,
	SemanticDifference,
	SemanticIssue,
	SemanticReconciliation,
	SemanticSelection,
	SemanticSubject,
	SemanticVariantIdentity,
	SemanticViewIdentity,
} from "@/runtime/codex-semantic-context/lib/types";
import {
	fail,
	nullableTextValue,
	numberValue,
	textValue,
	type BoundedValue,
} from "@/runtime/codex-semantic-context/lib/bounded-text";

/**
 * Whether a value is a non-array object whose keys can be inspected.
 * @param value - Any value.
 * @returns True for a plain object or class instance.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Freezes a value and everything reachable from it.
 * @param value - The value to freeze.
 * @returns The same value, now frozen.
 */
function deepFreeze<Value>(value: Value): Value {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	Object.freeze(value);
	for (const child of Object.values(value)) {
		deepFreeze(child);
	}
	return value;
}

/**
 * Validates one word from a closed vocabulary.
 *
 * The lists come from the board contract rather than from here; this only
 * refuses a word that is not on them, so a composition adapter cannot invent a
 * kind of subject an edit command would not take.
 * @param words - The words the field allows.
 * @param value - The candidate word.
 * @param field - The dotted path used in errors.
 * @returns The word.
 */
function wordValue<Word extends string>(
	words: readonly Word[],
	value: unknown,
	field: string,
): Word {
	const found = words.find((word) => word === value);
	if (found === undefined) {
		fail(field, `must be one of ${words.join(", ")}`);
	}
	return found;
}

// The vocabularies are the contracts' own, read off the canonical Zod schemas
// rather than written out again. A list copied here is a list that will still
// say `node` the day the board contract stops, and this side would quietly
// refuse a kind the rest of the system had started using.

/** The kinds of subject a selection or a difference may name. */
const SUBJECT_KINDS = SemanticSubjectKindSchema.options;

/** What kinds of disagreement a variant can be holding. */
const ISSUE_KINDS = ReconciliationKindSchema.options;

/** Where a variant can stand in a board's lifecycle. */
const LIFECYCLES = VariantLifecycleSchema.options;

/** The grammars a view can be drawn in. */
const GRAMMARS = DiagramGrammarSchema.options;

/**
 * How one subject differs from the same subject in the predecessor.
 *
 * The one vocabulary with no Zod owner to read: `ChangeKind` is a bare union in
 * the board contract's comparison. Listed here under a compile-time completeness
 * check instead, so adding a kind there fails this file rather than silently
 * making it refuse the new word. When that union gains a schema this becomes
 * `<its schema>.options` like the others.
 */
const CHANGE_KINDS = ["added", "removed", "changed", "unchanged"] as const;

/** Fails to compile if the board contract gains a change kind this list lacks. */
type EveryChangeKindListed =
	Exclude<ChangeKind, (typeof CHANGE_KINDS)[number]> extends never ? true : never;
const everyChangeKindListed: EveryChangeKindListed = true;
void everyChangeKindListed;

/**
 * Validates one named subject: an identity that is never clipped, and a label
 * that is.
 * @param value - The candidate subject.
 * @param field - The dotted path used in errors.
 * @returns The frozen subject.
 */
function normalizeSubject(value: unknown, field: string): BoundedValue<SemanticSubject> {
	if (!isRecord(value)) {
		fail(field, "must be {kind, id, name}");
	}
	const kind = wordValue(SUBJECT_KINDS, value["kind"], `${field}.kind`);
	const id = textValue(value["id"], `${field}.id`, SEMANTIC_CONTEXT_LIMITS.subjectIdBytes);
	if (id.truncated) {
		fail(`${field}.id`, `must not exceed ${SEMANTIC_CONTEXT_LIMITS.subjectIdBytes} UTF-8 bytes`);
	}
	const name = nullableTextValue(
		value["name"] ?? null,
		`${field}.name`,
		SEMANTIC_CONTEXT_LIMITS.subjectNameBytes,
	);
	return {
		value: deepFreeze({ kind, id: id.value, name: name.value }),
		truncated: name.truncated,
	};
}

/**
 * Validates the selected subjects.
 *
 * Ordered as the pane reported them and de-duplicated by identity rather than
 * sorted: what somebody picked first is what a singular question is about, and
 * sorting by id would answer it with whichever subject happened to be minted
 * earliest. The count is only reported as over budget here; the brief caps it.
 * @param selection - The selection input.
 * @returns The frozen subjects.
 */
function normalizeSelection(
	selection: SemanticContextInput["architecture"]["selection"],
): BoundedValue<SemanticSelection> {
	if (!isRecord(selection) || !Array.isArray(selection.subjects)) {
		fail("architecture.selection", "must be {count, subjects}");
	}
	const entries = selection.subjects.map((subject, index) =>
		normalizeSubject(subject, `architecture.selection[${index}]`),
	);
	const seen = new Set<string>();
	const unique = entries
		.map((entry) => entry.value)
		.filter((subject) => {
			const identity = `${subject.kind}:${subject.id}`;
			if (seen.has(identity)) {
				return false;
			}
			seen.add(identity);
			return true;
		});
	return {
		value: deepFreeze({
			count: countValue(selection.count, "architecture.selection.count"),
			subjects: unique,
		}),
		truncated:
			entries.some((entry) => entry.truncated) ||
			unique.length > SEMANTIC_CONTEXT_LIMITS.selectionEntries,
	};
}

/**
 * Validates which architectural state the pane is reading.
 * @param variant - The variant input, or null before anything is drawn.
 * @returns The frozen variant identity, or null.
 */
function normalizeVariant(
	variant: SemanticContextInput["architecture"]["variant"],
): BoundedValue<SemanticVariantIdentity | null> {
	if (variant === null) {
		return { value: null, truncated: false };
	}
	const id = textValue(
		variant.id,
		"architecture.variant.id",
		SEMANTIC_CONTEXT_LIMITS.subjectIdBytes,
	);
	const name = textValue(
		variant.name,
		"architecture.variant.name",
		SEMANTIC_CONTEXT_LIMITS.subjectNameBytes,
	);
	const against = nullableTextValue(
		variant.against,
		"architecture.variant.against",
		SEMANTIC_CONTEXT_LIMITS.subjectIdBytes,
	);
	return {
		value: deepFreeze({
			id: id.value,
			name: name.value,
			lifecycle: wordValue(LIFECYCLES, variant.lifecycle, "architecture.variant.lifecycle"),
			against: against.value,
		}),
		truncated: id.truncated || name.truncated || against.truncated,
	};
}

/**
 * Validates which view the variant is being read through.
 * @param view - The view input, or null for the whole variant.
 * @returns The frozen view identity, or null.
 */
function normalizeView(
	view: SemanticContextInput["architecture"]["view"],
): BoundedValue<SemanticViewIdentity | null> {
	if (view === null) {
		return { value: null, truncated: false };
	}
	const id = textValue(view.id, "architecture.view.id", SEMANTIC_CONTEXT_LIMITS.subjectIdBytes);
	const name = textValue(
		view.name,
		"architecture.view.name",
		SEMANTIC_CONTEXT_LIMITS.subjectNameBytes,
	);
	return {
		value: deepFreeze({
			id: id.value,
			name: name.value,
			grammar: wordValue(GRAMMARS, view.grammar, "architecture.view.grammar"),
		}),
		truncated: id.truncated || name.truncated,
	};
}

/**
 * Validates one difference: a named subject, and how it differs.
 * @param value - The candidate difference.
 * @param field - The dotted path used in errors.
 * @returns The frozen difference.
 */
function normalizeDifference(value: unknown, field: string): BoundedValue<SemanticDifference> {
	const named = normalizeSubject(value, field);
	const change = wordValue(
		CHANGE_KINDS,
		isRecord(value) ? value["change"] : undefined,
		`${field}.change`,
	);
	return { value: deepFreeze({ ...named.value, change }), truncated: named.truncated };
}

/**
 * Validates what this variant differs from its predecessor by.
 *
 * The counts are kept whole even when the named subjects are trimmed: an agent
 * told "three changed" and shown one of them knows to read the rest, and one
 * shown a short list with no count would believe it had seen everything.
 * @param differences - The differences input, or null for a variant with no predecessor.
 * @returns The frozen differences, or null.
 */
function normalizeDifferences(
	differences: SemanticContextInput["architecture"]["differences"],
): BoundedValue<SemanticArchitecture["differences"]> {
	if (differences === null) {
		return { value: null, truncated: false };
	}
	if (!Array.isArray(differences.subjects)) {
		fail("architecture.differences.subjects", "must be an array");
	}
	const subjects = differences.subjects.map((subject, index) =>
		normalizeDifference(subject, `architecture.differences.subjects[${index}]`),
	);
	return {
		value: deepFreeze({
			added: countValue(differences.added, "architecture.differences.added"),
			removed: countValue(differences.removed, "architecture.differences.removed"),
			changed: countValue(differences.changed, "architecture.differences.changed"),
			subjects: subjects.map((subject) => subject.value),
		}),
		truncated:
			subjects.some((subject) => subject.truncated) ||
			subjects.length > SEMANTIC_CONTEXT_LIMITS.differenceEntries,
	};
}

/**
 * Validates a count that must be present.
 * @param value - The candidate number.
 * @param field - The dotted path used in errors.
 * @returns The count.
 */
function countValue(value: unknown, field: string): number {
	const count = numberValue(value, field);
	if (count === null) {
		fail(field, "must be a non-negative safe integer");
	}
	return count;
}

/**
 * Validates the unsettled disagreements a variant is holding.
 * @param issues - The issues input.
 * @returns The frozen issues.
 */
function normalizeIssues(
	issues: SemanticReconciliation["issues"],
): BoundedValue<readonly SemanticIssue[]> {
	if (!Array.isArray(issues)) {
		fail("architecture.issues", "must be an array");
	}
	const entries = issues.map((issue, index) => {
		const field = `architecture.issues[${index}]`;
		if (!isRecord(issue)) {
			fail(field, "must be {subject, what, kind, field, repair}");
		}
		const subject = textValue(
			issue["subject"],
			`${field}.subject`,
			SEMANTIC_CONTEXT_LIMITS.subjectIdBytes,
		);
		const what = textValue(
			issue["what"],
			`${field}.what`,
			SEMANTIC_CONTEXT_LIMITS.subjectNameBytes,
		);
		const disputed = nullableTextValue(
			issue["field"] ?? null,
			`${field}.field`,
			SEMANTIC_CONTEXT_LIMITS.subjectNameBytes,
		);
		const repair = textValue(
			issue["repair"],
			`${field}.repair`,
			SEMANTIC_CONTEXT_LIMITS.repairBytes,
		);
		return {
			value: deepFreeze({
				subject: subject.value,
				what: what.value,
				kind: wordValue(ISSUE_KINDS, issue["kind"], `${field}.kind`),
				field: disputed.value,
				repair: repair.value,
			}),
			truncated: subject.truncated || what.truncated || disputed.truncated || repair.truncated,
		};
	});
	return {
		value: deepFreeze(entries.map((entry) => entry.value)),
		truncated:
			entries.some((entry) => entry.truncated) ||
			entries.length > SEMANTIC_CONTEXT_LIMITS.issueEntries,
	};
}

/**
 * Validates what a variant is waiting on.
 *
 * The fact and the count are required and never clipped; the issues themselves
 * are the part a brief may have to drop. An agent told `required` with an empty
 * list knows to read the board; an agent told nothing at all does not.
 * @param reconciliation - The reconciliation input.
 * @returns The frozen reconciliation.
 */
function normalizeReconciliation(
	reconciliation: SemanticContextInput["architecture"]["reconciliation"],
): BoundedValue<SemanticReconciliation> {
	if (!isRecord(reconciliation)) {
		fail("architecture.reconciliation", "must be {required, count, blockedBy, issues}");
	}
	const issues = normalizeIssues(reconciliation.issues);
	const blockedBy = nullableTextValue(
		reconciliation.blockedBy,
		"architecture.reconciliation.blockedBy",
		SEMANTIC_CONTEXT_LIMITS.subjectIdBytes,
	);
	if (typeof reconciliation.required !== "boolean") {
		fail("architecture.reconciliation.required", "must be a boolean");
	}
	return {
		value: deepFreeze({
			required: reconciliation.required,
			count: countValue(reconciliation.count, "architecture.reconciliation.count"),
			blockedBy: blockedBy.value,
			issues: issues.value,
		}),
		truncated: issues.truncated || blockedBy.truncated,
	};
}

/**
 * Validates the whole architecture block: what is being read, through which
 * view, what is picked out, what it differs from and what it is waiting on.
 * @param architecture - The architecture input.
 * @returns The frozen architecture.
 */
function normalizeArchitecture(
	architecture: SemanticContextInput["architecture"],
): BoundedValue<SemanticArchitecture> {
	if (!isRecord(architecture)) {
		fail("architecture", "must be {variant, view, selection, differences, issues}");
	}
	const variant = normalizeVariant(architecture.variant);
	const view = normalizeView(architecture.view);
	const selection = normalizeSelection(architecture.selection);
	const differences = normalizeDifferences(architecture.differences);
	const reconciliation = normalizeReconciliation(architecture.reconciliation);
	const parts: readonly BoundedValue<unknown>[] = [
		variant,
		view,
		selection,
		differences,
		reconciliation,
	];
	return {
		value: deepFreeze({
			variant: variant.value,
			view: view.value,
			selection: selection.value,
			differences: differences.value,
			reconciliation: reconciliation.value,
		}),
		truncated: parts.some((part) => part.truncated),
	};
}

export { type BoundedValue, normalizeArchitecture };
