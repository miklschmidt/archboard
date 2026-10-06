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
	 * `name-mangled` (`__name`) for a class member.
	 */
	readonly visibility: string;
	/**
	 * Whether code outside the file can reach it: an exported declaration, or
	 * a public member of an exposed one.
	 */
	readonly exposed: boolean;
}

/** How a reference reaches its name: written as code, or as a string the adapter counts. */
type ReferenceVia = "code" | "environment" | "event";

/**
 * One use of a name, at the first line the file uses it that way. `symbol` is
 * spelled as the code spells it, through `.` from a name: `ns.run`, `Ledger`.
 */
interface Reference {
	readonly symbol: string;
	readonly line: number;
	readonly via: ReferenceVia;
	/**
	 * A use at run time is `call` evidence, a use only as a type `import`
	 * evidence. A name in a string has no kind of its own: an environment value
	 * joins two parts only once infrastructure sets it (TASK-367.23).
	 */
	readonly kind?: Extract<EvidenceKind, "call" | "import">;
	readonly typeOnly: boolean;
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
}

/** A part of the file that did not parse: its lines, and the names written there. */
interface Unparsed {
	readonly start: number;
	readonly end: number;
	readonly names: readonly string[];
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
 * The facts a grammar gives one file, before its imports are resolved. These
 * depend on the file's bytes alone, so the cache keeps them.
 */
interface ParsedFacts {
	readonly definitions: readonly Definition[];
	readonly references: readonly (Reference & { readonly through?: ReferenceThroughImport })[];
	readonly imports: readonly Import[];
	readonly unparsed: readonly Unparsed[];
}

/** Where an import or a reference leads in the checkout: a file, and the name there. */
interface Target {
	readonly path: string;
	readonly symbol: string;
}

/** The adapters a grammar reads files through, one for each entry of the table in adapters.ts. */
type AdapterName = "typescript" | "python";

/**
 * An import with the checkout file it resolves to, where the adapter can
 * resolve it. Its names are as the resolved file names them: a Python name
 * that is a submodule becomes `*`, the whole submodule.
 */
type ResolvedImport = Import & { readonly resolved?: string };

/** Reads one file of a checkout as text, or says it cannot. */
type ReadText = (relative: string) => string | undefined;

/** Resolves the imports of one checkout for one pass, as one adapter's language does. */
interface ImportResolver {
	/**
	 * Where one import leads.
	 * @param from The importing file, relative to the checkout.
	 * @param found The import.
	 * @returns The import, resolved where it names a file of the checkout.
	 */
	resolve(from: string, found: Import): ResolvedImport;
}

/** The code facts of one file a grammar reads, with its imports resolved for this pass. */
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

/** A file no grammar reads: its text, which the text reading tests (ADR 0046). */
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
	ParsedFacts,
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
