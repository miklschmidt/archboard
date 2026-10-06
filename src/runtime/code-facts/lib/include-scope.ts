// Where a name is defined that a file reaches through its includes (ADR 0046,
// TASK-367.09). A C or C++ `#include` puts every name of the header in scope,
// and every name of each header it includes, so a use names no import of its
// own. The search reads the included headers in the order the file includes
// them, each header's own includes after it, and stops at the first that
// defines the name. Every include on the way names its file, so a site found
// this way is resolved, not a candidate. A header that only includes another
// passes no code of its own on, so a site names no file between: Redis's
// `server.h` includes `zmalloc.h`, and a use of `zmalloc_size` reaches
// `zmalloc.h` alone.
//
// A bare name finds a definition at file or namespace scope only: `count`
// never finds the field `count` of a struct, which code reaches through a
// value. A name qualified with `::` finds what its qualifiers name. A use
// through a value, spelled with `.`, finds nothing here: a language server
// resolves it (TASK-367.15).

import type { DefinitionSite } from "@/runtime/code-facts/lib/definition-site";
import type { Definition, FileFacts, SyntaxFacts } from "@/runtime/code-facts/lib/facts";
import { endsWithNames } from "@/runtime/code-facts/lib/lookup";
import { lastName } from "@/runtime/code-facts/lib/text-reading";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";
import type { FactsPass } from "@/runtime/code-facts/lib/reader";

/** How many headers one file's includes may reach before the search stops reading. */
const HEADER_LIMIT = 256;

/** The visibility words of a member of a class. */
const MEMBER = new Set(["public", "protected", "private"]);

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

/**
 * The files a file's includes name, in order.
 * @param facts The file's facts.
 * @returns The resolved files of its includes.
 */
function includedBy(facts: SyntaxFacts): string[] {
	return facts.imports.flatMap((found) =>
		found.inScope === true && found.resolved !== undefined ? [found.resolved] : [],
	);
}

/** Each header's definitions by their last name, made once for the facts a pass read. */
const BY_LAST_NAME = new WeakMap<SyntaxFacts, Map<string, Definition[]>>();

/**
 * The definitions of a header whose last name is a name's.
 * @param header The header's facts.
 * @param name The last name.
 * @returns The definitions, in the header's order.
 */
function definitionsEnding(header: SyntaxFacts, name: string): readonly Definition[] {
	let index = BY_LAST_NAME.get(header);
	if (index === undefined) {
		index = new Map();
		for (const definition of header.definitions) {
			const last = lastName(definition.symbol);
			index.set(last, [...(index.get(last) ?? []), definition]);
		}
		BY_LAST_NAME.set(header, index);
	}
	return index.get(name) ?? [];
}

/**
 * The site of a name in one header, if the header defines it: the same name
 * first, else a name that ends with it.
 * @param header The header's facts.
 * @param symbol The name as the asking file spells it.
 * @returns The site, or undefined.
 */
function siteIn(header: FileFacts | undefined, symbol: string): DefinitionSite | undefined {
	if (header === undefined || header.adapter === "text") return undefined;
	const candidates = definitionsEnding(header, lastName(symbol));
	const definition =
		candidates.find((each) => each.symbol === symbol) ??
		candidates.find((each) => names(each, symbol));
	return definition === undefined ? undefined : { path: header.path, definition, via: [] };
}

/**
 * The headers one header includes that the search has not queued yet, which
 * this marks as queued.
 * @param header The header's facts.
 * @param seen The files queued so far.
 * @returns The headers to read after the ones queued.
 */
function unseen(header: FileFacts | undefined, seen: Set<string>): string[] {
	if (header === undefined || header.adapter === "text") return [];
	const next = includedBy(header).filter((file) => !seen.has(file));
	for (const file of next) seen.add(file);
	return next;
}

/** The headers each file of a pass reaches through its includes, read once. */
const REACHED = new WeakMap<SyntaxFacts, Promise<FileFacts[]>>();

/**
 * Every header a file reaches through its includes, in the order a search
 * reads them: each include in order, and each header's own includes after it.
 * @param pass The pass.
 * @param checkout The checkout and the files the pass may read.
 * @param facts The file's facts.
 * @returns The headers' facts.
 */
async function readHeaders(
	pass: FactsPass,
	checkout: CheckoutFiles,
	facts: SyntaxFacts,
): Promise<FileFacts[]> {
	const seen = new Set([facts.path]);
	const queue = unseen(facts, seen);
	const headers: FileFacts[] = [];
	for (let read = 0; read < Math.min(queue.length, HEADER_LIMIT); read += 1) {
		// oxlint-disable-next-line no-await-in-loop -- each header names the next ones to read
		const header = await pass.read(checkout, queue[read] ?? "");
		if (header !== undefined) headers.push(header);
		queue.push(...unseen(header, seen));
	}
	return headers;
}

/**
 * Where a name a file reaches through its includes is defined.
 * @param pass The pass.
 * @param checkout The checkout and the files the pass may read.
 * @param facts The asking file's facts.
 * @param symbol The name as the file spells it.
 * @returns The site in the first header that defines it, or undefined.
 */
async function includedSite(
	pass: FactsPass,
	checkout: CheckoutFiles,
	facts: SyntaxFacts,
	symbol: string,
): Promise<DefinitionSite | undefined> {
	if (symbol.includes(".") || !facts.imports.some((found) => found.inScope === true)) {
		return undefined;
	}
	let headers = REACHED.get(facts);
	if (headers === undefined) {
		headers = readHeaders(pass, checkout, facts);
		REACHED.set(facts, headers);
	}
	for (const header of await headers) {
		const site = siteIn(header, symbol);
		if (site !== undefined) return site;
	}
	return undefined;
}

export { includedSite };
