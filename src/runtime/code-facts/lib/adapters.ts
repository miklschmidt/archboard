// The table of adapters (ADR 0046): for each language or file format an
// adapter reads, the files it reads, how it reads each one from its text to
// its facts, and the resolver of its imports. A file no entry names is read as
// text (text-reading.ts).
//
// An adapter reads a file through a tree-sitter grammar and its query file
// (`treeSitter`, grammars.ts), or with a parser Bun has: compose files and
// Kubernetes manifests are YAML (`Bun.YAML.parse`) and `flake.lock` is JSON.
// An entry names a file by its extension (`.py`) or by its whole name
// (`flake.lock`), and a whole name wins over an extension. No two entries
// read the same file.
//
// A new language or format adds its own files (its facts and its import
// resolver, and a query file for a grammar), its name to `AdapterName`
// (facts.ts) and one entry here. Nothing else changes: the reader, the cache,
// the definition search and the code check read every adapter's facts the
// same way.

import path from "node:path";
import type {
	AdapterName,
	ImportResolver,
	ParseFacts,
	ReadParsed,
	ReadText,
} from "@/runtime/code-facts/lib/facts";
import { cFacts } from "@/runtime/code-facts/lib/c-adapter";
import { createCResolver } from "@/runtime/code-facts/lib/c-resolution";
import { composeFacts, envFileFacts } from "@/runtime/code-facts/lib/compose-adapter";
import {
	COMPOSE_FILE_NAMES,
	createComposeResolver,
} from "@/runtime/code-facts/lib/compose-project";
import { csharpFacts } from "@/runtime/code-facts/lib/csharp-adapter";
import { projectFacts } from "@/runtime/code-facts/lib/csharp-project";
import { createCSharpResolver } from "@/runtime/code-facts/lib/csharp-resolution";
import { treeSitter } from "@/runtime/code-facts/lib/grammars";
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
	/** Each extension (`.ts`) or whole file name (`flake.lock`) it reads, and how it reads it. */
	readonly reads: Readonly<Record<string, ParseFacts>>;
	/**
	 * The resolver of one checkout's imports, made once in a pass. It reads
	 * other files as text, or their facts, such as the files of a C# project.
	 */
	readonly resolver: (
		checkout: CheckoutFiles,
		read: ReadText,
		parsed: ReadParsed,
	) => ImportResolver;
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

const TYPESCRIPT = treeSitter(
	"tree-sitter-typescript/tree-sitter-typescript.wasm",
	"typescript.scm",
	typeScriptFacts,
);
const TSX = treeSitter(
	"tree-sitter-typescript/tree-sitter-tsx.wasm",
	"typescript.scm",
	typeScriptFacts,
);
const PYTHON = treeSitter("tree-sitter-python/tree-sitter-python.wasm", "python.scm", pythonFacts);
const C = treeSitter("tree-sitter-c/tree-sitter-c.wasm", "c.scm", cFacts);
/** A `.h` is read as C++, which reads the C headers of Redis and SQLite as the C grammar does (TASK-367.09). */
const CPP = treeSitter("tree-sitter-cpp/tree-sitter-cpp.wasm", "c.scm", cFacts);
const CSHARP = treeSitter(
	"tree-sitter-c-sharp/tree-sitter-c_sharp.wasm",
	"csharp.scm",
	csharpFacts,
);

/** Every adapter, one entry each. */
const ADAPTERS: readonly Adapter[] = [
	{
		name: "typescript",
		reads: { ".ts": TYPESCRIPT, ".mts": TYPESCRIPT, ".cts": TYPESCRIPT, ".tsx": TSX },
		resolver: typeScriptResolver,
	},
	{
		name: "python",
		reads: { ".py": PYTHON, ".pyi": PYTHON },
		resolver: createPythonResolver,
	},
	{ name: "c", reads: { ".c": C }, resolver: createCResolver },
	{
		name: "cpp",
		reads: {
			".cc": CPP,
			".cpp": CPP,
			".cxx": CPP,
			".h": CPP,
			".hh": CPP,
			".hpp": CPP,
			".hxx": CPP,
		},
		resolver: createCResolver,
	},
	{
		name: "csharp",
		reads: { ".cs": CSHARP, ".csproj": projectFacts },
		resolver: createCSharpResolver,
	},
	{
		name: "compose",
		reads: {
			...Object.fromEntries(COMPOSE_FILE_NAMES.map((name) => [name, composeFacts])),
			".env": envFileFacts,
		},
		resolver: createComposeResolver,
	},
];

/** The adapter that reads a file, and how it reads it. */
interface AdapterReading {
	readonly adapter: Adapter;
	readonly parse: ParseFacts;
}

/**
 * Each extension and file name an adapter reads, and how.
 * @returns The readings, by extension or file name.
 * @throws {Error} When two entries read the same extension or file name.
 */
function readings(): ReadonlyMap<string, AdapterReading> {
	const byName = new Map<string, AdapterReading>();
	for (const adapter of ADAPTERS) {
		for (const [name, parse] of Object.entries(adapter.reads)) {
			const other = byName.get(name)?.adapter.name;
			if (other !== undefined)
				throw new Error(`The ${other} and ${adapter.name} adapters both read ${name}`);
			byName.set(name, { adapter, parse });
		}
	}
	return byName;
}

const BY_NAME = readings();

/**
 * The adapter that reads a file: by its whole name, else by its extension.
 * @param file The file.
 * @returns The adapter and how it reads the file, or undefined for a file read as text.
 */
function adapterOf(file: string): AdapterReading | undefined {
	return BY_NAME.get(path.posix.basename(file)) ?? BY_NAME.get(path.posix.extname(file));
}

export { type AdapterReading, adapterOf };
