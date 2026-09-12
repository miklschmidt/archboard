// Whether a merged candidate is something a board may actually hold.
//
// Reconciliation can compose a state nobody wrote: this proposal's new beat
// about a step the predecessor has just removed, an arrow whose far end went
// with a deletion neither side thought twice about. Neither side did anything
// wrong, and the result is still a document the contract refuses.
//
// The rules for what a variant may hold are not restated here. They are the
// canonical ones, the same rules a document read off disk is held to, asked of
// the candidate — because a second, shorter list of what may not dangle is the
// one that drifts, and the one that drifts is always the one nobody is reading.

import { z } from "zod";
import { subjectIds, VariantContentSchema } from "@/shared/semantic-board/lib/content";
import type { VariantContent } from "@/shared/semantic-board/lib/content";
import { checkVariantContent } from "@/shared/semantic-board/lib/integrity";
import type { ReconciliationIssue } from "@/shared/semantic-board/lib/reconcile";

/**
 * Why a merged candidate is not something a board may hold, if it is not.
 *
 * Asked of the canonical checks rather than of a list kept here. Reconciliation
 * can invent a combination nobody wrote — this proposal's new beat about a step
 * the predecessor has just removed — and the rules for what a variant may hold
 * already exist, are already what a document read off disk is held to, and are
 * already maintained. A second, shorter list here is the one that drifts.
 * @param content The merged candidate.
 * @returns One issue per reason it cannot stand, or none.
 */
function incoherenceOf(content: VariantContent): ReconciliationIssue[] {
	const shape = VariantContentSchema.safeParse(content);
	if (!shape.success) {
		return [danglingIssue(WHOLE_CONTENT, z.prettifyError(shape.error))];
	}
	return checkVariantContent(shape.data, "content").map((issue) =>
		danglingIssue(subjectIn(issue.at, content), `${issue.at}: ${issue.problem}`),
	);
}

/** What a problem is reported against when it is about the content as a whole. */
const WHOLE_CONTENT = "content";

/**
 * The subject a canonical problem is actually about.
 *
 * Read out of the path the rule reported it under, deepest first, and only
 * accepted when the content really holds a subject of that id — so the answer
 * is the beat whose reference dangles rather than whichever node happened to be
 * written first. Guidance that points at the wrong subject is worse than
 * guidance that admits it is about the document.
 * @param at The path the canonical rule reported.
 * @param content The content it was checked against.
 * @returns The subject's id, or the whole content when none is named.
 */
function subjectIn(at: string, content: VariantContent): string {
	const held = new Set(subjectIds(content));
	return (
		at
			.split(".")
			.toReversed()
			.find((segment) => held.has(segment)) ?? WHOLE_CONTENT
	);
}

/**
 * One reason a merged candidate cannot stand, as a disagreement to settle.
 * @param subject What it is about.
 * @param problem What is wrong, in the contract's own words.
 * @returns The issue.
 */
function danglingIssue(subject: string, problem: string): ReconciliationIssue {
	return {
		subject,
		what: subject === WHOLE_CONTENT ? "variant" : "subject",
		kind: "reference-lost",
		mine: "kept what it said",
		theirs: "changed under it",
		repair:
			"Merging the change from the variant this proposal came from would leave it saying " +
			`something no board may hold — ${problem}. This proposal keeps what it said; say what it ` +
			"should say instead.",
	};
}

export { incoherenceOf };
