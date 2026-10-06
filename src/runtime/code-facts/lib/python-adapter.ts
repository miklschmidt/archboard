// The Python adapter (ADR 0046): the code facts of one file from the captures
// of `python.scm`.
//
// A name in a comment or a docstring is never captured. A name in a string
// counts in three places only: as the name of an environment value
// (`os.environ["NAME"]`, `os.environ.get("NAME")`, `"NAME" in os.environ`,
// `os.getenv("NAME")`), as the name of an event (the first string argument of
// `signal`, `on`, `once` or `emit`, as blinker names Flask's signals), and as a
// name in a string annotation (`"Flask"`), which is how Python writes a type
// that it imports only for type checking. A bare `environ` is not read: in a
// WSGI application it is the request's environ, not the process's.
//
// An annotation and the body of `if TYPE_CHECKING:` are types, so a name used
// only there is import evidence and an import there is type-only. Every other
// use is at run time, a call. Code in a part of the file that did not parse
// holds no facts; the names written there are kept.

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
import { dynamicImport, staticImports } from "@/runtime/code-facts/lib/python-imports";
import { spansOf, type Spans } from "@/runtime/code-facts/lib/spans";
import { unparsedOf } from "@/runtime/code-facts/lib/unparsed";

/** The captures of one file, by what the query calls them. */
interface Captured {
	readonly definition: Node[];
	readonly target: Node[];
	readonly binding: Node[];
	readonly reference: Node[];
	readonly all: Node[];
	readonly allDeclared: Node[];
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
	"all.declared": "allDeclared",
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
		allDeclared: [],
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
 * The names a string annotation writes, each a use as a type.
 * @param types The annotations, nested or not.
 * @param unparsed The file's unparsed code.
 * @returns The references.
 */
function annotatedReferences(types: readonly Node[], unparsed: Spans): Reference[] {
	const outermost = types.filter((node) => node.type === "type" && node.parent?.type !== "type");
	return outermost.flatMap((node) =>
		node.descendantsOfType("string_content").flatMap((content) => {
			if (unparsed.holds(content.startIndex)) return [];
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
function referencesOf(captured: Captured, context: UseContext): Reference[] {
	const inCode = captured.reference.flatMap((node) => codeReference(node, context) ?? []);
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
 * @returns The ids of the names.
 */
function declaredNames(captured: Captured): Set<number> {
	return new Set(
		[...captured.definition, ...captured.binding, ...captured.target.flatMap(targetNames)].map(
			(node) => node.id,
		),
	);
}

/**
 * The names `__all__` lists, if the module sets it.
 * @param captured The captures.
 * @returns The names, or undefined when the module never sets `__all__`.
 */
function listedNames(captured: Captured): Set<string> | undefined {
	if (captured.all.length === 0 && captured.allDeclared.length === 0) return undefined;
	return new Set(
		captured.all.flatMap((list) =>
			list.namedChildren.flatMap((item) =>
				item.type === "string"
					? item.namedChildren
							.filter((part) => part.type === "string_content")
							.map((part) => part.text)
					: [],
			),
		),
	);
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
 * @param references Every reference, before duplicates are dropped.
 * @param locals Each local name and its import's index.
 * @returns The imports.
 */
function withUses(
	imports: readonly Import[],
	references: readonly Reference[],
	locals: ReadonlyMap<string, number>,
): Import[] {
	const runtime = new Map<string, boolean>();
	for (const reference of references) {
		const through = reference.via === "code" ? throughImport(reference.symbol, locals) : undefined;
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
 * The references of a file, one for each spelling and way of use at the
 * first line it occurs, each with the import it reaches through.
 * @param references Every reference.
 * @param locals Each local name and its import's index.
 * @returns The references.
 */
function distinct(
	references: readonly Reference[],
	locals: ReadonlyMap<string, number>,
): ParsedFacts["references"] {
	const seen = new Map<string, ParsedFacts["references"][number]>();
	for (const reference of references) {
		const key = `${reference.via}\0${reference.symbol}\0${String(reference.typeOnly)}`;
		if (seen.has(key)) continue;
		const through = reference.via === "code" ? throughImport(reference.symbol, locals) : undefined;
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
	return {
		definitions: definitionsOf(captured.definition, captured.target, {
			unparsed,
			listed: listedNames(captured),
		}),
		references: distinct(references, locals),
		imports: withUses(written, references, locals),
		unparsed: unparsedOf(captured.unparsed),
	};
}

export { pythonFacts };
