// The table of adapters (ADR 0046): for each language a grammar reads, the
// file extensions it reads with which grammar, the query file it captures by,
// the function that turns the captures of one file into its facts, and the
// resolver of its imports. A file whose extension no entry names is read as
// text (text-reading.ts).
//
// A new language adds its own files (a query, a facts function and an import
// resolver), its name to `AdapterName` (facts.ts) and one entry here. Nothing
// else changes: the reader, the cache, the definition search and the code
// check read every adapter's facts the same way.

import path from "node:path";
import type { Tree } from "web-tree-sitter";
import type {
	AdapterName,
	ImportResolver,
	ParsedFacts,
	ReadText,
} from "@/runtime/code-facts/lib/facts";
import type { Grammar, GrammarSource } from "@/runtime/code-facts/lib/grammars";
import {
	createModuleResolver,
	type CheckoutFiles,
} from "@/runtime/code-facts/lib/module-resolution";
import { pythonFacts } from "@/runtime/code-facts/lib/python-adapter";
import { createPythonResolver } from "@/runtime/code-facts/lib/python-resolution";
import { typeScriptFacts } from "@/runtime/code-facts/lib/typescript-adapter";

/** What one adapter reads, and how. */
interface Adapter {
	/** What the facts of a file it reads say read them. */
	readonly name: AdapterName;
	/** Each extension it reads, and the `.wasm` file of the grammar that parses it. */
	readonly extensions: Readonly<Record<string, string>>;
	/** The query file, beside grammars.ts, that every grammar of the adapter compiles. */
	readonly query: string;
	/** The facts of one parsed file, before its imports are resolved. */
	readonly facts: (tree: Tree, grammar: Grammar) => ParsedFacts;
	/** The resolver of one checkout's imports, made once in a pass. */
	readonly resolver: (checkout: CheckoutFiles, read: ReadText) => ImportResolver;
}

/**
 * The resolver of TypeScript imports, which resolves an import by its specifier.
 * @param checkout The checkout's files.
 * @param read Reads a file of the checkout as text.
 * @returns The resolver.
 */
function typeScriptResolver(checkout: CheckoutFiles, read: ReadText): ImportResolver {
	const modules = createModuleResolver(checkout, read);
	return {
		/**
		 * Where one import leads, by its specifier.
		 * @param from The importing file.
		 * @param found The import.
		 * @returns The import, with its file where it names one.
		 */
		resolve(from, found) {
			const resolved = modules.resolve(from, found.specifier);
			return resolved === undefined ? found : { ...found, resolved };
		},
	};
}

const TYPESCRIPT = "tree-sitter-typescript/tree-sitter-typescript.wasm";
const TSX = "tree-sitter-typescript/tree-sitter-tsx.wasm";
const PYTHON = "tree-sitter-python/tree-sitter-python.wasm";

/** Every adapter, one entry each. */
const ADAPTERS: readonly Adapter[] = [
	{
		name: "typescript",
		extensions: { ".ts": TYPESCRIPT, ".mts": TYPESCRIPT, ".cts": TYPESCRIPT, ".tsx": TSX },
		query: "typescript.scm",
		facts: typeScriptFacts,
		resolver: typeScriptResolver,
	},
	{
		name: "python",
		extensions: { ".py": PYTHON, ".pyi": PYTHON },
		query: "python.scm",
		facts: pythonFacts,
		resolver: createPythonResolver,
	},
];

/** The adapter that reads a file, and the grammar that parses it. */
interface AdapterReading {
	readonly adapter: Adapter;
	readonly grammar: GrammarSource;
}

/** Each extension an adapter reads, and how. */
const BY_EXTENSION: ReadonlyMap<string, AdapterReading> = new Map(
	ADAPTERS.flatMap((adapter) =>
		Object.entries(adapter.extensions).map(
			([extension, wasm]) =>
				[extension, { adapter, grammar: { wasm, query: adapter.query } }] as const,
		),
	),
);

/**
 * The adapter that reads a file.
 * @param file The file.
 * @returns The adapter and its grammar, or undefined for a file read as text.
 */
function adapterOf(file: string): AdapterReading | undefined {
	return BY_EXTENSION.get(path.posix.extname(file));
}

export { type Adapter, type AdapterReading, adapterOf };
