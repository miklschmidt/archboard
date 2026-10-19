// Lookups by name in long lists of definitions and uses, narrowed by the last
// name of each (ADR 0046). A C or C++ file reaches every name of its includes,
// so a file such as Redis's `server.c` has thousands of uses that each lead to
// a header of thousands of definitions, and matching each use against every
// definition took most of a pass (TASK-367.09). A definition or a use can match
// a symbol only where its last name is the symbol's, except for a name whose
// last name does not narrow it: one with a Nix wildcard `*`, an argument list
// or a key. The lookups find what a scan of the whole list finds, in its order.

import type { Definition, Reference } from "#runtime/operations/code-facts/facts.ts";
import { definitionsNamed } from "#runtime/operations/code-facts/lookup.ts";
import { lastName } from "#runtime/operations/code-facts/text-reading.ts";

/** A name whose last name does not narrow what it matches. */
const UNNARROWED = /[*([]/u;

/** The places of a list's items by the last name of each, and of the items no last name narrows. */
interface NameIndex {
	readonly byLast: ReadonlyMap<string, readonly number[]>;
	readonly unnarrowed: readonly number[];
}

/**
 * Index a list by the last name of each item.
 * @param names Each item's name, in the list's order.
 * @returns The index.
 */
function indexOf(names: readonly string[]): NameIndex {
	const byLast = new Map<string, number[]>();
	const unnarrowed: number[] = [];
	names.forEach((name, place) => {
		if (UNNARROWED.test(name)) unnarrowed.push(place);
		else {
			const last = lastName(name);
			byLast.set(last, [...(byLast.get(last) ?? []), place]);
		}
	});
	return { byLast, unnarrowed };
}

/**
 * The items of a list that can match a symbol, in the list's order.
 * @param items The list.
 * @param index Its index.
 * @param symbol The symbol.
 * @returns The items.
 */
function candidatesOf<T>(items: readonly T[], index: NameIndex, symbol: string): T[] {
	const places = [...(index.byLast.get(lastName(symbol)) ?? []), ...index.unnarrowed];
	return places.toSorted((left, right) => left - right).flatMap((place) => items[place] ?? []);
}

/** Each file's definitions by last name, made once for the facts a pass read. */
const DEFINITIONS = new WeakMap<readonly Definition[], NameIndex>();

/**
 * The definitions a symbol names, exact spellings first, as `definitionsNamed` finds them.
 * @param definitions A file's definitions.
 * @param symbol The symbol.
 * @returns The definitions.
 */
function definitionsNamedIn(definitions: readonly Definition[], symbol: string): Definition[] {
	let index = DEFINITIONS.get(definitions);
	if (index === undefined) {
		index = indexOf(definitions.map((each) => each.symbol));
		DEFINITIONS.set(definitions, index);
	}
	return definitionsNamed(candidatesOf(definitions, index, symbol), symbol);
}

/** Each file's uses by last name, made once for the facts a pass read. */
const USES = new WeakMap<readonly Reference[], NameIndex>();

/**
 * The uses of a file that can match a symbol: those whose last name is its
 * last name, and those no last name narrows, in the file's order.
 * @param references A file's uses.
 * @param symbol The symbol.
 * @returns The uses.
 */
function usesNamed<T extends Reference>(references: readonly T[], symbol: string): T[] {
	let index = USES.get(references);
	if (index === undefined) {
		index = indexOf(references.map((each) => each.symbol));
		USES.set(references, index);
	}
	return candidatesOf(references, index, symbol);
}

export { definitionsNamedIn, usesNamed };
