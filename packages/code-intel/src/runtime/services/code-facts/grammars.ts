// The grammars code facts parse with (ADR 0046): `web-tree-sitter` and the
// published `.wasm` file of each grammar, with no build step (ADR 0014), and
// the query an adapter reads captures by (grammar-files.ts). Which grammar and
// query read which file is the adapter table's (adapters.ts).
//
// Each grammar loads once per process, the first time a pass reads a file of
// it. A new grammar or query needs a restart (ADR 0021), and a restart starts
// with an empty cache. Parsing is synchronous; the reader yields to the event
// loop between files.

import { Language, Parser, Query, type Tree } from "web-tree-sitter";
// The runtime's own WebAssembly, which the executable of a release embeds like the grammars.
import runtimeWasm from "web-tree-sitter/web-tree-sitter.wasm" with { type: "file" };
import type { ParsedFacts, ParseFacts } from "#runtime/operations/code-facts/facts.ts";
import type { GrammarSource } from "#runtime/services/code-facts/grammar-files.ts";

/** One grammar, ready: a parser set to its language, and its compiled query. */
interface Grammar {
	readonly parser: Parser;
	readonly query: Query;
}

let runtime: Promise<void> | undefined;
const loaded = new Map<GrammarSource, Promise<Grammar>>();

/**
 * Where `web-tree-sitter` finds its WebAssembly, the one file it asks for.
 * @returns The file's path.
 */
function locateRuntime(): string {
	return runtimeWasm;
}

/**
 * Load one grammar and compile its query.
 * @param source The grammar's files.
 * @returns It, ready to parse.
 */
async function loadGrammar(source: GrammarSource): Promise<Grammar> {
	runtime ??= Parser.init({ locateFile: locateRuntime }).catch((error: unknown) => {
		runtime = undefined;
		throw error;
	});
	await runtime;
	const language = await Language.load(source.wasm);
	const parser = new Parser();
	parser.setLanguage(language);
	return { parser, query: new Query(language, source.query) };
}

/**
 * One grammar, loaded once for the process. A load that fails is tried again
 * by the next caller, so one failure does not stay for the life of the server.
 * @param source The grammar's files.
 * @returns The grammar.
 */
function grammar(source: GrammarSource): Promise<Grammar> {
	let loading = loaded.get(source);
	if (loading === undefined) {
		loading = loadGrammar(source).catch((error: unknown) => {
			loaded.delete(source);
			throw error;
		});
		loaded.set(source, loading);
	}
	return loading;
}

/**
 * How an adapter reads a file through a tree-sitter grammar: parse the text
 * with the grammar and read the facts from the tree and the query's captures.
 * @param source The grammar's files (grammar-files.ts).
 * @param facts The facts of one parsed file.
 * @returns The adapter's parse.
 */
function treeSitter(
	source: GrammarSource,
	facts: (tree: Tree, grammar: Grammar) => ParsedFacts,
): ParseFacts {
	return async (text) => {
		const ready = await grammar(source);
		const tree = ready.parser.parse(text);
		if (tree === null) throw new Error(`The grammar ${source.wasm} gave no tree`);
		try {
			return facts(tree, ready);
		} finally {
			tree.delete();
		}
	};
}

export { type Grammar, treeSitter };
