// Where the uses of a C or C++ file lead through its includes (ADR 0046,
// TASK-367.09). An `#include` puts every name of the header in scope, and
// every name of each header it includes, so a use names no import of its
// own: the include resolver gives each use its target, as the resolvers of
// C# and Swift give the uses of names their module sees (`inModule`).
//
// The search reads the included headers in the order the file includes them,
// each header's own includes after it, and stops at the first that defines
// the name. A header that only includes another passes no code of its own on,
// so a target names no file between: Redis's `server.h` includes `zmalloc.h`,
// and a use of `zmalloc_size` leads to `zmalloc.h` alone. A use of a name the
// file defines itself, also by a prototype, leads to no other file.
//
// A bare name finds a definition at file or namespace scope only: `count`
// never finds the field `count` of a struct, which code reaches through a
// value. A name qualified with `::` finds what its qualifiers name. A use
// through a value, spelled with `.`, finds nothing here: a language server
// resolves it (TASK-367.15).
//
// The include names the header, which often only declares the name. Where the
// code that runs is, the header's pair or another file, is the definition
// site's to say (definition-site.ts).

import type {
	Definition,
	Import,
	ParsedFacts,
	ReadParsed,
	ResolvedImport,
	Target,
} from "@/runtime/code-facts/lib/facts";
import { endsWithNames } from "@/runtime/code-facts/lib/lookup";
import { lastName } from "@/runtime/code-facts/lib/text-reading";

/** How many headers one file's includes may reach before the search stops reading. */
const HEADER_LIMIT = 256;

/** The visibility words of a member of a class, with Objective-C's `@package` (objc-definitions.ts). */
const MEMBER = new Set(["public", "protected", "private", "package"]);

/**
 * What the search needs: where an include leads, the facts of a header, and
 * the files each header's includes name, kept for the pass, because every
 * file that includes a header reads its includes again.
 */
interface IncludeSearch {
	readonly resolve: (from: string, found: Import) => ResolvedImport;
	readonly parsed: ReadParsed;
	readonly included: Map<string, readonly string[]>;
}

/** One header the search read: its path and its facts. */
interface Header {
	readonly path: string;
	readonly facts: ParsedFacts;
}

/**
 * Whether a definition is the one a use's spelling names.
 * @param definition The definition.
 * @param symbol The use's spelling.
 * @returns True for the same name, a name its qualifiers name, or for a bare
 * name a definition at file or namespace scope that ends with it.
 */
function names(definition: Definition, symbol: string): boolean {
	if (definition.symbol === symbol) return true;
	if (!endsWithNames(definition.symbol, symbol)) return false;
	return symbol.includes("::") || !MEMBER.has(definition.visibility);
}

/** Each file's definitions by their last name, made once for the facts the cache holds. */
const BY_LAST_NAME = new WeakMap<ParsedFacts, Map<string, Definition[]>>();

/**
 * The definitions of a file whose last name is a name's.
 * @param facts The file's facts.
 * @param name The last name.
 * @returns The definitions, in the file's order.
 */
function definitionsEnding(facts: ParsedFacts, name: string): readonly Definition[] {
	let index = BY_LAST_NAME.get(facts);
	if (index === undefined) {
		index = new Map();
		for (const definition of facts.definitions) {
			const last = lastName(definition.symbol);
			index.set(last, [...(index.get(last) ?? []), definition]);
		}
		BY_LAST_NAME.set(facts, index);
	}
	return index.get(name) ?? [];
}

/**
 * The definition of a name in one file, if the file defines it: the same name
 * first, else a name that ends with it.
 * @param facts The file's facts.
 * @param symbol The name as the asking file spells it.
 * @returns The definition, or undefined.
 */
function definitionIn(facts: ParsedFacts, symbol: string): Definition | undefined {
	const candidates = definitionsEnding(facts, lastName(symbol));
	return (
		candidates.find((each) => each.symbol === symbol) ??
		candidates.find((each) => names(each, symbol))
	);
}

/**
 * The files a file's includes name, in order, resolved once in the search.
 * @param search The search.
 * @param from The file.
 * @param facts Its facts.
 * @returns The headers its includes resolve to.
 */
function includedBy(search: IncludeSearch, from: string, facts: ParsedFacts): readonly string[] {
	let included = search.included.get(from);
	if (included === undefined) {
		included = facts.imports.flatMap((found) => search.resolve(from, found).resolved ?? []);
		search.included.set(from, included);
	}
	return included;
}

/**
 * Every header a file reaches through its includes, in the order a search
 * reads them: each include in order, and each header's own includes after it.
 * @param search The search.
 * @param from The file.
 * @param facts Its facts.
 * @returns The headers.
 */
async function headersOf(
	search: IncludeSearch,
	from: string,
	facts: ParsedFacts,
): Promise<Header[]> {
	const seen = new Set([from]);
	const queue: string[] = [];
	/**
	 * Queue the headers not queued yet.
	 * @param paths The headers.
	 */
	const enqueue = (paths: readonly string[]) => {
		for (const path of paths.filter((each) => !seen.has(each))) {
			queue.push(path);
			seen.add(path);
		}
	};
	enqueue(includedBy(search, from, facts));
	const headers: Header[] = [];
	for (let read = 0; read < Math.min(queue.length, HEADER_LIMIT); read += 1) {
		const path = queue[read] ?? "";
		// oxlint-disable-next-line no-await-in-loop -- each header names the next ones to read
		const header = await search.parsed(path);
		if (header === undefined) continue;
		headers.push({ path, facts: header });
		enqueue(includedBy(search, path, header));
	}
	return headers;
}

/**
 * Where each use of a file leads through its includes: the first header that
 * defines its name, with the name as the header spells it.
 * @param search The search.
 * @param from The file.
 * @param facts Its facts.
 * @returns The target of each use, by index; none for a use through a value,
 * one of a name the file defines, or one no header defines.
 */
async function includedTargets(
	search: IncludeSearch,
	from: string,
	facts: ParsedFacts,
): Promise<(Target | undefined)[]> {
	if (facts.imports.length === 0) return [];
	const headers = await headersOf(search, from, facts);
	return facts.references.map((use) => {
		if (use.via !== "code" || use.symbol.includes(".")) return undefined;
		if (definitionIn(facts, use.symbol) !== undefined) return undefined;
		for (const header of headers) {
			const definition = definitionIn(header.facts, use.symbol);
			if (definition !== undefined) return { path: header.path, symbol: definition.symbol };
		}
		return undefined;
	});
}

export { type IncludeSearch, includedTargets };
