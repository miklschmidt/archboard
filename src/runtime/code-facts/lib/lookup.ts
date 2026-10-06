// Finding a symbol in the code facts of one file (ADR 0046).
//
// A definition matches a symbol spelled as its qualified name, or by its last
// names: `post` and `Ledger.post` both find the method `post` of `Ledger`, and
// `Ledger.post` never finds a function `post`. A reference matches by its last
// name, `post` in `ledger.post()`, because the code does not say what a value
// is: only a language server can (TASK-367.13). A file read as text holds a
// symbol wherever its last name stands as a whole word. A symbol a file holds
// only in code that did not parse is neither found nor absent.

import type { Definition, FileFacts, Reference, Unparsed } from "@/runtime/code-facts/lib/facts";
import { lastName, textTest } from "@/runtime/code-facts/lib/text-reading";

/** What a file holds of a symbol. */
type Found =
	| {
			readonly status: "found";
			/** The line of the definition or the use, where code facts give one. */
			readonly line?: number;
			/** The definition, where the file defines the symbol. */
			readonly definition?: Definition;
	  }
	| { readonly status: "unparsed"; readonly unparsed: Unparsed }
	| { readonly status: "absent" };

/** Whether the symbol must be a definition, or may be a use too. */
type Accept = "definition" | "definition-or-reference";

/**
 * A name with `::` written as `.`, so a C++ name and a binding that spells it
 * either way compare alike.
 * @param name The name.
 * @returns It with `.` between its names.
 */
function dotted(name: string): string {
	return name.replaceAll("::", ".");
}

/**
 * Whether a qualified name ends with a symbol, name by name; `::` counts as `.`.
 * @param qualified The qualified name, such as `Ledger.post` or `shop::Ledger::post`.
 * @param symbol The symbol, such as `post` or `Ledger.post`.
 * @returns True when the symbol is its whole tail.
 */
function endsWithNames(qualified: string, symbol: string): boolean {
	if (qualified.includes("::") || symbol.includes("::")) {
		return endsWithNames(dotted(qualified), dotted(symbol));
	}
	return qualified === symbol || qualified.endsWith(`.${symbol}`);
}

/**
 * The definitions a symbol names, exact spellings first.
 * @param definitions A file's definitions.
 * @param symbol The symbol.
 * @returns The definitions.
 */
function definitionsNamed(definitions: readonly Definition[], symbol: string): Definition[] {
	const named = definitions.filter((definition) => endsWithNames(definition.symbol, symbol));
	const exact = dotted(symbol);
	return named.toSorted(
		(left, right) => Number(dotted(right.symbol) === exact) - Number(dotted(left.symbol) === exact),
	);
}

/**
 * The first use of a symbol, an exact spelling first, else its last name.
 * @param references A file's references.
 * @param symbol The symbol.
 * @returns The reference, or undefined.
 */
function referenceNamed(references: readonly Reference[], symbol: string): Reference | undefined {
	const name = lastName(symbol);
	return (
		references.find((reference) => reference.symbol === symbol) ??
		references.find((reference) => lastName(reference.symbol) === name)
	);
}

/**
 * What a file holds of a symbol: a definition, or with `definition-or-reference`
 * a use too.
 * @param facts The file's facts.
 * @param symbol The symbol.
 * @param accept What counts.
 * @returns Where it was found, that it is only in unparsed code, or that it is absent.
 */
function findSymbol(facts: FileFacts, symbol: string, accept: Accept): Found {
	if (facts.adapter === "text") {
		return textTest(symbol).holds(facts.text) ? { status: "found" } : { status: "absent" };
	}
	const definition = definitionsNamed(facts.definitions, symbol)[0];
	if (definition !== undefined) return { status: "found", line: definition.start, definition };
	const reference = accept === "definition" ? undefined : referenceNamed(facts.references, symbol);
	return reference === undefined
		? notFound(facts.unparsed, symbol)
		: { status: "found", line: reference.line };
}

/**
 * Why a file of code facts does not hold a symbol: it holds it only in code
 * that did not parse, or not at all.
 * @param unparsed The file's unparsed parts.
 * @param symbol The symbol.
 * @returns Unparsed or absent.
 */
function notFound(unparsed: readonly Unparsed[], symbol: string): Found {
	const name = lastName(symbol);
	const part = unparsed.find((each) => each.names.includes(name));
	return part === undefined ? { status: "absent" } : { status: "unparsed", unparsed: part };
}

export { type Accept, type Found, definitionsNamed, endsWithNames, findSymbol };
