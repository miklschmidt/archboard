// What a board has to be true of itself, above any one variant.
//
// The rules here are about the family and the frame: which contract version the
// document was written for, that variant ids and names are unique, that
// ancestry resolves and terminates, that at most one variant is designated
// current and the board agrees with it, and that the board's own id and its
// variants' ids are nobody else's. Everything about what is *on* a variant is
// next door in `integrity.ts`.
//
// Separate from those rules because they are read at a different scale: these
// are answered once per document, those once per variant, and one file holding
// both had grown past what anybody reads in a sitting.

import {
	asksForDesignation,
	CURRENT_DESIGNATION,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SUPPORTED_SCHEMA_MAJOR,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/lib/aggregate";
import { subjectIds } from "@/shared/semantic-board/lib/content";
import { repeated, walkReturns, type IntegrityIssue } from "@/shared/semantic-board/lib/rules";

/**
 * Check the variant family: unique ids, ancestry that resolves and terminates,
 * and a `current` designation that names a variant marked as the current one.
 * @param board The board.
 * @returns The issues found.
 */
function familyIssues(board: SemanticBoard): IntegrityIssue[] {
	const issues: IntegrityIssue[] = [];
	const byId = new Map(board.variants.map((variant) => [variant.id, variant]));
	for (const id of repeated(board.variants.map((variant) => variant.id))) {
		issues.push({ at: "variants", problem: `two variants share the id "${id}"` });
	}
	for (const name of repeated(board.variants.map((variant) => variant.name))) {
		issues.push({
			at: "variants",
			problem: `two variants are called "${name}"; a variant name is an address somebody types`,
		});
	}
	for (const variant of board.variants) {
		if (asksForDesignation(variant.name)) {
			issues.push({
				at: `variants.${variant.id}.name`,
				problem:
					`"${CURRENT_DESIGNATION}" asks which variant is designated current and cannot be a ` +
					"variant's lasting name; name this state for what it is",
			});
		}
	}
	issues.push(
		...ancestryIssues(board.variants, byId),
		...designationIssues(board, byId),
		...standingIssues(board, byId),
	);
	return issues;
}

/**
 * Check what each variant says it is waiting on.
 *
 * A standing names two other variants and a version, and all three have to be
 * real: a draft waiting on a variant this board does not have is waiting for
 * something that cannot arrive, and a version from the future is a record
 * written by something that was not this board. None of it is recoverable by
 * guessing, so a document that says it is refused rather than opened.
 * @param board The board.
 * @param byId The board's variants, by id.
 * @returns The issues found.
 */
function standingIssues(
	board: SemanticBoard,
	byId: ReadonlyMap<string, SemanticVariant>,
): IntegrityIssue[] {
	return board.variants.flatMap((variant) =>
		variant.reconciliation === undefined
			? []
			: oneStandingIssues(
					variant.reconciliation,
					board,
					byId,
					`variants.${variant.id}`,
					variant.parent,
				),
	);
}

/**
 * Check one variant's standing against the family it belongs to.
 * @param standing What the variant says it is waiting on.
 * @param board The board.
 * @param byId The board's variants, by id.
 * @param at The path the variant is reported under.
 * @param parent The variant it was derived from, when it was derived from one.
 * @returns The issues found.
 */
function oneStandingIssues(
	standing: NonNullable<SemanticVariant["reconciliation"]>,
	board: SemanticBoard,
	byId: ReadonlyMap<string, SemanticVariant>,
	at: string,
	parent: string | undefined,
): IntegrityIssue[] {
	const issues: IntegrityIssue[] = [];
	if (!byId.has(standing.against)) {
		issues.push({
			at: `${at}.reconciliation.against`,
			problem: `waiting on "${standing.against}", which is not a variant of this board`,
		});
	} else if (standing.against !== parent) {
		// A variant is derived from exactly one other, and that is the only one it
		// can be out of step with. Waiting on a sibling, or on the variant's own
		// grandparent, would be a disagreement with something it was never
		// measured against — and the base it is holding would answer a question
		// nobody asked.
		issues.push({
			at: `${at}.reconciliation.against`,
			problem:
				`waiting on "${standing.against}", which is not the variant it was derived from ` +
				`("${parent ?? "nothing"}")`,
		});
	}
	if (standing.atVersion > board.version) {
		issues.push({
			at: `${at}.reconciliation.atVersion`,
			problem: `recorded at version ${standing.atVersion}, and this board is at ${board.version}`,
		});
	}
	return issues;
}

/**
 * Check the current designation: when there is one, it names a variant of this
 * board, that variant says it is the current one, and no other variant says so
 * too; when there is none, no variant says it is current.
 *
 * The last of those is the one worth spelling out. `current` is a designation
 * that moves, and the lifecycle on a variant is what a reader sees on screen.
 * Two variants both claiming to be the implemented architecture is not a
 * cosmetic disagreement: it is two different answers to the only question the
 * board exists to answer.
 * @param board The board.
 * @param byId The board's variants, by id.
 * @returns The issues found.
 */
function designationIssues(
	board: SemanticBoard,
	byId: ReadonlyMap<string, SemanticVariant>,
): IntegrityIssue[] {
	const claiming = board.variants.filter((variant) => variant.lifecycle === "current");
	const issues: IntegrityIssue[] =
		claiming.length > 1
			? [
					{
						at: "variants",
						problem: `${claiming.length} variants are marked current; at most one is the implemented architecture`,
					},
				]
			: [];
	return [...issues, ...designatedIssues(board.current, byId, claiming)];
}

/**
 * Check what the board designates against the variants that claim it.
 *
 * A board for something nobody has built designates nothing, and then no
 * variant may claim to be current either: one that did would be saying
 * something the board does not (ADR 0031).
 * @param current The board's designation, when it has one.
 * @param byId The board's variants, by id.
 * @param claiming The variants marked current.
 * @returns The issues found.
 */
function designatedIssues(
	current: string | undefined,
	byId: ReadonlyMap<string, SemanticVariant>,
	claiming: readonly SemanticVariant[],
): IntegrityIssue[] {
	if (current === undefined) {
		return claiming.map((variant) => ({
			at: "current",
			problem: `variant "${variant.name}" is marked current and the board designates no current variant`,
		}));
	}
	const designated = byId.get(current);
	if (designated === undefined) {
		return [{ at: "current", problem: `"${current}" is not a variant of this board` }];
	}
	return designated.lifecycle === "current"
		? []
		: [
				{
					at: "current",
					problem: `variant "${designated.name}" is designated current but is marked ${designated.lifecycle}`,
				},
			];
}

/**
 * Check that every variant's predecessor exists and that ancestry terminates.
 * @param variants The board's variants.
 * @param byId The same variants, by id.
 * @returns The issues found.
 */
function ancestryIssues(
	variants: readonly SemanticVariant[],
	byId: ReadonlyMap<string, SemanticVariant>,
): IntegrityIssue[] {
	const issues: IntegrityIssue[] = [];
	for (const variant of variants) {
		const parent = variant.parent;
		if (parent === undefined) {
			continue;
		}
		if (!byId.has(parent)) {
			issues.push({
				at: `variants.${variant.id}.parent`,
				problem: `derived from "${parent}", which is not a variant of this board`,
			});
		} else if (walkReturns(variant.id, (id) => byId.get(id)?.parent)) {
			issues.push({
				at: `variants.${variant.id}.parent`,
				problem: "ancestry closes on itself; a variant cannot descend from itself",
			});
		}
	}
	return issues;
}

/**
 * Whether this build implements the contract the document was written for.
 *
 * A document from a different major version is refused before anything else is
 * looked at, because every check below it reads fields whose meaning that major
 * version is free to have changed.
 * @param board The board.
 * @returns The issue, or nothing when the version is one this build implements.
 */
function versionIssues(board: SemanticBoard): IntegrityIssue[] {
	const major = Number(board.schemaVersion.split(".")[0]);
	if (major === SUPPORTED_SCHEMA_MAJOR) {
		return [];
	}
	return [
		{
			at: "schemaVersion",
			problem:
				`written for contract version ${board.schemaVersion}; ` +
				`this build implements ${SEMANTIC_BOARD_SCHEMA_VERSION}`,
		},
	];
}

/**
 * Check that the board and its variants do not answer to an id something on a
 * variant is already using.
 *
 * The board's own id and a variant's id are addressed by the same machinery
 * that addresses what is on them — a claim, a render request, a selection, an
 * announcement all carry an id and nothing else — so a board whose id is also a
 * flow's id is a board where "id X changed" has two answers. Inherited content
 * ids repeating *across* variants stay untouched; this is about the frame, not
 * about what is on it.
 * @param board The board.
 * @returns The issues found.
 */
function frameIssues(board: SemanticBoard): IntegrityIssue[] {
	const onVariants = new Set(board.variants.flatMap((variant) => subjectIds(variant.content)));
	const issues: IntegrityIssue[] = [];
	const reserved = new Set([
		...onVariants,
		board.id,
		...board.variants.map((variant) => variant.id),
	]);
	for (const view of board.views) {
		if (reserved.has(view.id)) {
			issues.push({
				at: `views.${view.id}.id`,
				problem: `the view answers to "${view.id}", and so does another subject on this board`,
			});
		}
	}
	if (onVariants.has(board.id)) {
		issues.push({
			at: "id",
			problem: `the board answers to "${board.id}", and so does something on one of its variants`,
		});
	}
	// The frame against itself, not only against what is on it. A board whose id
	// is also one of its variants' is a board where a claim, a render request and
	// an announcement all carry an id with two answers — and an id is the only
	// thing any of them carries.
	for (const variant of board.variants.filter((one) => one.id === board.id)) {
		issues.push({
			at: `variants.${variant.id}.id`,
			problem: `the variant answers to "${variant.id}", and so does the board itself`,
		});
	}
	for (const variant of board.variants.filter((one) => onVariants.has(one.id))) {
		issues.push({
			at: `variants.${variant.id}.id`,
			problem: `the variant answers to "${variant.id}", and so does something on a variant`,
		});
	}
	return issues;
}

export { familyIssues, frameIssues, versionIssues };
