// Finding a symbol in the code facts of one file (ADR 0046).
//
// A definition matches a symbol spelled as its qualified name, or by its last
// names: `post` and `Ledger.post` both find the method `post` of `Ledger`, and
// `Ledger.post` never finds a function `post`. A reference matches by its last
// name, `post` in `ledger.post()`, because the code does not say what a value
// is: only a language server can (TASK-367.13). A file read as text holds a
// symbol wherever its last name stands as a whole word. A Terraform address
// names one declaration, so it is matched whole, without an instance key:
// `aws_sqs_queue.jobs` never finds `data.aws_sqs_queue.jobs`. A symbol a file
// holds only in code that did not parse is neither found nor absent.
//
// A Nix expression a static reading cannot follow leaves the names below its
// attribute path unknown (`under`): a symbol below it, or one not spelled from
// a first name the file defines, is neither found nor absent either. A name
// `*` in a Nix definition stands for every name of a list the reading cannot
// tell, such as a flake's systems, and matches any one name.

import type {
	Definition,
	FileFacts,
	Reference,
	SyntaxFacts,
	Unparsed,
} from "@/runtime/code-facts/lib/facts";
import { declarationAddress } from "@/runtime/code-facts/lib/terraform-address";
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
	return (
		qualified === symbol || qualified.endsWith(`.${symbol}`) || everyNameEndsWith(qualified, symbol)
	);
}

/**
 * Whether a qualified name with the name `*`, which stands for every name of
 * a list a static reading cannot tell (`packages.*.default` in Nix), ends with
 * a symbol, name by name.
 * @param qualified The qualified name.
 * @param symbol The symbol.
 * @returns True when the symbol is its tail, `*` matching any one name; a
 * tail shorter than the name never ends at a `*`.
 */
function everyNameEndsWith(qualified: string, symbol: string): boolean {
	if (!qualified.includes("*")) return false;
	const names = qualified.split(".");
	const tail = symbol.split(".");
	const start = names.length - tail.length;
	if (start < 0 || (start > 0 && names.at(-1) === "*")) return false;
	return tail.every((name, index) => names[start + index] === "*" || names[start + index] === name);
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
	if (facts.adapter === "text") return textFound(facts.text, symbol);
	if (facts.adapter === "terraform") return addressFound(facts, symbol, accept);
	const definition = definitionsNamed(facts.definitions, symbol)[0];
	if (definition !== undefined) return { status: "found", line: definition.start, definition };
	const reference = accept === "definition" ? undefined : referenceNamed(facts.references, symbol);
	return reference === undefined
		? notFound(facts.unparsed, symbol, facts.definitions)
		: { status: "found", line: reference.line };
}

/**
 * Whether a symbol may name something below a part whose names a static
 * reading cannot tell (`under`): it is spelled from that part's attribute
 * path, or from no first name the file defines, so that it may be the tail of
 * a name below.
 * @param part The part.
 * @param symbol The symbol.
 * @param definitions The file's definitions.
 * @returns True when the file may define it there.
 */
function mayBeBelow(part: Unparsed, symbol: string, definitions: readonly Definition[]): boolean {
	if (part.under === undefined) return false;
	const names = symbol.split(".");
	const under = part.under === "" ? [] : part.under.split(".");
	return (
		under.every((name, index) => name === "*" || names[index] === name) ||
		!definitions.some((definition) => definition.symbol.split(".")[0] === names[0])
	);
}

/**
 * What a file read as text holds of a symbol: its last name as a whole word.
 * @param text The file's text.
 * @param symbol The symbol.
 * @returns Found, with no line, or absent.
 */
function textFound(text: string, symbol: string): Found {
	return textTest(symbol).holds(text) ? { status: "found" } : { status: "absent" };
}

/**
 * What a Terraform file holds of an address: the declaration, or with
 * `definition-or-reference` a reference too, matched whole.
 * @param facts The file's facts.
 * @param symbol The address, with or without an instance key.
 * @param accept What counts.
 * @returns Where it was found, that it is only in unparsed code, or that it is absent.
 */
function addressFound(facts: SyntaxFacts, symbol: string, accept: Accept): Found {
	const address = declarationAddress(symbol);
	const declared = facts.definitions.find((each) => each.symbol === address);
	if (declared !== undefined)
		return { status: "found", line: declared.start, definition: declared };
	const used =
		accept === "definition" ? undefined : facts.references.find((each) => each.symbol === address);
	return used === undefined
		? notFound(facts.unparsed, address)
		: { status: "found", line: used.line };
}

/**
 * Why a file of code facts does not hold a symbol: it holds it only in code
 * that did not parse or that a static reading cannot follow, or not at all.
 * @param unparsed The file's unparsed parts.
 * @param symbol The symbol.
 * @param definitions The file's definitions.
 * @returns Unparsed or absent.
 */
function notFound(
	unparsed: readonly Unparsed[],
	symbol: string,
	definitions: readonly Definition[] = [],
): Found {
	const name = lastName(symbol);
	const part = unparsed.find(
		(each) => each.names.includes(name) || mayBeBelow(each, symbol, definitions),
	);
	return part === undefined ? { status: "absent" } : { status: "unparsed", unparsed: part };
}

export { type Accept, type Found, definitionsNamed, endsWithNames, findSymbol };
