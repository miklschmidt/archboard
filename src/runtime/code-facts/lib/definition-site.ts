// Where a symbol a file names is defined in its checkout (ADR 0046): in the
// file itself, or in the file an import of it names, through every
// `export ... from` on the way. An import path names the file it reaches, so
// a definition found this way is resolved, not a candidate. A name the code
// reaches only through a value, such as `ledger.post()`, has no import that
// names its file, so it has no site here: a language server resolves it
// (TASK-367.13).

import type { Definition, SyntaxFacts, Target } from "@/runtime/code-facts/lib/facts";
import { definitionsNamed } from "@/runtime/code-facts/lib/lookup";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";
import type { FactsPass } from "@/runtime/code-facts/lib/reader";
import { lastName } from "@/runtime/code-facts/lib/text-reading";

/** How many files a chain of re-exports may pass through before the search gives up. */
const CHAIN_DEPTH = 16;

/** Where a symbol is defined. */
interface DefinitionSite {
	/** The file that defines it, relative to its checkout. */
	readonly path: string;
	readonly definition: Definition;
	/** The files that pass it on, by `export ... from`, between the asking file and the definition. */
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
	return { path: target.path, symbol: names.join(".") };
}

/**
 * Where the asking file's uses of a symbol lead: a use of the symbol or of
 * its first names that an import names, the longest spelling first, then a
 * use of its last name.
 * @param facts The asking file's facts.
 * @param symbol The symbol.
 * @returns Each target, in that order.
 */
function usedTargets(facts: SyntaxFacts, symbol: string): Target[] {
	const names = symbol.split(".");
	const byPrefix = names.flatMap((_, index) => {
		const prefix = names.slice(0, names.length - index).join(".");
		const rest = names.slice(names.length - index);
		return facts.references.flatMap((reference) =>
			reference.symbol === prefix && reference.target !== undefined
				? [joined(reference.target, rest)]
				: [],
		);
	});
	const name = lastName(symbol);
	const byLastName = facts.references.flatMap((reference) =>
		lastName(reference.symbol) === name && reference.target !== undefined ? [reference.target] : [],
	);
	return [...byPrefix, ...byLastName].filter((target) => target.symbol !== "");
}

/**
 * Where a file's re-exports send a symbol it does not define.
 * @param facts The file's facts.
 * @param symbol The symbol.
 * @returns Each file and the name there.
 */
function reexportTargets(facts: SyntaxFacts, symbol: string): Target[] {
	const [first = "", ...rest] = symbol.split(".");
	return facts.imports.flatMap((found) => {
		const to = found.resolved;
		if (to === undefined) return [];
		return found.names.flatMap((name): Target[] => {
			if (found.reexport && name.local === "*") return [{ path: to, symbol }];
			return name.local === first ? [joined({ path: to, symbol: name.imported }, rest)] : [];
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

/**
 * Follow a symbol to the file that defines it.
 * @param pass The pass.
 * @param checkout The checkout.
 * @param target The file and the name to find there.
 * @param depth How many more files the chain may pass through.
 * @returns The site, or undefined when no file on the chain defines it.
 */
async function follow(
	pass: FactsPass,
	checkout: CheckoutFiles,
	target: Target,
	depth: number,
): Promise<DefinitionSite | undefined> {
	const facts = depth < 0 ? undefined : await pass.read(checkout, target.path);
	if (facts?.adapter !== "typescript") return undefined;
	const definition = definitionsNamed(facts.definitions, target.symbol)[0];
	if (definition !== undefined) return { path: facts.path, definition, via: [] };
	const site = await firstSite(reexportTargets(facts, target.symbol), (next) =>
		follow(pass, checkout, next, depth - 1),
	);
	return site === undefined ? undefined : { ...site, via: [facts.path, ...site.via] };
}

/**
 * Where a symbol one file names is defined in its checkout.
 * @param pass The pass.
 * @param checkout The checkout and the files the pass may read.
 * @param file The file that names the symbol, relative to the checkout.
 * @param symbol The symbol.
 * @returns The site, or undefined when the file neither defines it nor
 * imports it from a file of the checkout.
 */
async function definitionSite(
	pass: FactsPass,
	checkout: CheckoutFiles,
	file: string,
	symbol: string,
): Promise<DefinitionSite | undefined> {
	const facts = await pass.read(checkout, file);
	if (facts?.adapter !== "typescript") return undefined;
	const own = definitionsNamed(facts.definitions, symbol)[0];
	if (own !== undefined) return { path: facts.path, definition: own, via: [] };
	return firstSite(usedTargets(facts, symbol), (target) =>
		follow(pass, checkout, target, CHAIN_DEPTH),
	);
}

export { type DefinitionSite, definitionSite };
