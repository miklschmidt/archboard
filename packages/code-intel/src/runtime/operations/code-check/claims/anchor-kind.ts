// Whether the evidence an anchor proves is of a kind its relationship accepts
// (ADR 0046): the other half of `ANCHOR_MISMATCH`.
//
// The code facts of the anchored file decide the kind, never the author: a use
// of the symbol at run time is a call, a use only as a type an import. If the
// file uses the symbol in more than one way, one accepted kind is enough. A
// file read as text gives no kind, and nor does a name the file only defines,
// such as the event one end defines, so the check does not judge those. A
// declaration that joins two parts, such as an event source mapping, is the
// exception: an anchor may name it (ADR 0046), and it proves its join's kind,
// so a grant does not prove a call. A
// flow step has a message kind and no relationship kind, and a relationship
// kind without the `evidence` key accepts every kind, so neither is judged.
//
// A use that reaches its name through an import is resolved, because the
// import path names the file, and so is a Terraform reference, which names its
// address, and a flake input, which `flake.lock` pins to its source. Any other
// use is resolved once the language
// server of the file names its definition (TASK-367.13); until then it is a
// candidate, and the finding is then information.

import type { ReadCheckout } from "#runtime/operations/code-check/checkouts.ts";
import type { AnchorClaim } from "#runtime/operations/code-check/claims/claims.ts";
import type { Resolve } from "#runtime/operations/code-check/resolution.ts";
import { findSymbol } from "#runtime/operations/code-facts/lookup.ts";
import { lastName } from "#runtime/operations/code-facts/text-reading.ts";
import {
	type Definition,
	type FileFacts,
	type SyntaxFacts,
} from "#runtime/operations/code-facts/facts.ts";
import type { CodeEvidence, CodeFinding } from "#shared/protocol/code-check.ts";
import type { CodeAnchor } from "@archboard/code-binding/bindings";
import { describeSubject } from "@archboard/board/policy";

/** The adapters whose every use names the address it reaches: a Terraform reference, a flake input. */
const ADDRESSED: ReadonlySet<string> = new Set(["terraform", "nix"]);

/** How the pass resolves the anchored file's uses through a language server. */
interface KindResolution {
	readonly resolve: Resolve;
	readonly checkout: ReadCheckout;
}

/**
 * The uses of an anchor's symbol in its file that carry an evidence kind, one
 * of each kind: the uses of its spelling, else of its last name.
 * @param facts The anchored file's facts.
 * @param anchor The anchor.
 * @param resolution How a use that no import resolves is resolved.
 * @returns The uses, as evidence.
 */
async function usesOf(
	facts: SyntaxFacts,
	anchor: CodeAnchor,
	resolution: KindResolution,
): Promise<CodeEvidence[]> {
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
	return Promise.all(
		first.map(async (use) => ({
			kind: use.kind,
			resolution:
				use.target !== undefined ||
				ADDRESSED.has(facts.adapter) ||
				(await resolution.resolve(resolution.checkout, facts.path, use)).status !== "unknown"
					? ("resolved" as const)
					: ("candidate" as const),
			repo: anchor.repo,
			path: facts.path,
			line: use.line,
			symbol: use.symbol,
		})),
	);
}

/**
 * What a joining declaration the anchored file defines proves: the kind of
 * the join, which its references to the ends it joins carry (TASK-367.18),
 * cited at the declaration. A Terraform reference is resolved.
 * @param facts The anchored file's facts.
 * @param definition The declaration, where code facts give one.
 * @param anchor The anchor.
 * @returns One use per kind, or none for a declaration that joins nothing.
 */
function joinUses(
	facts: SyntaxFacts,
	definition: Definition | undefined,
	anchor: CodeAnchor,
): CodeEvidence[] {
	if (definition === undefined) return [];
	const ends = facts.references.filter(
		(reference) =>
			reference.joins !== undefined &&
			definition.start <= reference.line &&
			reference.line <= definition.end,
	);
	const kinds = new Set(ends.flatMap((end) => end.kind ?? []));
	return [...kinds].map((kind) => ({
		kind,
		resolution: "resolved",
		repo: anchor.repo,
		path: facts.path,
		line: definition.start,
		symbol: definition.symbol,
	}));
}

/**
 * The uses that decide the evidence kind of an anchor, when the check judges it.
 * @param claim The anchor.
 * @param facts The anchored file's facts.
 * @param resolution How a use that no import resolves is resolved.
 * @returns The uses, or none when the kind is not judged: on a step, on a
 * relationship kind that accepts every evidence kind, in a file read as text,
 * or for a name the file defines itself, unless it is a joining declaration.
 */
async function judgedUses(
	claim: AnchorClaim,
	facts: FileFacts | undefined,
	resolution: KindResolution,
): Promise<readonly CodeEvidence[]> {
	if (claim.relationship?.accepts === undefined || facts === undefined) return [];
	if (facts.adapter === "text") return [];
	const defined = findSymbol(facts, claim.anchor.symbol, "definition");
	if (defined.status !== "found") return usesOf(facts, claim.anchor, resolution);
	return joinUses(facts, defined.definition, claim.anchor);
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
 * @param resolution How a use that no import resolves is resolved.
 * @returns The finding, or undefined when a use is accepted or the check cannot tell.
 */
async function judgeAnchorKind(
	claim: AnchorClaim,
	facts: FileFacts | undefined,
	resolution: KindResolution,
): Promise<CodeFinding | undefined> {
	const uses = await judgedUses(claim, facts, resolution);
	const accepted = claim.relationship?.accepts ?? [];
	const supported = uses.some((use) => accepted.includes(use.kind));
	return uses.length === 0 || supported ? undefined : kindMismatch(claim, accepted, uses);
}

export { judgeAnchorKind };
