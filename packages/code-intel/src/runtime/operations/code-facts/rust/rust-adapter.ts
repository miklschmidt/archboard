// The Rust adapter (ADR 0046, TASK-540): the code facts of one file from the
// captures of `rust.scm`.
//
// A use of a path is one reference for the whole path, spelled through `.`
// from its first name: `crate::ledger::post` is `crate.ledger.post`,
// `Ledger::new` is `Ledger.new` and `Vec::<u8>::new` is `Vec.new`. A path
// starts with `crate`, with `super` where it leads above the file's module, or
// with a name; `self::` and the `super::` of an inline module are read from
// the file's module, as an import is (rust-imports.ts), and `Self` is the type
// of the `impl` or trait it stands in. A reference whose first name a `use`
// brings in reaches its file through that import; any other path is resolved
// in the crate's module tree (rust-resolution.ts).
//
// A field or a method reached with `.` from a name is spelled from the name,
// `ledger.post`, and from any other value, such as `self` or a call's result,
// with the `.` alone, `.post`: only the type of the value says what it is,
// which a language server knows. A name in a type, a bound, a generic
// argument or the trait an `impl` implements is a use only as a type,
// `import` evidence. Every other use is at run time, `call` evidence, and one
// that is neither called, constructed nor a macro is a use as a value
// (runs.ts). The names a macro is called with are read from its tokens
// (rust-tokens.ts). A name in a string counts only as the name of an
// environment value: `env::var("NAME")`, `env::var_os("NAME")`,
// `env!("NAME")` and `option_env!("NAME")`. A name a `use` brings in that no
// code of the file names, as a trait is brought in only to call its methods,
// is a use as a type on the line of the `use`.
//
// The facts keep the names the file binds in a scope narrower than the file,
// a parameter, a local, a pattern's binding or a generic parameter, so the
// resolver leads a use of one to no other file. Code that did not parse holds
// no facts; the names written there are kept.

import type { Node, QueryCapture, Tree } from "web-tree-sitter";
import type {
	Import,
	ParsedFacts,
	Reference,
	ReferenceThroughImport,
} from "#runtime/operations/code-facts/facts.ts";
import type { Grammar } from "#runtime/services/code-facts/grammars.ts";
import { definitionsOf, typeName } from "#runtime/operations/code-facts/rust/rust-definitions.ts";
import {
	fromFile,
	importsOf,
	nestingOf,
} from "#runtime/operations/code-facts/rust/rust-imports.ts";
import { tokenUses } from "#runtime/operations/code-facts/rust/rust-tokens.ts";
import { ANY, type RunSyntax, valueMark } from "#runtime/operations/code-facts/runs.ts";
import { spansOf, type Spans } from "#runtime/operations/code-facts/spans.ts";
import { unparsedOf } from "#runtime/operations/code-facts/unparsed.ts";

/** The facts of a Rust file, with the names it binds in a scope narrower than the file. */
type RustFacts = ParsedFacts & { readonly scoped: readonly string[] };

/** One reference, with the import it reaches through where a `use` brings in its first name. */
type FileReference = Reference & { readonly through?: ReferenceThroughImport };

/** The captures of one file, by what the query calls them. */
interface Captured {
	readonly binding: Node[];
	readonly declared: Node[];
	readonly matched: Node[];
	readonly reference: Node[];
	readonly member: Node[];
	readonly tokens: Node[];
	readonly environment: Node[];
	readonly import: Node[];
	readonly type: Node[];
	readonly skip: Node[];
	readonly unparsed: Node[];
}

/** Which list each capture of the query joins; a capture named `_...` only constrains a pattern. */
const LIST_OF: Readonly<Record<string, keyof Captured>> = {
	binding: "binding",
	declared: "declared",
	matched: "matched",
	reference: "reference",
	member: "member",
	tokens: "tokens",
	environment: "environment",
	import: "import",
	type: "type",
	skip: "skip",
	unparsed: "unparsed",
};

/** The nodes that join the names of a path. */
const PATHS = new Set(["scoped_identifier", "scoped_type_identifier"]);

/** The words that start a path at a module. */
const HEADS = new Set(["crate", "self", "super"]);

/** What deciding whether a captured name is a use needs. */
interface UseContext {
	/** The names that are no use: bound or declared where written. */
	readonly bound: ReadonlySet<number>;
	readonly skip: Spans;
	readonly unparsed: Spans;
	readonly types: Spans;
	readonly tokens: Spans;
}

/** How Rust runs a name: a call, a macro call, or a struct it builds. */
const RUN_SYNTAX: RunSyntax = {
	runners: { call_expression: "function", macro_invocation: "macro", struct_expression: "name" },
	chains: {
		scoped_identifier: ["path", "name"],
		scoped_type_identifier: ["path", "name"],
		generic_function: ["function"],
		field_expression: ["value", "field"],
	},
	arguments: { arguments: ANY },
};

/**
 * Sort the captures into their lists.
 * @param captures The captures, in document order.
 * @returns The lists.
 */
function sorted(captures: readonly QueryCapture[]): Captured {
	const lists: Captured = {
		binding: [],
		declared: [],
		matched: [],
		reference: [],
		member: [],
		tokens: [],
		environment: [],
		import: [],
		type: [],
		skip: [],
		unparsed: [],
	};
	for (const capture of captures) {
		const list = LIST_OF[capture.name];
		if (list !== undefined) lists[list].push(capture.node);
	}
	return lists;
}

/**
 * Whether a node is the given field of its parent.
 * @param parent The parent.
 * @param field The field.
 * @param node The node.
 * @returns True when it is.
 */
function isField(parent: Node, field: string, node: Node): boolean {
	return parent.childForFieldName(field)?.id === node.id;
}

/**
 * The whole path a name stands in: the outermost `a::b::c` that holds it,
 * through a generic type that starts a path, as `Vec::<u8>` starts `Vec::<u8>::new`.
 * @param node The name.
 * @returns The path, or the name itself.
 */
function wholePath(node: Node): Node {
	let at = node;
	for (let parent = at.parent; parent !== null; parent = at.parent) {
		if (!links(parent, at) && !startsPath(parent, at)) return at;
		at = parent;
	}
	return at;
}

/**
 * Whether a node is a name of the path that holds it.
 * @param parent The node that holds it.
 * @param node The node.
 * @returns True when it is.
 */
function links(parent: Node, node: Node): boolean {
	return PATHS.has(parent.type) && (isField(parent, "path", node) || isField(parent, "name", node));
}

/**
 * Whether a name is the type of a generic type that starts a path, as `Vec` in `Vec::<u8>::new`.
 * @param parent The node that holds it.
 * @param node The name.
 * @returns True when it is.
 */
function startsPath(parent: Node, node: Node): boolean {
	const outer = parent.parent;
	return (
		parent.type === "generic_type" &&
		isField(parent, "type", node) &&
		outer !== null &&
		isField(outer, "path", parent) &&
		PATHS.has(outer.type)
	);
}

/** The nodes that are one name of a path. */
const NAMES = new Set(["identifier", "type_identifier", ...HEADS]);

/**
 * The names of a path, from its first.
 * @param node The path.
 * @returns Its names, or undefined where it starts at something with no name, such as `<T as Trait>`.
 */
function pathNames(node: Node | null): string[] | undefined {
	if (node === null) return [];
	if (NAMES.has(node.type)) return [node.text];
	if (node.type === "generic_type") return pathNames(node.childForFieldName("type"));
	return PATHS.has(node.type) ? joinedNames(node) : undefined;
}

/**
 * The names of a path `a::b`: the names of its own path, and its last name.
 * @param node The path.
 * @returns Its names, or undefined where it starts at something with no name.
 */
function joinedNames(node: Node): string[] | undefined {
	const base = pathNames(node.childForFieldName("path"));
	const name = node.childForFieldName("name")?.text;
	return base === undefined || name === undefined ? undefined : [...base, name];
}

/**
 * The name `Self` stands for: the type of the `impl` block, or the trait, around a node.
 * @param node The node.
 * @returns The name, or undefined outside both.
 */
function selfType(node: Node): string | undefined {
	for (let at = node.parent; at !== null; at = at.parent) {
		if (at.type === "impl_item") return typeName(at.childForFieldName("type"));
		if (at.type === "trait_item") return at.childForFieldName("name")?.text;
	}
	return undefined;
}

/**
 * How the file's module reads a path written at a node: `Self` as its type,
 * and `self` and `super` from the file's module, with no `self` before a name
 * of the file itself.
 * @param path The path's names as written.
 * @param node Where it is written.
 * @returns The names.
 */
function readPath(path: readonly string[], node: Node): string[] {
	const [first, ...rest] = path;
	const own = first === "Self" ? selfType(node) : first;
	const read = fromFile(own === undefined ? path : [own, ...rest], nestingOf(node));
	return read[0] === "self" ? read.slice(1) : read;
}

/**
 * How code spells a chain of members through `.` from a name.
 * @param node A field expression or a name.
 * @returns The spelling, or undefined when the chain starts at a value with no name.
 */
function memberChain(node: Node | null): string | undefined {
	if (node === null) return undefined;
	if (node.type === "identifier") return node.text;
	return node.type === "field_expression" ? fieldChain(node) : undefined;
}

/**
 * How code spells a field expression through `.` from a name.
 * @param node The field expression.
 * @returns The spelling, or undefined when the chain starts at a value with no name.
 */
function fieldChain(node: Node): string | undefined {
	const base = memberChain(node.childForFieldName("value"));
	const field = node.childForFieldName("field")?.text;
	return base === undefined || field === undefined ? undefined : `${base}.${field}`;
}

/**
 * A use, with its evidence kind and its way of use.
 * @param symbol Its spelling.
 * @param node The node its way of use is read at.
 * @param typeOnly Whether it is a use only as a type.
 * @returns The reference.
 */
function use(symbol: string, node: Node, typeOnly: boolean): Reference {
	return {
		symbol,
		line: node.startPosition.row + 1,
		via: "code",
		kind: typeOnly ? "import" : "call",
		typeOnly,
		...valueMark(node, RUN_SYNTAX, typeOnly),
	};
}

/**
 * The use a captured name makes, read once for its whole path.
 * @param node The name.
 * @param context The file's bound names and spans.
 * @param seen The paths already read, which this adds to.
 * @returns The use, or undefined where the name is no use.
 */
function pathReference(node: Node, context: UseContext, seen: Set<number>): Reference | undefined {
	const whole = wholePath(node);
	if (seen.has(whole.id)) return undefined;
	seen.add(whole.id);
	const bound = context.bound.has(node.id) && whole.id === node.id;
	if (bound || hidden(whole, context)) return undefined;
	const symbol = pathSymbol(whole, node);
	return isUse(symbol) ? use(symbol, whole, context.types.holds(whole.startIndex)) : undefined;
}

/**
 * Whether a node is in code where no name is a use: skipped, unparsed, or
 * among a macro's tokens, which are read apart.
 * @param node The node.
 * @param context The file's spans.
 * @returns True when it is.
 */
function hidden(node: Node, context: UseContext): boolean {
	const at = node.startIndex;
	return [context.skip, context.unparsed, context.tokens].some((spans) => spans.holds(at));
}

/**
 * How a path is spelled: its names as the file's module reads them, or its
 * last name after a `.` where it starts at something with no name.
 * @param whole The path.
 * @param node The captured name.
 * @returns The spelling.
 */
function pathSymbol(whole: Node, node: Node): string {
	const names = pathNames(whole);
	if (names !== undefined) return readPath(names, whole).join(".");
	return `.${whole.childForFieldName("name")?.text ?? node.text}`;
}

/**
 * Whether a spelling names something: neither nothing nor a bare `crate`, `self` or `super`.
 * @param symbol The spelling.
 * @returns True when it does.
 */
function isUse(symbol: string): boolean {
	return symbol !== "" && !HEADS.has(symbol);
}

/**
 * The use a member reached with `.` makes.
 * @param node The member's name.
 * @param context The file's spans.
 * @returns The use, or undefined in code where no name is a use.
 */
function memberReference(node: Node, context: UseContext): Reference | undefined {
	if (hidden(node, context)) return undefined;
	const chain = node.parent === null ? undefined : memberChain(node.parent);
	return use(chain ?? `.${node.text}`, node, false);
}

/**
 * The uses among the tokens a macro is called with.
 * @param tree The tokens.
 * @param context The file's spans.
 * @returns The uses.
 */
function tokenReferences(tree: Node, context: UseContext): Reference[] {
	if (context.skip.holds(tree.startIndex) || context.unparsed.holds(tree.startIndex)) return [];
	return tokenUses(tree).flatMap((found): Reference[] => {
		const last = found.path.at(-1) ?? "";
		const symbol = found.member ? `.${last}` : readPath(found.path, found.node).join(".");
		if (!isUse(symbol)) return [];
		const line = found.node.startPosition.row + 1;
		const way = found.called ? {} : { asValue: true as const };
		return [{ symbol, line, via: "code", kind: "call", typeOnly: false, ...way }];
	});
}

/**
 * The import each local name a `use` or a `mod` declaration brings in reaches through.
 * @param imports The file's imports.
 * @returns Each local name and the index of its import.
 */
function localsOf(imports: readonly Import[]): Map<string, number> {
	const locals = new Map<string, number>();
	imports.forEach((found, index) => {
		for (const name of found.names)
			if (name.local !== "*" && !locals.has(name.local)) locals.set(name.local, index);
	});
	return locals;
}

/**
 * The references of a file, one for each spelling, way of use and evidence
 * kind at the first line it occurs, each with the import its first name
 * reaches through.
 * @param uses Every use.
 * @param locals The local names the file's imports bring in.
 * @returns The references.
 */
function distinct(
	uses: readonly Reference[],
	locals: ReadonlyMap<string, number>,
): FileReference[] {
	const seen = new Map<string, FileReference>();
	for (const reference of uses) {
		const key = keyOf(reference);
		if (!seen.has(key)) seen.set(key, throughOf(reference, locals));
	}
	return [...seen.values()];
}

/**
 * What tells two uses apart: spelling, way of use and evidence kind.
 * @param reference The use.
 * @returns Its key.
 */
function keyOf(reference: Reference): string {
	const { via, symbol, typeOnly, kind, asValue, passed } = reference;
	return [via, symbol, typeOnly, kind ?? "", asValue, passed].map(String).join("\0");
}

/**
 * A use with the import its first name reaches through, where a `use` or a `mod` brings it in.
 * @param reference The use.
 * @param locals The local names the file's imports bring in.
 * @returns The use.
 */
function throughOf(reference: Reference, locals: ReadonlyMap<string, number>): FileReference {
	const local = reference.symbol.split(".")[0] ?? "";
	const index = reference.via === "code" ? locals.get(local) : undefined;
	return index === undefined ? reference : { ...reference, through: { import: index, local } };
}

/**
 * A use of each name a `use` brings in that no code of the file names, as a
 * trait is brought in only to call its methods on values: a use as a type at
 * the line of the `use`. A name passed on with `pub use` is no use.
 * @param imports The file's imports.
 * @param uses The file's other uses.
 * @returns The uses.
 */
function importedOnly(imports: readonly Import[], uses: readonly Reference[]): Reference[] {
	const named = new Set(uses.map((each) => each.symbol.split(".")[0]));
	return imports.flatMap((found) =>
		found.reexport
			? []
			: found.names.flatMap((name): Reference[] =>
					name.imported === "*" || name.local === "_" || named.has(name.local)
						? []
						: [
								{
									symbol: name.local,
									line: found.line,
									via: "code",
									kind: "import",
									typeOnly: true,
								},
							],
				),
	);
}

/**
 * The names a file binds in a scope narrower than the file.
 * @param bindings The names bound where written.
 * @returns The names.
 */
function scopedNames(bindings: readonly Node[]): string[] {
	return [...new Set(bindings.map((node) => node.text))];
}

/**
 * The code facts of one parsed Rust file.
 * @param tree The file's syntax tree.
 * @param grammar The grammar it was parsed with.
 * @returns Its facts.
 */
function rustFacts(tree: Tree, grammar: Grammar): RustFacts {
	const captured = sorted(grammar.query.captures(tree.rootNode));
	const matchedNames = new Set(captured.matched.map((node) => node.id));
	const binding = captured.binding.filter((node) => !matchedNames.has(node.id));
	const unparsed = spansOf(captured.unparsed);
	const context: UseContext = {
		bound: new Set([...binding, ...captured.declared].map((node) => node.id)),
		skip: spansOf(captured.skip),
		unparsed,
		types: spansOf(captured.type),
		tokens: spansOf(captured.tokens),
	};
	const imports = captured.import
		.filter((node) => !unparsed.holds(node.startIndex))
		.flatMap((node) => importsOf(node));
	const seen = new Set<number>();
	const environment = captured.environment.flatMap((node): Reference[] =>
		unparsed.holds(node.startIndex)
			? []
			: [
					{
						symbol: node.text,
						line: node.startPosition.row + 1,
						via: "environment",
						typeOnly: false,
					},
				],
	);
	const written = [
		...captured.reference.flatMap((node) => pathReference(node, context, seen) ?? []),
		...captured.member.flatMap((node) => memberReference(node, context) ?? []),
		...captured.tokens.flatMap((node) => tokenReferences(node, context)),
		...environment,
	];
	const uses = [...written, ...importedOnly(imports, written)].toSorted(
		(left, right) => left.line - right.line,
	);
	return {
		definitions: definitionsOf(tree.rootNode),
		references: distinct(uses, localsOf(imports)),
		imports,
		unparsed: unparsedOf(captured.unparsed),
		scoped: scopedNames(binding),
	};
}

/**
 * Whether facts are a Rust file's.
 * @param facts The facts a file gave.
 * @returns True for the facts of a Rust file.
 */
function isRustFacts(facts: ParsedFacts): facts is RustFacts {
	return "scoped" in facts;
}

export { type RustFacts, isRustFacts, rustFacts };
