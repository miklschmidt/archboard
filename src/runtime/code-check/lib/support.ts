// Whether an anchor that holds supports its relationship or step (ADR 0046).
//
// An anchor does not support it when its symbol names a definition in the
// checkout, and that definition is in the bound code of neither end, nor of a
// part inside an end: `ANCHOR_MISMATCH`. Code facts find the definition in
// the anchored file, or where an import of it leads through every re-export,
// so the import path names the file and the finding is a warning. A symbol
// the code reaches only through a value, such as `ledger.post()`, has no such
// definition, and the check does not judge it until a language server
// resolves it (TASK-367.13). Where the bound code of a part that could hold
// the definition cannot be read, the check cannot tell, and says nothing.
//
// The bound code of a part is the definition its symbol names, else the whole
// file, or every file below the directory. A file that passes the symbol on,
// such as a module's `index.ts`, holds it for a part bound to that file
// without a symbol, because that is where the code that uses it reaches it.

import { otherRefOf, readableOf, type ReadCheckout } from "@/runtime/code-check/lib/checkouts";
import type { AnchorClaim } from "@/runtime/code-check/lib/claims";
import { heldInFiles, type Search } from "@/runtime/code-check/lib/symbols";
import {
	definitionSite,
	lastName,
	type Definition,
	type DefinitionSite,
	type FileFacts,
} from "@/runtime/code-facts/index";
import { resolveLocalCodeTarget, type CheckoutSnapshot } from "@/runtime/code-target/index";
import type { CodeEvidence, CodeFinding } from "@/shared/code-check/index";
import type { SemanticNode } from "@/shared/semantic-board/index";
import { describeSubject } from "@/shared/semantic-policy/index";

/** Whether a part's bound code holds a definition, or the check cannot tell. */
type Holding = "holds" | "elsewhere" | "unknown";

/** What judging support needs. */
interface SupportContext {
	readonly search: Search;
	readonly snapshot: CheckoutSnapshot;
}

/**
 * Whether one definition lies inside another, as a method inside its class.
 * @param inner The inner definition.
 * @param outer The outer definition.
 * @returns True when the outer one spans the inner one's lines.
 */
function within(inner: Definition, outer: Definition): boolean {
	return outer.start <= inner.start && inner.end <= outer.end;
}

/**
 * The files a part's binding names in the anchor's checkout.
 * @param part The part.
 * @param checkout The anchor's checkout.
 * @param context The pass.
 * @returns The files; `elsewhere` for a part bound to nothing in the checkout;
 * `unknown` for a binding the pass cannot read there.
 */
function boundFiles(
	part: SemanticNode,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
): readonly string[] | "elsewhere" | "unknown" {
	const { binding } = part;
	if (binding?.repo !== checkout.repo) return "elsewhere";
	const target = resolveLocalCodeTarget(binding, context.snapshot);
	if (!target.ok || otherRefOf(binding, context.snapshot) !== undefined) return "unknown";
	const readable = readableOf(target, checkout.files);
	return readable.status === "files" ? readable.files : "unknown";
}

/**
 * Whether a part's bound code holds a definition.
 * @param part The part.
 * @param site Where the definition is.
 * @param checkout The anchor's checkout.
 * @param context The pass.
 * @returns Whether it holds it, or that the check cannot tell.
 */
async function holding(
	part: SemanticNode,
	site: DefinitionSite,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
): Promise<Holding> {
	const files = boundFiles(part, checkout, context);
	if (typeof files === "string") return files;
	const symbol = part.binding?.symbol;
	if (symbol !== undefined) return holdingAt(files, symbol, site, context);
	return [site.path, ...site.via].some((file) => files.includes(file)) ? "holds" : "elsewhere";
}

/**
 * Whether the definition a binding's symbol names holds another one.
 * @param files The bound files.
 * @param symbol The binding's symbol.
 * @param site Where the other definition is.
 * @param context The pass.
 * @returns Whether it holds it, or that the check cannot tell where the bound symbol is.
 */
async function holdingAt(
	files: readonly string[],
	symbol: string,
	site: DefinitionSite,
	context: SupportContext,
): Promise<Holding> {
	const bound = await heldInFiles(context.search, files, symbol, "definition");
	if (bound.status !== "found" || bound.definition === undefined) return "unknown";
	const inside = bound.file === site.path && within(site.definition, bound.definition);
	return inside ? "holds" : "elsewhere";
}

/**
 * The anchored use of a symbol, as evidence: the first use of its spelling or
 * its last name. A symbol the anchored file only defines has no use, and no
 * evidence kind (ADR 0046).
 * @param facts The anchored file's facts.
 * @param claim The anchor.
 * @returns The evidence, or undefined.
 */
function anchoredUse(facts: FileFacts | undefined, claim: AnchorClaim): CodeEvidence | undefined {
	if (facts?.adapter !== "typescript") return undefined;
	const { symbol, repo } = claim.anchor;
	const name = lastName(symbol);
	const use =
		facts.references.find((reference) => reference.symbol === symbol && reference.kind) ??
		facts.references.find((reference) => lastName(reference.symbol) === name && reference.kind);
	if (use?.kind === undefined) return undefined;
	return { kind: use.kind, resolution: "resolved", repo, path: facts.path, line: use.line, symbol };
}

/**
 * The warning for an anchor whose symbol is defined outside both ends.
 * @param claim The anchor.
 * @param site Where the symbol is defined.
 * @param use The anchored use, if the file uses the symbol.
 * @returns The finding.
 */
function anchorMismatch(
	claim: AnchorClaim,
	site: DefinitionSite,
	use: CodeEvidence | undefined,
): CodeFinding {
	const ends = claim.ends.map((end) => JSON.stringify(end.name)).join(" nor ");
	return {
		...claim.site,
		severity: "warning",
		code: "ANCHOR_MISMATCH",
		message:
			`The anchor of ${describeSubject(claim.site.subject)} names ${JSON.stringify(claim.anchor.symbol)}, ` +
			`which ${site.path}:${site.definition.start} defines, and that definition is in the bound ` +
			`code of neither ${ends}, nor of a part inside one. Cite the symbol in the code of an end ` +
			"that proves the relationship, bind the part whose code it is, or change the relationship " +
			"to what the code does.",
		...(use === undefined ? {} : { evidence: [use] }),
	};
}

/**
 * Judge whether an anchor that holds supports its relationship or step.
 * @param claim The anchor.
 * @param file The anchored file, relative to its checkout.
 * @param checkout The anchor's checkout.
 * @param context The pass.
 * @returns The finding, or undefined when it supports it or the check cannot tell.
 */
async function judgeSupport(
	claim: AnchorClaim,
	file: string,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
): Promise<CodeFinding | undefined> {
	const { facts } = context.search;
	const site = await definitionSite(facts, checkout, file, claim.anchor.symbol);
	if (site === undefined) return undefined;
	const holdings = await Promise.all(
		claim.holders.map((part) => holding(part, site, checkout, context)),
	);
	if (holdings.some((each) => each !== "elsewhere")) return undefined;
	return anchorMismatch(claim, site, anchoredUse(await facts.read(checkout, file), claim));
}

export { type SupportContext, judgeSupport };
