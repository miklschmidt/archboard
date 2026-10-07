// What a Python file defines: each function, class, type alias and assigned
// name at module level, and each member of a class there, with the
// visibility Python gives it.
//
// Python has no keyword for visibility, so the word is its rule. A module
// that sets `__all__` exposes exactly the names it lists (`__all__`, and
// `not in __all__` for the rest); a module without one exposes every name that
// does not start with `_` (`public`, and `non-public` for the rest), as
// `from module import *` reads it. A class member is `public`, `non-public`
// (`_name`) or `name-mangled` (`__name`, which Python renames outside the
// class); a special method such as `__init__` is public. A member is exposed
// when it is public and its class is exposed. Exposure means outside the file:
// what a package passes on through its `__init__.py` is TASK-368.10's.
//
// A declaration inside a function body is local to that body, so a part never
// stands for it. A name assigned under `if`, `try`, `with`, a loop or `match`
// at module level is still a module-level name.

import type { Node } from "web-tree-sitter";
import type { Definition } from "@/runtime/code-facts/lib/facts";
import type { Spans } from "@/runtime/code-facts/lib/spans";

/** The syntax that can hold a declaration and keep it at module level or in a class body. */
const HOLDERS = new Set([
	"block",
	"decorated_definition",
	"class_definition",
	"if_statement",
	"elif_clause",
	"else_clause",
	"try_statement",
	"except_clause",
	"except_group_clause",
	"finally_clause",
	"with_statement",
	"for_statement",
	"while_statement",
	"match_statement",
	"case_clause",
	"expression_statement",
	"assignment",
]);

/** The patterns whose names an assignment binds. */
const PATTERNS = new Set(["pattern_list", "tuple_pattern", "list_pattern", "list_splat_pattern"]);

/** What wraps a name inside its declaration: a pattern of an assignment, the type of an alias. */
const WRAPPERS = new Set([...PATTERNS, "type"]);

/** Callable declarations and types whose bodies define members. */
const KINDS: Readonly<Record<string, Definition["kind"]>> = {
	function_definition: "function",
	lambda: "function",
	class_definition: "class",
};
/** Syntax that holds the declaration or literal which decides a name's kind. */
const KIND_VALUES: Readonly<Record<string, string>> = {
	decorated_definition: "definition",
	assignment: "right",
};

/** What reading the definitions needs from the rest of the file. */
interface DefinitionContext {
	readonly unparsed: Spans;
	/** The names the module's `__all__` lists, or undefined when it sets none. */
	readonly listed: ReadonlySet<string> | undefined;
}

/**
 * The names an assignment target binds: a name, or every name of a pattern.
 * An attribute or a subscript binds none.
 * @param target The target.
 * @returns The names, in the order written.
 */
function targetNames(target: Node): Node[] {
	if (target.type === "identifier") return [target];
	return PATTERNS.has(target.type) ? target.namedChildren.flatMap(targetNames) : [];
}

/**
 * The declaration a captured name belongs to: the assignment of a target,
 * the alias statement of a type alias, a function or a class with its
 * decorators.
 * @param name The name.
 * @returns The declaration.
 */
function declarationOf(name: Node): Node {
	let at = name;
	for (let up = at.parent; up !== null && WRAPPERS.has(up.type); up = up.parent) at = up;
	const declaration = at.parent ?? name;
	const decorated = declaration.parent;
	return decorated?.type === "decorated_definition" ? decorated : declaration;
}

/**
 * The declaration's kind, through decorators and a directly assigned lambda.
 * @param declaration The declaration.
 * @returns Its kind.
 */
function kindOf(declaration: Node): Definition["kind"] {
	const kind = KINDS[declaration.type];
	if (kind !== undefined) return kind;
	const field = KIND_VALUES[declaration.type];
	const value = field === undefined ? null : declaration.childForFieldName(field);
	return value === null ? "value" : kindOf(value);
}

/**
 * Whether a declaration is at module level, or in the body of a class there.
 * @param declaration The declaration.
 * @returns False for one inside a function, a lambda or an expression.
 */
function atModuleLevel(declaration: Node): boolean {
	for (let at = declaration.parent; at !== null; at = at.parent) {
		if (at.type === "module") return true;
		if (!HOLDERS.has(at.type)) return false;
	}
	return false;
}

/**
 * The classes that hold a declaration, outermost first.
 * @param declaration The declaration.
 * @returns Their names.
 */
function classesAround(declaration: Node): string[] {
	const names: string[] = [];
	for (let at = declaration.parent; at !== null; at = at.parent) {
		const name = at.type === "class_definition" ? at.childForFieldName("name") : null;
		if (name !== null) names.unshift(name.text);
	}
	return names;
}

/**
 * The visibility of a class member.
 * @param name The member's name.
 * @returns `public`, `non-public` or `name-mangled`.
 */
function memberVisibility(name: string): string {
	if (/^__.+__$/u.test(name)) return "public";
	if (name.startsWith("__")) return "name-mangled";
	return name.startsWith("_") ? "non-public" : "public";
}

/**
 * The visibility of a module-level name.
 * @param name The name.
 * @param listed The names `__all__` lists, if the module sets it.
 * @returns `__all__`, `not in __all__`, `public` or `non-public`.
 */
function moduleVisibility(name: string, listed: ReadonlySet<string> | undefined): string {
	if (listed !== undefined) return listed.has(name) ? "__all__" : "not in __all__";
	return name.startsWith("_") ? "non-public" : "public";
}

/**
 * The visibility of a name: as a class member where classes hold it, else as
 * a module-level name.
 * @param name The name.
 * @param classes The classes that hold it.
 * @param listed The names `__all__` lists, if the module sets it.
 * @returns The visibility.
 */
function visibilityOf(
	name: string,
	classes: readonly string[],
	listed: ReadonlySet<string> | undefined,
): string {
	return classes.length > 0 ? memberVisibility(name) : moduleVisibility(name, listed);
}

/**
 * Whether the class that holds a declaration is exposed. A declaration no
 * class holds has nothing to hide it.
 * @param declaration The declaration.
 * @param exposure Whether each definition read so far is exposed, by its node.
 * @returns True when its class is exposed or it has none.
 */
function holderExposed(declaration: Node, exposure: ReadonlyMap<number, boolean>): boolean {
	for (let at = declaration.parent; at !== null; at = at.parent) {
		const exposed = exposure.get(at.id);
		if (exposed !== undefined) return exposed;
	}
	return true;
}

/**
 * The definition one name declares, where it is at module level or in a
 * class body there.
 * @param name The name.
 * @param context The file's unparsed code and `__all__`.
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
	const classes = classesAround(declaration);
	const visibility = visibilityOf(name.text, classes, context.listed);
	const own = visibility === "public" || visibility === "__all__";
	const exposed = own && holderExposed(declaration, exposure);
	exposure.set(declaration.id, exposure.get(declaration.id) ?? exposed);
	return {
		symbol: [...classes, name.text].join("."),
		kind: kindOf(declaration),
		start: declaration.startPosition.row + 1,
		end: declaration.endPosition.row + 1,
		visibility,
		exposed,
	};
}

/**
 * Every definition of a file, in the order the file declares them.
 * @param names Each captured name of a function, class or type alias.
 * @param targets Each captured assignment target.
 * @param context The file's unparsed code and `__all__`.
 * @returns The definitions.
 */
function definitionsOf(
	names: readonly Node[],
	targets: readonly Node[],
	context: DefinitionContext,
): Definition[] {
	const exposure = new Map<number, boolean>();
	return [...names, ...targets.flatMap(targetNames)]
		.toSorted((left, right) => left.startIndex - right.startIndex)
		.flatMap((name) => definitionOf(name, context, exposure) ?? []);
}

export { type DefinitionContext, definitionsOf, targetNames };
