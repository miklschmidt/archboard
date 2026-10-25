// The Rust adapter (ADR 0046, TASK-540): the code facts of one file from the
// captures of `rust.scm`.
//
// A use of a path is spelled through `.` from its first name:
// `crate::ledger::post` is `crate.ledger.post`, `Ledger::new` is `Ledger.new`
// and `Vec::<u8>::new` is `Vec.new`. It is also a use of each leading part of
// the path that names something, as TypeScript reads `a.b.c`: `Ledger::new`
// uses `Ledger`, and `crate::ledger::post` uses `crate.ledger`. A path
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
// Each use keeps the imports visible in its scope and whether it names a
// local binding. Code that did not parse holds no facts; its names are kept.

import type { Node, QueryCapture, Tree } from "web-tree-sitter";
import type { ParsedFacts } from "#runtime/operations/code-facts/facts.ts";
import type { Grammar } from "#runtime/services/code-facts/grammars.ts";
import { definitionsOf, typeName } from "#runtime/operations/code-facts/rust/rust-definitions.ts";
import { fromFile, nestingOf } from "#runtime/operations/code-facts/rust/rust-imports.ts";
import {
	bindReferences,
	type WrittenUse,
} from "#runtime/operations/code-facts/rust/rust-scopes.ts";
import { tokenUses } from "#runtime/operations/code-facts/rust/rust-tokens.ts";
import { ANY, type RunSyntax, valueMark } from "#runtime/operations/code-facts/runs.ts";
import { spansOf, type Spans } from "#runtime/operations/code-facts/spans.ts";
import { unparsedOf } from "#runtime/operations/code-facts/unparsed.ts";

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
function use(symbol: string, node: Node, typeOnly: boolean): WrittenUse {
	return {
		symbol,
		node,
		line: node.startPosition.row + 1,
		via: "code",
		kind: typeOnly ? "import" : "call",
		typeOnly,
		...valueMark(node, RUN_SYNTAX, typeOnly),
	};
}

/**
 * The uses a captured name makes, read once for its whole path: one for each
 * of the path's names, spelled from its first, as TypeScript reads `a.b.c` as
 * `a`, `a.b` and `a.b.c`. `Item::Definitions { .. }` uses `Item`, and
 * `Paragraph::new(..)` calls through `Paragraph`.
 * @param node The name.
 * @param context The file's bound names and spans.
 * @param seen The paths already read, which this adds to.
 * @returns The uses, none where the name is no use.
 */
function pathReferences(node: Node, context: UseContext, seen: Set<number>): WrittenUse[] {
	const whole = wholePath(node);
	if (seen.has(whole.id)) return [];
	seen.add(whole.id);
	const bound = context.bound.has(node.id) && whole.id === node.id;
	if (bound || hidden(whole, context)) return [];
	const typeOnly = context.types.holds(whole.startIndex);
	return pathSymbols(whole, node).map((symbol) => use(symbol, whole, typeOnly));
}

/**
 * The spelling of each leading part of a path that names something: `a`, `a.b` and `a.b.c`.
 * @param names The path's names, as the file's module reads them.
 * @returns The spellings, shortest first.
 */
function prefixes(names: readonly string[]): string[] {
	return names.map((_, index) => names.slice(0, index + 1).join(".")).filter(isUse);
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
 * How a path and each leading part of it are spelled: its names as the file's
 * module reads them, or its last name after a `.` where it starts at
 * something with no name.
 * @param whole The path.
 * @param node The captured name.
 * @returns The spellings, shortest first.
 */
function pathSymbols(whole: Node, node: Node): string[] {
	const names = pathNames(whole);
	if (names !== undefined) return prefixes(readPath(names, whole));
	return [`.${whole.childForFieldName("name")?.text ?? node.text}`];
}

/**
 * Whether a spelling names something: neither nothing nor a bare `crate`, `self` or `super`.
 * @param symbol The spelling.
 * @returns True when it does.
 */
function isUse(symbol: string): boolean {
	return symbol.split(".").some((name) => name !== "" && !HEADS.has(name));
}

/**
 * The use a member reached with `.` makes.
 * @param node The member's name.
 * @param context The file's spans.
 * @returns The use, or undefined in code where no name is a use.
 */
function memberReference(node: Node, context: UseContext): WrittenUse | undefined {
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
function tokenReferences(tree: Node, context: UseContext): WrittenUse[] {
	if (context.skip.holds(tree.startIndex) || context.unparsed.holds(tree.startIndex)) return [];
	return tokenUses(tree).flatMap((found): WrittenUse[] => {
		const last = found.path.at(-1) ?? "";
		const symbols = found.member ? [`.${last}`] : prefixes(readPath(found.path, found.node));
		const line = found.node.startPosition.row + 1;
		const way = found.called ? {} : { asValue: true as const };
		return symbols.map((symbol) => ({
			symbol,
			node: found.node,
			line,
			via: "code",
			kind: "call",
			typeOnly: false,
			...way,
		}));
	});
}

/**
 * The code facts of one parsed Rust file.
 * @param tree The file's syntax tree.
 * @param grammar The grammar it was parsed with.
 * @returns Its facts.
 */
function rustFacts(tree: Tree, grammar: Grammar): ParsedFacts {
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
	const imports = captured.import.filter((node) => !unparsed.holds(node.startIndex));
	const seen = new Set<number>();
	const environment = captured.environment.flatMap((node): WrittenUse[] =>
		unparsed.holds(node.startIndex)
			? []
			: [
					{
						symbol: node.text,
						node,
						line: node.startPosition.row + 1,
						via: "environment",
						typeOnly: false,
					},
				],
	);
	const written = [
		...captured.reference.flatMap((node) => pathReferences(node, context, seen)),
		...captured.member.flatMap((node) => memberReference(node, context) ?? []),
		...captured.tokens.flatMap((node) => tokenReferences(node, context)),
		...environment,
	];
	return {
		definitions: definitionsOf(tree.rootNode),
		...bindReferences(written, imports, binding),
		unparsed: unparsedOf(captured.unparsed),
	};
}

export { rustFacts };
