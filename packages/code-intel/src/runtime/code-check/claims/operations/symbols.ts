// Where the files of a bound or anchored path hold a symbol, as code facts
// read them (ADR 0046): a file a grammar reads holds a symbol it defines, or
// for an anchor one it references too, and a file read as text holds its last
// name as a whole word. A symbol found only in code that did not parse is
// neither held nor missing.
//
// A binding whose path is a Terraform or OpenTofu root module names an
// address in that root's address space (ADR 0046): the root module's own
// declarations, and those of the modules its calls make. An address inside a
// module the check does not read, such as a remote one with no plan named for
// it, is neither held nor missing either.

import path from "node:path";
import type { AnchorClaim, Claim } from "#runtime/code-check/claims/operations/claims.ts";
import type { ReadCheckout } from "#runtime/code-check/operations/checkouts.ts";
import { readsSameCode, targetIn, type RefCodes } from "#runtime/code-check/operations/ref-code.ts";
import type { CheckoutSnapshot, LocalCodeTarget } from "@archboard/code-binding/resolution";
import { findSymbol, type Accept } from "#runtime/code-facts/operations/lookup.ts";
import {
	isTerraformFile,
	parseTerraformAddress,
} from "#runtime/code-facts/terraform/operations/terraform-address.ts";
import {
	terraformConfiguration,
	terraformRootOf,
	type Declared,
	type TerraformConfiguration,
} from "#runtime/code-facts/terraform/operations/terraform-configuration.ts";
import { directoryOf } from "#runtime/code-facts/terraform/operations/terraform-resolution.ts";
import {
	type Definition,
	type FileFacts,
	type Unparsed,
} from "#runtime/code-facts/operations/facts.ts";
import { type FactsPass } from "#runtime/code-facts/services/reader.ts";

/** Where the files of a path hold a symbol. */
type Held =
	| {
			readonly status: "found";
			/** The file, relative to its checkout. */
			readonly file: string;
			readonly line?: number;
			readonly definition?: Definition;
			/** When resolved through a Terraform root module, its canonical root-relative address. */
			readonly address?: string;
			/** The Terraform root directory that resolved `address`. */
			readonly root?: string;
	  }
	| { readonly status: "unparsed"; readonly file: string; readonly unparsed: Unparsed }
	/** An address inside a module the check does not read: the module call's address. */
	| { readonly status: "module-unread"; readonly module: string }
	/** A selector whose target cannot be statically followed, such as a plan-only resource's nested block. */
	| { readonly status: "unfollowed"; readonly detail: string }
	| {
			readonly status: "absent";
			/** Every file was read as text, so only the symbol's last name was looked for. */
			readonly asText?: boolean;
			/** Multiple nested blocks of the same type share that literal name in one resource. */
			readonly ambiguous?: true;
	  };

/** What a search reports beside where it found the symbol: the files it read as text. */
interface Search {
	readonly facts: FactsPass;
	readonly checkout: ReadCheckout;
	/**
	 * Note a file read as text.
	 * @param file The file, relative to its checkout.
	 */
	readonly readAsText: (file: string) => void;
}

/**
 * Where one file holds a symbol.
 * @param facts The file's facts, if the pass could read it.
 * @param symbol The symbol.
 * @param accept A definition only, or a use too.
 * @returns Where it holds it.
 */
function heldIn(facts: FileFacts | undefined, symbol: string, accept: Accept): Held {
	if (facts === undefined) return { status: "absent" };
	const found = findSymbol(facts, symbol, accept);
	if (found.status === "absent") return found;
	return found.status === "unparsed"
		? { status: "unparsed", file: facts.path, unparsed: found.unparsed }
		: { ...found, file: facts.path };
}

/**
 * Where the files of a path hold a symbol: in the address space of the
 * Terraform root module a binding's path names, else in each file.
 * @param search The pass, the checkout, and where files read as text are noted.
 * @param files The files of the path, relative to the checkout.
 * @param symbol The symbol.
 * @param accept A definition only, or a use too.
 * @param root For a binding, the Terraform root module its path names, whose address the symbol is.
 * @returns Where they hold it.
 */
function heldInFiles(
	search: Search,
	files: readonly string[],
	symbol: string,
	accept: Accept,
	root?: string,
): Promise<Held> {
	return root !== undefined && accept === "definition"
		? heldByBinding(search, files, symbol, root)
		: heldInEach(search, files, symbol, accept);
}

/**
 * Pick the highest-precedence per-file result: found, ambiguous, unparsed, else absent.
 * @param held Each file's search result.
 * @param asText Whether every file was read as text.
 * @returns The combined result.
 */
function pickHeld(held: readonly Held[], asText: boolean): Held {
	const found = held.find((each) => each.status === "found");
	if (found !== undefined) return found;
	const ambiguous = held.find((each) => each.status === "absent" && each.ambiguous === true);
	if (ambiguous !== undefined) return ambiguous;
	return held.find((each) => each.status === "unparsed") ?? { status: "absent", asText };
}

/**
 * Where the files of a path hold a symbol, each as its language defines and
 * uses names: the first file that holds it, else an ambiguous match, else the
 * first that holds it only in unparsed code, else nowhere.
 * @param search The pass, the checkout, and where files read as text are noted.
 * @param files The files of the path, relative to the checkout.
 * @param symbol The symbol.
 * @param accept A definition only, or a use too.
 * @returns Where they hold it.
 */
async function heldInEach(
	search: Search,
	files: readonly string[],
	symbol: string,
	accept: Accept,
): Promise<Held> {
	const read = await Promise.all(files.map((file) => search.facts.read(search.checkout, file)));
	for (const facts of read) if (facts?.adapter === "text") search.readAsText(facts.path);
	const held = read.map((facts) => heldIn(facts, symbol, accept));
	return pickHeld(
		held,
		read.every((facts) => facts?.adapter === "text"),
	);
}

/**
 * The root module a resolved bound path names, when it is Terraform's.
 * @param target The resolved path.
 * @param files The files of its checkout.
 * @returns The root module's directory, relative to the checkout, or undefined.
 */
function terraformRootOfTarget(
	target: LocalCodeTarget,
	files: ReadonlySet<string>,
): string | undefined {
	const where = path.relative(target.root, target.target).split(path.sep).join("/");
	return terraformRootOf(where, target.kind, files);
}

/**
 * Convert a non-found, non-plain-absent Terraform declaration lookup into `Held`.
 * @param declared The non-found diagnosis.
 * @returns The matching `Held` result.
 */
function unheldAddress(
	declared: Extract<Declared, { status: "unread" | "unparsed" | "unfollowed" | "ambiguous" }>,
): Held {
	if (declared.status === "unread") return { status: "module-unread", module: declared.module };
	if (declared.status === "unparsed") {
		return { status: "unparsed", file: declared.path, unparsed: declared.unparsed };
	}
	if (declared.status === "unfollowed") {
		return { status: "unfollowed", detail: declared.detail };
	}
	return { status: "absent", ambiguous: true };
}

/**
 * Where an address space holds an address, as a binding's search says it.
 * @param declared What the address space holds there.
 * @returns Where the checkout holds it, or why it does not.
 */
function heldAtAddress(declared: Declared): Held {
	if (declared.status === "absent") return { status: "absent" };
	if (declared.status !== "found") return unheldAddress(declared);
	const { site } = declared;
	return site === undefined
		? { status: "absent" }
		: {
				status: "found",
				file: site.path,
				line: site.definition.start,
				definition: site.definition,
			};
}

/**
 * Where a binding's files define its symbol. Where its path is a Terraform
 * root module, the symbol is an address of that root; one it does not declare
 * is looked for in the bound files that another adapter reads, as its language
 * defines a name, and is missing as an address when none of them defines it.
 * A file read as text holds no definition, so it never stands in for one.
 * @param search The pass, the checkout, and where files read as text are noted.
 * @param files The bound files, relative to the checkout.
 * @param symbol The binding's symbol.
 * @param root The Terraform root module the bound path names.
 * @returns Where they define it.
 */
async function heldByBinding(
	search: Search,
	files: readonly string[],
	symbol: string,
	root: string,
): Promise<Held> {
	const configuration = await terraformConfiguration(search.facts, search.checkout, root);
	const held = heldAtAddress(configuration.declared(symbol));
	if (held.status !== "absent" || held.ambiguous === true) return held;
	const others = files.filter((file) => !isTerraformFile(file));
	const read = await Promise.all(others.map((file) => search.facts.read(search.checkout, file)));
	const parsed = read.flatMap((facts) =>
		facts === undefined || facts.adapter === "text" ? [] : [facts.path],
	);
	const elsewhere = await heldInEach(search, parsed, symbol, "definition");
	return elsewhere.status === "absent" ? held : elsewhere;
}

/**
 * Whether an anchor's cited `.tf` file matches a Terraform configuration
 * lookup: either the cited file is in the root module itself or it is the
 * defining module file of the target declaration (or its parent resource).
 * @param file The anchor's cited file, relative to the checkout.
 * @param root The Terraform root module directory.
 * @param targetFile The defining file of the declaration, if known.
 * @returns True when the anchor's cited file agrees with the lookup.
 */
function anchorFileMatches(file: string, root: string, targetFile: string | undefined): boolean {
	return directoryOf(file) === root || targetFile === file;
}

/** Pass checkout snapshot and ref readings needed to resolve holder bindings. */
interface AnchorContext {
	readonly snapshot: CheckoutSnapshot;
	readonly refs: RefCodes;
}

/**
 * Convert a found Terraform declaration into a `Held` site when it matches `file`.
 * @param configuration The root module's configuration.
 * @param declared A found declaration from the configuration.
 * @param file The anchor's cited file.
 * @returns The resolved `Held`, or undefined when the file does not match.
 */
function foundAnchorInRoot(
	configuration: TerraformConfiguration,
	declared: Extract<Declared, { status: "found" }>,
	file: string,
): Held | undefined {
	const { site, declaration } = declared;
	if (site === undefined || !anchorFileMatches(file, configuration.root, site.path)) {
		return undefined;
	}
	return {
		status: "found",
		file: site.path,
		line: site.definition.start,
		definition: site.definition,
		address: declaration.address,
		root: configuration.root,
	};
}

/**
 * Convert an unheld (unparsed, unread, or unfollowed) Terraform lookup into `Held`
 * when the anchor's cited file agrees with the lookup target.
 * @param configuration The root module's configuration.
 * @param declared The unheld configuration lookup.
 * @param file The anchor's cited file.
 * @param parentDeclaration The enclosing resource address for a nested block.
 * @returns The resolved `Held`, or undefined when the file does not match.
 */
function unheldAnchorInRoot(
	configuration: TerraformConfiguration,
	declared: Exclude<Declared, { status: "found" | "absent" }>,
	file: string,
	parentDeclaration: string,
): Held | undefined {
	const targetFile =
		declared.status === "unparsed" ? declared.path : configuration.siteOf(parentDeclaration)?.path;
	return anchorFileMatches(file, configuration.root, targetFile)
		? unheldAddress(declared)
		: undefined;
}

/**
 * Convert a Terraform configuration lookup for a module-qualified or plan-only
 * anchor into `Held` when the anchor's cited file agrees with the lookup.
 * @param configuration The root module's configuration.
 * @param declared What the configuration holds at the symbol.
 * @param file The anchor's cited file.
 * @param parentDeclaration The enclosing resource address for a nested block, if any.
 * @param qualified Whether the anchor symbol carries a `module.<name>` prefix.
 * @returns The resolved `Held`, or undefined when the lookup does not apply to `file`.
 */
function anchorHeldInRoot(
	configuration: TerraformConfiguration,
	declared: Declared,
	file: string,
	parentDeclaration: string,
	qualified: boolean,
): Held | undefined {
	if (declared.status === "absent") return undefined;
	if (!qualified) {
		const inRoot = declared.status === "unfollowed" && directoryOf(file) === configuration.root;
		return inRoot ? unheldAddress(declared) : undefined;
	}
	return declared.status === "found"
		? foundAnchorInRoot(configuration, declared, file)
		: unheldAnchorInRoot(configuration, declared, file, parentDeclaration);
}

/**
 * Resolve one holder part's Terraform root directory in the anchor's checkout.
 * @param part The holder part.
 * @param checkout The anchor's checkout.
 * @param context The pass snapshot and ref readings.
 * @returns The root directory, or undefined when the holder binds another code or non-Terraform path.
 */
function holderTerraformRoot(
	part: AnchorClaim["holders"][number],
	checkout: { readonly repo: string } & ReadCheckout,
	context: AnchorContext,
): string | undefined {
	const { binding } = part;
	if (binding === undefined || binding.repo !== checkout.repo) return undefined;
	if (!readsSameCode(binding, checkout, context)) return undefined;
	const target = targetIn(binding, checkout, context);
	return target.ok ? terraformRootOfTarget(target, checkout.files) : undefined;
}

/**
 * Candidate Terraform root modules to inspect for a Terraform anchor: the
 * anchor file's own root first, then any roots bound by the anchor's holders.
 * @param claim The anchor claim.
 * @param file The anchor's cited file.
 * @param checkout The anchor's checkout.
 * @param context The pass snapshot and ref readings.
 * @returns Unique root directories in priority order.
 */
function anchorTerraformRoots(
	claim: AnchorClaim,
	file: string,
	checkout: { readonly repo: string } & ReadCheckout,
	context: AnchorContext,
): string[] {
	const own = terraformRootOf(file, "file", checkout.files);
	const fromHolders = claim.holders.map((part) => holderTerraformRoot(part, checkout, context));
	return [...new Set([own, ...fromHolders].filter((root): root is string => root !== undefined))];
}

/**
 * Parse a Terraform anchor symbol that requires root-module configuration lookup
 * (either module-qualified or a nested-block selector).
 * @param file The anchor's cited file.
 * @param symbol The anchor symbol.
 * @returns The parsed address and qualification flag, or undefined.
 */
function terraformAnchorTarget(file: string, symbol: string) {
	if (!isTerraformFile(file)) return undefined;
	const parsed = parseTerraformAddress(symbol);
	if (parsed === undefined) return undefined;
	const qualified = parsed.modules.length > 0;
	return qualified || parsed.kind === "block" ? { parsed, qualified } : undefined;
}

/**
 * Resolve a module-qualified or plan-only Terraform anchor across candidate
 * root modules, checking that the cited file agrees and preserving the
 * selected root-relative address for sibling-block support.
 * @param search The pass and checkout.
 * @param file The anchor's cited `.tf` or `.tofu` file.
 * @param claim The anchor claim.
 * @param checkout The anchor's checkout.
 * @param context The pass snapshot and ref readings.
 * @returns The resolved `Held`, or undefined when no candidate root answers for `file`.
 */
async function heldByTerraformAnchor(
	search: Search,
	file: string,
	claim: AnchorClaim,
	checkout: { readonly repo: string } & ReadCheckout,
	context: AnchorContext,
): Promise<Held | undefined> {
	const target = terraformAnchorTarget(file, claim.anchor.symbol);
	if (target === undefined) return undefined;
	for (const root of anchorTerraformRoots(claim, file, checkout, context)) {
		// oxlint-disable-next-line no-await-in-loop -- inspect candidate roots in priority order until one resolves
		const configuration = await terraformConfiguration(search.facts, search.checkout, root);
		const held = anchorHeldInRoot(
			configuration,
			configuration.declared(claim.anchor.symbol),
			file,
			target.parsed.declaration,
			target.qualified,
		);
		if (held !== undefined) return held;
	}
	return undefined;
}

/**
 * Resolve one claim's symbol across its readable files, using root-module
 * configuration lookup for Terraform bindings and module-qualified or
 * plan-only Terraform anchors.
 * @param search The pass and checkout.
 * @param files The readable files of the claim's path.
 * @param claim The binding or anchor claim.
 * @param symbol The symbol to resolve.
 * @param checkout The claim's checkout.
 * @param context The pass snapshot and ref readings.
 * @param root For a binding, its Terraform root module directory.
 * @returns Where the files hold the symbol, or why they do not.
 */
async function heldForClaim(
	search: Search,
	files: readonly string[],
	claim: Claim,
	symbol: string,
	checkout: { readonly repo: string } & ReadCheckout,
	context: AnchorContext,
	root?: string,
): Promise<Held> {
	if (claim.kind === "anchor" && files[0] !== undefined) {
		const tfAnchor = await heldByTerraformAnchor(search, files[0], claim, checkout, context);
		if (tfAnchor !== undefined) return tfAnchor;
	}
	const accept: Accept = claim.kind === "binding" ? "definition" : "definition-or-reference";
	return heldInFiles(search, files, symbol, accept, root);
}

/**
 * Extract the pre-resolved Terraform anchor site from a found `Held`, when qualified.
 * @param held A found symbol result.
 * @returns The pre-resolved anchor site, or undefined.
 */
function resolvedSiteOf(held: Extract<Held, { status: "found" }>) {
	if (held.address === undefined || held.definition === undefined) return undefined;
	return {
		file: held.file,
		definition: held.definition,
		address: held.address,
		...(held.root === undefined ? {} : { root: held.root }),
	};
}

export { type Held, type Search, heldForClaim, heldInFiles, resolvedSiteOf, terraformRootOfTarget };
