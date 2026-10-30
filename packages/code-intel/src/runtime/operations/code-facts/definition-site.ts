// Where a symbol a file names is defined in its checkout (ADR 0046): in the
// file itself, or in the file an import of it names, through every
// `export ... from` on the way. An import path names the file it reaches, so
// a definition found this way is resolved, not a candidate. A name the code
// reaches only through a value, such as `ledger.post()`, has no import that
// names its file, so it has no site here: a language server resolves it
// (TASK-367.13). A name a C or C++ file reaches through its includes leads to
// the header that declares it (include-scope.ts).
//
// A declaration, such as a C prototype, names code that is elsewhere. Its site
// is the definition of its name in its file's pair, the source file of a
// header (c-pairs.ts), passed on by the declaring file. Where the pair defines
// nothing of the name, the code that runs is in a file the include does not
// name, as leveldb declares `WriteBatchInternal::Append` in
// `write_batch_internal.h` and defines it in `write_batch.cc`. The site then
// stays the declaration, which matches by name only: a candidate (ADR 0046),
// until clangd names the definition (TASK-367.15).

import { pairOf } from "#runtime/operations/code-facts/c/c-pairs.ts";
import type { Definition, SyntaxFacts, Target } from "#runtime/operations/code-facts/facts.ts";
import { endsWithNames } from "#runtime/operations/code-facts/lookup.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";
import {
	definitionsNamedIn,
	usesNamed,
} from "#runtime/operations/code-facts/modules/name-index.ts";
import type { FactsPass } from "#runtime/services/code-facts/reader.ts";

/** How many files a chain of re-exports may pass through before the search gives up. */
const CHAIN_DEPTH = 16;

/** Where a symbol is defined. */
interface DefinitionSite {
	/** The file that defines it, relative to its checkout. */
	readonly path: string;
	readonly definition: Definition;
	/**
	 * The files that pass it on between the asking file and the definition:
	 * each `export ... from`, and the header that declares a C or C++ name its
	 * pair defines.
	 */
	readonly via: readonly string[];
}

/**
 * A symbol with its first name replaced: `Ledger.post` reached through an
 * import of `Ledger` as `default` is `default.post` in the imported file.
 * @param target Where the first names lead.
 * @param rest The names after them.
 * @returns The symbol in the target file.
 */
function joined(target: Target, rest: readonly string[]): Target {
	const names = [target.symbol, ...rest].filter((name) => name !== "*" && name !== "");
	return { ...target, symbol: names.join(".") };
}

/**
 * Where the asking file's uses of a symbol lead: a use of the symbol or of
 * its first names that an import names, the longest spelling first, then a
 * use whose spelling ends with the symbol's names, as `Ledger.post` ends with
 * `post`. A use that only shares the last name, as `read` does with
 * `store.read`, is another name, and leads nowhere.
 * @param facts The asking file's facts.
 * @param symbol The symbol.
 * @returns Each target, in that order.
 */
function usedTargets(facts: SyntaxFacts, symbol: string): Target[] {
	const names = symbol.split(".");
	const byPrefix = names.flatMap((_, index) => {
		const prefix = names.slice(0, names.length - index).join(".");
		const rest = names.slice(names.length - index);
		return usesNamed(facts.references, prefix).flatMap((reference) =>
			reference.symbol === prefix && reference.target !== undefined
				? [joined(reference.target, rest)]
				: [],
		);
	});
	const byTail = usesNamed(facts.references, symbol).flatMap((reference) =>
		reference.target !== undefined && endsWithNames(reference.symbol, symbol)
			? [reference.target]
			: [],
	);
	return [...byPrefix, ...byTail].filter((target) => target.symbol !== "");
}

/**
 * A symbol as the file that defines it names it: `default`, what an import of
 * the default export reaches, is the name the file exports by default.
 * @param definitions The file's definitions.
 * @param symbol The symbol in the file.
 * @returns The symbol, with `default` replaced where the file names it.
 */
function ownSpelling(definitions: readonly Definition[], symbol: string): string {
	const [first, ...rest] = symbol.split(".");
	if (first !== "default") return symbol;
	const exported = definitions.find((definition) => definition.visibility === "export default");
	return exported === undefined ? symbol : [exported.symbol, ...rest].join(".");
}

/**
 * Where a file's re-exports send a symbol it does not define.
 * @param facts The file's facts.
 * @param symbol The symbol.
 * @returns Each file and the name there.
 */
function reexportTargets(facts: SyntaxFacts, symbol: string): Target[] {
	return facts.imports.flatMap((found) => {
		const to = found.resolved;
		if (to === undefined) return [];
		return found.names.flatMap((name): Target[] => {
			if (found.reexport && name.local === "*") return [{ path: to, symbol }];
			if (symbol !== name.local && !symbol.startsWith(`${name.local}.`)) return [];
			const rest = symbol.slice(name.local.length).split(".").filter(Boolean);
			return [joined({ path: to, symbol: name.imported }, rest)];
		});
	});
}

/**
 * The first site a search of each target finds, in order.
 * @param targets The files and names to search.
 * @param find Searches one.
 * @returns The first site found, or undefined.
 */
async function firstSite(
	targets: readonly Target[],
	find: (target: Target) => Promise<DefinitionSite | undefined>,
): Promise<DefinitionSite | undefined> {
	for (const target of targets) {
		// oxlint-disable-next-line no-await-in-loop -- the first file that defines the symbol ends the search, so later targets are never read
		const site = await find(target);
		if (site !== undefined) return site;
	}
	return undefined;
}

/** One search for a definition: the pass, the checkout, and each file and name it has looked in. */
interface Search {
	readonly pass: FactsPass;
	readonly checkout: CheckoutFiles;
	readonly seen: Set<string>;
}

/**
 * Whether a search looks in a file for a name: not past the depth of a chain,
 * and not where it has looked already, so a cycle of re-exports ends.
 * @param search The search, which notes the file and the name.
 * @param target The file and the name.
 * @param depth How many more files the chain may pass through.
 * @returns True the first time, within the depth.
 */
function looksIn(search: Search, target: Target, depth: number): boolean {
	const key = `${target.path}\0${target.symbol}`;
	if (depth < 0 || search.seen.has(key)) return false;
	search.seen.add(key);
	return true;
}

/**
 * Follow a symbol to the file that defines it.
 * @param search The search.
 * @param target The file and the name to find there.
 * @param depth How many more files the chain may pass through.
 * @returns The site, or undefined when no file on the chain defines it.
 */
async function follow(
	search: Search,
	target: Target,
	depth: number,
): Promise<DefinitionSite | undefined> {
	if (!looksIn(search, target, depth)) return undefined;
	const facts = await search.pass.read(search.checkout, target.path);
	if (facts === undefined || facts.adapter === "text") return undefined;
	const symbol = ownSpelling(facts.definitions, target.symbol);
	const definition = definitionsNamedIn(facts.definitions, symbol)[0];
	if (definition !== undefined) return { path: facts.path, definition, via: [] };
	const site = await firstSite(reexportTargets(facts, symbol), (next) =>
		follow(search, next, depth - 1),
	);
	return site === undefined ? undefined : { ...site, via: [facts.path, ...site.via] };
}

/**
 * Where the code of a declaration is: the definition of its name in its file's
 * pair, passed on by the declaring file.
 * @param pass The pass.
 * @param checkout The checkout and the files the pass may read.
 * @param site A site.
 * @returns The site of its code, or the site itself when it is no declaration
 * or its pair defines nothing of its name.
 */
async function codeSiteOf(
	pass: FactsPass,
	checkout: CheckoutFiles,
	site: DefinitionSite,
): Promise<DefinitionSite> {
	if (site.definition.declaration !== true) return site;
	for (const file of pairOf(site.path, checkout.files)) {
		// oxlint-disable-next-line no-await-in-loop -- the first file of the pair that defines the name ends the search
		const facts = await pass.read(checkout, file);
		if (facts === undefined || facts.adapter === "text") continue;
		const definition = facts.definitions.find(
			(each) => each.symbol === site.definition.symbol && each.declaration !== true,
		);
		if (definition !== undefined) {
			return { path: file, definition, via: [...site.via, site.path] };
		}
	}
	return site;
}

/**
 * Where a symbol one file names is defined in its checkout.
 * @param pass The pass.
 * @param checkout The checkout and the files the pass may read.
 * @param file The file that names the symbol, relative to the checkout.
 * @param symbol The symbol.
 * @returns The site, or undefined when the file neither defines it nor
 * imports it from a file of the checkout. A site whose definition is a
 * declaration is a candidate.
 */
async function definitionSite(
	pass: FactsPass,
	checkout: CheckoutFiles,
	file: string,
	symbol: string,
): Promise<DefinitionSite | undefined> {
	const facts = await pass.read(checkout, file);
	if (facts === undefined || facts.adapter === "text") return undefined;
	const own = definitionsNamedIn(facts.definitions, symbol)[0];
	if (own !== undefined) {
		return codeSiteOf(pass, checkout, { path: facts.path, definition: own, via: [] });
	}
	const search: Search = { pass, checkout, seen: new Set() };
	const site = await firstSite(usedTargets(facts, symbol), (target) =>
		follow(search, target, CHAIN_DEPTH),
	);
	return site === undefined ? undefined : codeSiteOf(pass, checkout, site);
}

export { type DefinitionSite, codeSiteOf, definitionSite };
