// The grammars code facts parse with (ADR 0046): `web-tree-sitter` and the
// published `.wasm` file of each grammar, loaded from `node_modules` with no
// build step (ADR 0014), and the query file an adapter reads captures by.
// Which grammar and query read which file is the adapter table's
// (adapters.ts).
//
// Each grammar loads once per process, the first time a pass reads a file of
// it. A new grammar or query needs a restart (ADR 0021), and a restart starts
// with an empty cache. Parsing is synchronous; the reader yields to the event
// loop between files.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Language, Parser, Query, type Tree } from "web-tree-sitter";
import type { ParsedFacts, ParseFacts } from "@/runtime/code-facts/lib/facts";

/** One grammar, ready: a parser set to its language, and its compiled query. */
interface Grammar {
	readonly parser: Parser;
	readonly query: Query;
}

/** A grammar's `.wasm` file as its package publishes it, and the query file beside this one. */
interface GrammarSource {
	readonly wasm: string;
	readonly query: string;
}

let runtime: Promise<void> | undefined;
const loaded = new Map<string, Promise<Grammar>>();

/**
 * Load one grammar and compile its query.
 * @param source The grammar's files.
 * @returns It, ready to parse.
 */
async function loadGrammar(source: GrammarSource): Promise<Grammar> {
	runtime ??= Parser.init().catch((error: unknown) => {
		runtime = undefined;
		throw error;
	});
	await runtime;
	const language = await Language.load(fileURLToPath(import.meta.resolve(source.wasm)));
	const query = readFileSync(new URL(`./${source.query}`, import.meta.url), "utf8");
	const parser = new Parser();
	parser.setLanguage(language);
	return { parser, query: new Query(language, query) };
}

/**
 * One grammar, loaded once for the process. A load that fails is tried again
 * by the next caller, so one failure does not stay for the life of the server.
 * @param source The grammar's files.
 * @returns The grammar.
 */
function grammar(source: GrammarSource): Promise<Grammar> {
	const key = `${source.wasm}\0${source.query}`;
	let loading = loaded.get(key);
	if (loading === undefined) {
		loading = loadGrammar(source).catch((error: unknown) => {
			loaded.delete(key);
			throw error;
		});
		loaded.set(key, loading);
	}
	return loading;
}

/**
 * How an adapter reads a file through a tree-sitter grammar: parse the text
 * with the grammar and read the facts from the tree and the query's captures.
 * @param wasm The grammar's `.wasm` file, as its package publishes it.
 * @param query The query file beside this one.
 * @param facts The facts of one parsed file.
 * @returns The adapter's parse.
 */
function treeSitter(
	wasm: string,
	query: string,
	facts: (tree: Tree, grammar: Grammar) => ParsedFacts,
): ParseFacts {
	return async (text) => {
		const ready = await grammar({ wasm, query });
		const tree = ready.parser.parse(text);
		if (tree === null) throw new Error(`The grammar ${wasm} gave no tree`);
		try {
			return facts(tree, ready);
		} finally {
			tree.delete();
		}
	};
}

export { type Grammar, treeSitter };
