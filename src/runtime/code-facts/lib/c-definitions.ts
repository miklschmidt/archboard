// The definitions of a C or C++ file (ADR 0046, TASK-367.09), read by walking
// the declarations at file scope, in namespaces, in `extern "C"` blocks, under
// preprocessor conditions such as an include guard, and in class bodies.
//
// A name is qualified with `::` by the namespaces and classes that hold it, as
// C++ spells it: `shop::Ledger::post`. A namespace qualifies names but is no
// definition of its own, because one namespace spans many files. A function, a
// variable, a type, a typedef or alias, an enumerator and a macro are
// definitions; so is a prototype, because a header declares the interface of
// its source file with prototypes. A prototype, a method declared without its
// body and an `extern` variable with no value are marked as declarations:
// their code is in another file, or later in this one. A forward declaration
// (`struct Ledger;`) is not a definition, nor is an include guard, which
// names how the file guards itself rather than what it declares, nor anything
// inside a function body. A whole declaration inside an error node is read,
// because it parsed (c-unparsed.ts).
//
// Visibility is C's own word, which the file alone decides:
// - `extern`: a function or variable with external linkage, the default at
//   file scope. Code in another file can reach it.
// - `static`: internal linkage, reachable from this file only.
// - `anonymous namespace`: anything inside `namespace { }`, internal.
// - `no linkage`: a type, a typedef or alias, an enumerator. Any file that
//   includes this one can name it.
// - `macro`: a `#define`, which any file that includes this one can use.
// - `public`, `protected`, `private`: a member, by the access of its class
//   (a `class` starts private, a `struct` and a `union` public).
// A member is exposed when it is public and its class is exposed. A member
// defined outside its class (`void Ledger::post() {}`) takes the access the
// class body in the same file gives it, else `extern`. Which header is public
// depends on paths, not on one file's bytes, so a part's bound code takes in
// the header of its source file instead (c-pairs.ts).

import type { Node } from "web-tree-sitter";
import { declaratorKind, namesFunction } from "@/runtime/code-facts/lib/c-definition-kind";
import type { Definition } from "@/runtime/code-facts/lib/facts";
import { sourceRange } from "@/runtime/code-facts/lib/spans";

/** Where a declaration stands: the names that qualify it, and whether an anonymous namespace holds it. */
interface Scope {
	readonly names: readonly string[];
	readonly internal: boolean;
}

/** What holds the members of a class body: its qualified name, its access so far, and whether it is exposed. */
interface Holder {
	readonly symbol: string;
	readonly exposed: boolean;
	access: string;
}

/** One declaration being walked: where it stands, what it spans, and the definitions so far. */
interface Walk {
	readonly definitions: Definition[];
	readonly scope: Scope;
	readonly holder?: Holder;
}

/** Reads the definitions of one kind of declaration. */
type Handler = (walk: Walk, node: Node, extent: Node) => void;

/** The specifiers of a type that can have a body. */
const TYPE_SPECIFIERS = new Set([
	"class_specifier",
	"struct_specifier",
	"union_specifier",
	"enum_specifier",
]);

/** Nodes that are a name, or stand for one, at the end of a declarator. */
const NAMES = new Set([
	"identifier",
	"field_identifier",
	"type_identifier",
	"qualified_identifier",
	"destructor_name",
	"operator_name",
	"template_function",
	"template_type",
]);

/** A function's name as a macro before a namespace makes the grammar read it: `namespace detail`. */
const MISREAD_NAMESPACE = /^namespace\b\s*([\w:\s]*)$/u;

/** The visibility words of a member of a class. */
const MEMBER_ACCESS = new Set(["public", "protected", "private"]);

/**
 * How C++ spells a name with a qualifier: its scope and its name joined by `::`.
 * @param node The qualified name.
 * @returns The spelling.
 */
function spellQualified(node: Node): string {
	const scope = node.childForFieldName("scope");
	const name = node.childForFieldName("name");
	const rest = name === null ? "" : spell(name);
	return scope === null ? rest : `${spell(scope)}::${rest}`;
}

/**
 * How C++ spells a template's name: without its arguments.
 * @param node The template type, function or method.
 * @returns The spelling.
 */
function spellTemplate(node: Node): string {
	const name = node.childForFieldName("name");
	return name === null ? node.text : spell(name);
}

/** How each kind of qualified name is spelled. */
const SPELLINGS: Readonly<Record<string, (node: Node) => string>> = {
	qualified_identifier: spellQualified,
	template_type: spellTemplate,
	template_function: spellTemplate,
	template_method: spellTemplate,
};

/**
 * How C++ spells a name: the names of a qualified one joined by `::`, with
 * no template arguments and no spaces.
 * @param node The name.
 * @returns The spelling.
 */
function spell(node: Node): string {
	return SPELLINGS[node.type]?.(node) ?? node.text.replaceAll(/\s+/gu, "");
}

/**
 * The name a declarator declares, through pointers, references, arrays,
 * parentheses, initializers and parameter lists.
 * @param node The declarator.
 * @returns The name, or undefined for an abstract declarator.
 */
function declaredName(node: Node | null): Node | undefined {
	for (let at = node; at !== null;) {
		if (NAMES.has(at.type)) return at;
		at = at.childForFieldName("declarator") ?? at.namedChildren[0] ?? null;
	}
	return undefined;
}

/**
 * The visibility of a name in a walk: its member access, or its linkage.
 * @param walk Where it stands.
 * @param linkage Its word at namespace scope.
 * @returns The word, and whether it is exposed.
 */
function visibilityOf(walk: Walk, linkage: string): { word: string; exposed: boolean } {
	const { holder, scope } = walk;
	if (holder !== undefined) {
		return { word: holder.access, exposed: holder.exposed && holder.access === "public" };
	}
	if (scope.internal) return { word: "anonymous namespace", exposed: false };
	return { word: linkage, exposed: linkage !== "static" };
}

/**
 * A name qualified by the class or the namespaces it stands in.
 * @param walk Where it stands.
 * @param name Its own name.
 * @returns The qualified name.
 */
function qualified(walk: Walk, name: string): string {
	const qualifier = walk.holder?.symbol ?? walk.scope.names.join("::");
	return qualifier === "" ? name : `${qualifier}::${name}`;
}

/**
 * Note one definition, qualified by where it stands.
 * @param walk Where it stands.
 * @param name Its own name.
 * @param extent The node it spans.
 * @param linkage Its word at namespace scope.
 * @param kind Its definition kind.
 * @param declares Whether its code is elsewhere: a prototype or an `extern` variable.
 * @returns Its qualified symbol.
 */
function define(
	walk: Walk,
	name: string,
	extent: Node,
	linkage: string,
	kind: Definition["kind"],
	declares = false,
): string {
	const symbol = qualified(walk, name);
	const { word, exposed } = visibilityOf(walk, linkage);
	walk.definitions.push({
		symbol,
		kind,
		start: extent.startPosition.row + 1,
		end: extent.endPosition.row + 1,
		source: sourceRange(extent),
		visibility: word,
		exposed,
		...(declares ? { declaration: true as const } : {}),
	});
	return symbol;
}

/**
 * Whether a declaration names code that is elsewhere: a function or method
 * declared without its body, or an `extern` variable with no value.
 * @param node The function definition, declaration or field declaration.
 * @param declarator One of its declarators.
 * @param name The name it declares.
 * @returns True when it does.
 */
function declaresOnly(node: Node, declarator: Node, name: Node): boolean {
	if (node.type === "function_definition") return false;
	if (namesFunction(name)) return true;
	const isExtern = node.namedChildren.some(
		(child) => child.type === "storage_class_specifier" && child.text === "extern",
	);
	return isExtern && declarator.type !== "init_declarator";
}

/**
 * Walk one declaration by its kind.
 * @param walk Where it stands.
 * @param node The declaration.
 * @param extent What it spans: a template declaration around it, or itself.
 */
function declaration(walk: Walk, node: Node, extent: Node): void {
	const handler = TYPE_SPECIFIERS.has(node.type) ? typeSpecifier : HANDLERS[node.type];
	handler?.(walk, node, extent);
}

/**
 * Walk every declaration among a node's children.
 * @param walk Where they stand.
 * @param node A file, a namespace body, a class body or a preprocessor condition.
 */
function children(walk: Walk, node: Node): void {
	for (const child of node.namedChildren) declaration(walk, child, child);
}

/**
 * The declarations of a namespace's body, qualified by its name.
 * @param walk Where the namespace stands.
 * @param name Its name, `a::b` for a nested one; empty for an anonymous one, which is internal.
 * @param body Its body.
 */
function namespaceBody(walk: Walk, name: string, body: Node): void {
	const names = name === "" ? [] : name.split("::").map((each) => each.trim());
	const scope = {
		names: [...walk.scope.names, ...names],
		internal: walk.scope.internal || name === "",
	};
	children({ definitions: walk.definitions, scope }, body);
}

/**
 * A namespace: its body, qualified by its name, or internal when it has none.
 * @param walk Where it stands.
 * @param node The namespace definition.
 */
function namespace(walk: Walk, node: Node): void {
	const body = node.childForFieldName("body");
	if (body !== null) namespaceBody(walk, node.childForFieldName("name")?.text ?? "", body);
}

/**
 * The name of a namespace that a macro before it hides from the grammar:
 * `FMT_BEGIN_EXPORT namespace detail {` parses as a function named
 * `namespace::detail`, whose body holds the namespace's declarations. No
 * function can have that name, because `namespace` is a keyword. abseil opens
 * nearly every namespace after `ABSL_NAMESPACE_BEGIN`, 108,713 lines of 494
 * files.
 * @param node A function definition.
 * @returns The namespace's name, empty for an anonymous one, or undefined for a function.
 */
function misreadNamespace(node: Node): string | undefined {
	const declarator =
		node.type === "function_definition" ? node.childForFieldName("declarator") : null;
	const name = MISREAD_NAMESPACE.exec(declarator?.text ?? "")?.[1];
	return name?.replaceAll(/\s+/gu, "");
}

/** The specifiers of a type whose body holds members. */
const CLASS_SPECIFIERS = new Set(["class_specifier", "struct_specifier", "union_specifier"]);
/** A declarator that is a name alone, which declares no function. */
const BARE_NAMES = new Set(["identifier", "type_identifier"]);

/**
 * The class that a macro between `class` and its name hides from the grammar:
 * `class LEVELDB_EXPORT WriteBatch { ... }` parses as a function named
 * `WriteBatch` that returns `class LEVELDB_EXPORT`, whose body holds the
 * members, with an access word read as a label. A function's declarator names
 * its parameters, so one that is a bare name declares no function. leveldb
 * exports every public class of `include/leveldb` so.
 * @param node A function definition.
 * @returns The specifier, for the access its members start with, or undefined for a function.
 */
function misreadClass(node: Node): Node | undefined {
	const specifier = node.childForFieldName("type");
	const declarator = node.childForFieldName("declarator");
	if (specifier === null || declarator === null) return undefined;
	return hidesClass(specifier, declarator) ? specifier : undefined;
}

/**
 * Whether a function's return type and bare name are a class and its name.
 * @param specifier The function's return type.
 * @param declarator Its declarator.
 * @returns True for a class, struct or union with no body, before a bare name.
 */
function hidesClass(specifier: Node, declarator: Node): boolean {
	return (
		BARE_NAMES.has(declarator.type) &&
		CLASS_SPECIFIERS.has(specifier.type) &&
		specifier.childForFieldName("body") === null
	);
}

/**
 * Whether a function definition is a namespace or a class that a macro hid
 * from the grammar, so its names are no function's own.
 * @param node A function definition.
 * @returns True when it is.
 */
function isMisread(node: Node): boolean {
	return misreadNamespace(node) !== undefined || misreadClass(node) !== undefined;
}

/**
 * A function definition, or a namespace or a class a macro hid from the grammar.
 * @param walk Where it stands.
 * @param node The function definition.
 * @param extent What it spans.
 */
function functionDefinition(walk: Walk, node: Node, extent: Node): void {
	const body = node.childForFieldName("body");
	const namespaceName = misreadNamespace(node);
	const specifier = misreadClass(node);
	const name = node.childForFieldName("declarator");
	if (body !== null && namespaceName !== undefined) namespaceBody(walk, namespaceName, body);
	else if (body !== null && specifier !== undefined && name !== null) {
		classMembers(walk, specifier, body, define(walk, spell(name), extent, "no linkage", "class"));
	} else variables(walk, node, extent);
}

/**
 * A function, or a declaration of variables, prototypes or members, with any
 * type it defines on the way.
 * @param walk Where it stands.
 * @param node The function definition, declaration or field declaration.
 * @param extent What it spans.
 */
function variables(walk: Walk, node: Node, extent: Node): void {
	const type = node.childForFieldName("type");
	if (type !== null && TYPE_SPECIFIERS.has(type.type)) typeSpecifier(walk, type, type);
	const isStatic = node.namedChildren.some(
		(child) => child.type === "storage_class_specifier" && child.text === "static",
	);
	for (const declarator of node.childrenForFieldName("declarator")) {
		const name = declaredName(declarator);
		if (name === undefined) continue;
		const declares = declaresOnly(node, declarator, name);
		const kind = declaratorKind(name, declarator);
		define(walk, spell(name), extent, isStatic ? "static" : "extern", kind, declares);
	}
}

/**
 * A class, struct, union or enum with a body, and its members.
 * @param walk Where it stands.
 * @param node The specifier.
 * @param extent What it spans.
 * @param alias The name a typedef gives an anonymous one.
 */
function typeSpecifier(walk: Walk, node: Node, extent: Node, alias?: string): void {
	const body = node.childForFieldName("body");
	if (body === null) return;
	const named = node.childForFieldName("name");
	const symbol =
		named === null
			? alias === undefined
				? undefined
				: qualified(walk, alias)
			: define(walk, spell(named), extent, "no linkage", "class");
	if (symbol === undefined) return;
	if (node.type === "enum_specifier") enumerators(walk, node, body, symbol);
	else classMembers(walk, node, body, symbol);
}

/**
 * The members of a class, struct or union body.
 * @param walk Where the type stands.
 * @param node The specifier.
 * @param body Its body.
 * @param symbol The type's symbol.
 */
function classMembers(walk: Walk, node: Node, body: Node, symbol: string): void {
	const access = node.type === "class_specifier" ? "private" : "public";
	const { exposed } = visibilityOf(walk, "no linkage");
	children({ ...walk, holder: { symbol, exposed, access } }, body);
}

/**
 * Where the enumerators of an `enum class` stand: inside the enum, with the
 * access of a class that holds it.
 * @param walk Where the enum stands.
 * @param symbol The enum's symbol.
 * @returns The walk of its enumerators.
 */
function insideEnum(walk: Walk, symbol: string): Walk {
	if (walk.holder !== undefined) return { ...walk, holder: { ...walk.holder, symbol } };
	return {
		definitions: walk.definitions,
		scope: { names: [symbol], internal: walk.scope.internal },
	};
}

/**
 * The enumerators of an enum: qualified by the enum for `enum class`, else
 * by what holds the enum, as C++ scopes them.
 * @param walk Where the enum stands.
 * @param node The enum specifier.
 * @param body Its list of enumerators.
 * @param symbol The enum's own symbol.
 */
function enumerators(walk: Walk, node: Node, body: Node, symbol: string): void {
	const scoped = node.children.some((child) => child.type === "class" || child.type === "struct");
	const where = scoped ? insideEnum(walk, symbol) : walk;
	for (const enumerator of body.namedChildren) {
		const name = enumerator.childForFieldName("name");
		if (name !== null) define(where, name.text, enumerator, "no linkage", "value");
	}
}

/**
 * A typedef, and the type it defines on the way.
 * @param walk Where it stands.
 * @param node The type definition.
 * @param extent What it spans.
 */
function typedef(walk: Walk, node: Node, extent: Node): void {
	const names = node
		.childrenForFieldName("declarator")
		.map(declaredName)
		.filter((name) => name !== undefined)
		.map(spell);
	const type = node.childForFieldName("type");
	if (type !== null && TYPE_SPECIFIERS.has(type.type)) typeSpecifier(walk, type, type, names[0]);
	for (const name of names)
		define(
			walk,
			name,
			extent,
			"no linkage",
			type !== null && TYPE_SPECIFIERS.has(type.type) ? "class" : "value",
		);
}

/**
 * A template: the declaration it holds, spanning the template.
 * @param walk Where it stands.
 * @param node The template declaration.
 * @param extent What it spans.
 */
function templated(walk: Walk, node: Node, extent: Node): void {
	const held = node.namedChildren.at(-1);
	if (held !== undefined) declaration(walk, held, extent);
}

/**
 * An `extern "C"` block or declaration: what it holds.
 * @param walk Where it stands.
 * @param node The linkage specification.
 */
function linkageBlock(walk: Walk, node: Node): void {
	const body = node.childForFieldName("body");
	if (body?.type === "declaration_list") children(walk, body);
	else if (body !== null) declaration(walk, body, body);
}

/**
 * A `using` alias.
 * @param walk Where it stands.
 * @param node The alias declaration.
 * @param extent What it spans.
 */
function usingAlias(walk: Walk, node: Node, extent: Node): void {
	const name = node.childForFieldName("name");
	if (name !== null) define(walk, name.text, extent, "no linkage", "value");
}

/**
 * Whether a `#define` is an include guard: a macro with no value, defined
 * inside the `#ifndef` that tests it.
 * @param node The `#define`.
 * @param name Its name.
 * @returns True when it is.
 */
function isIncludeGuard(node: Node, name: Node): boolean {
	const condition = node.parent;
	return (
		node.childForFieldName("value") === null &&
		condition?.type === "preproc_ifdef" &&
		condition.childForFieldName("name")?.text === name.text
	);
}

/**
 * A macro, which no namespace or class qualifies.
 * @param walk Where it stands.
 * @param node The `#define`.
 */
function macro(walk: Walk, node: Node): void {
	const name = node.childForFieldName("name");
	if (name === null || isIncludeGuard(node, name)) return;
	const file: Walk = { definitions: walk.definitions, scope: { names: [], internal: false } };
	define(file, name.text, node, "macro", "value");
}

/** How each kind of declaration is read. */
const HANDLERS: Readonly<Record<string, Handler>> = {
	translation_unit: children,
	ERROR: children,
	declaration_list: children,
	preproc_if: children,
	preproc_ifdef: children,
	preproc_else: children,
	preproc_elif: children,
	preproc_elifdef: children,
	namespace_definition: namespace,
	linkage_specification: linkageBlock,
	template_declaration: templated,
	function_definition: functionDefinition,
	declaration: variables,
	field_declaration: variables,
	type_definition: typedef,
	alias_declaration: usingAlias,
	preproc_def: macro,
	preproc_function_def: macro,
	/**
	 * A change of access in a class body.
	 * @param walk The class body's walk.
	 * @param node The access specifier.
	 */
	access_specifier: (walk, node) => {
		if (walk.holder !== undefined) walk.holder.access = node.text.replace(/:$/u, "").trim();
	},
	/**
	 * A member of a class a macro hid, with `public:` or another access word
	 * before it read as a label (misreadClass).
	 * @param walk The class body's walk.
	 * @param node The labeled statement.
	 */
	labeled_statement: (walk, node) => {
		const label = node.childForFieldName("label")?.text ?? "";
		if (walk.holder !== undefined && MEMBER_ACCESS.has(label)) walk.holder.access = label;
		const statement = node.namedChildren.at(-1);
		if (statement !== undefined) declaration(walk, statement, statement);
	},
};

/**
 * A member defined outside its class takes the access its class body gives
 * it in the same file.
 * @param definitions The definitions, in the order they were found.
 * @returns The definitions, each out-of-class member with its member's visibility.
 */
function withMemberAccess(definitions: readonly Definition[]): Definition[] {
	const members = new Map<string, Definition>();
	for (const definition of definitions) {
		if (MEMBER_ACCESS.has(definition.visibility) && !members.has(definition.symbol)) {
			members.set(definition.symbol, definition);
		}
	}
	return definitions.map((definition) => {
		const member = members.get(definition.symbol);
		if (member === undefined || definition.visibility !== "extern") return definition;
		return { ...definition, visibility: member.visibility, exposed: member.exposed };
	});
}

/**
 * The definitions of one parsed C or C++ file: every whole declaration, also
 * one inside an error node, and nothing of a part that did not parse.
 * @param root The file's root node.
 * @returns The definitions, in document order within each declaration.
 */
function cDefinitionsOf(root: Node): Definition[] {
	const definitions: Definition[] = [];
	children({ definitions, scope: { names: [], internal: false } }, root);
	return withMemberAccess(definitions);
}

export { cDefinitionsOf, isMisread, spell };
