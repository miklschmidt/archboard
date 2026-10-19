// Whether an anchor that holds supports its relationship or step (ADR 0046).
//
// An anchor does not support it when its symbol names a definition in the
// checkout, and that definition is in the bound code of neither end, nor of a
// part inside an end: `ANCHOR_MISMATCH`. Code facts find the definition in
// the anchored file, or where an import of it leads through every re-export,
// so the import path names the file and the finding is a warning. A C or C++
// include leads to a header; where it only declares the name and the
// header's pair defines nothing of it, the code is in a file the include does
// not name, so the finding is information (definition-site.ts). A symbol
// the code reaches only through a value, such as `ledger.post()`, has no such
// definition. The language server of the anchored file then names it
// (TASK-367.13): a definition in a file of the checkout is judged the same
// way, and without the server's answer the check does not judge it. Where the code of a part that could hold the
// definition is unknown, the check cannot tell, and says nothing: a part with
// no binding, such as a person, an external system or a part not bound yet,
// and a binding the pass cannot read. A warning needs the check to be sure,
// and only the bindings say where the code of a part is.
//
// The bound code of a part is the definition its symbol names, else the whole
// file, or every file below the directory. A file that passes the symbol on,
// such as a module's `index.ts`, holds it for a part bound to that file
// without a symbol, because that is where the code that uses it reaches it.
//
// In infrastructure, the anchor is the declaration that joins the two parts
// (ADR 0046), and a Terraform declaration that neither end binds, such as an
// event source mapping, can be that declaration. A provider's rules say which
// declarations join two others (TASK-367.18), so an anchor that names one is
// not judged by where it is declared; any other Terraform declaration is, and
// a part bound to an address holds what that address declares in its root
// module's address space. The check does not judge where a Kubernetes
// anchor's symbol is declared: a Service, an Ingress, a route or a
// NetworkPolicy joins two workloads that a board draws, and neither end need
// bind it (TASK-367.19).

import { readableOf, type ReadCheckout } from "@/runtime/code-check/lib/checkouts";
import type { AnchorClaim } from "@/runtime/code-check/lib/claims";
import type { Resolve } from "@/runtime/code-check/lib/resolution";
import { heldInFiles, terraformRootOfTarget, type Search } from "@/runtime/code-check/lib/symbols";
import { holdsDeclarationAt } from "@/runtime/code-check/lib/terraform-evidence";
import {
	definitionSite,
	isJoiningDeclaration,
	isTerraformFile,
	lastName,
	mergedDefinitions,
	terraformConfiguration,
	type Definition,
	type DefinitionSite,
	type FileFacts,
	type Reference,
} from "@/runtime/code-facts/index";
import { readsSameCode, targetIn, type RefCodes } from "@/runtime/code-check/lib/ref-code";
import type { CheckoutSnapshot } from "@archboard/code-binding/checkout-snapshot";
import type { CodeEvidence, CodeFinding } from "@/shared/code-check/index";
import type { SemanticNode } from "@archboard/board/content";
import { describeSubject } from "@archboard/board/policy";

/** The adapters whose anchor may name a declaration that joins two parts and that neither end binds. */
const JOINED_BY_DECLARATION = new Set<FileFacts["adapter"] | undefined>(["kubernetes"]);

/** Whether a part's bound code holds a definition, or the check cannot tell. */
type Holding = "holds" | "elsewhere" | "unknown";

/** What judging support needs. */
interface SupportContext {
	readonly search: Search;
	readonly snapshot: CheckoutSnapshot;
	/** The refs read from Git where a checkout has another one out. */
	readonly refs: RefCodes;
	/** Where a language server says a use that no import resolves is defined. */
	readonly resolve: Resolve;
}

/**
 * Where a symbol is defined: a definition code facts found, or the one line a
 * language server named. A C or C++ declaration whose code is in no file the
 * check can name matches by name only, a candidate.
 */
type Site = Pick<DefinitionSite, "path" | "via"> & {
	readonly definition: Pick<Definition, "start" | "end" | "declaration">;
};

/**
 * Whether one definition lies inside another, as a method inside its class.
 * @param inner The inner definition.
 * @param outer The outer definition.
 * @returns True when the outer one spans the inner one's lines.
 */
function within(inner: Site["definition"], outer: Site["definition"]): boolean {
	return outer.start <= inner.start && inner.end <= outer.end;
}

/** The files a binding names, and the Terraform root module its path names, if any. */
interface Bound {
	readonly files: readonly string[];
	readonly root: string | undefined;
}

/**
 * The files a part's binding names in the anchor's checkout.
 * @param part The part.
 * @param checkout The anchor's checkout.
 * @param context The pass.
 * @returns The files; `elsewhere` for a part bound in another repository;
 * `unknown` for a part with no binding, or a binding the pass cannot read.
 */
function boundFiles(
	part: SemanticNode,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
): Bound | "elsewhere" | "unknown" {
	const { binding } = part;
	if (binding === undefined) return "unknown";
	if (binding.repo !== checkout.repo) return "elsewhere";
	// A part read at other code than the anchor's checkout holds is not read here.
	if (!readsSameCode(binding, checkout, context)) return "unknown";
	const target = targetIn(binding, checkout, context);
	if (!target.ok) return "unknown";
	const readable = readableOf(target, checkout.files, true);
	if (readable.status !== "files") return "unknown";
	return { files: readable.files, root: terraformRootOfTarget(target, checkout.files) };
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
	site: Site,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
): Promise<Holding> {
	const bound = boundFiles(part, checkout, context);
	if (typeof bound === "string") return bound;
	const symbol = part.binding?.symbol;
	if (symbol !== undefined) return holdingAt(bound, symbol, site, context);
	const held = [site.path, ...site.via].some((file) => bound.files.includes(file));
	return held ? "holds" : "elsewhere";
}

/**
 * Whether the definition a binding's symbol names holds another one, in its
 * file or in a file its tool merges with it. In a Terraform root module, the
 * symbol is an address of its address space, and it holds every declaration
 * of the module instance it names.
 * @param bound The bound files, and their Terraform root module.
 * @param symbol The binding's symbol.
 * @param site Where the other definition is.
 * @param context The pass.
 * @returns Whether it holds it, or that the check cannot tell where the bound symbol is.
 */
async function holdingAt(
	bound: Bound,
	symbol: string,
	site: Site,
	context: SupportContext,
): Promise<Holding> {
	const { search } = context;
	if (bound.root !== undefined) {
		const configuration = await terraformConfiguration(search.facts, search.checkout, bound.root);
		const at = { path: site.path, line: site.definition.start };
		if (holdsDeclarationAt(configuration, symbol, at)) return "holds";
	}
	const held = await heldInFiles(search, bound.files, symbol, "definition", bound.root);
	if (held.status !== "found" || held.definition === undefined) return "unknown";
	const { file, definition } = held;
	const merged = await mergedDefinitions(search.facts, search.checkout, file, definition.symbol);
	const inside = [{ path: file, definition }, ...merged].some(
		(each) => each.path === site.path && within(site.definition, each.definition),
	);
	return inside ? "holds" : "elsewhere";
}

/**
 * A file's uses of a symbol that give an evidence kind: a use of its spelling
 * before a use of its last name, and a use at run time before a use only as a
 * type.
 * @param references The file's references.
 * @param symbol The symbol.
 * @returns The uses, in that order.
 */
function usesOf(references: readonly Reference[], symbol: string): Reference[] {
	const name = lastName(symbol);
	const exact = references.filter((each) => each.kind !== undefined && each.symbol === symbol);
	const named = references.filter(
		(each) => each.kind !== undefined && lastName(each.symbol) === name,
	);
	return [...exact, ...named].toSorted(
		(left, right) => Number(left.typeOnly) - Number(right.typeOnly),
	);
}

/**
 * The anchored use of a symbol, as evidence. A symbol the anchored file only
 * defines has no use, and no evidence kind (ADR 0046).
 * @param facts The anchored file's facts.
 * @param claim The anchor.
 * @returns The evidence, or undefined.
 */
function anchoredUse(facts: FileFacts | undefined, claim: AnchorClaim): CodeEvidence | undefined {
	if (facts === undefined || facts.adapter === "text") return undefined;
	const { symbol, repo } = claim.anchor;
	const use = usesOf(facts.references, symbol)[0];
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
	site: Site,
	use: CodeEvidence | undefined,
): CodeFinding {
	const ends = claim.ends.map((end) => JSON.stringify(end.name)).join(" nor ");
	const candidate = site.definition.declaration === true;
	return {
		...claim.site,
		severity: candidate ? "information" : "warning",
		code: "ANCHOR_MISMATCH",
		message:
			`The anchor of ${describeSubject(claim.site.subject)} names ${JSON.stringify(claim.anchor.symbol)}, ` +
			`which ${site.path}:${site.definition.start} ${candidate ? "declares" : "defines"}, and that ` +
			`${candidate ? "declaration" : "definition"} is in the bound code of neither ${ends}, nor of ` +
			"a part inside one. Cite the symbol in the code of an end that proves the relationship, " +
			"bind the part whose code it is, or change the relationship to what the code does.",
		...(use === undefined
			? {}
			: { evidence: [{ ...use, resolution: candidate ? "candidate" : use.resolution }] }),
	};
}

/**
 * Where the language server of the anchored file says the anchored use is
 * defined, when that is in a file of the checkout.
 * @param claim The anchor.
 * @param file The anchored file.
 * @param checkout Its checkout.
 * @param context The pass.
 * @returns The site, or undefined when no server named one in the checkout.
 */
async function serverSite(
	claim: AnchorClaim,
	file: string,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
): Promise<Site | undefined> {
	const facts = await context.search.facts.read(checkout, file);
	const use =
		facts === undefined || facts.adapter === "text"
			? undefined
			: usesOf(facts.references, claim.anchor.symbol)[0];
	if (use === undefined) return undefined;
	const resolved = await context.resolve(checkout, file, use);
	if (resolved.status !== "site") return undefined;
	const definition = { start: resolved.line, end: resolved.line };
	return { path: resolved.path, definition, via: [] };
}

/**
 * Where an anchor's symbol is defined, when the check judges it: a definition
 * code facts find, else the line a language server names. Where code facts
 * find only a declaration whose code is in no file they can name, such as a C
 * prototype defined outside its header's pair, the line the server names
 * wins when it names one. A Terraform
 * declaration that joins two others by its provider's rules, such as an event
 * source mapping, is in neither end's code by design (ADR 0046), so it is not
 * judged.
 * @param claim The anchor.
 * @param file The anchored file.
 * @param checkout Its checkout.
 * @param context The pass.
 * @returns The site, or undefined when the check does not judge it.
 */
async function anchoredSite(
	claim: AnchorClaim,
	file: string,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
): Promise<Site | undefined> {
	const declared = await definitionSite(context.search.facts, checkout, file, claim.anchor.symbol);
	if (declared === undefined) return serverSite(claim, file, checkout, context);
	if (declared.definition.declaration === true) {
		return (await serverSite(claim, file, checkout, context)) ?? declared;
	}
	const joins = isTerraformFile(declared.path) && isJoiningDeclaration(declared.definition.symbol);
	return joins ? undefined : declared;
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
	if (JOINED_BY_DECLARATION.has((await facts.read(checkout, file))?.adapter)) return undefined;
	const site = await anchoredSite(claim, file, checkout, context);
	if (site === undefined) return undefined;
	const holdings = await Promise.all(
		claim.holders.map((part) => holding(part, site, checkout, context)),
	);
	if (holdings.some((each) => each !== "elsewhere")) return undefined;
	return anchorMismatch(claim, site, anchoredUse(await facts.read(checkout, file), claim));
}

export { type SupportContext, judgeSupport };
