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
// event source mapping or an association, can be that declaration. When
// neither end holds the declaration directly, the check judges each instance
// at its site in the root modules the ends bind:
// - For a declaration listed by its provider's join rules (TASK-367.18), it
//   checks the instance's `from` and `to` roles against the claimed ends and
//   their descendants in either orientation, warns `ANCHOR_MISMATCH` when
//   every instance rules out the claimed pair, and withholds the warning when
//   an opaque or unresolved end leaves room for a match.
// - For an unlisted Terraform declaration (such as an NSG filter attachment or
//   an unlisted provider's association), it supports the anchor when one
//   instance reaches code held by both claimed ends without emitting undrawn
//   evidence.
// A part bound to an address holds what that address declares in its root
// module's address space. The check does not judge where a Kubernetes
// anchor's symbol is declared: a Service, an Ingress, a route or a
// NetworkPolicy joins two workloads that a document draws, and neither end need
// bind it (TASK-367.19).

import {
	anchorMismatch,
	enclosingResourceMismatch,
} from "#runtime/code-check/claims/operations/claim-findings.ts";
import { readableOf, type ReadCheckout } from "#runtime/code-check/operations/checkouts.ts";
import type { AnchorClaim } from "#runtime/code-check/claims/operations/claims.ts";
import type { Resolve } from "#runtime/code-check/operations/resolution.ts";
import {
	heldInFiles,
	terraformRootOfTarget,
	type Search,
} from "#runtime/code-check/claims/operations/symbols.ts";
import { holdsAddress } from "#runtime/code-check/evidence/operations/terraform-evidence.ts";
import {
	judgeTerraformDeclaration,
	terraformReferenceSite,
} from "#runtime/code-check/claims/operations/terraform-support.ts";
import {
	definitionSite,
	type DefinitionSite,
} from "#runtime/code-facts/operations/definition-site.ts";
import {
	declarationAddress,
	isTerraformFile,
	parseTerraformAddress,
} from "#runtime/code-facts/terraform/operations/terraform-address.ts";
import { lastName } from "#runtime/code-facts/operations/text-reading.ts";
import { mergedDefinitions } from "#runtime/code-facts/compose/operations/compose-merged.ts";
import {
	terraformConfiguration,
	type TerraformConfiguration,
} from "#runtime/code-facts/terraform/operations/terraform-configuration.ts";
import {
	type Definition,
	type FileFacts,
	type Reference,
} from "#runtime/code-facts/operations/facts.ts";
import { readsSameCode, targetIn, type RefCodes } from "#runtime/code-check/operations/ref-code.ts";
import type { CheckoutSnapshot } from "@archboard/code-binding/resolution";
import type { CodeEvidence, CodeFinding } from "#shared/protocol/code-check.ts";
import type { SemanticNode } from "@archboard/model/content";

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
	readonly definition: Pick<Definition, "start" | "end" | "declaration"> & {
		readonly symbol?: string;
		readonly visibility?: string;
	};
	/** When resolved through a Terraform root module, its specific root-relative address. */
	readonly address?: string;
	/** The Terraform root module that resolved `address`. */
	readonly root?: string;
};

/** Pre-resolved Terraform anchor site carried from configuration lookup. */
interface ResolvedAnchorSite {
	readonly file: string;
	readonly definition: Definition;
	readonly address?: string;
	readonly root?: string;
}

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
 * The root-relative Terraform addresses of an anchored site in one root module:
 * the specific module-qualified address when the anchor named one in this root,
 * else every declaration instance at the site's file and line.
 * @param configuration The root module's address space.
 * @param site Where the anchored definition is.
 * @returns Its matching addresses in `configuration`.
 */
function siteAddressesIn(configuration: TerraformConfiguration, site: Site): readonly string[] {
	if (site.address !== undefined) {
		return site.root === undefined || site.root === configuration.root ? [site.address] : [];
	}
	return configuration.addressesAt(site.path, site.definition.start);
}

/**
 * Whether a Terraform binding symbol holds an anchored site directly or via a
 * 1-hop intra-resource sibling-block link in the same resource and module
 * instance (ADR 0046, TASK-682.03).
 * @param configuration The root module's address space.
 * @param symbol The part's binding symbol.
 * @param site Where the anchored definition is.
 * @returns True when the binding holds or is 1-hop linked to the site.
 */
function holdsTerraformSite(
	configuration: TerraformConfiguration,
	symbol: string,
	site: Site,
): boolean {
	const addresses = siteAddressesIn(configuration, site);
	const boundAddress = declarationAddress(symbol);
	if (addresses.some((each) => holdsAddress(boundAddress, each))) return true;
	const parsed = parseTerraformAddress(symbol);
	if (parsed?.kind !== "block") return false;
	return addresses.some((siteAddr) => configuration.areLinkedSiblings(parsed.address, siteAddr));
}

/**
 * The enclosing resource declaration address when an end binds a nested block.
 * @param end The claimed end part.
 * @returns The parent resource address, or undefined when the end is not a nested block.
 */
function nestedBlockParentAddress(end: AnchorClaim["ends"][number]): string | undefined {
	const symbol = end.binding?.symbol;
	const parsed = symbol === undefined ? undefined : parseTerraformAddress(symbol);
	return parsed?.kind === "block" ? parsed.declaration : undefined;
}

/**
 * Whether one claimed end binds a Terraform nested block enclosed by `site`.
 * @param end The claimed end part.
 * @param site Where the anchor's symbol is defined.
 * @param checkout The anchor's checkout.
 * @param context The pass.
 * @returns True when `end` binds a nested block inside `site`'s resource.
 */
async function endEnclosedBySite(
	end: AnchorClaim["ends"][number],
	site: Site,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
): Promise<boolean> {
	const declaration = nestedBlockParentAddress(end);
	if (declaration === undefined) return false;
	const bound = boundFiles(end, checkout, context);
	if (typeof bound === "string" || bound.root === undefined) return false;
	const configuration = await terraformConfiguration(
		context.search.facts,
		context.search.checkout,
		bound.root,
	);
	return siteAddressesIn(configuration, site).includes(declaration);
}

/**
 * Whether a site names a top-level Terraform resource definition.
 * @param site Where the anchor's symbol is defined.
 * @returns True when `site` is a Terraform resource definition.
 */
function isTerraformResourceSite(site: Site): boolean {
	if (!isTerraformFile(site.path)) return false;
	if (site.definition.visibility === "resource") return true;
	const symbol = site.address ?? site.definition.symbol;
	return symbol !== undefined && parseTerraformAddress(symbol)?.kind === "resource";
}

/**
 * Whether an anchored site names a top-level Terraform resource that encloses
 * a nested-block binding on one of the relationship's claimed ends (ADR 0046,
 * TASK-682). Anchoring on the enclosing whole resource when an end binds a
 * nested block always warns `ANCHOR_MISMATCH`, even if the other end binds the
 * whole resource.
 * @param claim The anchor claim.
 * @param site Where the anchor's symbol is defined.
 * @param checkout The anchor's checkout.
 * @param context The pass.
 * @returns True when the anchor cites the enclosing whole resource of a nested-block end.
 */
async function isEnclosingResourceAnchor(
	claim: AnchorClaim,
	site: Site,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
): Promise<boolean> {
	if (!isTerraformResourceSite(site)) return false;
	const enclosed = await Promise.all(
		claim.ends.map((end) => endEnclosedBySite(end, site, checkout, context)),
	);
	return enclosed.some(Boolean);
}

/**
 * Judge holding in a Terraform root module; when the anchor carries an
 * authoritative qualified address, bypass the file-span fallback if the
 * address identities disagree so a shared local module file cannot match
 * another module call.
 * @param bound The bound files and Terraform root.
 * @param symbol The part's binding symbol.
 * @param site Where the anchor's symbol is defined.
 * @param context The pass.
 * @returns A Terraform holding verdict, or undefined to fall back to file spans.
 */
async function terraformHoldingAt(
	bound: Bound,
	symbol: string,
	site: Site,
	context: SupportContext,
): Promise<Holding | undefined> {
	if (bound.root === undefined) return undefined;
	const { search } = context;
	const configuration = await terraformConfiguration(search.facts, search.checkout, bound.root);
	if (holdsTerraformSite(configuration, symbol, site)) return "holds";
	if (site.address === undefined || parseTerraformAddress(symbol) === undefined) return undefined;
	return configuration.declared(symbol).status === "found" ? "elsewhere" : "unknown";
}

/**
 * Whether the definition a binding's symbol names holds another one, in its
 * file or in a file its tool merges with it. In a Terraform root module, the
 * symbol is an address of its address space, and it holds every declaration
 * of the module instance it names, as well as any 1-hop linked sibling block.
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
	const terraform = await terraformHoldingAt(bound, symbol, site, context);
	if (terraform !== undefined) return terraform;
	const { search } = context;
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
 * @param matchAddress Whether the reference must name the full declaration address.
 * @returns The uses, in that order.
 */
function usesOf(
	references: readonly Reference[],
	symbol: string,
	matchAddress = false,
): Reference[] {
	const spelling = matchAddress ? declarationAddress(symbol) : symbol;
	const exact = references.filter((each) => each.kind !== undefined && each.symbol === spelling);
	if (matchAddress) return exact;
	const name = lastName(symbol);
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
 * A Terraform use names the full declaration address.
 * @param facts The anchored file's facts.
 * @param claim The anchor.
 * @returns The evidence, or undefined.
 */
function anchoredUse(facts: FileFacts | undefined, claim: AnchorClaim): CodeEvidence | undefined {
	if (facts === undefined || facts.adapter === "text") return undefined;
	const { symbol, repo } = claim.anchor;
	const use = usesOf(facts.references, symbol, facts.adapter === "terraform")[0];
	if (use?.kind === undefined) return undefined;
	return { kind: use.kind, resolution: "resolved", repo, path: facts.path, line: use.line, symbol };
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
 * Convert a pre-resolved qualified Terraform anchor into a `Site`.
 * @param resolved The pre-resolved anchor site.
 * @returns The corresponding `Site`.
 */
function siteFromResolved(resolved: ResolvedAnchorSite): Site {
	return {
		path: resolved.file,
		definition: resolved.definition,
		via: [],
		...(resolved.address === undefined ? {} : { address: resolved.address }),
		...(resolved.root === undefined ? {} : { root: resolved.root }),
	};
}

/**
 * Fallback definition site when code facts found no local definition in `file`:
 * resolve a Terraform reference in its root module first, else ask the language server.
 * @param claim The anchor.
 * @param file The anchored file.
 * @param checkout Its checkout.
 * @param context The pass.
 * @returns The resolved definition site, or undefined.
 */
async function fallbackAnchorSite(
	claim: AnchorClaim,
	file: string,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
): Promise<Site | undefined> {
	const referenced = await terraformReferenceSite(
		claim.anchor.symbol,
		file,
		checkout,
		context.search.facts,
	);
	return referenced === undefined
		? serverSite(claim, file, checkout, context)
		: { ...referenced, via: [] };
}

/**
 * Where an anchor's symbol is defined when not pre-resolved through a qualified
 * Terraform root: a definition code facts find, else a Terraform reference
 * resolved in its root, else the line a language server names.
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
	if (declared === undefined) return fallbackAnchorSite(claim, file, checkout, context);
	if (declared.definition.declaration === true) {
		return (await serverSite(claim, file, checkout, context)) ?? declared;
	}
	return declared;
}

/**
 * Judge an anchor whose definition lies outside the bound code of both ends:
 * Terraform declarations are checked per instance as joining declarations
 * before falling back to an ordinary `ANCHOR_MISMATCH`.
 * @param claim The anchor.
 * @param site Where the symbol is defined.
 * @param checkout Its checkout.
 * @param context The pass.
 * @param use The anchored use, if any.
 * @returns The finding, or undefined when a Terraform declaration supports it.
 */
async function outsideMismatch(
	claim: AnchorClaim,
	site: Site,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
	use: CodeEvidence | undefined,
): Promise<CodeFinding | undefined> {
	if (!isTerraformFile(site.path) || site.definition.declaration === true) {
		return anchorMismatch(claim, site, use);
	}
	const verdict = await judgeTerraformDeclaration(claim, site, use, {
		facts: context.search.facts,
		checkout,
		/**
		 * Resolve a holder part's bound files in the anchor's checkout.
		 * @param part The holder part.
		 * @returns The bound files, `elsewhere`, or `unknown`.
		 */
		boundFiles: (part) => boundFiles(part, checkout, context),
		/**
		 * Check whether a symbol-bound holder holds a reached site.
		 * @param bound The bound files and root.
		 * @param symbol The binding symbol.
		 * @param target The reached site.
		 * @returns Whether it holds it.
		 */
		holdingAt: (bound, symbol, target) => holdingAt(bound, symbol, target, context),
	});
	if (verdict === "supports" || verdict === "withhold") return undefined;
	return verdict === "outside" ? anchorMismatch(claim, site, use) : verdict;
}

/**
 * Judge one resolved anchor site against the claim's ends and holders.
 * @param claim The anchor.
 * @param site The resolved definition site.
 * @param fileFacts The anchored file's facts.
 * @param checkout The anchor's checkout.
 * @param context The pass.
 * @returns The finding, or undefined when `site` supports or withholds judgment.
 */
async function judgeSiteSupport(
	claim: AnchorClaim,
	site: Site,
	fileFacts: FileFacts | undefined,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
): Promise<CodeFinding | undefined> {
	if (await isEnclosingResourceAnchor(claim, site, checkout, context)) {
		return enclosingResourceMismatch(claim, site, anchoredUse(fileFacts, claim));
	}
	const holdings = await Promise.all(
		claim.holders.map((part) => holding(part, site, checkout, context)),
	);
	if (holdings.some((each) => each !== "elsewhere")) return undefined;
	return outsideMismatch(claim, site, checkout, context, anchoredUse(fileFacts, claim));
}

/**
 * Judge whether an anchor that holds supports its relationship or step. When a
 * qualified Terraform anchor resolves across multiple candidate roots, each
 * candidate is judged in its own root and a warning emits only when every
 * candidate rules out support.
 * @param claim The anchor.
 * @param file The anchored file, relative to its checkout.
 * @param checkout The anchor's checkout.
 * @param context The pass.
 * @param resolved Pre-resolved Terraform anchor candidate sites, when qualified.
 * @returns The finding, or undefined when it supports it or the check cannot tell.
 */
async function judgeSupport(
	claim: AnchorClaim,
	file: string,
	checkout: { readonly repo: string } & ReadCheckout,
	context: SupportContext,
	resolved: readonly ResolvedAnchorSite[],
): Promise<CodeFinding | undefined> {
	const fileFacts = await context.search.facts.read(checkout, file);
	if (JOINED_BY_DECLARATION.has(fileFacts?.adapter)) return undefined;
	const sites =
		resolved.length > 0
			? resolved.map(siteFromResolved)
			: [await anchoredSite(claim, file, checkout, context)].filter(
					(each): each is Site => each !== undefined,
				);
	const verdicts = await Promise.all(
		sites.map((each) => judgeSiteSupport(claim, each, fileFacts, checkout, context)),
	);
	return verdicts.includes(undefined) ? undefined : verdicts[0];
}

export { type ResolvedAnchorSite, judgeSupport };
