// What one file tells the code check (ADR 0046): what it defines, what it
// references and what it imports, or, for a file no grammar reads, its text.
//
// A line is 1-based. A file's facts quote names and lines, never other text
// of the file, so a finding built from them never quotes a secret.

import type { EvidenceKind } from "@/shared/semantic-policy/index";

/**
 * One definition: a declaration at module level, or a member of one.
 * `symbol` is qualified by what holds it, as TypeScript spells it:
 * `Ledger.post` for a method, `api.read` for a method of an object literal a
 * module-level `const api` holds.
 */
interface Definition {
	readonly symbol: string;
	/** The first and last line of the declaration. */
	readonly start: number;
	readonly end: number;
	/**
	 * The language's own word. TypeScript: `export` or `export default` for a
	 * module-level declaration and `module` for one that is not exported;
	 * `public`, `protected`, `private` or `#private` for a member. Python:
	 * `__all__` or `not in __all__` in a module that sets `__all__`, else
	 * `public` or `non-public` (`_name`); `public`, `non-public` or
	 * `name-mangled` (`__name`) for a class member. Nix: `output` for an
	 * output of a flake.
	 */
	readonly visibility: string;
	/**
	 * Whether code outside the file can reach it: an exported declaration, or
	 * a public member of an exposed one.
	 */
	readonly exposed: boolean;
}

/**
 * How a reference reaches its name: written as code, or as a string the
 * adapter counts: the name of an environment value, of an event, or of an
 * assembly, as C#'s `InternalsVisibleTo` names a friend.
 */
type ReferenceVia = "code" | "environment" | "event" | "assembly";

/**
 * One use of a name, at the first line the file uses it that way. `symbol` is
 * spelled as the code spells it, through `.` from a name: `ns.run`, `Ledger`.
 * C# spells a name after `.` from a value the code does not name, such as a
 * call's result, with the `.` alone: `.Command`.
 */
interface Reference {
	readonly symbol: string;
	readonly line: number;
	readonly via: ReferenceVia;
	/**
	 * A use at run time is `call` evidence, a use only as a type `import`
	 * evidence. A name in a string has no kind of its own: an environment value
	 * joins two parts only once infrastructure sets it (TASK-367.23). A project
	 * that a project file builds with, such as a .NET `ProjectReference`, is
	 * `build-dependency` evidence. In
	 * infrastructure, configuration that names another declaration, such as a
	 * compose service's `depends_on`, is `configured-path` evidence.
	 */
	readonly kind?: Extract<EvidenceKind, "call" | "import" | "configured-path" | "build-dependency">;
	readonly typeOnly: boolean;
	/**
	 * The syntax lets only a type stand here: a declared type, or C#'s
	 * `new Ledger()`, an attribute, `typeof` and a base list. Such a name is no
	 * value, so a lookup by name may take it for a type (csharp-resolution.ts).
	 */
	readonly asType?: true;
}

/** What one import names: `default`, `*` for the whole module, or an exported name. */
interface ImportedName {
	readonly imported: string;
	/** The name the file uses for it; `*` for `export * from`. */
	readonly local: string;
	/** Declared `type`, or used only as a type. */
	readonly typeOnly: boolean;
}

/** One import, re-export, `import()` or `require()`. */
interface Import {
	readonly specifier: string;
	readonly line: number;
	readonly names: readonly ImportedName[];
	/** Every name it brings in is type-only. */
	readonly typeOnly: boolean;
	/** An `export ... from`: it passes names on rather than using them. */
	readonly reexport: boolean;
	/**
	 * Every name its file defines, and every name that file has in scope, is in
	 * scope here too, as a C or C++ `#include` puts it: a use names no import,
	 * and is found through these imports in order (include-scope.ts).
	 */
	readonly inScope?: true;
}

/** A part of the file that did not parse: its lines, and the names written there. */
interface Unparsed {
	readonly start: number;
	readonly end: number;
	readonly names: readonly string[];
	/**
	 * The attribute path below which a static reading cannot tell the names,
	 * as a Nix expression it cannot follow gives them: a symbol below it is
	 * unknown, never absent. The empty path is every name of the file.
	 */
	readonly under?: string;
}

/**
 * A reference that reaches a name another file defines, through an import.
 * Where it leads is read from the import once the import is resolved, because
 * only resolution can tell whether a Python name is a submodule.
 */
interface ReferenceThroughImport {
	/** The index of the import in `imports`. */
	readonly import: number;
	/** The local name of the import the reference's spelling starts with: `Ledger`, `ns`, `a.b`. */
	readonly local: string;
}

/**
 * The facts an adapter gives one file, before its imports are resolved. These
 * depend on the file's bytes alone, so the cache keeps them.
 */
interface ParsedFacts {
	readonly definitions: readonly Definition[];
	readonly references: readonly (Reference & { readonly through?: ReferenceThroughImport })[];
	readonly imports: readonly Import[];
	readonly unparsed: readonly Unparsed[];
}

/**
 * How an adapter reads one file: from its text to its facts, through a
 * tree-sitter grammar (`treeSitter` in grammars.ts) or with a parser Bun has,
 * such as `Bun.YAML.parse` for a compose file.
 */
type ParseFacts = (text: string) => ParsedFacts | Promise<ParsedFacts>;

/** Where an import or a reference leads in the checkout: a file, and the name there. */
interface Target {
	readonly path: string;
	readonly symbol: string;
	/**
	 * The files that pass the name on to the file that uses it, as the project
	 * file of a C# project passes the names its files declare on to the
	 * projects that reference it.
	 */
	readonly via?: readonly string[];
}

/** The adapters that read files, one for each entry of the table in adapters.ts. */
type AdapterName = "typescript" | "python" | "compose" | "csharp" | "c" | "cpp" | "nix" | "terraform";

/**
 * An import with the checkout file it resolves to, where the adapter can
 * resolve it. Its names are as the resolved file names them: a Python name
 * that is a submodule becomes `*`, the whole submodule. A Terraform module is
 * a directory, so a module call resolves to the module's directory.
 */
type ResolvedImport = Import & { readonly resolved?: string };

/** Reads one file of a checkout as text, or says it cannot. */
type ReadText = (relative: string) => string | undefined;

/**
 * Reads the facts an adapter gives another file of the checkout, before its
 * imports are resolved: from the cache, or parsed now, one parse at a time.
 */
type ReadParsed = (relative: string) => Promise<ParsedFacts | undefined>;

/** A file's facts as the files of its module see them, which no import of the file says. */
interface ModuleReading {
	/** Its definitions, with the visibility its module gives them. */
	readonly definitions: readonly Definition[];
	/** For each of its references, by index, where it leads, if anywhere. */
	readonly targets: readonly (Target | undefined)[];
}

/** Resolves the imports of one checkout for one pass, as one adapter's language does. */
interface ImportResolver {
	/**
	 * Where one import leads.
	 * @param from The importing file, relative to the checkout.
	 * @param found The import.
	 * @returns The import, resolved where it names a file of the checkout.
	 */
	resolve(from: string, found: Import): ResolvedImport;
	/**
	 * For a language whose files see the names of their module without an
	 * import, as the files of one C# project see each other: where the uses
	 * of one file lead that no import names, and its definitions with the
	 * visibility the module gives them.
	 * @param from The file, relative to the checkout.
	 * @param parsed Its facts.
	 * @returns What its module says of it.
	 */
	readonly inModule?: (from: string, parsed: ParsedFacts) => Promise<ModuleReading>;
}

/** The code facts of one file an adapter reads, with its imports resolved for this pass. */
interface SyntaxFacts {
	readonly adapter: AdapterName;
	readonly path: string;
	readonly definitions: readonly Definition[];
	/** Each reference, and where it leads where an import names the file. */
	readonly references: readonly (Reference & { readonly target?: Target })[];
	/** Each import, and the checkout file it resolves to where the adapter can resolve it. */
	readonly imports: readonly ResolvedImport[];
	readonly unparsed: readonly Unparsed[];
}

/** A file no adapter reads: its text, which the text reading tests (ADR 0046). */
interface TextFacts {
	readonly adapter: "text";
	readonly path: string;
	readonly text: string;
}

type FileFacts = SyntaxFacts | TextFacts;

export type {
	AdapterName,
	Definition,
	FileFacts,
	Import,
	ImportedName,
	ImportResolver,
	ModuleReading,
	ParsedFacts,
	ParseFacts,
	ReadParsed,
	ReadText,
	Reference,
	ReferenceThroughImport,
	ReferenceVia,
	ResolvedImport,
	SyntaxFacts,
	Target,
	TextFacts,
	Unparsed,
};
