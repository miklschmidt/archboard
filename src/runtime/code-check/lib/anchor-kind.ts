// Whether the evidence an anchor proves is of a kind its relationship accepts
// (ADR 0046): the other half of `ANCHOR_MISMATCH`.
//
// The code facts of the anchored file decide the kind, never the author: a use
// of the symbol at run time is a call, a use only as a type an import. If the
// file uses the symbol in more than one way, one accepted kind is enough. A
// file read as text gives no kind, and nor does a name the file only defines,
// such as the event one end defines, so the check does not judge those. A
// flow step has a message kind and no relationship kind, and a relationship
// kind without the `evidence` key accepts every kind, so neither is judged.
//
// A use that reaches its name through an import is resolved, because the
// import path names the file; one through a value is a candidate, and the
// finding is then information.

import type { AnchorClaim } from "@/runtime/code-check/lib/claims";
import { findSymbol, lastName, type FileFacts, type SyntaxFacts } from "@/runtime/code-facts/index";
import type { CodeEvidence, CodeFinding } from "@/shared/code-check/index";
import type { CodeAnchor } from "@/shared/code-target/index";
import { describeSubject } from "@/shared/semantic-policy/index";

/**
 * The uses of an anchor's symbol in its file that carry an evidence kind, one
 * of each kind: the uses of its spelling, else of its last name.
 * @param facts The anchored file's facts.
 * @param anchor The anchor.
 * @returns The uses, as evidence.
 */
function usesOf(facts: SyntaxFacts, anchor: CodeAnchor): CodeEvidence[] {
	const typed = facts.references.flatMap((reference) =>
		reference.kind === undefined ? [] : [{ ...reference, kind: reference.kind }],
	);
	const exact = typed.filter((reference) => reference.symbol === anchor.symbol);
	const name = lastName(anchor.symbol);
	const uses =
		exact.length > 0 ? exact : typed.filter((reference) => lastName(reference.symbol) === name);
	const first = uses.filter(
		(use, index) => uses.findIndex((other) => other.kind === use.kind) === index,
	);
	return first.map((use) => ({
		kind: use.kind,
		resolution: use.target === undefined ? "candidate" : "resolved",
		repo: anchor.repo,
		path: facts.path,
		line: use.line,
		symbol: use.symbol,
	}));
}

/**
 * The uses that decide the evidence kind of an anchor, when the check judges it.
 * @param claim The anchor.
 * @param facts The anchored file's facts.
 * @returns The uses, or undefined when the kind is not judged: on a step, on a
 * relationship kind that accepts every evidence kind, in a file read as text,
 * or for a name the file defines itself.
 */
function judgedUses(
	claim: AnchorClaim,
	facts: FileFacts | undefined,
): readonly CodeEvidence[] | undefined {
	if (claim.relationship?.accepts === undefined || facts?.adapter !== "typescript")
		return undefined;
	const defined = findSymbol(facts, claim.anchor.symbol, "definition").status === "found";
	return defined ? undefined : usesOf(facts, claim.anchor);
}

/**
 * The finding about an anchor whose uses are all of evidence kinds its
 * relationship's kind does not accept.
 * @param claim The anchor.
 * @param accepted What its relationship's kind accepts.
 * @param uses Its uses, one of each kind.
 * @returns The finding: a warning when a use is resolved, else information.
 */
function kindMismatch(
	claim: AnchorClaim,
	accepted: readonly string[],
	uses: readonly CodeEvidence[],
): CodeFinding {
	const resolved = uses.some((use) => use.resolution === "resolved");
	const kinds = uses.map((use) => use.kind).join(" and ");
	const unsure = resolved
		? ""
		: " The use is a candidate, matched by name only until a language server resolves it.";
	return {
		...claim.site,
		severity: resolved ? "warning" : "information",
		code: "ANCHOR_MISMATCH",
		message:
			`The anchor of ${describeSubject(claim.site.subject)} names ` +
			`${JSON.stringify(claim.anchor.symbol)}, which ${claim.anchor.path} uses only as ${kinds} ` +
			`evidence, and its kind ${JSON.stringify(claim.relationship?.kind)} accepts ` +
			`${accepted.join(", ")}.${unsure} Cite the use that proves the relationship, or change ` +
			"its kind to what the code does.",
		evidence: [...uses],
	};
}

/**
 * The finding about an anchor whose uses in its file are all of evidence
 * kinds its relationship's kind does not accept, if any.
 * @param claim The anchor, with its relationship's kind and what that kind accepts.
 * @param facts The anchored file's facts.
 * @returns The finding, or undefined when a use is accepted or the check cannot tell.
 */
function judgeAnchorKind(
	claim: AnchorClaim,
	facts: FileFacts | undefined,
): CodeFinding | undefined {
	const uses = judgedUses(claim, facts) ?? [];
	const accepted = claim.relationship?.accepts ?? [];
	const supported = uses.some((use) => accepted.includes(use.kind));
	return uses.length === 0 || supported ? undefined : kindMismatch(claim, accepted, uses);
}

export { judgeAnchorKind };
