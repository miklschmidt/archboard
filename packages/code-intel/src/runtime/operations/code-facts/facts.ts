import type { EvidenceKindSchema } from "@archboard/board/policy";
import type { z } from "zod";

type EvidenceKind = z.infer<typeof EvidenceKindSchema>;
// What one file tells the code check (ADR 0046): what it defines, what it
// references and what it imports, or, for a file no grammar reads, its text.
//
// A line is 1-based. A file's facts quote names, lines and source offsets, never other text
// of the file, so a finding built from them never quotes a secret.

/**
 * One definition: a declaration at module level, or a member of one.
 * `symbol` is qualified by what holds it, as TypeScript spells it:
 * `Ledger.post` for a method, `api.read` for a method of an object literal a
 * module-level `const api` holds.
 */
interface Definition {
	readonly symbol: string;
	/** A callable declaration or literal, a named type with members, or another value. */
	readonly kind: "function" | "class" | "value";
	/** The first and last line of the declaration. */
	readonly start: number;
	readonly end: number;
	/** The declaration's UTF-16 string offsets: inclusive start, exclusive end. */
	readonly source?: { readonly start: number; readonly end: number };
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
	 * a public member of an exposed one. In Swift, whose files see the names of
	 * their module, whether another module can: `open`, `public` or `package`.
	 */
	readonly exposed: boolean;
	/**
	 * Declared here, with its code in another file or later in this one: a C or
	 * C++ prototype, a method declared without its body, an `extern` variable.
	 * A use that reaches a declaration reaches the code its file's pair defines
	 * (definition-site.ts), and without that it is a candidate.
	 */
	readonly declaration?: true;
	/**
	 * The directory whose code an infrastructure declaration runs, as its file
	 * writes it, relative to the file's own directory: the build context of a
	 * compose service, or, where that context is the compose file's own
	 * directory, the directory of its Dockerfile. The code check joins what the
	 * code there reads with what the declaration sets (TASK-367.23).
	 */
	readonly runs?: string;
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
 * C# and Swift spell a name after `.` from a value the code does not name,
 * such as a call's result or `self`, with the `.` alone: `.Command`.
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
	 * compose service's `depends_on`, is `configured-path` evidence. The rules of
	 * a Terraform provider make a reference a call, a permission or
	 * provisioning (TASK-367.18).
	 */
	readonly kind?: EvidenceKind;
	/**
	 * In infrastructure, the reference names an end of the declaration that
	 * holds it, which joins two others, as an event source mapping joins a queue
	 * and a function: the end the join runs from, or the one it runs to.
	 */
	readonly joins?: "from" | "to";
	/**
	 * In Terraform, the path of the argument of its block the reference sits
	 * in, its names joined by `.`: `bucket`, `versioning.enabled`, `count`.
	 */
	readonly argument?: string;
	/**
	 * The reference is the whole value of its argument, with no expression
	 * around it: `bucket = var.bucket` passes `var.bucket` on unchanged.
	 */
	readonly whole?: true;
	readonly typeOnly: boolean;
	/**
	 * The syntax lets only a type stand here: a declared type, or C#'s
	 * `new Ledger()`, an attribute, `typeof` and a base list. Such a name is no
	 * value, so a lookup by name may take it for a type (csharp-resolution.ts).
	 */
	readonly asType?: true;
	/**
	 * A use at run time that runs none of the name's code (runs.ts): it reads
	 * a constant, passes the name on, or tests a value against a class, as
	 * `instanceof` and a catch do. It is call evidence that supports a
	 * relationship, and the code check never calls a dependency undrawn on it
	 * alone. A passed function is the exception (TASK-436.15).
	 */
	readonly asValue?: true;
	/** The name is passed as an argument; a function definition may run later. */
	readonly passed?: true;
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
	/**
	 * The attribute path below which a static reading cannot tell the names,
	 * as a Nix expression it cannot follow gives them: a symbol below it is
	 * unknown, never absent. The empty path is every name of the file.
	 */
	readonly under?: string;
	/** An imported expression's original site; start/end still locate its owning flake. */
	readonly source?: { readonly path: string; readonly start: number; readonly end: number };
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
 * depend on the file's bytes and the reading that selects its grammar and
 * blanks SDK macros, so the cache keeps them (reader.ts).
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
 * such as `Bun.YAML.parse` for a compose file. An adapter that reads an
 * extension other formats share answers undefined for a file of another
 * format, which is then read as text: a `.yaml` file that holds no
 * Kubernetes object.
 */
type ParseFacts = (text: string) => ParsedFacts | undefined | Promise<ParsedFacts | undefined>;

/** Where an import or a reference leads in the checkout: a file, and the name there. */
interface Target {
	/** The file, or a directory written with a trailing `/`, as the module a Swift import names. */
	readonly path: string;
	readonly symbol: string;
}

/** The adapters that read files, one for each entry of the table in adapters.ts. */
type AdapterName =
	| "helm"
	| "typescript"
	| "python"
	| "compose"
	| "kubernetes"
	| "env"
	| "csharp"
	| "c"
	| "cpp"
	| "objc"
	| "nix"
	| "terraform"
	| "swift"
	| "rust";

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
