// The TypeScript and TSX adapter (ADR 0046): the code facts of one file from
// the captures of `typescript.scm`.
//
// A name in a comment is never captured. A name in a string counts only as
// the name of an environment value (`process.env.NAME`, `env["NAME"]`) or of
// an event (the first string argument of `on`, `emit`, `addEventListener` and
// their kin, or of `new Event`): those are the two strings ADR 0046 lets an
// anchor cite. Every other string is text, such as a message or a key. Code
// in a part of the file that did not parse holds no facts; the names written
// there are kept, so a symbol found only there is skipped, never missing.

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
import { spansOf, type Spans } from "@/runtime/code-facts/lib/spans";
import { definitionsOf, exportedNames } from "@/runtime/code-facts/lib/typescript-definitions";
import { dynamicImport, staticImport } from "@/runtime/code-facts/lib/typescript-imports";
import { unparsedOf } from "@/runtime/code-facts/lib/unparsed";

/** The captures of one file, by what the query calls them. */
interface Captured {
	readonly definition: Node[];
	readonly binding: Node[];
	readonly reference: Node[];
	readonly property: Node[];
	readonly environment: Node[];
	readonly event: Node[];
	readonly import: Node[];
	readonly dynamic: Node[];
	readonly exportName: Node[];
	readonly exportDefault: Node[];
	readonly type: Node[];
	readonly skip: Node[];
	readonly unparsed: Node[];
}

/** Which list each capture of the query joins; a capture named `_...` only constrains a pattern. */
const LIST_OF: Readonly<Record<string, keyof Captured>> = {
	definition: "definition",
	binding: "binding",
	reference: "reference",
	"reference.property": "property",
	environment: "environment",
	event: "event",
	import: "import",
	"import.dynamic": "dynamic",
	"export.name": "exportName",
	"export.default": "exportDefault",
	type: "type",
	skip: "skip",
	unparsed: "unparsed",
};

/** JSX tags that name an element of the host, `<div>`, not a component. */
const JSX_TAGS = new Set([
	"jsx_opening_element",
	"jsx_closing_element",
	"jsx_self_closing_element",
]);

/** The syntax in which each kind of name is part of a qualified spelling. */
const QUALIFIED_IN: Readonly<Record<string, string>> = {
	property_identifier: "member_expression",
	type_identifier: "nested_type_identifier",
};

/**
 * Sort the captures into their lists.
 * @param captures The captures, in document order.
 * @returns The lists.
 */
function sorted(captures: readonly QueryCapture[]): Captured {
	const lists: Captured = {
		definition: [],
		binding: [],
		reference: [],
		property: [],
		environment: [],
		event: [],
		import: [],
		dynamic: [],
		exportName: [],
		exportDefault: [],
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
 * @param node A member expression or a name.
 * @returns The spelling, or undefined when the chain starts at something else.
 */
function chain(node: Node): string | undefined {
	if (node.type === "identifier") return node.text;
	if (node.type !== "member_expression") return undefined;
	const object = node.childForFieldName("object");
	const property = node.childForFieldName("property");
	const base = object === null ? undefined : chain(object);
	return base === undefined || property === null ? undefined : `${base}.${property.text}`;
}

/**
 * How a used name is spelled: through `.` from a name where the code writes
 * it so, else the name alone.
 * @param node The name.
 * @returns The spelling.
 */
function spelling(node: Node): string {
	const parent = node.parent;
	if (parent === null || QUALIFIED_IN[node.type] !== parent.type) return node.text;
	return parent.type === "member_expression"
		? (chain(parent) ?? node.text)
		: parent.text.replaceAll(/\s/gu, "");
}

/** What deciding whether a captured name is a use needs. */
interface UseContext {
	readonly declared: ReadonlySet<number>;
	readonly skip: Spans;
	readonly unparsed: Spans;
	readonly types: Spans;
}

/**
 * Whether a captured name is not a use: a declared name, a name in an import
 * clause, in unparsed code, or the tag of a host element.
 * @param node The name.
 * @param context The file's declared names and spans.
 * @returns True when it is not a use.
 */
function notAUse(node: Node, context: UseContext): boolean {
	if (context.declared.has(node.id) || context.skip.holds(node.startIndex)) return true;
	return context.unparsed.holds(node.startIndex) || isHostTag(node);
}

/**
 * Whether a name is the tag of a host element, `<div>`, which names no code.
 * @param node The name.
 * @returns True for a lowercase JSX tag.
 */
function isHostTag(node: Node): boolean {
	return JSX_TAGS.has(node.parent?.type ?? "") && /^[a-z]/u.test(node.text);
}

/**
 * A use of a name in code.
 * @param node The name.
 * @param context The file's declared names and spans.
 * @returns The reference, or undefined when the name is not a use.
 */
function codeReference(node: Node, context: UseContext): Reference | undefined {
	if (notAUse(node, context)) return undefined;
	const typeOnly = node.type === "type_identifier" || context.types.holds(node.startIndex);
	return {
		symbol: spelling(node),
		line: node.startPosition.row + 1,
		via: "code",
		kind: typeOnly ? "import" : "call",
		typeOnly,
	};
}

/**
 * A name a string counts as.
 * @param node The name.
 * @param via Whether it names an environment value or an event.
 * @param unparsed The file's unparsed code.
 * @returns The reference, or undefined inside unparsed code.
 */
function stringReference(node: Node, via: ReferenceVia, unparsed: Spans): Reference | undefined {
	if (unparsed.holds(node.startIndex)) return undefined;
	return { symbol: node.text, line: node.startPosition.row + 1, via, typeOnly: false };
}

/** Whether a name is used at all, and whether at run time. */
interface Use {
	runtime: boolean;
}

/**
 * How the file uses each name it starts a reference with.
 * @param references Every reference, before duplicates are dropped.
 * @returns Each first name and whether any use of it is at run time.
 */
function usesOf(references: readonly Reference[]): Map<string, Use> {
	const uses = new Map<string, Use>();
	for (const reference of references) {
		if (reference.via !== "code") continue;
		const first = reference.symbol.split(".")[0] ?? reference.symbol;
		const use = uses.get(first) ?? { runtime: false };
		use.runtime ||= !reference.typeOnly;
		uses.set(first, use);
	}
	return uses;
}

/**
 * An import with each name marked type-only where only types use it.
 * @param found The import as written.
 * @param uses How the file uses each name.
 * @returns The import.
 */
function withUses(found: Import, uses: ReadonlyMap<string, Use>): Import {
	if (found.reexport) return found;
	const names = found.names.map((name): ImportedName => {
		const use = uses.get(name.local);
		return { ...name, typeOnly: name.typeOnly || (use !== undefined && !use.runtime) };
	});
	const typeOnly = found.typeOnly || (names.length > 0 && names.every((name) => name.typeOnly));
	return { ...found, names, typeOnly };
}

/**
 * The import that brings in a reference's first name.
 * @param reference The reference.
 * @param imported Each local name an import brings in, with its import's index.
 * @returns The import and the name, or undefined when no import brings it in.
 */
function throughImport(
	reference: Reference,
	imported: ReadonlyMap<string, number>,
): ReferenceThroughImport | undefined {
	if (reference.via !== "code") return undefined;
	const first = reference.symbol.split(".")[0] ?? "";
	const index = imported.get(first);
	return index === undefined ? undefined : { import: index, local: first };
}

/**
 * The references of a file, one for each spelling and way of use at the
 * first line it occurs, each with the import it reaches through.
 * @param references Every reference.
 * @param imports The file's imports.
 * @returns The references.
 */
function distinct(
	references: readonly Reference[],
	imports: readonly Import[],
): ParsedFacts["references"] {
	const imported = new Map(
		imports.flatMap((found, index) =>
			found.reexport ? [] : found.names.map((name) => [name.local, index] as const),
		),
	);
	const seen = new Map<string, ParsedFacts["references"][number]>();
	for (const reference of references) {
		const key = `${reference.via}\0${reference.symbol}\0${String(reference.typeOnly)}`;
		if (seen.has(key)) continue;
		const through = throughImport(reference, imported);
		seen.set(key, through === undefined ? reference : { ...reference, through });
	}
	return [...seen.values()];
}

/**
 * Every use the file makes of a name, in code and in the strings that count.
 * @param captured The captures.
 * @param context The file's declared names and spans.
 * @returns The references, in document order within each kind.
 */
function referencesOf(captured: Captured, context: UseContext): Reference[] {
	const inCode = [...captured.reference, ...captured.property]
		.toSorted((left, right) => left.startIndex - right.startIndex)
		.flatMap((node) => codeReference(node, context) ?? []);
	const inStrings = [
		...captured.environment.map((node) => stringReference(node, "environment", context.unparsed)),
		...captured.event.map((node) => stringReference(node, "event", context.unparsed)),
	].filter((reference) => reference !== undefined);
	return [...inCode, ...inStrings];
}

/**
 * The names a file declares where it writes them, which are therefore not uses.
 * A shorthand member of an object, `{ name }`, declares a member and uses the
 * name both, so it stays a use.
 * @param captured The captures.
 * @returns The ids of the declared names.
 */
function declaredNames(captured: Captured): Set<number> {
	const declared = new Set(captured.binding.map((node) => node.id));
	for (const node of captured.definition) {
		if (node.type !== "shorthand_property_identifier") declared.add(node.id);
	}
	return declared;
}

/**
 * The code facts of one parsed file, before its imports are resolved.
 * @param tree The file's syntax tree.
 * @param grammar The grammar it was parsed with.
 * @returns The facts.
 */
function typeScriptFacts(tree: Tree, grammar: Grammar): ParsedFacts {
	const captured = sorted(grammar.query.captures(tree.rootNode));
	const unparsed = spansOf(captured.unparsed);
	const context: UseContext = {
		declared: declaredNames(captured),
		skip: spansOf(captured.skip),
		unparsed,
		types: spansOf(captured.type),
	};
	const exported = exportedNames(captured.exportName, captured.exportDefault);
	const references = referencesOf(captured, context);
	const uses = usesOf(references);
	const imports = [
		...captured.import.filter((node) => !unparsed.holds(node.startIndex)).map(staticImport),
		...captured.dynamic.filter((node) => !unparsed.holds(node.startIndex)).map(dynamicImport),
	].map((found) => withUses(found, uses));
	return {
		definitions: definitionsOf(captured.definition, { unparsed, exported }),
		references: distinct(references, imports),
		imports,
		unparsed: unparsedOf(captured.unparsed),
	};
}

export { typeScriptFacts };
