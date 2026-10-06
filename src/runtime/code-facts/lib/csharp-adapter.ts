// The C# adapter (ADR 0046): the code facts of one `.cs` file from the
// captures of `csharp.scm` and a walk of its declarations
// (csharp-definitions.ts).
//
// A name in a comment or a string is never a use. A string counts in two
// places: the name of an environment value
// (`Environment.GetEnvironmentVariable("NAME")`), and the assembly that
// `[assembly: InternalsVisibleTo("Name")]` makes a friend of the project.
//
// A use at run time is call evidence: a call, a construction, a static member,
// an attribute, `typeof`, and the base class a class derives from, whose code
// runs in every instance. A name only in a type position is import evidence
// and type-only: a declared type, a type argument, a cast, `as`, the type of a
// pattern, a constraint, and an interface a type implements. A base list
// names the base class first, if it has one; C# cannot tell a class from an
// interface by syntax, so the first entry of a class or record is its base
// class unless it is named as .NET names an interface (`I` and a capital).
//
// A `using` names a namespace, or a type with `static`, never a file, so it
// resolves to no file: each one is an import of every name there (`*`), and
// an alias imports one name. A `global using` passes its names on to every
// file of the project, so it is a re-export. Where a name leads is the
// project's to say (csharp-resolution.ts). Code in a part of the file that
// did not parse holds no facts; the names written there are kept.

import type { Node, QueryCapture, Tree } from "web-tree-sitter";
import type { Import, ParsedFacts, Reference, ReferenceVia } from "@/runtime/code-facts/lib/facts";
import { csharpDefinitions } from "@/runtime/code-facts/lib/csharp-definitions";
import type { Grammar } from "@/runtime/code-facts/lib/grammars";
import { spansOf, type Span, type Spans } from "@/runtime/code-facts/lib/spans";
import { unparsedOf } from "@/runtime/code-facts/lib/unparsed";

/** The captures of one file, by what the query calls them. */
interface Captured {
	readonly binding: Node[];
	readonly reference: Node[];
	readonly type: Node[];
	readonly base: Node[];
	readonly using: Node[];
	readonly environment: Node[];
	readonly friend: Node[];
	readonly skip: Node[];
	readonly unparsed: Node[];
}

/** Which list each capture of the query joins; a capture named `_...` only constrains a pattern. */
const LIST_OF: Readonly<Record<string, keyof Captured>> = {
	binding: "binding",
	reference: "reference",
	type: "type",
	base: "base",
	using: "using",
	environment: "environment",
	friend: "friend",
	skip: "skip",
	unparsed: "unparsed",
};

/** How .NET names an interface: `I` and a capital, as `IOrderService`. */
const INTERFACE_NAME = /^I\p{Lu}/u;

/** The declarations whose base list may name a base class first. */
const DERIVING = new Set(["class_declaration", "record_declaration"]);

/**
 * Sort the captures into their lists.
 * @param captures The captures, in document order.
 * @returns The lists.
 */
function sorted(captures: readonly QueryCapture[]): Captured {
	const lists: Captured = {
		binding: [],
		reference: [],
		type: [],
		base: [],
		using: [],
		environment: [],
		friend: [],
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
 * One name of a chain: an identifier, or the name of a generic type or method.
 * @param node The node.
 * @returns The name, or undefined for anything else.
 */
function segment(node: Node | null): string | undefined {
	if (node?.type === "identifier") return node.text;
	return node?.type === "generic_name" ? segment(node.namedChild(0)) : undefined;
}

/** The fields of the nodes that join two names with `.`: what comes before, and the name after. */
const JOINED: Readonly<Record<string, readonly [string, string]>> = {
	member_access_expression: ["expression", "name"],
	qualified_name: ["qualifier", "name"],
};

/**
 * A name and the name before it, joined with `.`.
 * @param before The spelling before, if it has one.
 * @param name The name after.
 * @returns The spelling, or undefined when either is missing.
 */
function joinedNames(before: string | undefined, name: string | undefined): string | undefined {
	return before === undefined || name === undefined ? undefined : `${before}.${name}`;
}

/**
 * How code spells a chain of names through `.`, from a name: `Shop.Core.Ledger`,
 * `ledger.Post`. `global::` is left out, and a chain from `this`, `base` or a
 * call has no spelling.
 * @param node A name, a member access or a qualified name.
 * @returns The spelling, or undefined.
 */
function chain(node: Node | null): string | undefined {
	if (node === null) return undefined;
	if (node.type === "alias_qualified_name") return segment(node.childForFieldName("name"));
	const fields = JOINED[node.type];
	if (fields === undefined) return segment(node);
	return joinedNames(
		chain(node.childForFieldName(fields[0])),
		segment(node.childForFieldName(fields[1])),
	);
}

/** The nodes whose `name` is spelled with the chain before it. */
const CHAINS = new Set(["member_access_expression", "qualified_name", "alias_qualified_name"]);

/**
 * The chain a name ends, where it is the name after `.`.
 * @param named The name, or the generic name it is the name of.
 * @returns The member access or qualified name, or undefined.
 */
function chainEndedBy(named: Node): Node | undefined {
	const parent = named.parent;
	if (parent === null || !CHAINS.has(parent.type)) return undefined;
	return parent.childForFieldName("name")?.id === named.id ? parent : undefined;
}

/**
 * How a used name is spelled: the name after `.` with the chain before it,
 * else the name alone.
 * @param node The name.
 * @returns The spelling.
 */
function spelling(node: Node): string {
	const named = node.parent?.type === "generic_name" ? node.parent : node;
	const ended = chainEndedBy(named);
	return (ended === undefined ? undefined : chain(ended)) ?? node.text;
}

/**
 * The type one base list entry names: the entry, or the type of a base class
 * written with its constructor's arguments.
 * @param entry The entry.
 * @returns The type, if it names one.
 */
function entryType(entry: Node): Node | null {
	return entry.type === "primary_constructor_base_type" ? entry.childForFieldName("type") : entry;
}

/**
 * Whether a base list entry names the base class: the first entry of a class
 * or a record, unless it is named as .NET names an interface.
 * @param type The entry's type.
 * @param index Its place in the list.
 * @param deriving Whether the list is a class's or a record's.
 * @returns True for the base class.
 */
function namesBaseClass(type: Node, index: number, deriving: boolean): boolean {
	const name = chain(type)?.split(".").at(-1) ?? "";
	return deriving && index === 0 && !INTERFACE_NAME.test(name);
}

/**
 * The entries of each base list that name a type only: every interface, and
 * every entry of a struct, an interface or an enum. The base class of a class
 * or a record runs at run time; its constructor arguments are code.
 * @param lists The base lists.
 * @returns The entries that are types.
 */
function interfaceEntries(lists: readonly Node[]): Span[] {
	return lists.flatMap((list) => {
		const deriving = DERIVING.has(list.parent?.type ?? "");
		return list.namedChildren.flatMap((entry, index) => {
			const type = entryType(entry);
			return type === null || namesBaseClass(type, index, deriving) ? [] : [type];
		});
	});
}

/** What deciding whether a captured name is a use needs. */
interface UseContext {
	readonly declared: ReadonlySet<number>;
	readonly skip: Spans;
	readonly unparsed: Spans;
	readonly types: Spans;
}

/**
 * A use of a name in code.
 * @param node The name.
 * @param context The file's declared names and spans.
 * @returns The reference, or undefined when the name is not a use.
 */
function codeReference(node: Node, context: UseContext): Reference | undefined {
	const at = node.startIndex;
	if (context.declared.has(node.id) || context.skip.holds(at) || context.unparsed.holds(at)) {
		return undefined;
	}
	const typeOnly = context.types.holds(at);
	return {
		symbol: spelling(node),
		line: node.startPosition.row + 1,
		via: "code",
		kind: typeOnly ? "import" : "call",
		typeOnly,
	};
}

/**
 * The name a string counts as: an environment value, or a friend assembly
 * without its public key.
 * @param node The string's text.
 * @param via What it names.
 * @param unparsed The file's unparsed code.
 * @returns The reference, or undefined inside unparsed code.
 */
function stringReference(node: Node, via: ReferenceVia, unparsed: Spans): Reference | undefined {
	if (unparsed.holds(node.startIndex)) return undefined;
	const symbol = via === "assembly" ? (node.text.split(",")[0] ?? "").trim() : node.text;
	return { symbol, line: node.startPosition.row + 1, via, typeOnly: false };
}

/**
 * The import a using directive makes.
 * @param node The directive.
 * @returns The import, or undefined for a directive with no name.
 */
function usingImport(node: Node): Import | undefined {
	const alias = node.childForFieldName("name");
	const specifier = chain(node.namedChildren.at(-1) ?? null);
	if (specifier === undefined) return undefined;
	const name =
		alias === null
			? { imported: "*", local: "*", typeOnly: false }
			: { imported: specifier, local: alias.text, typeOnly: false };
	return {
		specifier,
		line: node.startPosition.row + 1,
		names: [name],
		typeOnly: false,
		reexport: node.children.some((child) => child.type === "global"),
	};
}

/**
 * The references of a file, one for each spelling and way of use at the
 * first line it occurs.
 * @param references Every reference.
 * @returns The references.
 */
function distinct(references: readonly Reference[]): Reference[] {
	const seen = new Map<string, Reference>();
	for (const reference of references) {
		const key = `${reference.via}\0${reference.symbol}\0${String(reference.typeOnly)}`;
		if (!seen.has(key)) seen.set(key, reference);
	}
	return [...seen.values()];
}

/**
 * The code facts of one parsed C# file, before the names it uses are resolved.
 * @param tree The file's syntax tree.
 * @param grammar The grammar it was parsed with.
 * @returns The facts.
 */
function csharpFacts(tree: Tree, grammar: Grammar): ParsedFacts {
	const captured = sorted(grammar.query.captures(tree.rootNode));
	const unparsed = spansOf(captured.unparsed);
	const context: UseContext = {
		declared: new Set(captured.binding.map((node) => node.id)),
		skip: spansOf(captured.skip),
		unparsed,
		types: spansOf([...captured.type, ...interfaceEntries(captured.base)]),
	};
	const inCode = captured.reference.flatMap((node) => codeReference(node, context) ?? []);
	const inStrings = [
		...captured.environment.map((node) => stringReference(node, "environment", unparsed)),
		...captured.friend.map((node) => stringReference(node, "assembly", unparsed)),
	].filter((reference) => reference !== undefined);
	const imports = captured.using
		.filter((node) => !unparsed.holds(node.startIndex))
		.flatMap((node) => usingImport(node) ?? []);
	return {
		definitions: csharpDefinitions(tree.rootNode),
		references: distinct([...inCode, ...inStrings]),
		imports,
		unparsed: unparsedOf(captured.unparsed),
	};
}

export { csharpFacts };
