// The C and C++ adapter (ADR 0046, TASK-367.09): the code facts of one file
// from the captures of `c.scm`, which compiles under both grammars.
//
// A name is a use unless the file declares it there: a declarator, a
// parameter, a macro's name or parameters, an enumerator, a type with a body,
// a template parameter. A forward declaration, a designated initializer
// (`.x = 1`), a `using` declaration, a destructor's name (`~Ledger`), an
// attribute and the condition of `#if` or `#ifdef` hold no use. A use of a name that the enclosing function
// declares, a parameter or a local, is not kept, because a local never joins
// two parts and C finds every other name through the file's includes.
//
// The evidence kind of a use:
// - A type name is a use only as a type, import evidence: a declaration, a
//   parameter, a cast, a template argument.
// - A type name that constructs is a call: `new Ledger(...)`,
//   `Ledger ledger(...)`, C++'s `Ledger ledger{...}` and `Ledger{...}`, and a
//   base class, whose constructor runs. A plain `Ledger ledger;` and
//   `Ledger ledger = {...}` are a type, because a C struct runs no code there.
// - Every other name is a use at run time, a call: a function called, a
//   variable or a macro read, a function passed on as a value.
// A name after `::` is spelled with its qualifier (`shop::util::run`), and a
// field after `.` or `->` with its chain through `.` (`ledger.post`), as
// TypeScript spells a use through a value. A string counts as the name of an
// environment value in `getenv("NAME")`. Comments and other strings hold no
// name. Code in a part that did not parse holds no facts (c-unparsed.ts).
//
// An `#include` brings every name of the header into the file, and every
// header that header includes: an import of `*`, with no name of its own.
// Where a use leads is found through the includes in order, by the resolver
// (include-scope.ts).

import type { Node, QueryCapture, Tree } from "web-tree-sitter";
import { cDefinitionsOf, isMisread, spell } from "@/runtime/code-facts/lib/c-definitions";
import type { Import, ParsedFacts, Reference } from "@/runtime/code-facts/lib/facts";
import type { Grammar } from "@/runtime/code-facts/lib/grammars";
import { cUnparsedOf } from "@/runtime/code-facts/lib/c-unparsed";
import { spansOf, type Spans } from "@/runtime/code-facts/lib/spans";

/** The captures of one file, by what the query calls them. */
interface Captured {
	readonly name: Node[];
	readonly import: Node[];
	readonly environment: Node[];
	readonly function: Node[];
	readonly skip: Node[];
	readonly unparsed: Node[];
}

/** Nodes whose `name` or `scope` is part of one qualified name. */
const QUALIFYING = new Set([
	"qualified_identifier",
	"template_type",
	"template_function",
	"template_method",
]);

/** Parents whose every name child declares a name. */
const DECLARING = new Set([
	"reference_declarator",
	"parenthesized_declarator",
	"attributed_declarator",
	"structured_binding_declarator",
	"variadic_declarator",
	"preproc_params",
	"type_parameter_declaration",
	"optional_type_parameter_declaration",
	"variadic_type_parameter_declaration",
	"template_template_parameter_declaration",
	"lambda_capture_specifier",
	// An Objective-C method's parameter (objc-adapter.ts), which no C or C++ tree holds.
	"method_parameter",
]);

/** Parents whose `name` declares a name. */
const NAMING = new Set([
	"preproc_def",
	"preproc_function_def",
	"enumerator",
	"alias_declaration",
	"namespace_definition",
	"concept_definition",
]);

/** Parents whose names hold no use. */
const NO_USE = new Set([
	"preproc_ifdef",
	"field_designator",
	"using_declaration",
	"namespace_alias_definition",
	"field_initializer",
	"preproc_defined",
	"destructor_name",
]);

/** The specifiers of a type that can have a body. */
const TYPE_SPECIFIERS = new Set([
	"class_specifier",
	"struct_specifier",
	"union_specifier",
	"enum_specifier",
]);

/** Where a statement of declarations stands, so a bodiless type there is a forward declaration. */
const DECLARATION_LISTS = new Set([
	"translation_unit",
	"declaration_list",
	"field_declaration_list",
	"preproc_if",
	"preproc_ifdef",
	"preproc_else",
	"preproc_elif",
	"friend_declaration",
]);

/**
 * Sort the captures into their lists.
 * @param captures The captures, in document order.
 * @returns The lists.
 */
function sorted(captures: readonly QueryCapture[]): Captured {
	const lists: Captured = {
		name: [],
		import: [],
		environment: [],
		function: [],
		skip: [],
		unparsed: [],
	};
	const byName: ReadonlyMap<string, Node[]> = new Map(Object.entries(lists));
	for (const capture of captures) byName.get(capture.name)?.push(capture.node);
	return lists;
}

/**
 * Whether a node is a parent's child of one field.
 * @param parent The parent.
 * @param field The field.
 * @param node The node.
 * @returns True when it is.
 */
function isField(parent: Node, field: string, node: Node): boolean {
	const first = parent.childForFieldName(field);
	if (first === null || first.id === node.id) return first !== null;
	return parent.childrenForFieldName(field).some((child) => child.id === node.id);
}

/**
 * The whole qualified name a name is part of: `shop::util::run` for `run`
 * and for `util`, `std::vector` for `vector` in `std::vector<int>`.
 * @param node The name.
 * @returns The outermost qualified name, or the name itself.
 */
function outermost(node: Node): Node {
	let at = node;
	for (let parent = at.parent; parent !== null && QUALIFYING.has(parent.type); parent = at.parent) {
		if (!isField(parent, "name", at) && !isField(parent, "scope", at)) break;
		at = parent;
	}
	return at;
}

/**
 * Whether a type specifier without a body is a forward declaration
 * (`struct Ledger;`, `friend class Ledger;`), which uses nothing.
 * @param specifier The specifier.
 * @returns True when it is.
 */
function forwardDeclaration(specifier: Node): boolean {
	const parent = specifier.parent;
	if (parent === null) return false;
	if (DECLARATION_LISTS.has(parent.type)) return true;
	const declares = parent.type === "declaration" || parent.type === "field_declaration";
	return declares && parent.childrenForFieldName("declarator").length === 0;
}

/** Whether a name is declared where it stands, holds no use there, or is a use. */
type Role = "declared" | "none" | "use";

/**
 * Whether a name, as its whole qualified name stands, is declared there,
 * holds no use, or is a use.
 * @param top The whole name.
 * @returns Its role.
 */
function roleOf(top: Node): Role {
	const parent = top.parent;
	if (parent === null || NO_USE.has(parent.type)) return "none";
	if (DECLARING.has(parent.type) || isField(parent, "declarator", top)) return "declared";
	if (isField(parent, "name", top)) return roleAsName(parent);
	return fieldRole(top);
}

/**
 * The role of a name that neither declares nor names: a field is a use only
 * after `.` or `->`, as in `ledger.post`; any other name is a use.
 * @param top The whole name.
 * @returns Its role.
 */
function fieldRole(top: Node): Role {
	return top.type !== "field_identifier" || isFieldUse(top) ? "use" : "none";
}

/**
 * The role of a name in the `name` field of its parent.
 * @param parent The parent.
 * @returns Declared for what the parent defines, none for a forward
 * declaration, else a use, such as the type of a declaration.
 */
function roleAsName(parent: Node): Role {
	if (NAMING.has(parent.type)) return "declared";
	if (!TYPE_SPECIFIERS.has(parent.type)) return "use";
	if (parent.childForFieldName("body") !== null) return "declared";
	return forwardDeclaration(parent) ? "none" : "use";
}

/**
 * Whether a name is the field of a field expression: `post` in `ledger.post`.
 * @param top The whole name.
 * @returns True when it is.
 */
function isFieldUse(top: Node): boolean {
	const parent = top.parent;
	return parent?.type === "field_expression" && isField(parent, "field", top);
}

/** One function of the file: its id, its bytes, and the function around it. */
interface FunctionSpan {
	readonly id: number;
	readonly start: number;
	readonly end: number;
	/** The index of the function around it, or -1. */
	readonly outer: number;
}

/**
 * Close the functions that end before a place, innermost first.
 * @param spans The functions so far.
 * @param open The indexes of the functions still open, outermost first, which this pops.
 * @param start The place.
 */
function closeEnded(spans: readonly FunctionSpan[], open: number[], start: number): void {
	while (open.length > 0 && (spans[open.at(-1) ?? 0]?.end ?? 0) <= start) open.pop();
}

/**
 * The functions of a file, in order, each with the function around it.
 * @param functions The function definitions.
 * @returns The spans, by their start.
 */
function functionSpans(functions: readonly Node[]): FunctionSpan[] {
	const ordered = functions.toSorted((left, right) => left.startIndex - right.startIndex);
	const spans: FunctionSpan[] = [];
	const open: number[] = [];
	for (const node of ordered) {
		closeEnded(spans, open, node.startIndex);
		spans.push({
			id: node.id,
			start: node.startIndex,
			end: node.endIndex,
			outer: open.at(-1) ?? -1,
		});
		open.push(spans.length - 1);
	}
	return spans;
}

/**
 * The index of the last function that starts at or before a place.
 * @param spans The file's functions, by their start.
 * @param offset The place.
 * @returns The index, or -1 when none does.
 */
function lastStartingBy(spans: readonly FunctionSpan[], offset: number): number {
	let low = 0;
	let high = spans.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if ((spans[middle]?.start ?? 0) <= offset) low = middle + 1;
		else high = middle;
	}
	return low - 1;
}

/**
 * The functions around a place in the file, innermost first.
 * @param spans The file's functions, by their start.
 * @param offset The place.
 * @returns Their ids.
 */
function functionsAround(spans: readonly FunctionSpan[], offset: number): number[] {
	const around: number[] = [];
	for (
		let span = spans[lastStartingBy(spans, offset)];
		span !== undefined;
		span = spans[span.outer]
	) {
		if (offset < span.end) around.push(span.id);
	}
	return around;
}

/**
 * How code spells a chain of fields through `.` or `->`, from a name.
 * @param node A field expression or a name.
 * @returns The spelling through `.`, or undefined when the chain starts at something else, such as a call.
 */
function chain(node: Node): string | undefined {
	if (node.type === "identifier" || QUALIFYING.has(node.type)) return spell(node);
	return node.type === "field_expression" ? fieldChain(node) : undefined;
}

/**
 * How code spells a field expression through `.`.
 * @param node The field expression.
 * @returns The spelling, or undefined when its chain starts at something else.
 */
function fieldChain(node: Node): string | undefined {
	const argument = node.childForFieldName("argument");
	const field = node.childForFieldName("field");
	const base = argument === null ? undefined : chain(argument);
	return base === undefined || field === null ? undefined : `${base}.${spell(field)}`;
}

/** Where a type name constructs a value: `new T(...)`, a base class, and C++'s `T{...}`. */
const CONSTRUCTING = new Set([
	"new_expression",
	"base_class_clause",
	"compound_literal_expression",
]);

/**
 * Whether a declarator constructs what it declares: `value(...)`, and C++'s
 * `value{...}`. With `=`, `value = {...}` fills a C struct, which runs no code.
 * @param declarator The declarator.
 * @returns True when it does.
 */
function constructsValue(declarator: Node): boolean {
	if (declarator.type !== "init_declarator") return false;
	const value = declarator.childForFieldName("value")?.type;
	const assigned = declarator.children.some((child) => child.type === "=");
	return value === "argument_list" || (value === "initializer_list" && !assigned);
}

/**
 * Whether a type name constructs a value, so a constructor runs: `new T(...)`,
 * `T value(...)`, `T value{...}`, `T{...}` and a base class. C writes a
 * compound literal with the type in parentheses, `(T){...}`, which runs no code.
 * @param top The whole type name.
 * @returns True when it does.
 */
function constructs(top: Node): boolean {
	const parent = top.parent;
	if (parent === null) return false;
	if (CONSTRUCTING.has(parent.type)) return true;
	if (parent.type !== "declaration" || !isField(parent, "type", top)) return false;
	return parent.childrenForFieldName("declarator").some(constructsValue);
}

/** One name, as the file writes it and where. */
interface Named {
	readonly node: Node;
	readonly top: Node;
	readonly role: Role;
	/** The ids of the functions around it, innermost first. */
	readonly functions: readonly number[];
}

/**
 * Each name of the file outside code that did not parse, with its role.
 * @param names The captured names.
 * @param unparsed The file's unparsed code, and code whose names are no use.
 * @param functions The file's functions.
 * @returns The names.
 */
function namedOf(
	names: readonly Node[],
	unparsed: Spans,
	functions: readonly FunctionSpan[],
): Named[] {
	return names.flatMap((node) => {
		if (unparsed.holds(node.startIndex)) return [];
		const top = outermost(node);
		return [
			{ node, top, role: roleOf(top), functions: functionsAround(functions, node.startIndex) },
		];
	});
}

/**
 * The names each function or lambda declares: its parameters and locals.
 * @param named The file's names.
 * @returns Each function's id and name, joined.
 */
function localsOf(named: readonly Named[]): Set<string> {
	const locals = new Set<string>();
	for (const { top, role, functions } of named) {
		const [innermost] = functions;
		if (role === "declared" && innermost !== undefined) locals.add(`${innermost}\0${top.text}`);
	}
	return locals;
}

/**
 * How a used name is spelled: a field with its chain through `.`, or with the
 * `.` alone after a value the code does not name, such as a call's result
 * (`.Append` in `open()->Append()`), as C# and Swift spell it; else the whole
 * qualified name.
 * @param top The whole name.
 * @returns The spelling.
 */
function spellingOf(top: Node): string {
	if (!isFieldUse(top) || top.parent === null) return spell(top);
	return chain(top.parent) ?? `.${spell(top)}`;
}

/**
 * Whether a bare name is a parameter or local of a function around it.
 * @param symbol The name's spelling.
 * @param named The name, with the functions around it.
 * @param locals Each function's locals.
 * @returns True when it is.
 */
function isLocal(symbol: string, named: Named, locals: ReadonlySet<string>): boolean {
	if (symbol.includes(".") || symbol.includes("::")) return false;
	return named.functions.some((id) => locals.has(`${id}\0${symbol}`));
}

/**
 * The use one name makes, if it is a use the file keeps.
 * @param named The name.
 * @param locals Each function's locals.
 * @returns The reference, or undefined.
 */
function useOf(named: Named, locals: ReadonlySet<string>): Reference | undefined {
	const { node, top, role } = named;
	if (role !== "use") return undefined;
	const symbol = spellingOf(top);
	if (isLocal(symbol, named, locals)) return undefined;
	const typeOnly = node.type === "type_identifier" && !constructs(top);
	return {
		symbol,
		line: top.startPosition.row + 1,
		via: "code",
		kind: typeOnly ? "import" : "call",
		typeOnly,
	};
}

/**
 * The path of an include as written: `ledger.h` for `"ledger.h"`, and
 * `<vector>` with its angle brackets.
 * @param path The include's path.
 * @returns The path, or undefined for an include of a macro.
 */
function includePath(path: Node | null): string | undefined {
	if (path?.type === "system_lib_string") return path.text;
	return path?.type === "string_literal" ? path.namedChildren[0]?.text : undefined;
}

/**
 * One `#include`: every name of the header in scope, under its path as
 * written, `<vector>` with its angle brackets.
 * @param node The include directive.
 * @returns The import, or undefined for an include of a macro.
 */
function includeOf(node: Node): Import | undefined {
	const specifier = includePath(node.childForFieldName("path"));
	if (specifier === undefined || specifier === "") return undefined;
	return {
		specifier,
		line: node.startPosition.row + 1,
		names: [{ imported: "*", local: "*", typeOnly: false }],
		typeOnly: false,
		reexport: false,
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
 * The code facts of one parsed C or C++ file, before its includes are resolved.
 * @param tree The file's syntax tree.
 * @param grammar The grammar it was parsed with.
 * @returns The facts.
 */
function cFacts(tree: Tree, grammar: Grammar): ParsedFacts {
	return cFactsOf(tree, grammar.query.captures(tree.rootNode));
}

/**
 * The code facts of one parsed file of the C family from the captures of a
 * query that names them as `c.scm` does. Objective-C's adapter reads the C
 * in its files so (objc-adapter.ts).
 * @param tree The file's syntax tree.
 * @param captures The query's captures, in document order; captures of other names are left out.
 * @returns The facts.
 */
function cFactsOf(tree: Tree, captures: readonly QueryCapture[]): ParsedFacts {
	const captured = sorted(captures);
	const broken = cUnparsedOf(captured.unparsed);
	const unparsed = spansOf(broken);
	const outside = spansOf([...broken, ...captured.skip]);
	// A namespace or a class a macro hides from the grammar is no function whose names are its own.
	const functions = captured.function.filter((node) => !isMisread(node));
	const named = namedOf(captured.name, outside, functionSpans(functions));
	const locals = localsOf(named);
	const inCode = named.flatMap((each) => useOf(each, locals) ?? []);
	const inStrings = captured.environment
		.filter((node) => !unparsed.holds(node.startIndex))
		.map((node): Reference => ({
			symbol: node.text,
			line: node.startPosition.row + 1,
			via: "environment",
			typeOnly: false,
		}));
	return {
		definitions: cDefinitionsOf(tree.rootNode),
		references: distinct([...inCode, ...inStrings]),
		imports: captured.import
			.filter((node) => !unparsed.holds(node.startIndex))
			.flatMap((node) => includeOf(node) ?? []),
		unparsed: broken.map(({ start, end, names }) => ({ start, end, names })),
	};
}

export { cFacts, cFactsOf };
