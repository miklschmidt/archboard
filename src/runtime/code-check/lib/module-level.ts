// The definition of the same file that a use names by its first name (ADR
// 0046). A use that no import resolves reaches a name the same file declares
// at module level, or nothing the check can name: a parameter, a local or a
// global. The check matches it by name only, so evidence that rests on the
// match is a candidate until a language server resolves it (evidence.ts).

import {
	findSymbol,
	type CheckoutFiles,
	type Definition,
	type FactsPass,
	type Reference,
	type SyntaxFacts,
} from "@/runtime/code-facts/index";

/**
 * The definition a file gives a name exactly, as a module-level declaration
 * spells it or as `Holder.member`.
 * @param facts The file's facts.
 * @param name The name.
 * @returns The definition, or undefined.
 */
function definedAs(facts: SyntaxFacts, name: string): Definition | undefined {
	return facts.definitions.find((definition) => definition.symbol === name);
}

/**
 * The definition of the same file that a use names by its first name: a
 * declaration at module level, or the member of one that the rest of the
 * spelling names. A first name that an import brings in, or that no
 * module-level declaration has, such as a parameter or a local, names none.
 * @param facts The file's facts.
 * @param symbol The use as the file spells it.
 * @param imported The names the file's imports bring in.
 * @returns The definition, or undefined.
 */
function moduleLevelDefinition(
	facts: SyntaxFacts,
	symbol: string,
	imported: ReadonlySet<string>,
): Definition | undefined {
	const first = symbol.split(".")[0] ?? "";
	if (imported.has(first)) return undefined;
	const declared = definedAs(facts, first);
	return declared === undefined ? undefined : (definedAs(facts, symbol) ?? declared);
}

/**
 * The definition of a passed name in the file a language server resolves.
 * @param facts The pass.
 * @param checkout The checkout.
 * @param file The resolved file.
 * @param reference The use.
 * @returns Its definition, where the adapter can name one.
 */
async function passedDefinition(
	facts: FactsPass,
	checkout: CheckoutFiles,
	file: string,
	reference: Reference,
): Promise<Definition | undefined> {
	if (reference.passed !== true) return undefined;
	const read = await facts.read(checkout, file);
	if (read === undefined) return undefined;
	const found = findSymbol(read, reference.symbol, "definition");
	return found.status === "found" ? found.definition : undefined;
}

export { moduleLevelDefinition, passedDefinition };
