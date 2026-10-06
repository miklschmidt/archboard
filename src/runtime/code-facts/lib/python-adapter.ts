// The Python adapter (ADR 0046): the code facts of one file from the captures
// of `python.scm`.
//
// A name in a comment or a docstring is never captured. A name in a string
// counts in three places only: as the name of an environment value
// (`os.environ["NAME"]`, `os.environ.get("NAME")`, `"NAME" in os.environ`,
// `os.getenv("NAME")`), as the name of an event (the first string argument of
// `signal`, `on`, `once` or `emit`, as blinker names Flask's signals), and as a
// name in a string annotation (`"Flask"`), which is how Python writes a type
// that it imports only for type checking; a string where `Literal` or
// `Annotated` takes a value names no type. A bare `environ` is not read: in a
// WSGI application it is the request's environ, not the process's.
//
// An annotation and the body of `if TYPE_CHECKING:` are types, so a name used
// only there is import evidence and an import there is type-only. Every other
// use is at run time, a call; one that calls, constructs, decorates or
// derives from nothing is a use as a value (runs.ts). A name that a function, a lambda or a
// comprehension binds for itself, such as a parameter, is its own inside it,
// so a use of it there reaches no import of the same name. Code in a part of
// the file that did not parse holds no facts; the names written there are
// kept.

import type { Node, QueryCapture, Tree } from "web-tree-sitter";
import type {
	Import,
	ImportedName,
	ParsedFacts,
	Reference,
	ReferenceThroughImport,
	ReferenceVia,
} from "@/runtime/code-facts/lib/facts";
import type { Grammar } from "@/runtime/code-facts/lib/grammars";
import { definitionsOf, targetNames } from "@/runtime/code-facts/lib/python-definitions";
import { dynamicImport, passedOn, staticImports } from "@/runtime/code-facts/lib/python-imports";
import { holds, isLocal, type Shadows, shadowsOf } from "@/runtime/code-facts/lib/python-scopes";
import { ANY, type RunSyntax, valueMark } from "@/runtime/code-facts/lib/runs";
import { spansOf, type Spans } from "@/runtime/code-facts/lib/spans";
import { unparsedOf } from "@/runtime/code-facts/lib/unparsed";

/** The captures of one file, by what the query calls them. */
interface Captured {
	readonly definition: Node[];
	readonly target: Node[];
	readonly binding: Node[];
	readonly reference: Node[];
	readonly all: Node[];
	readonly environment: Node[];
	readonly event: Node[];
	readonly import: Node[];
	readonly dynamic: Node[];
	readonly type: Node[];
	readonly skip: Node[];
	readonly unparsed: Node[];
}

/** Which list each capture of the query joins; a capture named `_...` only constrains a pattern. */
const LIST_OF: Readonly<Record<string, keyof Captured>> = {
	definition: "definition",
	"definition.target": "target",
	binding: "binding",
	reference: "reference",
	all: "all",
	environment: "environment",
	event: "event",
	import: "import",
	"import.dynamic": "dynamic",
	type: "type",
	skip: "skip",
	unparsed: "unparsed",
};

/** A name, or names joined by `.`, in a string annotation. */
const ANNOTATED = /[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)*/gu;

/** Words of a string annotation that name no code. */
const CONSTANTS = new Set(["None", "True", "False"]);

/** What can stand between a string and its annotation where the string still stands for a type. */
const TYPE_SYNTAX = new Set([
	"type",
	"generic_type",
	"type_parameter",
	"subscript",
	"binary_operator",
	"list",
]);

/** The subscripted types whose arguments are values from this one on: all of `Literal`'s, `Annotated`'s after the type. */
const VALUES_FROM: ReadonlyMap<string, number> = new Map([
	["Literal", 0],
	["Annotated", 1],
]);

/** What `__all__` can be set to and still be read: a list or a tuple of strings, or the arguments of `append()`. */
const NAME_LISTS = new Set(["list", "tuple", "expression_list", "argument_list"]);

/** A use of a name, and whether a scope around it binds its first name for itself. */
type Use = Reference & { readonly local?: true };

/**
 * Sort the captures into their lists.
 * @param captures The captures, in document order.
 * @returns The lists.
 */
function sorted(captures: readonly QueryCapture[]): Captured {
	const lists: Captured = {
		definition: [],
		target: [],
		binding: [],
		reference: [],
		all: [],
		environment: [],
		event: [],
		import: [],
		dynamic: [],
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
 * How code spells a chain of names through `.`, from a name.
 * @param node An attribute or a name.
 * @returns The spelling, or undefined when the chain starts at something else, such as a call.
 */
function chain(node: Node): string | undefined {
	if (node.type === "identifier") return node.text;
	if (node.type !== "attribute") return undefined;
	const object = node.childForFieldName("object");
	const attribute = node.childForFieldName("attribute");
	const base = object === null ? undefined : chain(object);
	return base === undefined || attribute === null ? undefined : `${base}.${attribute.text}`;
}

/**
 * How a used name is spelled: the name after `.` with the chain before it,
 * else the name alone.
 * @param node The name.
 * @returns The spelling.
 */
function spelling(node: Node): string {
	const parent = node.parent;
	if (parent?.type !== "attribute") return node.text;
	const after = parent.childForFieldName("attribute")?.id === node.id;
	return after ? (chain(parent) ?? node.text) : node.text;
}

/**
 * Whether a list of arguments names the base classes of a class.
 * @param list The list.
 * @returns True for a class's bases.
 */
function namesBases(list: Node): boolean {
	return list.parent?.type === "class_definition";
}

/**
 * How Python runs a name: a call, also a construction, a decorator, a base
 * class. A subscript links a chain, so a generic base, `Base[int]`, derives
 * from `Base`.
 */
const RUN_SYNTAX: RunSyntax = {
	runners: { call: "function", decorator: ANY, argument_list: namesBases },
	chains: { attribute: ["object", "attribute"], subscript: ["value"] },
};

/** What deciding whether a captured name is a use needs. */
interface UseContext {
	readonly declared: ReadonlySet<number>;
	readonly skip: Spans;
	readonly unparsed: Spans;
	readonly types: Spans;
}

/**
 * Whether a captured name is not a use: a name the file binds where it
 * writes it, or one in an import statement or in code that did not parse.
 * @param node The name.
 * @param context The file's declared names and spans.
 * @returns True when it is not a use.
 */
function notAUse(node: Node, context: UseContext): boolean {
	const at = node.startIndex;
	return context.declared.has(node.id) || context.skip.holds(at) || context.unparsed.holds(at);
}

/**
 * A use of a name in code.
 * @param node The name.
 * @param context The file's declared names and spans.
 * @param shadows The names of imports that scopes bind for themselves.
 * @returns The use, or undefined when the name is not a use.
 */
function codeReference(node: Node, context: UseContext, shadows: Shadows): Use | undefined {
	if (notAUse(node, context)) return undefined;
	const typeOnly = context.types.holds(node.startIndex);
	const reference: Reference = {
		symbol: spelling(node),
		line: node.startPosition.row + 1,
		via: "code",
		kind: typeOnly ? "import" : "call",
		typeOnly,
		...valueMark(node, RUN_SYNTAX, typeOnly),
	};
	return isLocal(node, reference.symbol, shadows) ? { ...reference, local: true } : reference;
}

/**
 * The arguments of a subscripted type: `Literal["a"]`, `t.Optional["X"]`.
 * @param node The syntax.
 * @returns Its arguments, or none for syntax that subscripts nothing.
 */
function argumentsOf(node: Node): Node[] {
	if (node.type === "subscript") return node.childrenForFieldName("subscript");
	const parameters =
		node.type === "generic_type"
			? node.namedChildren.find((child) => child.type === "type_parameter")
			: undefined;
	return parameters?.namedChildren ?? [];
}

/**
 * Whether a string sits where `Literal` or `Annotated` takes a value.
 * @param at Syntax that holds the string.
 * @param string The string.
 * @returns True when the syntax subscripts one of them and the string is a value argument.
 */
function aValue(at: Node, string: Node): boolean {
	const name = at.type === "subscript" ? at.childForFieldName("value") : at.namedChildren[0];
	const from = VALUES_FROM.get(name?.text.split(".").at(-1) ?? "");
	if (from === undefined) return false;
	return argumentsOf(at).findIndex((argument) => holds(argument, string)) >= from;
}

/**
 * Whether a node is a whole annotation: a type no other type syntax holds.
 * @param node The node.
 * @returns True for the type of a parameter, a return, an assignment or an alias.
 */
function isAnnotation(node: Node): boolean {
	return node.type === "type" && !TYPE_SYNTAX.has(node.parent?.type ?? "");
}

/**
 * Whether a string in an annotation stands for a type, as a forward reference
 * does (`"Flask"`, `t.Optional["Flask"]`): it sits where a type sits, and not
 * where `Literal` or `Annotated` takes a value or in a call.
 * @param string The string.
 * @returns True for a forward reference.
 */
function forwardReference(string: Node): boolean {
	for (let at = string.parent; at !== null; at = at.parent) {
		if (!TYPE_SYNTAX.has(at.type) || aValue(at, string)) return false;
		if (isAnnotation(at)) return true;
	}
	return false;
}

/**
 * The names the string annotations write, each a use as a type.
 * @param types The annotations, nested or not, and the bodies of `if TYPE_CHECKING:`.
 * @param unparsed The file's unparsed code.
 * @returns The references.
 */
function annotatedReferences(types: readonly Node[], unparsed: Spans): Reference[] {
	const strings = new Map<number, Node>();
	for (const node of types) {
		if (node.type !== "type") continue;
		for (const string of node.descendantsOfType("string")) strings.set(string.id, string);
	}
	return [...strings.values()].filter(forwardReference).flatMap((string) =>
		string.namedChildren.flatMap((content) => {
			if (content.type !== "string_content" || unparsed.holds(content.startIndex)) return [];
			const line = content.startPosition.row + 1;
			return (content.text.match(ANNOTATED) ?? [])
				.filter((name) => !CONSTANTS.has(name))
				.map((symbol): Reference => ({
					symbol,
					line,
					via: "code",
					kind: "import",
					typeOnly: true,
				}));
		}),
	);
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
 * Every use the file makes of a name, in code and in the strings that count.
 * @param captured The captures.
 * @param context The file's declared names and spans.
 * @returns The references, in document order within each kind.
 */
function referencesOf(captured: Captured, context: UseContext): Use[] {
	const shadows = shadowsOf(captured.import, boundNames(captured));
	const inCode = captured.reference.flatMap((node) => codeReference(node, context, shadows) ?? []);
	const inStrings = [
		...captured.environment.map((node) => stringReference(node, "environment", context.unparsed)),
		...captured.event.map((node) => stringReference(node, "event", context.unparsed)),
	].filter((reference) => reference !== undefined);
	return [...inCode, ...annotatedReferences(captured.type, context.unparsed), ...inStrings];
}

/**
 * The names a file writes where it binds them, which are therefore not uses:
 * the names it declares, assigns, takes as parameters or loops over.
 * @param captured The captures.
 * @returns The names.
 */
function boundNames(captured: Captured): Node[] {
	return [...captured.definition, ...captured.binding, ...captured.target.flatMap(targetNames)];
}

/**
 * The ids of the names a file binds where it writes them.
 * @param captured The captures.
 * @returns The ids.
 */
function declaredNames(captured: Captured): Set<number> {
	return new Set(boundNames(captured).map((node) => node.id));
}

/**
 * The text of a plain string, one with no interpolation.
 * @param node A node of a list.
 * @returns The text, or undefined for anything but a plain string.
 */
function plainString(node: Node): string | undefined {
	if (node.type !== "string") return undefined;
	const parts = node.namedChildren.filter(
		(part) => part.type !== "string_start" && part.type !== "string_end",
	);
	return parts.every((part) => part.type === "string_content")
		? parts.map((part) => part.text).join("")
		: undefined;
}

/**
 * The names one value given to `__all__` spells out.
 * @param value A list, a tuple, or the arguments of `append()`.
 * @returns The names, or undefined for a value that is not strings alone.
 */
function namesIn(value: Node): string[] | undefined {
	if (!NAME_LISTS.has(value.type)) return undefined;
	const names = value.namedChildren.filter((item) => item.type !== "comment").map(plainString);
	return names.every((name) => name !== undefined) ? names : undefined;
}

/**
 * The names `__all__` lists, where the module spells them out: lists and
 * tuples of strings it is set to, added with `+=` or passed to `extend()`,
 * and the strings passed to `append()`.
 * @param captured The captures.
 * @returns The names, or undefined when the module never sets `__all__` or
 *   builds it any other way (`base.__all__ + [...]`): its names are then read
 *   by the leading underscore, as in a module without one.
 */
function listedNames(captured: Captured): Set<string> | undefined {
	if (captured.all.length === 0) return undefined;
	const lists = captured.all.map(namesIn);
	return lists.every((names) => names !== undefined) ? new Set(lists.flat()) : undefined;
}

/**
 * The import that brings in the first names of a use: the longest local name
 * of an import that the use's spelling starts with.
 * @param symbol The use's spelling.
 * @param locals Each local name an import brings in, with its import's index.
 * @returns The import and the local name, or undefined.
 */
function throughImport(
	symbol: string,
	locals: ReadonlyMap<string, number>,
): ReferenceThroughImport | undefined {
	const names = symbol.split(".");
	for (let count = names.length; count > 0; count -= 1) {
		const local = names.slice(0, count).join(".");
		const index = locals.get(local);
		if (index !== undefined) return { import: index, local };
	}
	return undefined;
}

/**
 * Each local name the file's imports bring in, the first import of a name
 * winning; a `*` import brings in names nobody can list here.
 * @param imports The file's imports.
 * @returns Each local name and its import's index.
 */
function localsOf(imports: readonly Import[]): Map<string, number> {
	const locals = new Map<string, number>();
	imports.forEach((found, index) => {
		for (const name of found.names) {
			if (name.local !== "*" && !locals.has(name.local)) locals.set(name.local, index);
		}
	});
	return locals;
}

/**
 * The imports with each name marked type-only where only types use it.
 * @param imports The imports as written.
 * @param references Every use, before duplicates are dropped.
 * @param locals Each local name and its import's index.
 * @returns The imports.
 */
function withUses(
	imports: readonly Import[],
	references: readonly Use[],
	locals: ReadonlyMap<string, number>,
): Import[] {
	const runtime = new Map<string, boolean>();
	for (const reference of references) {
		const through = reachesImport(reference) ? throughImport(reference.symbol, locals) : undefined;
		if (through === undefined) continue;
		runtime.set(through.local, (runtime.get(through.local) ?? false) || !reference.typeOnly);
	}
	return imports.map((found) => {
		if (found.reexport) return found;
		const names = found.names.map((name): ImportedName => ({
			...name,
			typeOnly: name.typeOnly || runtime.get(name.local) === false,
		}));
		const typeOnly = found.typeOnly || (names.length > 0 && names.every((name) => name.typeOnly));
		return { ...found, names, typeOnly };
	});
}

/**
 * Whether a use can reach an import: a use in code of a name no scope around
 * it binds for itself.
 * @param use The use.
 * @returns True when an import of its first name reaches it.
 */
function reachesImport(use: Use): boolean {
	return use.via === "code" && use.local !== true;
}

/**
 * The references of a file, one for each spelling and way of use at the
 * first line it occurs, each with the import it reaches through.
 * @param uses Every use.
 * @param locals Each local name and its import's index.
 * @returns The references.
 */
function distinct(
	uses: readonly Use[],
	locals: ReadonlyMap<string, number>,
): ParsedFacts["references"] {
	const seen = new Map<string, ParsedFacts["references"][number]>();
	for (const use of uses) {
		const { local, ...reference } = use;
		const key = `${use.via}\0${use.symbol}\0${String(use.typeOnly)}\0${String(use.asValue)}\0${String(local === true)}`;
		if (seen.has(key)) continue;
		const through = reachesImport(use) ? throughImport(use.symbol, locals) : undefined;
		seen.set(key, through === undefined ? reference : { ...reference, through });
	}
	return [...seen.values()];
}

/**
 * The code facts of one parsed Python file, before its imports are resolved.
 * @param tree The file's syntax tree.
 * @param grammar The grammar it was parsed with.
 * @returns The facts.
 */
function pythonFacts(tree: Tree, grammar: Grammar): ParsedFacts {
	const captured = sorted(grammar.query.captures(tree.rootNode));
	const unparsed = spansOf(captured.unparsed);
	const types = spansOf(captured.type);
	const context: UseContext = {
		declared: declaredNames(captured),
		skip: spansOf(captured.skip),
		unparsed,
		types,
	};
	const written = [
		...captured.import
			.filter((node) => !unparsed.holds(node.startIndex))
			.flatMap((node) => staticImports(node, types.holds(node.startIndex))),
		...captured.dynamic.filter((node) => !unparsed.holds(node.startIndex)).map(dynamicImport),
	];
	const locals = localsOf(written);
	const references = referencesOf(captured, context);
	const listed = listedNames(captured);
	return {
		definitions: definitionsOf(captured.definition, captured.target, { unparsed, listed }),
		references: distinct(references, locals),
		imports: [...withUses(written, references, locals), ...passedOn(written, listed)],
		unparsed: unparsedOf(captured.unparsed),
	};
}

export { pythonFacts };
