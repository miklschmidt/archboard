// Where the files of a bound or anchored path hold a symbol, as code facts
// read them (ADR 0046): a file a grammar reads holds a symbol it defines, or
// for an anchor one it references too, and a file read as text holds its last
// name as a whole word. A symbol found only in code that did not parse is
// neither held nor missing.

import type { ReadCheckout } from "@/runtime/code-check/lib/checkouts";
import {
	findSymbol,
	type Accept,
	type Definition,
	type FactsPass,
	type FileFacts,
	type Unparsed,
} from "@/runtime/code-facts/index";

/** Where the files of a path hold a symbol. */
type Held =
	| {
			readonly status: "found";
			/** The file, relative to its checkout. */
			readonly file: string;
			readonly line?: number;
			readonly definition?: Definition;
	  }
	| { readonly status: "unparsed"; readonly file: string; readonly unparsed: Unparsed }
	| {
			readonly status: "absent";
			/** Every file was read as text, so only the symbol's last name was looked for. */
			readonly asText?: boolean;
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
 * Where the files of a path hold a symbol: the first file that holds it, else
 * the first that holds it only in unparsed code, else nowhere.
 * @param search The pass, the checkout, and where files read as text are noted.
 * @param files The files of the path, relative to the checkout.
 * @param symbol The symbol.
 * @param accept A definition only, or a use too.
 * @returns Where they hold it.
 */
async function heldInFiles(
	search: Search,
	files: readonly string[],
	symbol: string,
	accept: Accept,
): Promise<Held> {
	const read = await Promise.all(files.map((file) => search.facts.read(search.checkout, file)));
	for (const facts of read) if (facts?.adapter === "text") search.readAsText(facts.path);
	const held = read.map((facts) => heldIn(facts, symbol, accept));
	const asText = read.every((facts) => facts?.adapter === "text");
	return (
		held.find((each) => each.status === "found") ??
		held.find((each) => each.status === "unparsed") ?? { status: "absent", asText }
	);
}

export { type Held, type Search, heldInFiles };
