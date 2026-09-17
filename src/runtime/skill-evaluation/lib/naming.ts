// Finding the subject a check names by the name a person would call it. A
// scenario quotes a symbol out of the source and an author writes a display
// name for the same thing: `run_simple` is drawn as `Werkzeug run_simple` and
// `DefaultJSONProvider` as `Default JSON provider`. Comparing the strings calls
// an accurate board wrong, so a check matches on the words of a name and
// accepts the qualifying words an author added to it.
//
// Only the evaluation's own checks read names this way. Identity is compared
// exactly by the ids-stable guardrail, the product's `payments@variant`
// addressing is the contract this wraps and never replaces, and a fixture's
// `$node(...)` placeholder names a node the fixture itself wrote.

import {
	resolveVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/index";

/** How well a candidate name answers the name a check asked for. */
const NO_MATCH = 0;
/** The check's words and a qualifying word the author added: `run_simple` is `Werkzeug run_simple`. */
const QUALIFIED = 1;
/** The same words, spelled differently: case, separators, spacing or camel case. */
const SAME_WORDS = 2;
/** The same string. */
const IDENTICAL = 3;

/** What a lookup for one name among candidates concluded. */
type NameMatch<T> =
	| { readonly kind: "exact"; readonly subject: T; readonly name: string }
	| { readonly kind: "loose"; readonly subject: T; readonly name: string }
	| { readonly kind: "none" }
	| { readonly kind: "ambiguous"; readonly names: readonly string[] };

/** Where the check being evaluated records the looser names it accepted. */
let accepted: Set<string> | undefined;

/**
 * Runs one check while collecting every looser name its lookups accepted, so
 * its verdict can say what it matched. Evaluation is synchronous, so the
 * collector belongs to exactly one check at a time.
 * @param run The check.
 * @returns What it concluded and the names it accepted, in the order accepted.
 */
function recordingMatches<T>(run: () => T): {
	readonly value: T;
	readonly notes: readonly string[];
} {
	const outer = accepted;
	const mine = new Set<string>();
	accepted = mine;
	try {
		return { value: run(), notes: [...mine] };
	} finally {
		accepted = outer;
	}
}

/**
 * Records that a name was answered by a differently spelled one.
 * @param asked The name the check used.
 * @param matched The name the subject carries.
 */
function noteMatch(asked: string, matched: string): void {
	accepted?.add(`"${asked}" matched "${matched}"`);
}

/**
 * The words of a name as a person reads them: separators, spacing and case
 * boundaries all end a word, so `run_simple`, `runSimple` and `Run Simple` are
 * one name and `DefaultJSONProvider` reads as three words.
 * @param name The name.
 * @returns Its words, lowercased, in order.
 */
function wordsOf(name: string): string[] {
	return name
		.replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
		.replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/u)
		.filter((word) => word !== "");
}

/**
 * Whether a subject's name is the name a check used with a qualifying word or
 * two added, as `Werkzeug run_simple` qualifies `run_simple`.
 *
 * Only that direction. A subject whose name says less than the check asked for
 * is a different subject: a proposal that replaces `App context stack` with
 * `App context` removed the part the check names, and a check that accepted
 * the shorter name for the longer one would say it is still there.
 * @param wanted The words the check's name reads as.
 * @param carried The words the subject's name reads as.
 * @returns True when the subject's name qualifies the check's.
 */
function qualifies(wanted: readonly string[], carried: readonly string[]): boolean {
	return wanted.length < carried.length && wanted.every((word) => carried.includes(word));
}

/**
 * How well two names read as one name, once both are read as words.
 * @param carried The words a subject's name reads as.
 * @param wanted The words the check's name reads as.
 * @returns The tier, NO_MATCH when nothing connects them.
 */
function wordTier(carried: readonly string[], wanted: readonly string[]): number {
	if (carried.length === 0 || wanted.length === 0) return NO_MATCH;
	if (carried.join(" ") === wanted.join(" ")) return SAME_WORDS;
	return qualifies(wanted, carried) ? QUALIFIED : NO_MATCH;
}

/**
 * How well one candidate name answers a name.
 * @param candidate The name a subject carries.
 * @param asked The name the check used.
 * @returns The tier, NO_MATCH when nothing connects them.
 */
function tierOf(candidate: string, asked: string): number {
	return candidate === asked ? IDENTICAL : wordTier(wordsOf(candidate), wordsOf(asked));
}

/**
 * The one subject a name answers to. The best tier decides, so an exactly
 * named subject wins over a qualified one; two subjects answering equally well
 * is an ambiguous name, which is no match at all rather than a guess.
 * @param candidates The subjects to look through.
 * @param nameOf Each subject's name.
 * @param asked The name the check used.
 * @returns What the lookup concluded.
 */
function matchName<T>(
	candidates: readonly T[],
	nameOf: (subject: T) => string,
	asked: string | undefined,
): NameMatch<T> {
	if (asked === undefined) return { kind: "none" };
	const scored = candidates.map((subject) => {
		const name = nameOf(subject);
		return { subject, name, tier: tierOf(name, asked) };
	});
	const best = Math.max(NO_MATCH, ...scored.map((entry) => entry.tier));
	if (best === NO_MATCH) return { kind: "none" };
	const top = scored.filter((entry) => entry.tier === best);
	const first = top[0];
	if (first === undefined) return { kind: "none" };
	// Two subjects with the same exact name are the same answer twice; two that
	// merely read alike are a name the check cannot resolve.
	if (best === IDENTICAL) return { kind: "exact", subject: first.subject, name: first.name };
	if (top.length > 1) return { kind: "ambiguous", names: top.map((entry) => entry.name) };
	noteMatch(asked, first.name);
	return { kind: "loose", subject: first.subject, name: first.name };
}

/**
 * The subject a match found, if it found one.
 * @param match The match.
 * @returns The subject, or undefined for none and for an ambiguous name.
 */
function subjectOf<T>(match: NameMatch<T>): T | undefined {
	return match.kind === "exact" || match.kind === "loose" ? match.subject : undefined;
}

/**
 * The one subject a name answers to, or nothing.
 * @param candidates The subjects to look through.
 * @param nameOf Each subject's name.
 * @param asked The name the check used.
 * @returns The subject, or undefined.
 */
function namedSubject<T>(
	candidates: readonly T[],
	nameOf: (subject: T) => string,
	asked: string | undefined,
): T | undefined {
	return subjectOf(matchName(candidates, nameOf, asked));
}

/**
 * Every subject that could answer a name, ambiguity included: what a check
 * that requires a subject to be absent must find nothing of, so a name two
 * subjects answer fails it rather than passing because neither is the one.
 * @param candidates The subjects to look through.
 * @param nameOf Each subject's name.
 * @param asked The name the check used.
 * @returns The subjects, in the candidates' order.
 */
function plausibleSubjects<T>(
	candidates: readonly T[],
	nameOf: (subject: T) => string,
	asked: string | undefined,
): T[] {
	if (asked === undefined) return [];
	return candidates.filter((subject) => tierOf(nameOf(subject), asked) >= QUALIFIED);
}

/**
 * Whether two names are the same name.
 * @param candidate The name a subject carries.
 * @param asked The name the check used.
 * @returns True when they are, recording the looser ones.
 */
function namesMatch(candidate: string | undefined, asked: string | undefined): boolean {
	if (candidate === undefined || asked === undefined) return false;
	return namedSubject([candidate], (name) => name, asked) !== undefined;
}

/**
 * The entry a name-keyed map holds under the name a check uses.
 * @param byName The map, keyed by name.
 * @param asked The name the check used.
 * @returns The key and value, or undefined.
 */
function namedEntry<T>(
	byName: ReadonlyMap<string, T>,
	asked: string | undefined,
): readonly [string, T] | undefined {
	if (asked === undefined) return undefined;
	const direct = byName.get(asked);
	if (direct !== undefined) return [asked, direct];
	return namedSubject([...byName], ([name]) => name, asked);
}

/**
 * The value a name-keyed map holds under the name a check uses.
 * @param byName The map, keyed by name.
 * @param asked The name the check used.
 * @returns The value, or undefined.
 */
function namedValue<T>(byName: ReadonlyMap<string, T>, asked: string | undefined): T | undefined {
	return namedEntry(byName, asked)?.[1];
}

/**
 * The variant an address asks for: the product's own addressing first, since
 * `payments@variant` is the contract and a variant id is not a name, and only
 * then the variant whose name reads the same.
 * @param board The board.
 * @param asked The address.
 * @returns The variant, or undefined.
 */
function variantNamed(
	board: SemanticBoard,
	asked: string | undefined,
): SemanticVariant | undefined {
	return (
		resolveVariant(board, asked) ?? namedSubject(board.variants, (variant) => variant.name, asked)
	);
}

/**
 * The board view a check names.
 * @param board The board.
 * @param asked The view's name.
 * @returns The view, or undefined.
 */
function viewNamed(
	board: SemanticBoard,
	asked: string | undefined,
): SemanticBoard["views"][number] | undefined {
	return namedSubject(board.views, (view) => view.name, asked);
}

export {
	matchName,
	namedEntry,
	namedSubject,
	namedValue,
	namesMatch,
	plausibleSubjects,
	recordingMatches,
	subjectOf,
	variantNamed,
	viewNamed,
	wordsOf,
	type NameMatch,
};
