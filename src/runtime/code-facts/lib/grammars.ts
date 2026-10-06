// The grammars code facts parse with (ADR 0046): `web-tree-sitter` and the
// published `.wasm` file of each grammar, loaded from `node_modules` with no
// build step (ADR 0014), and the query file each adapter reads captures by.
//
// Each grammar loads once per process. A new grammar or query needs a restart
// (ADR 0021), and a restart starts with an empty cache. Parsing is
// synchronous; the reader yields to the event loop between files.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Language, Parser, Query } from "web-tree-sitter";

/** A grammar code facts parses with. */
type GrammarName = "typescript" | "tsx";

/** One grammar, ready: a parser set to its language, and its compiled query. */
interface Grammar {
	readonly parser: Parser;
	readonly query: Query;
}

/** Every grammar code facts loads. */
const GRAMMARS: readonly GrammarName[] = ["typescript", "tsx"];

/** The `.wasm` file of each grammar, as its package publishes it. */
const WASM: Readonly<Record<GrammarName, string>> = {
	typescript: "tree-sitter-typescript/tree-sitter-typescript.wasm",
	tsx: "tree-sitter-typescript/tree-sitter-tsx.wasm",
};

/** The query file each grammar compiles. TypeScript and TSX share one. */
const QUERY: Readonly<Record<GrammarName, string>> = {
	typescript: "typescript.scm",
	tsx: "typescript.scm",
};

let loaded: Promise<ReadonlyMap<GrammarName, Grammar>> | undefined;

/**
 * Load one grammar and compile its query.
 * @param name The grammar.
 * @returns It, ready to parse.
 */
async function loadGrammar(name: GrammarName): Promise<[GrammarName, Grammar]> {
	const language = await Language.load(fileURLToPath(import.meta.resolve(WASM[name])));
	const source = readFileSync(new URL(`./${QUERY[name]}`, import.meta.url), "utf8");
	const parser = new Parser();
	parser.setLanguage(language);
	return [name, { parser, query: new Query(language, source) }];
}

/**
 * Every grammar, loaded once for the process. A load that fails is tried
 * again by the next caller, so one failure does not stay for the life of the
 * server.
 * @returns Each grammar by its name.
 */
function grammars(): Promise<ReadonlyMap<GrammarName, Grammar>> {
	loaded ??= (async () => {
		await Parser.init();
		return new Map(await Promise.all(GRAMMARS.map(loadGrammar)));
	})().catch((error: unknown) => {
		loaded = undefined;
		throw error;
	});
	return loaded;
}

export { type Grammar, type GrammarName, grammars };
