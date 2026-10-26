// Whether a merged candidate is something a board may actually hold, and the
// largest part of the predecessor's change that is.
//
// Reconciliation can compose a state nobody wrote: this proposal's new beat
// about a step the predecessor has just removed, an arrow whose far end went
// with a deletion neither side thought twice about. Neither side did anything
// wrong, and the result is still a document the contract refuses. What is in
// dispute is the subject whose change breaks it, not the whole change: a rename
// in the same edit has nothing to do with the removal, so it still arrives.
//
// The rules for what a variant may hold are not restated here. They are the
// canonical ones, the same rules a document read off disk is held to, asked of
// the candidate — because a second, shorter list of what may not dangle is the
// one that drifts, and the one that drifts is always the one nobody is reading.

import { z } from "zod";
import { subjectIds, VariantContentSchema } from "#shared/schemas/content.ts";
import type { VariantContent } from "#shared/schemas/content.ts";
import { checkVariantContent } from "#shared/rules/coherence/integrity.ts";
import type { Reconciliation, ThreeStates } from "#shared/rules/reconcile/variant.ts";
import type { ReconciliationIssue } from "#shared/schemas/reconciliation.ts";
import { same } from "#shared/rules/reconcile/removed.ts";

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
			`something no board may hold — ${problem}. This proposal keeps its own side of that and ` +
			"takes the rest of the change; say what it should say instead.",
	};
}

/** The collections a predecessor's change is taken or held back by, one subject at a time. */
const COLLECTIONS = ["nodes", "edges", "flows", "walkthroughs"] as const;

/**
 * The merge that takes as much of the predecessor's change as a board may hold.
 *
 * Every subject the predecessor changed starts held back, which is this
 * proposal as it stands and so coherent. Each is then taken, one at a time,
 * when the merge that takes it is still something a board may hold, and the
 * walk repeats until a pass takes nothing more: a removal that only stands once
 * something else is removed is taken on the pass after. What is left held back
 * is exactly what the dispute is about, and only that keeps this proposal's
 * side. A held-back subject is read as the base had it, so the merge itself
 * keeps this proposal's side of it, and the next merge, measured from the same
 * base, finds the same dispute again rather than losing it.
 *
 * A subject is a node, a relationship, a flow or a walkthrough, whole: a flow's
 * steps and a walkthrough's beats are taken or held back with it.
 * @param states The base, this proposal, and the predecessor as it stands.
 * @param merge The merge of three states, coherent or not.
 * @param incoherence The selected architecture coherence authority.
 * @returns The merge of the largest part a board may hold.
 */
function coherentPart(
	states: ThreeStates,
	merge: (states: ThreeStates) => Reconciliation,
	incoherence = incoherenceOf,
): Reconciliation {
	let held = changedSubjects(states.base, states.theirs);
	let part: Reconciliation = { content: states.mine, issues: [], inherited: [] };
	for (let before = Number.POSITIVE_INFINITY; held.size < before;) {
		before = held.size;
		// Walks this pass's set; taking a subject replaces `held`, never changes it.
		for (const id of held) {
			const fewer = new Set([...held].filter((one) => one !== id));
			const tried = merge({ ...states, theirs: subjectsAsIn(states.theirs, states.base, fewer) });
			if (incoherence(tried.content).length === 0) {
				held = fewer;
				part = tried;
			}
		}
	}
	return part;
}

/**
 * Every subject the predecessor changed since the base, in the order a
 * document holds them, so referenced subjects come before what refers to them.
 * @param base The predecessor when the two last agreed.
 * @param theirs The predecessor now.
 * @returns The ids of what it added, removed or changed.
 */
function changedSubjects(base: VariantContent, theirs: VariantContent): Set<string> {
	return new Set(
		COLLECTIONS.flatMap((collection) => {
			const was = new Map<string, unknown>(base[collection].map((one) => [one.id, one]));
			const now = new Map<string, unknown>(theirs[collection].map((one) => [one.id, one]));
			const ids = [...new Set([...was.keys(), ...now.keys()])];
			return ids.filter((id) => !same(was.get(id), now.get(id)));
		}),
	);
}

/**
 * A content with the named subjects as another content holds them: changed,
 * restored or removed to match, and everything else left as it is.
 * @param content The content to change.
 * @param source The content the named subjects are read from.
 * @param ids The subjects to take from it.
 * @returns The content.
 */
function subjectsAsIn(
	content: VariantContent,
	source: VariantContent,
	ids: ReadonlySet<string>,
): VariantContent {
	return {
		nodes: collectionAsIn(content.nodes, source.nodes, ids),
		edges: collectionAsIn(content.edges, source.edges, ids),
		flows: collectionAsIn(content.flows, source.flows, ids),
		walkthroughs: collectionAsIn(content.walkthroughs, source.walkthroughs, ids),
	};
}

/**
 * One collection with the named subjects as another holds them. A subject
 * stays where it stood; one only the source holds comes last.
 * @param mine The collection to change.
 * @param yours The collection the named subjects are read from.
 * @param ids The subjects to take from it.
 * @returns The collection.
 */
function collectionAsIn<Entity extends { readonly id: string }>(
	mine: readonly Entity[],
	yours: readonly Entity[],
	ids: ReadonlySet<string>,
): Entity[] {
	const held = new Map(yours.map((entity) => [entity.id, entity]));
	const kept = mine.flatMap((entity) => {
		const now = ids.has(entity.id) ? held.get(entity.id) : entity;
		return now === undefined ? [] : [now];
	});
	const present = new Set(kept.map((entity) => entity.id));
	return [...kept, ...yours.filter((entity) => ids.has(entity.id) && !present.has(entity.id))];
}

export { coherentPart, incoherenceOf, subjectsAsIn };
