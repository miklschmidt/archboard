// What a TypeScript or TSX file defines: each declaration at module level,
// and each member of one, with the visibility TypeScript gives it.
//
// A declaration inside a function body is local to that body, so a part never
// stands for it and it is not a definition of the file. A member is qualified
// by the names that hold it: `Ledger.post`, `api.read`, `Color.Red`.

import type { Node } from "web-tree-sitter";
import type { Definition } from "#runtime/operations/code-facts/facts.ts";
import { sourceRange, type Spans } from "#runtime/operations/code-facts/spans.ts";

/** The syntax that can hold a declaration and keep it at module level. */
const HOLDERS = new Set([
	"export_statement",
	"ambient_declaration",
	"lexical_declaration",
	"variable_declaration",
	"variable_declarator",
	"object",
	"pair",
	"class_body",
	"class_declaration",
	"abstract_class_declaration",
	"class",
	"interface_body",
	"interface_declaration",
	"object_type",
	"type_alias_declaration",
	"enum_body",
	"enum_declaration",
	"enum_assignment",
	"internal_module",
	"module",
	"expression_statement",
	"object_pattern",
	"pair_pattern",
	"array_pattern",
	"as_expression",
	"satisfies_expression",
	"parenthesized_expression",
]);

/** The field that names what a holder holds, for each holder that names it. */
const NAME_FIELD: Readonly<Record<string, string>> = {
	class_declaration: "name",
	abstract_class_declaration: "name",
	interface_declaration: "name",
	enum_declaration: "name",
	internal_module: "name",
	type_alias_declaration: "name",
	variable_declarator: "name",
	pair: "key",
};

/** The syntax of a name a holder can give, as opposed to a pattern, a string or a computed key. */
const NAMES = new Set([
	"identifier",
	"type_identifier",
	"property_identifier",
	"nested_identifier",
]);

/** The syntax of a member: of a class, an interface, an object type, an object or an enum. */
const MEMBERS = new Set([
	"method_definition",
	"public_field_definition",
	"method_signature",
	"abstract_method_signature",
	"property_signature",
	"pair",
	"enum_assignment",
	"enum_body",
	"object",
]);

/** Patterns whose names a module-level destructuring declares. */
const PATTERNS = new Set(["object_pattern", "pair_pattern", "array_pattern"]);

/** Statement wrappers whose modifiers and initializer belong to a declaration's source. */
const SOURCE_WRAPPERS = new Set([
	...PATTERNS,
	"variable_declarator",
	"lexical_declaration",
	"variable_declaration",
	"export_statement",
	"ambient_declaration",
]);

/** Callable declarations and literals, including object and class methods. */
const FUNCTIONS = new Set([
	"function_declaration",
	"generator_function_declaration",
	"function_signature",
	"method_definition",
	"method_signature",
	"abstract_method_signature",
	"arrow_function",
	"function_expression",
	"generator_function",
]);
/** Declarations and expressions of types with named members. */
const CLASSES = new Set([
	"class_declaration",
	"abstract_class_declaration",
	"class",
	"interface_declaration",
	"enum_declaration",
]);

/**
 * The kind syntax proves, including callable and class literals assigned to a name.
 * @param declaration The declaration or its value.
 * @returns Its kind.
 */
function declaredKind(declaration: Node): Definition["kind"] | undefined {
	if (
		declaration.type === "method_definition" &&
		declaration.children.some((child) => child.type === "get" || child.type === "set")
	)
		return "value";
	if (FUNCTIONS.has(declaration.type)) return "function";
	return CLASSES.has(declaration.type) ? "class" : undefined;
}

/**
 * The kind of a declaration or a literal assigned through an expression wrapper.
 * @param declaration The declaration or expression.
 * @returns Its kind.
 */
function kindOf(declaration: Node): Definition["kind"] {
	const kind = declaredKind(declaration);
	if (kind !== undefined) return kind;
	const wrapper = ["as_expression", "satisfies_expression", "parenthesized_expression"].includes(
		declaration.type,
	);
	const value = wrapper ? declaration.namedChildren[0] : declaration.childForFieldName("value");
	return value == null ? "value" : kindOf(value);
}

/**
 * The declaration a name belongs to: the name itself for an enum member, a
 * shorthand object member or a destructured name, else its parent.
 * @param name The captured name.
 * @returns The declaration.
 */
function declarationOf(name: Node): Node {
	const parent = name.parent;
	if (parent === null) return name;
	const itself =
		parent.type === "enum_body" || parent.type === "object" || PATTERNS.has(parent.type);
	return itself ? name : parent;
}

/**
 * A declaration's source, including its statement keywords and export modifiers.
 * @param declaration The declaration.
 * @returns Its source node; a shared variable statement stays one source range.
 */
function sourceOf(declaration: Node): Node {
	let at = declaration;
	while (at.parent !== null && SOURCE_WRAPPERS.has(at.parent.type)) at = at.parent;
	return at;
}

/**
 * Whether a statement block is the body of a namespace, which holds
 * module-level declarations of its own.
 * @param node The node.
 * @returns True for a namespace's body.
 */
function isNamespaceBody(node: Node): boolean {
	const holder = node.parent?.type;
	return node.type === "statement_block" && (holder === "internal_module" || holder === "module");
}

/**
 * Whether a declaration is at module level, or a member of one there.
 * @param declaration The declaration.
 * @returns False for one inside a function body or an expression.
 */
function atModuleLevel(declaration: Node): boolean {
	for (let at = declaration.parent; at !== null; at = at.parent) {
		if (at.type === "program") return true;
		if (!HOLDERS.has(at.type) && !isNamespaceBody(at)) return false;
	}
	return false;
}

/**
 * The name a holder gives what it holds.
 * @param holder The holding node.
 * @returns Its name, or undefined when it names nothing.
 */
function holderName(holder: Node): string | undefined {
	const field = NAME_FIELD[holder.type];
	const name = field === undefined ? null : holder.childForFieldName(field);
	return name !== null && NAMES.has(name.type) ? name.text : undefined;
}

/**
 * A declaration's symbol, qualified by the names that hold it.
 * @param name The captured name.
 * @param declaration Its declaration.
 * @returns The symbol, such as `Ledger.post`.
 */
function qualifiedSymbol(name: Node, declaration: Node): string {
	const names = [name.text];
	for (let at = declaration.parent; at !== null; at = at.parent) {
		const holder = holderName(at);
		if (holder !== undefined) names.unshift(holder);
	}
	return names.join(".");
}

/**
 * The visibility of a member: the modifier it carries, or TypeScript's
 * default, `public`.
 * @param name The member's name.
 * @param declaration The member.
 * @returns `public`, `protected`, `private` or `#private`.
 */
function memberVisibility(name: Node, declaration: Node): string {
	if (name.type === "private_property_identifier") return "#private";
	return (
		declaration.children.find((child) => child.type === "accessibility_modifier")?.text ?? "public"
	);
}

/**
 * The visibility of a declaration: `export` or `export default` where an
 * export statement holds it or a top-level `export { ... }` names it, and
 * `module` otherwise.
 * @param name The declaration's name.
 * @param declaration The declaration.
 * @param exported The names the file exports by name.
 * @returns The visibility.
 */
function declarationVisibility(
	name: Node,
	declaration: Node,
	exported: ReadonlyMap<string, string>,
): string {
	for (let at = declaration.parent; at !== null; at = at.parent) {
		if (at.type === "export_statement") {
			return at.children.some((child) => child.type === "default") ? "export default" : "export";
		}
		if (isNamespaceBody(at)) return "module";
	}
	return exported.get(name.text) ?? "module";
}

/**
 * Whether what holds a declaration is exposed: the nearest holder the file
 * defines. A declaration no definition holds has nothing to hide it.
 * @param declaration The declaration.
 * @param exposure Whether each definition read so far is exposed, by its node.
 * @returns True when its holder is exposed or it has none.
 */
function holderExposed(declaration: Node, exposure: ReadonlyMap<number, boolean>): boolean {
	for (let at = declaration.parent; at !== null; at = at.parent) {
		const exposed = exposure.get(at.id);
		if (exposed !== undefined) return exposed;
	}
	return true;
}

/** What reading the definitions needs from the rest of the file. */
interface DefinitionContext {
	readonly unparsed: Spans;
	readonly exported: ReadonlyMap<string, string>;
}

/**
 * The visibility of a declaration, and whether that alone lets code outside
 * the file reach it.
 * @param name The declaration's name.
 * @param declaration The declaration.
 * @param exported The names the file exports by name.
 * @returns The visibility, and whether it exposes the declaration.
 */
function visibilityOf(
	name: Node,
	declaration: Node,
	exported: ReadonlyMap<string, string>,
): { readonly visibility: string; readonly own: boolean } {
	if (MEMBERS.has(declaration.type) || MEMBERS.has(name.parent?.type ?? "")) {
		const visibility = memberVisibility(name, declaration);
		return { visibility, own: visibility === "public" };
	}
	const visibility = declarationVisibility(name, declaration, exported);
	return { visibility, own: visibility.startsWith("export") };
}

/**
 * The definition one captured name declares, where it is at module level.
 * @param name The captured name.
 * @param context The file's unparsed code and exported names.
 * @param exposure Whether each definition read so far is exposed; this one joins it.
 * @returns The definition, or undefined for a local or unparsed declaration.
 */
function definitionOf(
	name: Node,
	context: DefinitionContext,
	exposure: Map<number, boolean>,
): Definition | undefined {
	const declaration = declarationOf(name);
	if (context.unparsed.holds(name.startIndex) || !atModuleLevel(declaration)) return undefined;
	const { visibility, own } = visibilityOf(name, declaration, context.exported);
	const exposed = own && holderExposed(declaration, exposure);
	exposure.set(declaration.id, exposed);
	return {
		symbol: qualifiedSymbol(name, declaration),
		kind: kindOf(declaration),
		start: declaration.startPosition.row + 1,
		end: declaration.endPosition.row + 1,
		source: sourceRange(sourceOf(declaration)),
		visibility,
		exposed,
	};
}

/**
 * The names a file exports by name, with no declaration of their own there:
 * `export { name }`, `export { name as default }` and `export default name`.
 * @param names The names of `export { ... }`.
 * @param defaults The names of `export default`.
 * @returns Each name and its visibility.
 */
function exportedNames(names: readonly Node[], defaults: readonly Node[]): Map<string, string> {
	const exported = new Map<string, string>();
	for (const name of names) {
		const alias = name.parent?.childForFieldName("alias")?.text;
		exported.set(name.text, alias === "default" ? "export default" : "export");
	}
	for (const name of defaults) exported.set(name.text, "export default");
	return exported;
}

/**
 * Every definition of a file, in the order the file declares them.
 * @param names Each captured definition name, in document order.
 * @param context The file's unparsed code and exported names.
 * @returns The definitions.
 */
function definitionsOf(names: readonly Node[], context: DefinitionContext): Definition[] {
	const exposure = new Map<number, boolean>();
	return names.flatMap((name) => definitionOf(name, context, exposure) ?? []);
}

export { type DefinitionContext, definitionsOf, exportedNames };
