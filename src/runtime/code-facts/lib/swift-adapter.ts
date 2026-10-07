// The Swift adapter (ADR 0046, TASK-367.12): the code facts of one file from
// the captures of `swift.scm`.
//
// A Swift `import` names a module, not a file, and the files of one module
// see each other's names with no import at all. So a use names no import
// here: the resolver finds where it leads in the module and in the modules
// the file imports (swift-resolution.ts). An import is also a use of the
// module it names, as `build-dependency` evidence: a module is built from the
// modules it imports, and the target dependencies of `Package.swift` say
// which local modules those are.
//
// A name in a type, a generic constraint or an inheritance clause is a use
// only as a type, `import` evidence: the syntax cannot tell a superclass from
// a protocol. Every other use is at run time, `call` evidence, a type name in
// an attribute too, as a property wrapper runs. One that neither is called nor
// stands in an attribute is a use as a value (runs.ts). A name in a comment or a string
// is never captured, but for the name of an environment value
// (`ProcessInfo.processInfo.environment["NAME"]`, `getenv("NAME")`) and of a
// notification (`Notification.Name("NAME")`). The member that a leading `.`
// names (`.shared`, `case .debit`) is no use: only the context says its type.
// A member reached through a value the code does not name, such as `self`, a
// call's result or a literal, is spelled with the `.` alone (`.close`), as C#
// spells it: it is no name of the module.
//
// The facts keep the names the file binds in a scope narrower than the file:
// a parameter, a local, a closure's or a generic parameter, a member. A use of
// one of those names may be that binding, so the resolver leads it to no other
// file.
//
// tree-sitter-swift recovers from code it cannot parse by guessing where the
// code after it belongs, and the guess can be wrong: on swift-collections and
// swift-nio, an `unsafe` expression (Swift 6.2) puts the members after it
// inside the function it broke, and an `#if` condition it cannot read closes
// a type early and puts its members at file level. So the part of a file that
// did not parse runs from the first place the grammar could not read to the
// end of the last declaration at file level that holds such a place: a name
// the reading does not find there is unknown, never absent. A file whose whole
// tree is an error holds no definitions, as it holds no uses.

import type { Node, QueryCapture, Tree } from "web-tree-sitter";
import type {
	Import,
	ParsedFacts,
	Reference,
	ReferenceVia,
	Unparsed,
} from "@/runtime/code-facts/lib/facts";
import type { Grammar } from "@/runtime/code-facts/lib/grammars";
import { ANY, type RunSyntax, valueMark } from "@/runtime/code-facts/lib/runs";
import { spansOf, type Spans } from "@/runtime/code-facts/lib/spans";
import { definitionsOf } from "@/runtime/code-facts/lib/swift-definitions";

/** The facts of a Swift file, with the names it binds in a scope narrower than the file. */
type SwiftFacts = ParsedFacts & { readonly scoped: readonly string[] };

/** The captures of one file, by what the query calls them. */
interface Captured {
	readonly binding: Node[];
	readonly label: Node[];
	readonly reference: Node[];
	readonly environment: Node[];
	readonly event: Node[];
	readonly import: Node[];
	readonly type: Node[];
	readonly runtime: Node[];
	readonly skip: Node[];
	readonly unparsed: Node[];
}

/** Which list each capture of the query joins; a capture named `_...` only constrains a pattern. */
const LIST_OF: Readonly<Record<string, keyof Captured>> = {
	binding: "binding",
	label: "label",
	reference: "reference",
	environment: "environment",
	event: "event",
	import: "import",
	type: "type",
	runtime: "runtime",
	skip: "skip",
	unparsed: "unparsed",
};

/** A whole word, as the text reading spells one. */
const WORD = /[\p{L}\p{N}_$]+/gu;

/** What deciding whether a captured name is a use needs. */
interface UseContext {
	/** The names that are no use: bound where written, or an argument label. */
	readonly declared: ReadonlySet<number>;
	readonly skip: Spans;
	readonly unparsed: Spans;
	readonly types: Spans;
	readonly runtime: Spans;
}

/**
 * Sort the captures into their lists.
 * @param captures The captures, in document order.
 * @returns The lists.
 */
function sorted(captures: readonly QueryCapture[]): Captured {
	const lists: Captured = {
		binding: [],
		label: [],
		reference: [],
		environment: [],
		event: [],
		import: [],
		type: [],
		runtime: [],
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
 * The member a navigation names after its `.`.
 * @param navigation The navigation.
 * @returns The member's name, or undefined for anything else, such as a tuple's `.0`.
 */
function memberName(navigation: Node): string | undefined {
	const suffix = navigation.childForFieldName("suffix")?.childForFieldName("suffix");
	return suffix?.type === "simple_identifier" ? suffix.text : undefined;
}

/**
 * How code spells a chain of names through `.`, from a name.
 * @param node A navigation or a name.
 * @returns The spelling, or undefined when the chain starts at something else, such as a call.
 */
function chain(node: Node): string | undefined {
	if (node.type === "simple_identifier") return node.text;
	const target = node.type === "navigation_expression" ? node.childForFieldName("target") : null;
	const base = target === null ? undefined : chain(target);
	const member = base === undefined ? undefined : memberName(node);
	return member === undefined ? undefined : `${base}.${member}`;
}

/**
 * A name of a qualified type or module (`Core.Ledger`) with the names before it.
 * @param node The name.
 * @param parent The type or the module name that holds it.
 * @returns The spelling.
 */
function qualifiedSpelling(node: Node, parent: Node): string {
	const names = parent.namedChildren.filter((child) => child.type === node.type);
	const upTo = names.findIndex((child) => child.id === node.id);
	return names
		.slice(0, upTo + 1)
		.map((name) => name.text)
		.join(".");
}

/** The nodes whose names a name is spelled with. */
const QUALIFIED = new Set(["user_type", "identifier"]);

/**
 * How a used name is spelled: the name after `.` with the chain before it,
 * or with the `.` alone when the chain starts at a value the code does not
 * name; a name of a qualified type or module with the names before it; else
 * the name alone.
 * @param node The name.
 * @returns The spelling.
 */
function spelling(node: Node): string {
	const parent = node.parent;
	if (parent === null) return node.text;
	if (QUALIFIED.has(parent.type)) return qualifiedSpelling(node, parent);
	const navigation = parent.type === "navigation_suffix" ? parent.parent : null;
	if (navigation === null) return node.text;
	return chain(navigation) ?? `.${node.text}`;
}

/**
 * Whether a name is what a call calls, its first child. The grammar writes a
 * subscript, `table["k"]`, as a call whose arguments stand in brackets; it
 * reads and calls nothing.
 * @param call The call.
 * @param name The name.
 * @returns True when the call calls it.
 */
function callee(call: Node, name: Node): boolean {
	const suffix = call.namedChildren.find((child) => child.type === "call_suffix");
	const subscript = suffix?.namedChildren[0]?.firstChild?.type === "[";
	return call.namedChildren[0]?.id === name.id && !subscript;
}

/**
 * Whether an argument is in a call, rather than a tuple or a subscript.
 * @param argument The argument.
 * @returns Whether the suffix calls code.
 */
function inCall(argument: Node): boolean {
	const suffix = argument.parent?.parent;
	return suffix?.type === "call_suffix" && suffix.firstChild?.firstChild?.type !== "[";
}

/**
 * Whether a name stands as the value of a call argument.
 * @param argument The argument.
 * @param name The name.
 * @returns Whether it is passed.
 */
function passedArgument(argument: Node, name: Node): boolean {
	return argument.childForFieldName("value")?.id === name.id && inCall(argument);
}

/** How Swift runs a name: a call, which is also how it constructs. */
const RUN_SYNTAX: RunSyntax = {
	runners: { call_expression: callee, attribute: ANY },
	chains: {
		navigation_expression: ["target", "suffix"],
		navigation_suffix: ["suffix"],
		user_type: [""],
	},
	arguments: { value_argument: passedArgument },
};

/**
 * A use of a name in code. A name in an attribute runs, as a property wrapper
 * does; any other name runs only where the code calls it.
 * @param node The name.
 * @param context The file's bound names and spans.
 * @returns The use, or undefined when the name is not a use.
 */
function codeReference(node: Node, context: UseContext): Reference | undefined {
	const at = node.startIndex;
	if (context.declared.has(node.id) || context.skip.holds(at) || context.unparsed.holds(at)) {
		return undefined;
	}
	const typeOnly = context.types.holds(at) && !context.runtime.holds(at);
	return {
		symbol: spelling(node),
		line: node.startPosition.row + 1,
		via: "code",
		kind: typeOnly ? "import" : "call",
		typeOnly,
		...valueMark(node, RUN_SYNTAX, typeOnly),
	};
}

/**
 * A name a string counts as.
 * @param node The string's text.
 * @param via Whether it names an environment value or an event.
 * @param unparsed The file's unparsed code.
 * @returns The reference, or undefined inside unparsed code.
 */
function stringReference(node: Node, via: ReferenceVia, unparsed: Spans): Reference | undefined {
	if (unparsed.holds(node.startIndex)) return undefined;
	return { symbol: node.text, line: node.startPosition.row + 1, via, typeOnly: false };
}

/**
 * Whether an import declaration carries an attribute, such as `@_exported`.
 * @param node The declaration.
 * @param name The attribute's name.
 * @returns True when it does.
 */
function hasAttribute(node: Node, name: string): boolean {
	return node.descendantsOfType("attribute").some((attribute) => attribute.text === `@${name}`);
}

/**
 * One import: the module it names. `@_exported` passes the module's names on.
 * @param node The import declaration.
 * @param unparsed The file's unparsed code.
 * @returns The import, or undefined for one that names no module or did not parse.
 */
function importOf(node: Node, unparsed: Spans): Import | undefined {
	const module = node.namedChildren
		.find((child) => child.type === "identifier")
		?.namedChildren.find((child) => child.type === "simple_identifier");
	if (module === undefined || unparsed.holds(node.startIndex)) return undefined;
	return {
		specifier: module.text,
		line: node.startPosition.row + 1,
		names: [],
		typeOnly: false,
		reexport: hasAttribute(node, "_exported"),
	};
}

/**
 * The use of the module an import names, as a build dependency.
 * @param found The import.
 * @returns The reference.
 */
function moduleUse(found: Import): Reference {
	return {
		symbol: found.specifier,
		line: found.line,
		via: "code",
		kind: "build-dependency",
		typeOnly: false,
	};
}

/**
 * The references of a file, one for each spelling, way of use and evidence
 * kind at the first line it occurs.
 * @param uses Every use.
 * @returns The references.
 */
function distinct(uses: readonly Reference[]): Reference[] {
	const seen = new Map<string, Reference>();
	for (const use of uses) {
		const key = `${use.via}\0${use.symbol}\0${String(use.typeOnly)}\0${use.kind ?? ""}\0${String(use.asValue)}\0${String(use.passed)}`;
		if (!seen.has(key)) seen.set(key, use);
	}
	return [...seen.values()];
}

/**
 * The first place where the grammar could not read the code: an error, a
 * token it took as missing, such as the `}` that closes a type early, or a
 * token it read while recovering.
 * @param root The file's syntax tree.
 * @returns The node, or undefined for a file that parsed.
 */
function firstBroken(root: Node): Node | undefined {
	if (!root.hasError) return undefined;
	let node = root;
	for (;;) {
		const inner = node.children.find((child) => child.hasError || child.isMissing);
		if (node.isError || node.isMissing || inner === undefined) return node;
		node = inner;
	}
}

/**
 * The last line a node holds text on, 1-based.
 * @param node The node.
 * @returns The line.
 */
function lastLine(node: Node): number {
	return node.endPosition.row + (node.endPosition.column === 0 ? 0 : 1);
}

/**
 * The part of a file whose reading is uncertain, with every name written
 * there: from the first place the grammar could not read to the end of the
 * last declaration at file level that holds such a place. A type closed early
 * leaves a `}` that the grammar cannot place, so the members it read at file
 * level lie between the two.
 * @param root The file's syntax tree.
 * @returns The part, or none for a file that parsed.
 */
function uncertainPart(root: Node): Unparsed[] {
	const first = firstBroken(root);
	if (first === undefined) return [];
	const broken = root.isError ? [root] : root.children.filter((child) => child.hasError);
	const start = first.startPosition.row + 1;
	const end = Math.max(start, ...broken.map(lastLine));
	const lines = root.text
		.split("\n")
		.slice(start - 1 - root.startPosition.row, end - root.startPosition.row);
	const names = new Set(lines.flatMap((line) => line.match(WORD) ?? []));
	return [{ start, end, names: [...names] }];
}

/**
 * The names a file binds in a scope narrower than the file: each bound name
 * but those of the file's own declarations at file level.
 * @param bindings The names written where they are bound.
 * @param definitions The file's definitions.
 * @returns The names.
 */
function scopedNames(bindings: readonly Node[], definitions: ParsedFacts["definitions"]): string[] {
	const fileLevel = new Set(definitions.map((definition) => definition.symbol));
	return [...new Set(bindings.map((node) => node.text))].filter((name) => !fileLevel.has(name));
}

/**
 * The code facts of one parsed Swift file.
 * @param tree The file's syntax tree.
 * @param grammar The grammar it was parsed with.
 * @returns Its facts.
 */
function swiftFacts(tree: Tree, grammar: Grammar): SwiftFacts {
	const captured = sorted(grammar.query.captures(tree.rootNode));
	const unparsed = spansOf(captured.unparsed);
	const context: UseContext = {
		declared: new Set([...captured.binding, ...captured.label].map((node) => node.id)),
		skip: spansOf(captured.skip),
		unparsed,
		types: spansOf(captured.type),
		runtime: spansOf(captured.runtime),
	};
	const imports = captured.import.flatMap((node) => importOf(node, unparsed) ?? []);
	const uses = [
		...imports.map(moduleUse),
		...captured.reference.flatMap((node) => codeReference(node, context) ?? []),
		...captured.environment.flatMap((node) => stringReference(node, "environment", unparsed) ?? []),
		...captured.event.flatMap((node) => stringReference(node, "event", unparsed) ?? []),
	];
	const definitions = definitionsOf(tree.rootNode);
	return {
		definitions,
		references: distinct(uses),
		imports,
		unparsed: uncertainPart(tree.rootNode),
		scoped: scopedNames(captured.binding, definitions),
	};
}

/**
 * Whether facts are a Swift file's.
 * @param facts The facts a file gave.
 * @returns True for the facts of a Swift file.
 */
function isSwiftFacts(facts: ParsedFacts): facts is SwiftFacts {
	return "scoped" in facts;
}

export { type SwiftFacts, isSwiftFacts, swiftFacts };
